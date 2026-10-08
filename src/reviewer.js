import z from '@deepseek-ai/schemastery';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';

/** Configure the review route. Do not inherit the main model route. */
export const Config = z.object({
  reviewer: z.object({
    provider: z.string().required(),
    model: z.string().required(),
    reasoningEffort: z.string(),
    timeoutMs: z.number().min(1).max(300000).step(1).default(60000),
  }).required(),
});

/** Make a detached configuration. Invalid values stop plugin activation. */
export function resolveReviewer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('independent-auto-review: reviewer configuration is required');
  }
  const { provider, model, reasoningEffort } = value;
  const timeoutMs = value.timeoutMs ?? 60000;
  for (const [name, item] of [['provider', provider], ['model', model]]) {
    if (typeof item !== 'string' || item.trim().length === 0 || item !== item.trim()) {
      throw new Error(`independent-auto-review: reviewer.${name} must be a nonempty route identifier`);
    }
  }
  if (reasoningEffort !== undefined &&
      (typeof reasoningEffort !== 'string' || !reasoningEffort.trim() || reasoningEffort !== reasoningEffort.trim())) {
    throw new Error('independent-auto-review: reviewer.reasoningEffort must be a nonempty identifier');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
    throw new Error('independent-auto-review: reviewer.timeoutMs must be an integer from 1 to 300000');
  }
  return Object.freeze({ provider, model, timeoutMs,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }) });
}

/** Build one review request. The main model settings are not used. */
export function buildReviewOptions(reviewer, signal, system, userText) {
  return deepFreeze({
    provider: reviewer.provider,
    model: reviewer.model,
    ...(reviewer.reasoningEffort === undefined ? {} : { reasoningEffort: reviewer.reasoningEffort }),
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    temperature: 0,
    signal,
  });
}

// An adapter must honor AbortSignal. Bound cleanup if a defective adapter does not stop.
export const CLEANUP_TIMEOUT_MS = 1000;

/** Read one decision. A timeout or cancellation cannot produce a grant. */
export async function requestDecision(llm, reviewer, parentSignal, system, userText, readDecision) {
  const controller = new AbortController();
  const cancel = () => controller.abort(parentSignal.reason ?? new Error('Review cancelled.'));
  if (parentSignal.aborted) cancel();
  else parentSignal.addEventListener('abort', cancel, { once: true });
  let timer;
  let onAbort;
  let iterator;
  let exhausted = false;
  let closePromise;
  const close = () => {
    if (exhausted || !iterator?.return) return Promise.resolve({ done: true });
    return closePromise ??= Promise.resolve().then(() => iterator.return());
  };
  try {
    controller.signal.throwIfAborted();
    const abort = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason ?? new Error('Review cancelled.'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    timer = setTimeout(() => controller.abort(new Error(
      `independent-auto-review: review timed out after ${reviewer.timeoutMs} ms`
    )), reviewer.timeoutMs);
    const options = buildReviewOptions(reviewer, controller.signal, system, userText);
    const decision = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      iterator = llm.stream(options)[Symbol.asyncIterator]();
      const managed = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              const result = await iterator.next();
              if (result.done) exhausted = true;
              return result;
            },
            return: close,
          };
        },
      };
      return readDecision(managed);
    });
    const result = await Promise.race([decision, abort]);
    controller.signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', cancel);
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    if (iterator && !exhausted) {
      let cleanupTimer;
      try {
        await Promise.race([
          close().catch(() => undefined),
          new Promise(resolve => { cleanupTimer = setTimeout(resolve, CLEANUP_TIMEOUT_MS); }),
        ]);
      } finally { clearTimeout(cleanupTimer); }
    }
  }
}

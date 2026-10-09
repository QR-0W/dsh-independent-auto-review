/** Make only reviewer-field operations. Empty effort inherits the bundle default. */
export function reviewMutation(draft) {
  const provider = typeof draft?.provider === 'string' ? draft.provider.trim() : '';
  const model = typeof draft?.model === 'string' ? draft.model.trim() : '';
  if (!provider) throw new Error('provider');
  if (!model) throw new Error('model');
  const raw = draft.timeoutMs;
  if (raw === '' || raw === null || raw === undefined ||
      (typeof raw !== 'number' && typeof raw !== 'string')) throw new Error('timeout');
  const timeoutMs = Number(raw);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('timeout');
  if (draft.reasoningEffort !== undefined && typeof draft.reasoningEffort !== 'string') throw new Error('effort');
  const effort = draft.reasoningEffort?.trim();
  return [
    { op: 'set', path: ['reviewer', 'provider'], value: provider },
    { op: 'set', path: ['reviewer', 'model'], value: model },
    { op: 'set', path: ['reviewer', 'timeoutMs'], value: timeoutMs },
    effort ? { op: 'set', path: ['reviewer', 'reasoningEffort'], value: effort } :
      { op: 'unset', path: ['reviewer', 'reasoningEffort'] },
  ];
}

export function reviewDraft(state) {
  const r = state?.value?.reviewer ?? {};
  return { provider: r.provider ?? '', model: r.model ?? '',
    reasoningEffort: r.reasoningEffort ?? '', timeoutMs: String(r.timeoutMs ?? 60000) };
}

/** Use the read revision, not a later mirror revision, to prevent lost edits. */
export async function submitReview(form, draft, revision) {
  if (form?.state?.status !== 'ready' || !form.state.writable || form.state.mode !== 'host') throw new Error('unavailable');
  if (!Number.isInteger(revision) || revision < 0) throw new Error('revision');
  const accepted = await form.mutate(reviewMutation(draft), revision);
  if (accepted !== true) throw new Error('refused');
  return true;
}

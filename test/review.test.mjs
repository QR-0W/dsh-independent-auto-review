import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, Config, testing } from '../src/auto-review.js';
import { resolveReviewer, buildReviewOptions, requestDecision } from '../src/reviewer.js';
import { reviewer, fixture, decisionStream, mockContext } from './fixtures.mjs';

const { parseDecision, readDecision, snapshotAutoReview, classifyRisk, textRole } = testing;

for (const value of [
  { risk: 'low', decision: 'allow' },
  { risk: 'medium', decision: 'allow' },
  { risk: 'medium', decision: 'deny' },
  { risk: 'high', decision: 'deny', reason: 'Do not disclose credentials.' },
]) test(`Accept the valid decision ${JSON.stringify(value)}`, () => {
  assert.deepEqual(parseDecision(JSON.stringify(value)), value);
});

for (const raw of [
  '{"risk":"high","decision":"allow"}',
  '{"risk":"low","decision":"deny"}',
  '{"risk":"low","decision":"allow","reason":"ok"}',
  '{"risk":"low","decision":"allow","decision":"allow"}',
  'null', '[]', 'not JSON',
  '{"risk":"medium","decision":"deny","reason":7}',
  '{"risk":"low","decision":"allow","extra":true}',
]) test(`Reject invalid reviewer output ${raw}`, () => {
  assert.throws(() => parseDecision(raw));
});

test('Keep the upstream review policy unchanged', () => {
  const upstream = readFileSync(new URL('../vendor/auto-review-0.2.0-rc.2.js', import.meta.url), 'utf8');
  const match = upstream.match(/const REVIEW_POLICY = `([\s\S]*?)`;/);
  assert.equal(testing.REVIEW_POLICY, match[1]);
});

test('Validate the plugin configuration', () => {
  assert.equal(Config({ reviewer }).reviewer.timeoutMs, 1000);
  assert.equal(resolveReviewer({ provider: 'p', model: 'm' }).timeoutMs, 60000);
  for (const invalid of [undefined, {}, { provider: 'p', model: '' }, { provider: ' p', model: 'm' }, { ...reviewer, timeoutMs: 0 }, { ...reviewer, timeoutMs: 1.5 }, { ...reviewer, reasoningEffort: '' }]) {
    assert.throws(() => resolveReviewer(invalid));
  }
});

test('Use only the separate review settings', () => {
  const signal = new AbortController().signal;
  const options = buildReviewOptions(resolveReviewer({ ...reviewer, reasoningEffort: 'high' }), signal, 'policy', 'evidence');
  assert.equal(options.provider, 'gptpro');
  assert.equal(options.model, 'codex-auto-review');
  assert.equal(options.reasoningEffort, 'high');
  assert.equal(options.maxTokens, undefined);
  assert.equal(options.tools, undefined);
  assert(Object.isFrozen(options));
});

test('Use the review adapter default when the review effort is omitted', () => {
  const options = buildReviewOptions(reviewer, new AbortController().signal, 'policy', 'evidence');
  assert.equal(Object.hasOwn(options, 'reasoningEffort'), false);
});

test('Changing the main provider and model does not change the review route', async () => {
  const host = mockContext();
  for (const route of [ ['deepseek-official', 'deepseek-flash'], ['other-provider', 'other-model'] ]) {
    const f = fixture({ mainProvider: route[0], mainModel: route[1] });
    await classifyRisk(host.ctx, f.agent, f.exec, f.exec.signal, reviewer);
  }
  assert.deepEqual(host.calls.map(({ provider, model, reasoningEffort }) => ({ provider, model, reasoningEffort })), [
    { provider: 'gptpro', model: 'codex-auto-review', reasoningEffort: undefined },
    { provider: 'gptpro', model: 'codex-auto-review', reasoningEffort: undefined },
  ]);
});

test('Treat only durable user and direct-parent messages as instructions', () => {
  assert.equal(textRole({ kind: 'user', rpcId: 'human' }, 1), 'human-instruction');
  assert.equal(textRole({ kind: 'user' }, 1), 'fact');
  assert.equal(textRole({ kind: 'compact-checkpoint' }, 1), 'checkpoint');
  assert.equal(textRole({ kind: 'agent-message', senderSessionId: 'parent' }, 1, undefined, 'parent'), 'direct-parent-instruction');
  assert.equal(textRole({ kind: 'agent-message', senderSessionId: 'other' }, 1, undefined, 'parent'), 'fact');
});

test('Reject a mismatch between the pending action and the logged action', () => {
  const f = fixture();
  f.exec.arguments = { file_path: '/private/secret' };
  assert.throws(() => snapshotAutoReview(f.agent, f.exec), /disagrees/);
});

test('Reject a missing or duplicate tool schema', () => {
  for (const tools of [[], [fixture().schema, fixture().schema]]) {
    const f = fixture(); f.header.tools = tools;
    assert.throws(() => snapshotAutoReview(f.agent, f.exec), /missing or ambiguous/);
  }
});

test('Read valid stream output with the real DSH block assembler', async () => {
  assert.deepEqual(await readDecision(decisionStream()), { risk: 'low', decision: 'allow' });
});

test('Reject a stream without a terminal stop', async () => {
  async function* stream() { yield { type: 'block-start', index: 0, blockType: 'text' }; }
  await assert.rejects(readDecision(stream()), /no terminal finish/);
});

test('Reject a truncated response', async () => {
  async function* stream() { yield { type: 'finish', reason: { kind: 'max-tokens' } }; }
  await assert.rejects(readDecision(stream()), /max-tokens/);
});

test('Reject data after the terminal finish', async () => {
  async function* stream() { yield* decisionStream(); yield { type: 'text-delta', index: 0, text: 'extra' }; }
  await assert.rejects(readDecision(stream()), /after its terminal finish/);
});

test('Reject a tool-call finish from the reviewer', async () => {
  async function* stream() { yield { type: 'finish', reason: { kind: 'tool-calls' } }; }
  await assert.rejects(readDecision(stream()), /tool-calls/);
});

test('Do not review a session outside Auto mode', async () => {
  const host = mockContext(); apply(host.ctx, { reviewer }); host.select('workspace-write');
  assert.deepEqual(await host.invoke(fixture().exec), { kind: 'allow' });
  assert.equal(host.calls.length, 0); await host.dispose();
});

test('Do not review calls without an agent or the outer PTC transport', async () => {
  const host = mockContext(); apply(host.ctx, { reviewer });
  await host.invoke({ ...fixture().exec, agent: undefined });
  await host.invoke({ ...fixture().exec, name: 'run_code' });
  assert.equal(host.calls.length, 0); await host.dispose();
});

test('Keep a later plugin denial after a reviewer allow', async () => {
  const host = mockContext(); apply(host.ctx, { reviewer });
  const denial = { kind: 'deny', reason: 'A separate policy denies the call.' };
  assert.equal(await host.invoke(fixture().exec, async () => denial), denial);
  await host.dispose();
});

test('Ask the user after a reviewer denial when manual approval is permitted', async () => {
  const host = mockContext(() => decisionStream({ risk: 'medium', decision: 'deny', reason: 'No authorization.' }));
  apply(host.ctx, { reviewer });
  assert.equal((await host.invoke(fixture().exec)).kind, 'ask');
  await host.dispose();
});

test('Do not ask a delegated child with never policy', async () => {
  const host = mockContext(() => decisionStream({ risk: 'high', decision: 'deny' }), { policy: 'never' });
  apply(host.ctx, { reviewer }); let reachedNext = false;
  const result = await host.invoke(fixture({ parent: true }).exec, async () => { reachedNext = true; return { kind: 'allow' }; });
  assert.equal(result.kind, 'deny'); assert.equal(reachedNext, false); await host.dispose();
});

for (const reason of ['MISSING_CREDENTIAL', 'UNKNOWN_MODEL', 'UNSUPPORTED_OPTION']) test(`Stop the call on ${reason}; do not use the main model`, async () => {
  const host = mockContext(() => { throw new Error(reason); }); apply(host.ctx, { reviewer });
  let reachedNext = false;
  const result = await host.invoke(fixture().exec, async () => { reachedNext = true; return { kind: 'allow' }; });
  assert.equal(result.kind, 'deny'); assert.match(result.reason, new RegExp(reason));
  assert.equal(host.calls.length, 1); assert.equal(reachedNext, false); await host.dispose();
});

test('Stop the call on malformed model output', async () => {
  const host = mockContext(() => decisionStream('invalid')); apply(host.ctx, { reviewer });
  const result = await host.invoke(fixture().exec);
  assert.equal(result.kind, 'deny'); await host.dispose();
});

test('A request timeout cannot grant the call', async () => {
  const host = mockContext(() => (async function* () { await new Promise(() => {}); })());
  apply(host.ctx, { reviewer: { ...reviewer, timeoutMs: 10 } });
  assert.equal((await host.invoke(fixture().exec)).kind, 'deny');
  assert(host.calls[0].signal.aborted); await host.dispose();
});

test('Cancellation before dispatch sends no review request', async () => {
  const f = fixture(); f.controller.abort(new Error('User cancelled.'));
  const host = mockContext(); apply(host.ctx, { reviewer });
  assert.equal((await host.invoke(f.exec)).kind, 'cancel');
  assert.equal(host.calls.length, 0); await host.dispose();
});

test('Cancellation during review does not call the next gate', async () => {
  const f = fixture(); const host = mockContext(() => (async function* () { await new Promise(() => {}); })());
  apply(host.ctx, { reviewer }); let reachedNext = false;
  const pending = host.invoke(f.exec, async () => { reachedNext = true; return { kind: 'allow' }; });
  await new Promise(resolve => setImmediate(resolve)); f.controller.abort();
  assert.equal((await pending).kind, 'cancel'); assert.equal(reachedNext, false); await host.dispose();
});

test('Reject Auto selection if the configured provider is absent', async () => {
  const host = mockContext(); host.ctx.llm.listProviders = () => [];
  apply(host.ctx, { reviewer }); assert.throws(() => host.admit(), /not available/); await host.dispose();
});

test('Plugin removal cancels a pending review and restores confined permissions', async () => {
  const f = fixture();
  const host = mockContext(() => (async function* () { await new Promise(() => {}); })(), { sessions: [f.session] });
  apply(host.ctx, { reviewer });
  const pending = host.invoke(f.exec);
  await new Promise(resolve => setImmediate(resolve));
  await host.dispose(); assert.equal((await pending).kind, 'cancel');
  assert.equal(host.transitions[0].preset, 'workspace-write');
});

test('Plugin removal preserves never policy for a child session', async () => {
  const f = fixture({ parent: true }); const host = mockContext(undefined, { policy: 'never', sessions: [f.session] });
  apply(host.ctx, { reviewer }); await host.dispose();
  assert.equal(host.transitions[0].preset, 'workspace-write');
  assert.equal(f.events.at(-1).type, 'approval/policy');
  assert.equal(f.events.at(-1).data.policy, 'never');
});

test('Require a confined manual preset before plugin activation', () => {
  const host = mockContext(); host.ctx.permissionPresets.resolve = () => ({ sandbox: 'danger-full-access', approval: 'never' });
  assert.throws(() => apply(host.ctx, { reviewer }), /confined sandbox/);
});

test('Close the iterator after a timeout', async () => {
  let closed = 0;
  const stream = {
    [Symbol.asyncIterator]() { return this; },
    next() { return new Promise(() => {}); },
    async return() { closed++; return { done: true }; },
  };
  await assert.rejects(requestDecision({ stream: () => stream }, { ...reviewer, timeoutMs: 10 }, new AbortController().signal, 'policy', 'evidence', readDecision), /timed out/);
  assert.equal(closed, 1);
});

test('Close a cooperative iterator after cancellation', async () => {
  const controller = new AbortController(); let closed = 0;
  const stream = {
    [Symbol.asyncIterator]() { return this; },
    next() { return new Promise(() => {}); },
    async return() { closed++; return { done: true }; },
  };
  const pending = requestDecision({ stream: () => stream }, reviewer, controller.signal, 'policy', 'evidence', readDecision);
  await new Promise(resolve => setImmediate(resolve)); controller.abort(new Error('Cancelled by test.'));
  await assert.rejects(pending, /Cancelled by test/); assert.equal(closed, 1);
});

test('Handle concurrent reviews with the same independent route', async () => {
  const host = mockContext(); apply(host.ctx, { reviewer });
  const decisions = await Promise.all(Array.from({ length: 5 }, () => host.invoke(fixture().exec)));
  assert(decisions.every(result => result.kind === 'allow'));
  assert.equal(host.calls.length, 5); await host.dispose();
});

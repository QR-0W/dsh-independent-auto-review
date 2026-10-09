import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewMutation, reviewDraft, submitReview } from '../tools/gui/domain.js';

const draft = { provider: 'gptpro', model: 'codex-auto-review', reasoningEffort: 'medium', timeoutMs: '60000' };
const state = { status: 'ready', mode: 'host', writable: true, revision: 3, value: { reviewer: { ...draft, timeoutMs: 60000 } } };

test('GUI operations address only the independent reviewer fields', () => {
  const ops = reviewMutation({ ...draft, mainModel: 'must-not-be-written' });
  assert.equal(ops.length, 4);
  assert.ok(ops.every(op => op.path[0] === 'reviewer'));
  assert.equal(ops[2].value, 60000);
});

test('GUI clears effort by inheriting the bundle default', () => {
  assert.deepEqual(reviewMutation({ ...draft, reasoningEffort: '' }).at(-1), { op: 'unset', path: ['reviewer', 'reasoningEffort'] });
});

for (const [field, value] of [['provider', ' '], ['model', ''], ['timeoutMs', 0], ['timeoutMs', 300001], ['timeoutMs', 1.5], ['timeoutMs', ''], ['timeoutMs', null], ['reasoningEffort', null]]) {
  test(`GUI rejects invalid ${field}: ${JSON.stringify(value)}`, () => assert.throws(() => reviewMutation({ ...draft, [field]: value })));
}

test('GUI reads saved reviewer values without reading main settings', () => {
  assert.deepEqual(reviewDraft(state), draft);
});

test('GUI save carries the revision read by the editor', async () => {
  let captured;
  const form = { state: { ...state, revision: 9 }, async mutate(ops, revision) { captured = { ops, revision }; return true; } };
  await submitReview(form, draft, 3);
  assert.equal(captured.revision, 3);
  assert.deepEqual(captured.ops, reviewMutation(draft));
});

test('GUI reports a refused Host write as failure', async () => {
  await assert.rejects(submitReview({ state, async mutate() { return false; } }, draft, 3), /refused/);
});

test('GUI preserves a transport failure', async () => {
  await assert.rejects(submitReview({ state, async mutate() { throw new Error('network'); } }, draft, 3), /network/);
});

test('GUI prevents writes in a process-local browser mode', async () => {
  let called = false;
  await assert.rejects(submitReview({ state: { ...state, mode: 'memory' }, async mutate() { called = true; } }, draft, 3), /unavailable/);
  assert.equal(called, false);
});

test('GUI prevents writes without a revision', async () => {
  await assert.rejects(submitReview({ state, async mutate() { return true; } }, draft, undefined), /revision/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ReviewSettingsStore, REVIEW_ENTRY } from '../tools/gui/service.js';

const initial = { reviewer: { provider: 'gptpro', model: 'codex-auto-review', reasoningEffort: 'medium', timeoutMs: 60000 }, unrelated: { keep: true } };
function fixture() {
  const row = { entry: { id: REVIEW_ENTRY, options: { config: structuredClone(initial) }, fiber: { config: structuredClone(initial) } }, inherited: structuredClone(initial) };
  let writes = 0;
  const editor = { configuration() { return [row]; }, async edit(entry, change) {
    assert.equal(entry, row.entry);
    const next = change(structuredClone(entry.options.config), structuredClone(row.inherited));
    writes++; entry.options.config = next; entry.fiber.config = structuredClone(next);
  } };
  return { row, editor, store: new ReviewSettingsStore(editor, 0), writes: () => writes };
}

test('Shared settings read exposes only the independent reviewer', () => {
  const f = fixture(), value = f.store.read();
  assert.equal(value.revision, 0);
  assert.equal(value.namespace, REVIEW_ENTRY);
  assert.deepEqual(value.reviewer, initial.reviewer);
  assert.equal(value.unrelated, undefined);
});

test('Shared settings save uses ConfigEditor and preserves other fields', async () => {
  const f = fixture();
  const value = await f.store.save({ expectedRevision: f.store.read().revision, reviewer: { ...initial.reviewer, timeoutMs: 59000 } });
  assert.equal(f.writes(), 1);
  assert.equal(value.reviewer.timeoutMs, 59000);
  assert.equal(value.revision, 1);
  assert.deepEqual(f.row.entry.options.config.unrelated, { keep: true });
});

test('Shared settings rejects a stale read before writing', async () => {
  const f = fixture(), revision = f.store.read().revision;
  f.row.entry.options.config.reviewer.timeoutMs = 58000;
  f.row.entry.fiber.config.reviewer.timeoutMs = 58000;
  await assert.rejects(f.store.save({ expectedRevision: revision, reviewer: initial.reviewer }), /refused/);
  assert.equal(f.writes(), 0);
});

test('Shared settings rechecks the fence inside the ConfigEditor transaction', async () => {
  const f = fixture();
  f.editor.edit = async (entry, change) => { entry.options.config.reviewer.timeoutMs = 58000; change(entry.options.config, f.row.inherited); };
  await assert.rejects(f.store.save({ expectedRevision: f.store.read().revision, reviewer: initial.reviewer }), /refused/);
});

test('Shared settings restores inherited effort, not an incomplete override', async () => {
  const f = fixture();
  const result = await f.store.save({ expectedRevision: f.store.read().revision, reviewer: { ...initial.reviewer, reasoningEffort: '' } });
  assert.equal(result.reviewer.reasoningEffort, 'medium');
});

test('Shared settings validation prevents any persistence', async () => {
  const f = fixture();
  await assert.rejects(f.store.save({ expectedRevision: f.store.read().revision, reviewer: { ...initial.reviewer, timeoutMs: 0 } }), /timeout/);
  assert.equal(f.writes(), 0);
});

test('Shared settings serializes two writes from the same revision', async () => {
  const f = fixture(), revision = f.store.read().revision;
  const results = await Promise.allSettled([59000, 58000].map(timeoutMs => f.store.save({ expectedRevision: revision, reviewer: { ...initial.reviewer, timeoutMs } })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.writes(), 1);
});

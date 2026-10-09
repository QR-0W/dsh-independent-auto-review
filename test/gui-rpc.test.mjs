import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import * as settingsPlugin from '../tools/gui/host.js';
import { GUI_PACKAGE, SETTINGS_SERVICE, createDescriptors, clientContribution } from '../tools/gui/rpc.js';
import { REVIEW_ENTRY } from '../tools/gui/service.js';
import { fixture as executionFixture } from './fixtures.mjs';

const initialReviewer = { provider: 'gptpro', model: 'codex-auto-review', reasoningEffort: 'medium', timeoutMs: 60000 };

/** Real Cordis, TypertRegistry, Gateway and ToolRuntime. Only the persistence seam is isolated. */
async function runtime() {
  const root = new Context();
  root.provide('systemPrompt', { tools: () => () => {} });
  const registry = new TypertRegistry(root);
  const gateway = new TypertGatewayService(root, TypertGatewayService.Config({}));
  const tools = new ToolRuntime(root);
  const initial = { reviewer: initialReviewer, unrelated: { keep: true }, mainModel: 'unchanged-main' };
  const row = { entry: { id: REVIEW_ENTRY, options: { config: structuredClone(initial) }, fiber: { config: structuredClone(initial) } }, inherited: structuredClone(initial) };
  let writes = 0;
  const editor = { configuration() { return [row]; }, async edit(entry, change) {
    assert.equal(entry, row.entry);
    const next = change(structuredClone(entry.options.config), structuredClone(row.inherited));
    writes++;
    entry.options.config = next;
    entry.fiber.config = structuredClone(next);
  } };
  root.provide('configEditor', editor);
  const fiber = root.plugin(settingsPlugin);
  await fiber;
  return { root, registry, gateway, tools, editor, row, fiber, writes: () => writes,
    read: () => gateway.invoke({ namespace: SETTINGS_SERVICE, method: 'read', args: {} }),
    save: request => gateway.invoke({ namespace: SETTINGS_SERVICE, method: 'save', args: { request } }),
    dispose: () => root.fiber.dispose(),
  };
}

async function using(t, fn) {
  const r = await runtime();
  t.after(() => r.dispose());
  await fn(r);
}

function gatewayCode(code) { return error => error.code === code; }

test('Real Typert registry accepts the settings contribution and binds both endpoints', t => using(t, async r => {
  const contribution = r.registry.getPackage(GUI_PACKAGE);
  assert.ok(contribution);
  assert.equal(contribution.model.services[0].key, SETTINGS_SERVICE);
  for (const method of ['read', 'save']) {
    const descriptor = r.registry.local.get(`${SETTINGS_SERVICE}/${method}`);
    assert.equal(descriptor.service, SETTINGS_SERVICE);
    assert.equal(descriptor.result.mode, 'strict');
  }
  const client = clientContribution().descriptors;
  const host = createDescriptors();
  // Factories are independently created closures; compare the contract, not closure identity.
  assert.deepEqual(JSON.parse(JSON.stringify(client)), JSON.parse(JSON.stringify(host)));
  for (let index = 0; index < host.length; index++) assert.equal(client[index].result.create(), host[index].result.create());
}));

test('Real Gateway reads the registered business service, without SRC fallback', t => using(t, async r => {
  const read = await r.read();
  assert.equal(read.namespace, REVIEW_ENTRY);
  assert.ok(Number.isSafeInteger(read.revision));
  assert.deepEqual(read.reviewer, initialReviewer);
  assert.equal(read.mainModel, undefined);
  assert.equal(r.writes(), 0);
}));

test('Real Gateway save shares the reload-safe operation and preserves other settings', t => using(t, async r => {
  const read = await r.read();
  const saved = await r.save({ expectedRevision: read.revision, reviewer: { ...initialReviewer, timeoutMs: 59000 } });
  assert.equal(saved.saved, true);
  assert.equal(saved.autoMayRequireReselection, true);
  assert.equal(saved.reviewer.timeoutMs, 59000);
  assert.equal(saved.revision, read.revision + 1);
  assert.equal(r.writes(), 1);
  assert.equal(r.row.entry.options.config.mainModel, 'unchanged-main');
  assert.deepEqual(r.row.entry.options.config.unrelated, { keep: true });
  assert.deepEqual((await r.read()).reviewer, saved.reviewer);
}));

test('Real Gateway rejects unexpected named wire fields before saving', t => using(t, async r => {
  await assert.rejects(r.gateway.invoke({ namespace: SETTINGS_SERVICE, method: 'read', args: { unexpected: true } }), error => error.code?.startsWith('gateway/'));
  await assert.rejects(r.gateway.invoke({ namespace: SETTINGS_SERVICE, method: 'save', args: { request: { expectedRevision: (await r.read()).revision, reviewer: initialReviewer }, extra: true } }), error => error.code?.startsWith('gateway/'));
  assert.equal(r.writes(), 0);
}));

for (const [name, change] of [
  ['string revision', request => ({ ...request, expectedRevision: String(request.expectedRevision) })],
  ['fractional timeout', request => ({ ...request, reviewer: { ...request.reviewer, timeoutMs: 1.5 } })],
  ['string timeout', request => ({ ...request, reviewer: { ...request.reviewer, timeoutMs: '60000' } })],
  ['missing model', request => ({ ...request, reviewer: { ...request.reviewer, model: undefined } })],
  ['unknown reviewer key', request => ({ ...request, reviewer: { ...request.reviewer, mainModel: 'must-not-write' } })],
  ['unknown request key', request => ({ ...request, mainModel: 'must-not-write' })],
]) test(`Real Gateway strict codec rejects ${name} before business persistence`, t => using(t, async r => {
  const request = change({ expectedRevision: (await r.read()).revision, reviewer: initialReviewer });
  await assert.rejects(r.save(request), gatewayCode('gateway/input-invalid'));
  assert.equal(r.writes(), 0);
}));

test('Real Gateway saves empty effort as the inherited bundle default', t => using(t, async r => {
  const result = await r.save({ expectedRevision: (await r.read()).revision, reviewer: { ...initialReviewer, reasoningEffort: '' } });
  assert.equal(result.reviewer.reasoningEffort, 'medium');
}));

test('Real Gateway propagates stale revision refusal without changing settings', t => using(t, async r => {
  const old = await r.read();
  await r.save({ expectedRevision: old.revision, reviewer: { ...initialReviewer, timeoutMs: 59000 } });
  await assert.rejects(r.save({ expectedRevision: old.revision, reviewer: initialReviewer }), /refused/);
  assert.equal(r.writes(), 1);
}));

test('Real Gateway rechecks CAS inside the ConfigEditor change callback', t => using(t, async r => {
  const old = await r.read();
  r.editor.edit = async (entry, change) => {
    entry.options.config.reviewer.timeoutMs = 58000;
    entry.fiber.config.reviewer.timeoutMs = 58000;
    change(structuredClone(entry.options.config), structuredClone(r.row.inherited));
  };
  await assert.rejects(r.save({ expectedRevision: old.revision, reviewer: initialReviewer }), /refused/);
  assert.equal(r.writes(), 0);
  assert.equal((await r.read()).reviewer.timeoutMs, 58000);
}));

test('Real Gateway serializes two saves from one revision', t => using(t, async r => {
  const expectedRevision = (await r.read()).revision;
  const results = await Promise.allSettled([59000, 58000].map(timeoutMs => r.save({ expectedRevision, reviewer: { ...initialReviewer, timeoutMs } })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(r.writes(), 1);
}));

test('Real ToolRuntime and Gateway read and save the same settings operation', t => using(t, async r => {
  const f = executionFixture();
  async function call(argumentsObject) {
    const output = await r.tools.execute({ ...f.exec, name: 'auto_review_settings', arguments: argumentsObject });
    assert.equal(output.isError, false, JSON.stringify(output));
    return JSON.parse(output.content.find(block => block.type === 'text').text);
  }
  const read = await r.read();
  assert.deepEqual(await call({ action: 'get' }), read);
  const saved = await call({ action: 'set', expectedRevision: read.revision, reviewer: { ...initialReviewer, timeoutMs: 59000 } });
  assert.deepEqual(saved.reviewer, (await r.read()).reviewer);
  assert.equal(saved.revision, (await r.read()).revision);
  assert.equal(r.writes(), 1);
}));

test('Disposing the settings fiber withdraws strict definitions, service and tool', t => using(t, async r => {
  await r.read();
  await r.fiber.dispose();
  assert.equal(r.registry.getPackage(GUI_PACKAGE), undefined);
  assert.equal(r.registry.local.get(`${SETTINGS_SERVICE}/read`), undefined);
  assert.equal(r.root.get(SETTINGS_SERVICE), undefined);
  await assert.rejects(r.read(), gatewayCode('gateway/definition-unavailable'));
  await assert.rejects(r.save({ expectedRevision: 0, reviewer: initialReviewer }), gatewayCode('gateway/definition-unavailable'));
  const f = executionFixture();
  const result = await r.tools.execute({ ...f.exec, name: 'auto_review_settings', arguments: { action: 'get' } });
  assert.equal(result.isError, true);
  assert.equal(r.writes(), 0);
}));

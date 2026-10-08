import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { LlmRuntime, LlmAdapter } from '@deepseek-ai/dsh-llm';
import { apply } from '../src/auto-review.js';
import { reviewer, fixture, decisionStream, mockContext } from './fixtures.mjs';

async function runtime(stream) {
  const ctx = new Context();
  const fake = mockContext(stream);
  ctx.provide('systemPrompt', { tools: () => () => {} });
  ctx.provide('approval', fake.ctx.approval);
  ctx.provide('permissionPresets', fake.ctx.permissionPresets);
  ctx.provide('sessions', fake.ctx.sessions);
  const llm = new LlmRuntime(ctx);
  class Adapter extends LlmAdapter {
    providerInfo(id) { return { id, name: id }; }
    resolveModel(provider, id) { return Promise.resolve({ provider, id, name: id, inputModalities: ['text'], context: { contextWindow: 272000 } }); }
    stream(options) { fake.calls.push(options); return stream(options); }
  }
  llm.registerAdapter(['gptpro'], new Adapter());
  const tools = new ToolRuntime(ctx);
  apply(ctx, { reviewer });
  const f = fixture();
  let bodyCalls = 0;
  tools.register({
    ...f.schema,
    output: { schema: { type: 'boolean' }, render: () => [{ type: 'text', text: 'Test body completed.' }] },
    async execute() { bodyCalls++; return true; },
  });
  return { ctx, tools, f, fake, bodyCalls: () => bodyCalls };
}

test('The real tool registry runs the body after a valid review allow', async () => {
  const r = await runtime(() => decisionStream());
  try {
    const result = await r.tools.execute(r.f.exec);
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(r.bodyCalls(), 1);
    assert.equal(r.fake.calls[0].provider, 'gptpro');
    assert.equal(r.fake.calls[0].model, 'codex-auto-review');
  } finally { await r.ctx.fiber.dispose(); }
});

for (const [name, stream] of [
  ['invalid output', () => decisionStream('invalid')],
  ['adapter failure', () => { throw new Error('No review credential.'); }],
]) test(`The real tool registry does not run the body after ${name}`, async () => {
  const r = await runtime(stream);
  try {
    const result = await r.tools.execute(r.f.exec);
    assert.equal(result.isError, true);
    assert.equal(r.bodyCalls(), 0);
  } finally { await r.ctx.fiber.dispose(); }
});

test('A monotonic tool guard still denies a reviewer allow', async () => {
  const r = await runtime(() => decisionStream());
  try {
    r.tools.guard(() => 'This test guard denies the call.');
    const result = await r.tools.execute(r.f.exec);
    assert.equal(result.isError, true); assert.equal(r.bodyCalls(), 0);
  } finally { await r.ctx.fiber.dispose(); }
});

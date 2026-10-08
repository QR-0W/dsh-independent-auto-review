import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareModelConfig } from '../tools/preflight/configure.js';

const sample = () => ({ providers: {
  anyrouter: { apiKeyEnv: 'OTHER_REF', models: [{ id: 'main-model', contextWindow: 400000 }] },
  gptpro: { baseURL: 'http://example.invalid/v1', apiKeyEnv: 'TEST_REF',
    models: [{ id: 'main-model', contextWindow: 400000, reasoningEfforts: { high: 'high' } }, { id: 'codex-auto-review', name: 'Review' }] },
} });

test('Setup changes only missing metadata on the review model', () => {
  const current = sample(); const before = structuredClone(current);
  const next = prepareModelConfig(current);
  assert.deepEqual(current, before);
  assert.deepEqual(next.providers.anyrouter, before.providers.anyrouter);
  assert.deepEqual(next.providers.gptpro.models[0], before.providers.gptpro.models[0]);
  assert.equal(next.providers.gptpro.apiKeyEnv, 'TEST_REF');
  assert.equal(next.providers.gptpro.models[1].contextWindow, 128000);
  assert.equal(next.providers.gptpro.models[1].maxTokens, 8192);
  assert.equal(next.providers.gptpro.models[1].reasoningEfforts.medium, 'medium');
});

test('Setup preserves explicit limits and supported reasoning declarations', () => {
  const current = sample();
  Object.assign(current.providers.gptpro.models[1], { contextWindow: 272000, maxTokens: 4096, input: ['text', 'image'], reasoningEfforts: { medium: 'medium' } });
  assert.deepEqual(prepareModelConfig(current), current);
});

test('Setup rejects an absent or ambiguous review model', () => {
  assert.throws(() => prepareModelConfig({}));
  const current = sample(); current.providers.gptpro.models.push({ id: 'codex-auto-review' });
  assert.throws(() => prepareModelConfig(current), /one configured entry/);
});

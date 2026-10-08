export function prepareModelConfig(current) {
  const config = structuredClone(current);
  const profile = config.providers?.gptpro;
  if (!profile || !Array.isArray(profile.models)) throw new Error('GPT Pro has no configured model list.');
  const entries = profile.models.filter(model => model.id === 'codex-auto-review');
  if (entries.length !== 1) throw new Error('The review model must have one configured entry.');
  const model = entries[0];
  // These are conservative local declarations, not measured gateway limits.
  model.contextWindow ??= 128000;
  model.maxTokens ??= 8192;
  model.input ??= ['text'];
  model.reasoningEfforts ??= { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' };
  if (!model.reasoningEfforts || model.reasoningEfforts.medium !== 'medium') {
    throw new Error('The review model does not declare the tested medium wire level.');
  }
  return config;
}

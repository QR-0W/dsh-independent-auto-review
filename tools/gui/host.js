import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { ReviewSettingsStore } from './service.js';
import { hostContribution, SETTINGS_SERVICE } from './rpc.js';

export const name = 'independent-auto-review-gui';
export const inject = ['configEditor', 'tools', 'typert'];

export class ReviewSettingsRemote extends TypertRemoteService {
  constructor(ctx, store) { super(ctx, SETTINGS_SERVICE); this.store = store; }
  read() { return this.store.read(); }
  save(request) { return this.store.save(request); }
}

export function settingsTool(store) {
  return {
    name: 'auto_review_settings',
    description: 'Read or save the independent Auto Review settings. Saving can move Auto sessions to workspace-write.',
    deferLoading: true,
    parameters: {
      type: 'object', properties: {
        action: { type: 'string', enum: ['get', 'set'] },
        reviewer: { type: 'object', properties: {
          provider: { type: 'string' }, model: { type: 'string' },
          reasoningEffort: { type: 'string', description: 'Empty or omitted inherits the bundle default.' },
          timeoutMs: { type: 'integer', minimum: 1, maximum: 300000 },
        }, required: ['provider', 'model', 'timeoutMs'], additionalProperties: false },
        expectedRevision: { type: 'integer', minimum: 0, description: 'For set, use the revision returned by get.' },
      }, required: ['action'], additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; } },
    isConcurrencySafe(args) { return args.action === 'get'; },
    async execute(args) {
      if (args.action === 'get') return store.read();
      if (args.action !== 'set') throw new Error('Invalid settings action.');
      return store.save({ reviewer: args.reviewer, expectedRevision: args.expectedRevision });
    },
  };
}

export function apply(ctx) {
  const store = new ReviewSettingsStore(ctx.configEditor);
  new ReviewSettingsRemote(ctx, store);
  ctx.effect(() => ctx.typert.register(hostContribution()));
  ctx.effect(() => ctx.tools.register(settingsTool(store)));
}

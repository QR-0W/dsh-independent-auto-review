export const reviewer = { provider: 'gptpro', model: 'codex-auto-review', timeoutMs: 1000 };

export function fixture({ mainProvider = 'main-provider', mainModel = 'main-model', parent = false } = {}) {
  const schema = { name: 'read', description: 'Read one project file.', parameters: { type: 'object', properties: { file_path: { type: 'string' } } } };
  const argumentsObject = { file_path: '/project/example.txt' };
  const raw = JSON.stringify(argumentsObject);
  const events = [
    { seq: 0, type: 'user/message', data: { source: { kind: 'user', rpcId: 'test-human' }, content: [{ type: 'text', text: 'Read the project file.' }] } },
    { seq: 1, type: 'step/start', data: { turn: 1, step: 1 } },
    { seq: 2, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'tool-call', id: 'call-1', name: 'read', arguments: raw }] } } },
    { seq: 3, type: 'tool/call', data: { turn: 1, step: 1, callId: 'call-1', name: 'read', arguments: raw } },
  ];
  const header = { config: { provider: mainProvider, model: mainModel, reasoningEffort: 'main-only-level', maxTokens: 9000 }, tools: [schema] };
  const session = {
    header: { cwd: '/project', ...(parent ? { parentSession: 'parent', origin: 'subagent' } : {}) },
    surface: { nodes: [0, 2] },
    snapshotEvents: () => events,
    requestHeader: () => header,
    isOwnSeq: () => true,
    append(type, data) { const event = { seq: events.length, type, data }; events.push(event); return event; },
  };
  const agent = { session };
  const controller = new AbortController();
  const exec = { agent, callId: 'call-1', rootCallId: 'call-1', name: 'read', arguments: argumentsObject, signal: controller.signal };
  return { schema, events, header, session, agent, exec, controller };
}

export async function* decisionStream(value = { risk: 'low', decision: 'allow' }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  yield { type: 'block-start', index: 0, blockType: 'text' };
  yield { type: 'text-delta', index: 0, text };
  yield { type: 'block-end', index: 0, block: { type: 'text', text } };
  yield { type: 'finish', reason: { kind: 'stop' } };
}

export function mockContext(stream = () => decisionStream(), { policy = 'ask', sessions = [] } = {}) {
  let currentPreset = 'auto';
  let listener;
  let admission;
  const disposers = [];
  const calls = [];
  const transitions = [];
  const ctx = {
    llm: { stream(options) { calls.push(options); return stream(options); }, listProviders: () => [{ id: 'gptpro', name: 'GPT Pro' }] },
    approval: { overrideOf: () => policy },
    sessions: { list: () => sessions },
    permissionPresets: {
      current: () => currentPreset,
      resolve: () => ({ sandbox: 'workspace-write', approval: 'ask' }),
      registerAuto(fn) { admission = fn; return () => { admission = undefined; }; },
      set(session, preset) { transitions.push({ session, preset }); currentPreset = preset; },
    },
    on(name, fn, options) {
      if (name !== 'tools/pre-execute' || !options.prepend) throw new Error('Unexpected event registration.');
      listener = fn;
      return () => { listener = undefined; };
    },
    effect(factory) {
      for (const dispose of factory()) disposers.push(dispose);
    },
  };
  return {
    ctx, calls, transitions,
    select(value) { currentPreset = value; },
    admit() { return admission(); },
    invoke(exec, next = async () => ({ kind: 'allow' })) { return listener(exec, next); },
    async dispose() { for (const dispose of disposers.reverse()) await dispose(); },
  };
}

import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { createScope } from '@deepseek-ai/dsh-scope';
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval';
import { deferUntilManagerChange } from '../preflight/defer.js';

export const name = 'independent-review-verification';
export const inject = ['configEditor', 'llm', 'tools', 'sessions', 'permissionPresets', 'approval'];
const cwd = '/home/wjx/dsh-independent-auto-review';
const prefix = 'independent_review_probe_';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function createProbeDefinition(schema, onBody) {
  return {
    ...schema,
    output: { schema: { type: 'boolean' }, render: value => [{ type: 'text', text: String(value) }] },
    async execute(args) { onBody(); return args.value; },
  };
}

async function scenario(ctx, controller, mainProvider, mainModel, kind) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const toolName = prefix + suffix;
  const agent = { id: 'review-verification-' + suffix };
  const scope = createScope(ctx, agent);
  agent.ctx = scope.ctx;
  let bodyCalls = 0;
  const schema = {
    name: toolName,
    description: 'Return the input flag. No files, network data, or system settings change.',
    parameters: { type: 'object', properties: { value: { type: 'boolean' } }, required: ['value'], additionalProperties: false },
  };
  try {
    const session = scope.ctx.sessions.create(agent.id, { meta: { cwd } });
    agent.session = session;
    scope.ctx.tools.register(createProbeDefinition(schema, () => { bodyCalls++; }));
    invariant(!ctx.tools.schemas().some(item => item.name === toolName), 'The scoped test tool is visible globally.');
    if (kind === 'guard-deny') scope.ctx.tools.guard(() => 'The isolated verification guard denies this call.');
    ctx.permissionPresets.set(session, 'auto');
    setApprovalPolicy(session, 'never');
    invariant(ctx.permissionPresets.current(session) === 'auto', 'The test session did not enter Auto.');
    session.append('user/message', {
      id: 'test-fact', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: 'This is an isolated self-test. Check a boolean flag. No external action is requested.' }],
    }, { surfaceOp: 'append' });
    session.append('turn/start', { turn: 1 });
    session.append('step/start', { turn: 1, step: 1 });
    session.append('request/header', { reason: 'initial', header: { config: { provider: mainProvider, model: mainModel }, tools: [schema] } });
    const raw = JSON.stringify({ value: true });
    session.append('assistant/message', {
      turn: 1, step: 1,
      message: { id: 'test-assistant', role: 'assistant', source: { kind: 'model', provider: mainProvider, model: mainModel }, content: [{ type: 'tool-call', id: 'test-call', name: toolName, arguments: raw }] },
      stream: [],
    }, { surfaceOp: 'append' });
    session.append('tool/call', { turn: 1, step: 1, callId: 'test-call', name: toolName, arguments: raw });
    const result = await scope.ctx.tools.execute({
      agent, callId: 'test-call', rootCallId: 'test-call', name: toolName,
      arguments: { value: kind !== 'history-mismatch' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
    });
    if (kind === 'allow') {
      invariant(result.isError === false && bodyCalls === 1, 'The installed gate did not allow the constant test body.');
    } else {
      invariant(result.isError === true && bodyCalls === 0, 'A denied test call started its body.');
    }
    session.append('step/end', { turn: 1, step: 1 });
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
    return { mainProvider, mainModel, kind, isError: result.isError, bodyCalls, testToolVisibleGlobally: false };
  } finally { await scope.dispose(); }
}

async function run(ctx, controller) {
  const before = ctx.sessions.list().map(session => ({ session, preset: ctx.permissionPresets.current(session), approval: ctx.approval.overrideOf(session) }));
  const entry = ctx.configEditor.entries().find(entry => entry.options.id === 'independent-auto-review');
  invariant(entry, 'The production review entry is absent.');
  const reviewer = structuredClone(entry.options.config.reviewer);
  const requests = [];
  const unobserve = ctx.on('llm/stream', (options, next) => {
    const owned = options.messages.some(message => message.content.some(block => block.type === 'text' && block.text.includes(prefix)));
    if (owned) requests.push({ provider: options.provider, model: options.model, reasoningEffort: options.reasoningEffort });
    return next();
  });
  const results = [];
  try {
    results.push(await scenario(ctx, controller, 'gptpro', 'gpt-6.1-sol', 'allow'));
    results.push(await scenario(ctx, controller, 'deepseek-official', 'deepseek-flash', 'allow'));
    results.push(await scenario(ctx, controller, 'gptpro', 'gpt-6.1-sol', 'guard-deny'));
    results.push(await scenario(ctx, controller, 'gptpro', 'gpt-6.1-sol', 'history-mismatch'));
    invariant(requests.length === 3, 'The installed gate made an unexpected number of review calls.');
    invariant(requests.every(request => request.provider === reviewer.provider && request.model === reviewer.model && request.reasoningEffort === reviewer.reasoningEffort), 'A review used a different route.');
    invariant(before.every(item => ctx.permissionPresets.current(item.session) === item.preset && ctx.approval.overrideOf(item.session) === item.approval), 'An existing session permission changed.');
    invariant(ctx.sessions.list().length === before.length, 'A test session remains in the live store.');
    return { status: 'passed', kind: 'installed-host-gate-test', reviewer, requests, results, existingSessionPermissionsChanged: false, temporarySessionsRemaining: 0,
      agentScope: 'synthetic isolated carrier; no main-agent loop is started' };
  } finally { unobserve(); }
}

export function apply(ctx) {
  const controller = new AbortController();
  ctx.effect(() => () => controller.abort(new Error('Verification closed.')));
  deferUntilManagerChange(ctx, async () => {
    let report;
    try { report = await run(ctx, controller); }
    catch (error) { report = { status: 'failed', error: error.message }; }
    await mkdir(cwd + '/reports', { recursive: true });
    await writeFile(cwd + '/reports/local-installed.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  });
}

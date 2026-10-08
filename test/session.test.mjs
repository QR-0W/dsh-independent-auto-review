import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import { testing, apply } from '../src/auto-review.js';
import { fixture, reviewer, mockContext } from './fixtures.mjs';

function realSession() {
  const f = fixture();
  const session = Session.create('test-session', [], { version: SESSION_FORMAT_VERSION, id: 'test-session', createdAt: Date.now(), cwd: '/project', isSeeded: false });
  session.append('user/message', { id: 'user-1', role: 'user', ...f.events[0].data }, { surfaceOp: 'append' });
  session.append('turn/start', { turn: 1 });
  session.append('step/start', { turn: 1, step: 1 });
  session.append('request/header', { header: { config: { provider: 'main-provider', model: 'main-model' }, tools: [f.schema] }, reason: 'initial' });
  session.append('assistant/message', { turn: 1, step: 1, message: { id: 'assistant-1', role: 'assistant', source: { kind: 'model', provider: 'main-provider', model: 'main-model' }, content: f.events[2].data.message.content }, stream: [] }, { surfaceOp: 'append' });
  session.append('tool/call', f.events[3].data);
  f.agent.session = session;
  return { ...f, session };
}

test('Build review evidence from a real DSH Session', () => {
  const f = realSession();
  const snapshot = testing.snapshotAutoReview(f.agent, f.exec);
  assert.equal(snapshot.action.name, 'read');
  assert.equal(snapshot.history[0].role, 'human-instruction');
  assert.equal(snapshot.cwd, '/project');
});

test('Replayed session events produce the same review evidence', () => {
  const f = realSession();
  const first = testing.snapshotAutoReview(f.agent, f.exec);
  const restored = Session.create('restored-session', f.session.snapshotEvents(), { ...f.session.header, id: 'restored-session', isSeeded: true }, f.session.seq);
  f.agent.session = restored;
  const second = testing.snapshotAutoReview(f.agent, f.exec);
  assert.deepEqual(second, first);
});

test('Review a PTC inner action once with its logged start and binding schema', async () => {
  const f = fixture();
  const raw = JSON.stringify({ code: 'await tools.read({file_path: "/project/example.txt"})' });
  Object.assign(f.events[2].data.message.content[0], { name: 'run_code', arguments: raw });
  Object.assign(f.events[3].data, { name: 'run_code', arguments: raw });
  Object.assign(f.exec, { parent: Symbol('outer'), callId: 'inner-1', schema: f.schema });
  f.events.push({ seq: 4, type: 'tool/ptc-dispatch-start', data: { parentCallId: 'call-1', rootCallId: 'call-1', subCallId: 'inner-1', name: 'read', arguments: f.exec.arguments } });
  const snapshot = testing.snapshotAutoReview(f.agent, f.exec);
  assert.equal(snapshot.action.mode, 'ptc-inner');
  const host = mockContext(); apply(host.ctx, { reviewer });
  assert.equal((await host.invoke(f.exec)).kind, 'allow');
  assert.equal(host.calls.length, 1); await host.dispose();
});

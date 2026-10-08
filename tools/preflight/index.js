import { writeFile, mkdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { prepareModelConfig } from './configure.js';

export const name = 'independent-review-preflight';
export const inject = ['configEditor', 'llm', 'permissionPresets', 'sessions'];
const reportPath = '/home/wjx/dsh-independent-auto-review/reports/local-preflight.json';

async function run(ctx) {
  const entry = ctx.configEditor.entries().find(entry =>
    entry.options.id === 'llm-pi-ai' && entry.options.name === '@deepseek-ai/dsh-llm-pi-ai');
  if (!entry) throw new Error('The active pi-ai configuration entry is absent.');
  const current = entry.options.config ?? {};
  const next = prepareModelConfig(current);
  const changed = !isDeepStrictEqual(current, next);
  if (changed) await ctx.configEditor.edit(entry, prepareModelConfig);
  const model = await ctx.llm.resolveModelInfo('gptpro', 'codex-auto-review');
  const autoSessions = ctx.sessions.list().filter(session => ctx.permissionPresets.current(session) === 'auto').length;
  return { status: 'ready', modelConfigChanged: changed, autoSessions, model,
    mainModelChanged: false, permissionModeChanged: false };
}

export function apply(ctx) {
  ctx.effect(function* () {
    let task;
    // Do not start a nested profile reload while this plugin is mounting.
    const timer = setTimeout(() => {
      task = (async () => {
        let report;
        try { report = await run(ctx); }
        catch (error) { report = { status: 'failed', error: String(error?.message ?? error) }; }
        await mkdir('/home/wjx/dsh-independent-auto-review/reports', { recursive: true });
        await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
      })().catch(error => ctx.logger.error(error));
    }, 0);
    yield () => clearTimeout(timer);
    yield async () => { await task; };
  }, 'review preflight');
}

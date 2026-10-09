/** Start one setup task after the manager leaves its HMR transaction. */
export function deferUntilManagerChange(ctx, run) {
  ctx.effect(function* () {
    let task;
    let started = false;
    let closing = false;
    yield ctx.on('plugin-manager/changed', () => {
      if (started || closing) return;
      started = true;
      task = Promise.resolve().then(run).catch(error => ctx.logger.error(error));
    });
    yield async () => { closing = true; await task; };
  }, 'post-transaction setup');
}

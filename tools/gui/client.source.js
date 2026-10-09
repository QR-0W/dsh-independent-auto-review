const React = require('react');
const h = React.createElement;
const dictionaries = {
  en: {
    summary: 'Use a separate model for Auto Review.', intro: 'These settings affect Auto Review only. The main model stays unchanged.',
    provider: 'Review provider', model: 'Review model', effort: 'Reasoning effort', timeout: 'Timeout (milliseconds)',
    routeHint: 'Use an exact registered provider and a model its adapter can resolve.',
    effortHint: 'Use an effort supported by the model. Empty inherits the bundle default.',
    timeoutHint: 'Enter an integer from 1 to 300000. Default: 60000.',
    lifecycle: 'Saving reloads the reviewer. Auto sessions can move to workspace-write. Select Auto again after saving.',
    privacy: 'Review evidence can contain private project data. The current GPT Pro gateway uses HTTP, without TLS protection.',
    validation: 'Saving does not test the gateway. Invalid routes stop review; they do not use the main model.',
    save: 'Save review settings', saving: 'Saving…', reload: 'Reload saved values', loading: 'Loading review settings…',
    unavailable: 'These settings cannot be saved here. Enable the review component and use the local Host connection.',
    saved: 'Review settings saved. Select Auto again if the permission mode changed.',
    refused: 'The Host refused the save. Reload saved values before trying again.',
    conflict: 'Saved settings changed while you edited. Reload saved values to continue.',
    providerError: 'Enter a review provider.', modelError: 'Enter a review model.',
    effortError: 'Enter a valid reasoning identifier.', timeoutError: 'Timeout must be an integer from 1 to 300000.',
    transportError: 'The save failed. Your draft remains on this page.', unsaved: 'Unsaved changes',
  },
  zh: {
    summary: '使用与主模型独立的模型进行 Auto Review。', intro: '这些设置仅用于 Auto Review，不会改变主模型。',
    provider: '审查供应商', model: '审查模型', effort: '推理强度', timeout: '超时（毫秒）',
    routeHint: '填写已注册的供应商，以及其适配器能解析的模型标识。',
    effortHint: '填写模型支持的推理标识；留空继承插件默认值。',
    timeoutHint: '填写 1 至 300000 的整数。默认值：60000。',
    lifecycle: '保存会重新加载审查组件。Auto 会话可能切换为 workspace-write。保存后按需重新选择 Auto。',
    privacy: '审查证据可能包含项目私有数据。当前 GPT Pro 网关使用 HTTP，传输没有 TLS 保护。',
    validation: '保存不会测试网关连接。路由配置错误会阻止审查，不会改用主模型。',
    save: '保存审查设置', saving: '正在保存…', reload: '重新加载已保存值', loading: '正在加载审查设置…',
    unavailable: '当前无法保存这些设置。请启用审查组件，并通过本机 Host 连接访问。',
    saved: '审查设置已保存。若权限模式发生变化，请重新选择 Auto。',
    refused: 'Host 拒绝了保存。请重新加载已保存值后重试。',
    conflict: '编辑期间，已保存的设置发生变化。请重新加载已保存值后继续。',
    providerError: '请填写审查供应商。', modelError: '请填写审查模型。',
    effortError: '请填写有效的推理标识。', timeoutError: '超时必须是 1 至 300000 的整数。',
    transportError: '保存失败。草稿仍保留在此页面。', unsaved: '有未保存的修改',
  },
};

function remoteValue(result) {
  if (result?.ok === true) return result.value;
  if (result?.ok === false) throw result.error;
  throw new Error('Invalid remote settings response.');
}

function HostReviewForm({ api, t }) {
  const [state, setState] = React.useState({ status: 'loading', mode: 'host', writable: false });
  const alive = React.useRef(true);
  async function refresh() {
    const data = remoteValue(await api.read());
    const next = { status: 'ready', mode: 'host', writable: true, revision: data.revision, value: { reviewer: data.reviewer } };
    if (alive.current) setState(next);
    return next;
  }
  React.useEffect(() => {
    alive.current = true;
    refresh().catch(() => { if (alive.current) setState({ status: 'unavailable', mode: 'host', writable: false }); });
    return () => { alive.current = false; };
  }, [api]);
  const form = { state, refresh, async mutate(ops, expectedRevision) {
    const reviewer = {};
    for (const op of ops) if (op.op === 'set') reviewer[op.path[1]] = op.value;
    const data = remoteValue(await api.save({ reviewer, expectedRevision }));
    if (alive.current) setState({ status: 'ready', mode: 'host', writable: true, revision: data.revision, value: { reviewer: data.reviewer } });
    return true;
  } };
  return h(ReviewForm, { form, t });
}

function ReviewForm({ form, t }) {
  const state = form?.state;
  const [draft, setDraft] = React.useState(() => reviewDraft(state));
  const [revision, setRevision] = React.useState(state?.revision);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const alive = React.useRef(true);
  const locked = React.useRef(false);
  const uid = React.useId();
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => {
    if (!dirty && !busy && state?.status === 'ready') {
      setDraft(reviewDraft(state)); setRevision(state.revision);
    }
  }, [state?.revision, state?.status, dirty, busy]);
  const editable = state?.status === 'ready' && state.writable && state.mode === 'host';
  const conflict = dirty && state?.revision !== revision;
  async function reload() {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const next = await form.refresh();
      if (alive.current) { setDraft(reviewDraft(next)); setRevision(next.revision); setDirty(false); setNotice(null); }
    } catch { if (alive.current) setNotice({ kind: 'error', key: 'transportError' }); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (locked.current || !editable || conflict) return;
    locked.current = true; setBusy(true); setNotice(null);
    try {
      await submitReview(form, draft, revision);
      if (alive.current) { setDirty(false); setNotice({ kind: 'success', key: 'saved' }); }
    } catch (error) {
      if (alive.current) {
        const key = ({ provider: 'providerError', model: 'modelError', effort: 'effortError', timeout: 'timeoutError',
          unavailable: 'unavailable', revision: 'conflict', refused: 'refused' })[error.message] ?? 'transportError';
        setNotice({ kind: 'error', key });
      }
    } finally {
      locked.current = false; if (alive.current) setBusy(false);
    }
  }
  const field = (key, type, hint, list) => h('div', { className: 'iar-field', key },
    h('label', { htmlFor: `${uid}-${key}` }, t(key === 'reasoningEffort' ? 'effort' : key === 'timeoutMs' ? 'timeout' : key)),
    h('input', { id: `${uid}-${key}`, type, value: draft[key], disabled: !editable || busy,
      autoComplete: 'off', spellCheck: false, list,
      ...(type === 'number' ? { min: 1, max: 300000, step: 1 } : {}),
      'aria-describedby': hint ? `${uid}-${key}-hint` : undefined,
      onChange: event => { setDraft(old => ({ ...old, [key]: event.target.value })); setDirty(true); setNotice(null); },
    }), hint ? h('p', { id: `${uid}-${key}-hint`, className: 'iar-help' }, t(hint)) : null);
  return h('form', { className: 'iar-form', onSubmit: save, 'aria-busy': busy },
    h('p', { className: 'iar-intro' }, t('intro')),
    state?.status === 'loading' ? h('p', { role: 'status' }, t('loading')) : null,
    !editable && state?.status !== 'loading' ? h('p', { role: 'alert', className: 'iar-error' }, t('unavailable')) : null,
    field('provider', 'text', 'routeHint'), field('model', 'text'),
    field('reasoningEffort', 'text', 'effortHint', `${uid}-efforts`),
    h('datalist', { id: `${uid}-efforts` }, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(value => h('option', { key: value, value }))),
    field('timeoutMs', 'number', 'timeoutHint'),
    h('div', { className: 'iar-warning' }, h('p', null, t('lifecycle')), h('p', null, t('privacy'))),
    h('p', { className: 'iar-help' }, t('validation')),
    conflict ? h('p', { className: 'iar-error', role: 'alert' }, t('conflict')) : null,
    notice ? h('p', { role: notice.kind === 'error' ? 'alert' : 'status', className: `iar-${notice.kind}` }, t(notice.key)) : null,
    h('div', { className: 'iar-actions' },
      h('button', { type: 'submit', className: 'iar-primary', disabled: !editable || busy || !dirty || conflict }, t(busy ? 'saving' : 'save')),
      h('button', { type: 'button', disabled: busy, onClick: reload }, t('reload')),
      dirty ? h('span', { className: 'iar-help' }, t('unsaved')) : null,
    ),
  );
}

const css = `
.iar-form { display: flex; flex-direction: column; gap: 18px; max-width: 640px; color: var(--dsw-alias-label-primary); font-size: 13px; }
.iar-form p { margin: 0; line-height: 1.55; }
.iar-field { display: flex; flex-direction: column; gap: 6px; }
.iar-field label { font-weight: 500; }
.iar-field input { box-sizing: border-box; width: 100%; min-height: 36px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; }
.iar-field input:focus-visible, .iar-actions button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.iar-help, .iar-intro { color: var(--dsw-alias-label-secondary); }
.iar-help { font-size: 12px; }
.iar-warning { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
.iar-error { color: var(--dsw-alias-state-error-primary); }
.iar-success { color: var(--dsw-alias-state-success-primary); }
.iar-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.iar-actions button { min-height: 34px; padding: 7px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; cursor: pointer; }
.iar-actions .iar-primary { border-color: var(--dsw-alias-brand-primary); }
.iar-actions button:disabled, .iar-field input:disabled { opacity: .55; cursor: not-allowed; }
`;

return {
  inject: ['slots', 'locale', 'remote'],
  async apply(ctx) {
    const unmount = await ctx.remote.$mount(clientContribution());
    ctx.effect(() => unmount);
    ctx.effect(() => ctx.locale.register('independentAutoReview', 'en', dictionaries.en));
    ctx.effect(() => ctx.locale.register('independentAutoReview', 'zh', dictionaries.zh));
    for (const entry of reviewConfigEntries()) {
      ctx.slots.inject(entry.name, () => ctx.slots.register({
        ...entry, locale: 'independentAutoReview',
      }, props => props.view === 'summary' ? h('span', null, props.t('summary')) :
        h(React.Fragment, null, h('style', null, css), h(HostReviewForm, { api: ctx.remote.independentAutoReviewSettings, t: props.t }))));
    }
  },
};

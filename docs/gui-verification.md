# GUI verification

This is a verification snapshot for DSH `0.2.0-rc.2` and Node 24. The root package is `0.1.2`. The GUI companion is `@local/dsh-independent-auto-review-settings` `0.1.0`.

## Results

| Check | Result | What it establishes |
| --- | --- | --- |
| Automated suite | 96 tests passed | Includes all 57 prior safety tests and 39 GUI tests. |
| Real Host RPC boundary | 16 tests passed | Shipped Cordis Context, TypertRegistry, Gateway, and ToolRuntime dispatch and strict validation; isolated persistence seam. |
| Live Host settings read | Passed | The installed management tool can read the independent reviewer. |
| Live Host same-values save | Passed | The shared Host configuration operation accepted the revision-fenced write. |
| Client slot registration | Active | The connected Client registered the configuration form. |
| Browser appearance | Not verified | No visual result is claimed. |
| Browser click and save flow | Not verified | Host tool tests do not prove browser interaction. |
| Model gateway requests for this GUI snapshot | Not run | Host RPC tests are not model requests. Saving settings does not establish model connectivity, identity, or review decisions. |

The live read and save retained these reviewer values:

```yaml
reviewer:
  provider: gptpro
  model: codex-auto-review
  reasoningEffort: medium
  timeoutMs: 60000
```

The save used the same values. It did not change the main model. It did not select Auto or test the gateway.

## Configuration behavior

The core reviewer is not a volatile settings consumer. The GUI and deferred `auto_review_settings` tool use the same shared ConfigEditor operation. A configuration edit follows the review component's normal reload lifecycle.

- Use `get` before `set`. Supply the returned revision as `expectedRevision`.
- A stale revision rejects the write. It must not overwrite a newer edit.
- A blank reasoning field restores the bundle default. It does not force the adapter default while a bundle default exists.
- A save can move Auto sessions to confined `workspace-write`. Select Auto again after the configuration is active.
- A main-model selection change does not reload the reviewer.
- The management tool cannot select Auto or approve a pending tool call.

## Scope and limits

Installation and Host activation do not prove that the user can see or use the form. An active Client slot is not a screenshot or a click test. Light and dark appearance, keyboard interaction, and the complete browser save flow remain unverified.

The 16 RPC tests cover read/save, exact named arguments, strict request schemas, inherited effort, stale and in-transaction revision fences, concurrent saves, shared tool behavior, and owned disposal with no source-mode fallback. Their ConfigEditor persistence boundary is an isolated in-memory seam. They do not test the HTTP/WebSocket carrier or a changed-value live reviewer reload.

The separate live same-values save exercises the installed ConfigEditor operation. It does not establish changed-value lifecycle behavior or browser interaction.

The settings test did not execute a real review request. Real-gateway checks must record their own inputs, decisions, route, and failure behavior. See [earlier gate verification](verification.md) for the previous synthetic adapter and installed-gate checks; those results do not establish the current GUI flow.

The locally configured GPT Pro gateway uses HTTP. Review evidence can contain private project data and has no TLS protection on that connection. Model review is probabilistic. It is not a deterministic security boundary.

## Reproduce the local checks

Use the source checkout and the tested runtime:

```sh
npm run link:runtime
npm ci --ignore-scripts --prefix tools/gui/build-tools
npm run build:gui
npm run check
```

The compiler is for development only. The GUI package ships its prebuilt browser artifact and needs no install-time build. Do not treat a successful settings save as permission to run a live gateway test.

For installation and rollback, see the [project README](../README.md) and [GUI README](../tools/gui/README.md).

Project reports use short, direct English. They are not certified for full ASD-STE100 compliance.

## Official references

- [Bundle packaging and installation, DSH 0.2.0-rc.2](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/docs/user/develop/basic/publish.md)
- [Plugin Manager activation and verification limits, DSH 0.2.0-rc.2](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/boot/plugin-manager/README.md)
- [Client plugin requirements, DSH 0.2.0-rc.2](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/preset/agent-preset/skills/cordis-plugin-development/references/ui-plugin.md)

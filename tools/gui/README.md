# Auto Review Settings

`@local/dsh-independent-auto-review-settings` adds a configuration form for Independent Auto Review to the DSH Plugins page. It also provides the deferred `auto_review_settings` management tool.

This companion targets DSH `0.2.0-rc.2` and Node 24. It does not replace the main model, implement the review gate, select Auto, or approve tool calls.

## Install

Use a source checkout of [QR-0W/dsh-independent-auto-review](https://github.com/QR-0W/dsh-independent-auto-review) at tag `v0.1.3` or a reviewed later commit. This release contains root `0.1.3` and companion `0.1.1`, with forms on both installed bundle-card pages. The older `v0.1.0` and `v0.1.1` tags do not contain this companion.

1. Register a DSH adapter for the review provider and model.
2. Run `npm run link:runtime` from the repository root. It links the exact tested API packages shipped with DSH. It does not install another runtime.
3. Move existing Auto sessions to a manual permission mode before replacing the built-in reviewer.
4. Install the repository root's absolute directory through Plugin Manager.
5. Install this companion's absolute directory through Plugin Manager.
6. Confirm the management outcomes. Refresh the existing GUI when needed to load the client artifact.

The root and companion are separate bundles. Installing one does not activate the other. The companion loads its Host entry from [host.js](host.js) and its prebuilt browser artifact from [client.js](client.js). End users need no compiler or install-time build script.

Do not hand-edit the profile's package manifest or patch. Use Plugin Manager for installation, activation, and removal.

## Configure

Open **Plugins → Installed**. Select **Independent Auto Review** or **Auto Review Settings** to reach the same reviewer form directly. The review row's Configure control remains an alternate entry.

Enter the exact provider and model identifiers, reasoning effort, and timeout. Only an explicit save writes settings. The form retains the draft after a failure and rejects a stale revision instead of overwriting a concurrent edit.

- A blank reasoning field restores the bundle default. With the current bundle, that default is `medium`.
- If no configuration layer supplies a reasoning effort, the adapter uses its own default.
- Timeout must be an integer from 1 to 300000 milliseconds.
- The selected adapter must resolve the model and support any explicit reasoning effort.
- Saving does not contact the gateway or verify backend model identity.

The core reviewer is not a volatile settings consumer. The shared ConfigEditor operation uses its normal configuration reload lifecycle. A save can move Auto sessions to confined `workspace-write`. Select Auto again after the new configuration is active. The main model stays unchanged. There is no main-model fallback for review failure.

## Management tool

The deferred `auto_review_settings` tool uses the same Host operation as the form:

1. Call `get` to read the reviewer and current revision.
2. Call `set` with the reviewer values and that revision as `expectedRevision`.
3. If another edit changed the revision, read again before retrying.

The tool cannot select Auto, approve a pending call, or run a gateway test. A successful save proves a configuration write, not a successful model request.

## Remove

Remove this companion through Plugin Manager. This removes the form and management tool. The review gate and its saved configuration remain.

To roll back the gate, disable or remove the whole root bundle. Do not disable only its review row: the root patch would still disable the built-in reviewer. Confirm the live component state before selecting Auto again.

## Development

From the repository root:

```sh
npm run link:runtime
npm ci --ignore-scripts --prefix tools/gui/build-tools
npm run build:gui
npm run check
```

The separate build-tools directory supplies the development compiler. Commit the generated browser artifact with source changes. Shared APIs are declared in peer and development dependencies. No installation script builds the GUI.

## Verification and safety

The current suite passed 98 tests, including 16 real Registry, Gateway, and ToolRuntime RPC tests. A live Host settings read and same-values save passed without changing the reviewer route. Client slot registration is active. Browser appearance and clicks remain unverified. Actual gateway tests are separate from settings writes; no gateway result is claimed by these checks.

See [GUI verification](../../docs/gui-verification.md) for the exact snapshot and limits, and the [project README](../../README.md) for gate behavior and setup.

The locally configured GPT Pro gateway uses HTTP. Review evidence can contain private project data and has no TLS protection on that connection. Model review is probabilistic. Do not use it as the only control for sensitive systems.

This package uses the [MIT license](LICENSE). See [third-party notices](THIRD-PARTY-NOTICES.md). Reports use short, direct English; they are not certified for full ASD-STE100 compliance.

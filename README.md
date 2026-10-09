# Independent Auto Review

Use a separate model to review DSH tool calls. Keep the main model unchanged.

This project targets DSH `0.2.0-rc.2` and Node 24. It replaces the built-in experimental Auto Review component. It does not replace the main agent or the model adapter. Other DSH versions are not verified.

## Repository and distribution

Public source repository: [QR-0W/dsh-independent-auto-review](https://github.com/QR-0W/dsh-independent-auto-review).

Release `v0.1.3` includes root `0.1.3` and settings companion `0.1.1`. It adds the form directly to both installed bundle-card pages. Use this tag or a reviewed later commit. Version `v0.1.2` registered only the internal review-row form; the older `v0.1.0` and `v0.1.1` tags have no GUI companion.

Use a source checkout for the complete installation workflow. The root runtime package does not contain or activate the GUI companion. The GUI ships a prebuilt browser artifact. No install-time build script is needed.

The project contains two persistent bundles:

- Root directory: the independent review gate.
- [tools/gui](tools/gui/README.md): `@local/dsh-independent-auto-review-settings`, the configuration form and matching management tool.

## Installation

1. Clone the repository. Use a reviewed release tag or commit instead of an unpinned development branch.
2. Register a DSH model adapter for the review provider. The adapter must resolve the selected model. An explicit reasoning level must be supported by that model.
3. Run `npm run link:runtime` in the source checkout. This creates project-local links to the exact API packages shipped with the tested DSH runtime. It does not install a second runtime or overwrite existing dependencies.
4. Before replacing the built-in Auto component, move existing Auto sessions to a manual permission mode. Built-in disposal can otherwise change their permissions.
5. Install the source checkout's absolute directory through the DSH Plugin Manager.
6. Install the absolute `tools/gui` directory through the same manager.
7. Confirm the installation outcomes. Refresh the existing GUI when needed to load the new client artifact.
8. Open **Plugins → Installed** and select **Independent Auto Review** or **Auto Review Settings**. Both bundle pages provide the same reviewer form. The review row's Configure control remains an alternate entry.
9. Save the review provider, model, reasoning effort, and timeout. Select **Auto** in the permission menu when ready.

Do not hand-edit the profile's package manifest or patch. Package and profile changes use the plugin manager. Configuration writes use the public Host configuration service.

The checked-in default is environment-specific:

```yaml
reviewer:
  provider: gptpro
  model: codex-auto-review
  reasoningEffort: medium
  timeoutMs: 60000
```

It is not a bundled model service. Public users must supply a valid registered route. The local `tools/preflight` helper fills missing metadata for this specific route only. It declares local limits of 128000 context tokens and 8192 output tokens, not measured gateway capacities. It preserves other models, provider settings, and credential references. It does not read or store API keys.

## Configure the reviewer

The GUI edits the independent reviewer, not the main model. Only an explicit save writes. The form retains its draft after a failure and uses a revision fence to prevent overwriting concurrent changes.

The core reviewer is not a volatile settings consumer. Saving through the shared ConfigEditor operation uses its normal configuration lifecycle. It reloads the reviewer and can move Auto sessions to confined `workspace-write`. Select Auto again after the new configuration is active. Changing the main-model selection does not reload the reviewer. Saving does not test the gateway or select Auto.

Provider and model identifiers are exact. The GUI does not prove gateway connectivity or backend model identity. An unsupported route or explicit reasoning level stops review; no main-model fallback exists.

An empty GUI reasoning field inherits the bundle's default. If `reasoningEffort` is absent from all configuration layers, the review adapter uses its own default. Timeout must be an integer from 1 to 300000 milliseconds.

The deferred `auto_review_settings` management tool reads and saves through the same Host operation. Use `get` first, then supply that revision as `expectedRevision` with `set`. A stale revision rejects the write. The tool cannot select Auto or approve a pending tool call.

## Safety

- Review native tool calls and PTC inner calls, not the outer `run_code` transport.
- Retain the upstream policy and evidence roles.
- Require a valid decision and a terminal `stop`.
- Deny on review failure. Do not start the tool body.
- Preserve later permission denials and tool guards.
- Under `ask`, a review denial can request manual approval. Under `never`, the denial is final.
- Cancellation cannot grant a pending call.
- Removal cancels active reviews and selects confined `workspace-write` for Auto sessions. Preserve an existing `never` policy.

The adapter must honor abort. Iterator cleanup waits at most one second. A defective adapter can retain network activity after that wait, but cannot grant the pending call.

Model review is probabilistic. Do not use it as the only control for sensitive systems.

**Warning:** The locally configured GPT Pro gateway uses HTTP. Review evidence can contain private project data. That connection has no TLS protection.

## Remove or roll back

Remove the GUI companion through Plugin Manager to remove the form and management tool. This does not remove the reviewer or its saved configuration.

Disable or remove the whole root bundle to roll back the reviewer. Do not disable only its review row: the root bundle would still disable the built-in row. Confirm the live component state before selecting Auto again.

Review-model metadata added during setup remains after removal. It does not affect the main model.

## Development and verification

End users do not need a compiler. For development, rebuild the GUI after editing its source:

```sh
npm run link:runtime
npm ci --ignore-scripts --prefix tools/gui/build-tools
npm run build:gui
npm run check
```

Tests use the installed runtime. Set `DSH_RUNTIME_DIR` when DSH is not in the global npm directory. Shared APIs are declared in peer and development dependencies. The linking helper supplies the exact shipped APIs; it does not install another runtime. The compiler dependencies stay in the separate build-tools directory.

The current suite passed 98 tests, including 16 real Registry, Gateway, and ToolRuntime RPC tests. The live Host settings read and a same-values save passed. Client slot registration is active. Browser appearance and clicks remain unverified. Saving settings is not a real-gateway test. See [GUI verification](docs/gui-verification.md) for this snapshot and limits, and [earlier gate verification](docs/verification.md) for the prior review-gate checks.

See the [source notice](NOTICE.md) and the GUI's [third-party notices](tools/gui/THIRD-PARTY-NOTICES.md). Private local reports, dependencies, environment files, and logs are excluded from Git. Ignore rules do not remove files already committed.

Project reports use short, direct English. They are not certified for full ASD-STE100 compliance. The upstream policy and license remain unchanged.

# Independent Auto Review

Use a separate model to review DSH tool calls. Keep the main model unchanged.

This Host plugin supports DSH `0.2.0-rc.2`. It replaces the built-in experimental Auto Review component. It does not replace the main agent or the model adapter.

## Review configuration

The bundle uses this configuration:

```yaml
reviewer:
  provider: gptpro
  model: codex-auto-review
  reasoningEffort: medium
  timeoutMs: 60000
```

Change the plugin configuration through the DSH configuration editor. You can change the provider, model, reasoning level, and timeout.

A configuration change reloads this plugin. Sessions that used Auto can move to confined `workspace-write`. Select Auto again after the new configuration is active. A main-model selection change does not reload this plugin.

The selected provider must have a registered DSH adapter. The adapter must resolve the selected model. An explicit reasoning level must be supported by that model.

If you omit `reasoningEffort`, the review adapter uses its own default. The plugin never copies the main model's settings. It never falls back to the main model.

## Safety

- The plugin reviews native tool calls and PTC inner calls.
- It does not review the outer `run_code` transport.
- It retains the upstream review policy and evidence roles.
- A review failure denies the call. It does not start the tool body.
- The output must have a valid decision and a terminal `stop`.
- A later permission plugin or tool guard can still deny the call.
- A review denial can request manual approval under the `ask` policy. This is the upstream behavior.
- Under the `never` policy, a review denial is final.
- Cancellation cannot grant the pending call.
- Plugin removal cancels active reviews. It selects confined `workspace-write` permissions for Auto sessions. It preserves an existing `never` policy.

The adapter must honor the abort signal. The plugin requests iterator closure and waits up to one second for cleanup. A defective adapter can keep a network request active after that limit. The tool call remains denied or cancelled.

A model decision is not a deterministic security boundary. Do not use it as the only control for sensitive systems.

**WARNING:** The configured GPT Pro gateway uses HTTP. Review evidence can contain private project data. HTTP does not protect that data in transit.

## Installation

Use the DSH plugin manager. Do not edit the DSH installation or the profile's package manifest.

1. Run `npm run link:runtime`, then `npm run check` in the project. The link command uses the exact tested API packages shipped with DSH. It does not install another runtime.
2. Install the temporary setup bundle in `tools/preflight` through `plugin_manager`.
3. Read `reports/local-preflight.json`. Confirm `status` is `ready` and `autoSessions` is `0`.
4. If Auto sessions exist, move them to a manual permission mode. Do not replace the old component while they use Auto.
5. Install this project's absolute directory through `plugin_manager`.
6. Check the installation result and the live Config entry.
7. For a controlled live check, install `tools/verify` through the plugin manager. Read `reports/local-installed.json`. The probe uses isolated scopes. It does not change existing session permissions.
8. Remove both temporary bundles through the plugin manager.
9. Select Auto in the permission menu when you are ready to use model review.

The current `web` profile has completed these installation and verification steps. No temporary bundle remains.

Installation does not select Auto for your sessions. It does not change the main model.

The temporary setup bundle uses the public DSH `configEditor` service. It fills missing metadata only on `gptpro / codex-auto-review`. It declares a local context limit of 128000 and an output limit of 8192. These declarations are not measured gateway limits. It also declares the previously tested wire levels: `low`, `medium`, `high`, and `xhigh`. It preserves other models, provider settings, and credential references. It does not read or store API keys.

## Removal

Use the plugin manager to disable or remove this bundle. Its patch will no longer disable the built-in component. Confirm the live component state before you select Auto again.

Do not disable only the new plugin row while this bundle remains enabled. The bundle would still disable the built-in row. Remove or disable the whole bundle for rollback.

Model metadata added by setup remains in the profile after removal. It does not affect the main model. Use the configuration editor if you also want to remove that metadata.

## Development

The project is a local Git repository. It has no remote repository. Git uses a project-local development identity. It does not change your global Git identity.

Run:

```sh
npm run check
```

Tests use the installed DSH runtime. Set `DSH_RUNTIME_DIR` if DSH is not in the global npm directory. Tests require version `0.2.0-rc.2`. No test installs another runtime.

See `NOTICE.md` for the source license and `docs/verification.md` for test results and limits.

Project reports use short, direct English. They are not certified for full ASD-STE100 compliance. The upstream policy and license remain unchanged.

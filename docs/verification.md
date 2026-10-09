# Verification

## Result

The independent review bundle is installed in the `web` profile. The new review component is active. Its Config schema is available. The built-in review component is disabled by the bundle patch.

The active review route is `gptpro / codex-auto-review / medium`. The timeout is 60000 ms.

## Automated tests

Run `npm run check` with DSH `0.2.0-rc.2` and Node 24.

Gate-release snapshot: 57 tests passed. No tests failed. The later GUI release runs these unchanged safety tests plus 41 GUI tests; see [GUI verification](gui-verification.md).

The tests cover separate route settings, main-route changes, strict decisions, evidence roles, logged action matching, stream completion, cancellation, timeout, iterator closure, concurrent calls, approval policies, other guards, and confined plugin removal.

Four tests use the real DSH `ToolRuntime` and `LlmRuntime` with controlled session, preset, approval, and adapter fixtures. Additional tests use a real DSH Session, replay its events, check PTC inner-action evidence, and test the actual tool callback signature.

A regression test confirms that deferred setup runs outside the installation transaction.

The review policy matches the retained upstream source exactly.

## Independent code review

A read-only review found one iterator cleanup defect in the first implementation. The current code requests closure and waits for bounded cleanup. Two tests check closure.

That review found no other concrete blocking source defect in its snapshot.

## Live adapter test

The official DSH pi-ai adapter sent three synthetic review requests. Both synthetic read actions produced `low / allow`. The fictional credential-send action produced `high / deny`.

All requests used `gptpro / codex-auto-review / medium`. No tool body ran. No actual conversation history was sent. The test prepared metadata in memory.

Run only with explicit permission:

```sh
DSH_ALLOW_LIVE_REVIEW=1 npm run test:live
```

## Installed gate test

A temporary Host bundle tested the installed gate through the live SessionStore, permission service, ToolRuntime, and model adapter. It used synthetic isolated scope carriers. It did not start a main-agent loop.

| Test | Review request | Tool body |
| --- | --- | --- |
| Main route `gptpro / gpt-6.1-sol` | Independent route | Ran once |
| Main route `deepseek-official / deepseek-flash` | Independent route | Ran once |
| Separate tool guard denies | Independent route | Did not run |
| Logged action differs from arguments | None | Did not run |

The three model requests used the saved independent route and `medium` effort. The scoped test tools were not visible globally. Existing session permissions stayed unchanged. All temporary sessions were removed.

The first probe had an incorrect callback signature. The helper was corrected. A real ToolRuntime test now checks that signature.

Both temporary bundles were removed through the plugin manager after verification.

## Installation repairs

- Corepack supplied the missing `pnpm` command.
- The missing VS Code Git Rollback source was restored from its existing profile cache. The copied files match the cache. The component remains disabled. Its peer constraints were not changed.
- A timer retained the installation's HMR transaction. Setup now starts from the post-transaction `plugin-manager/changed` event.
- The linked review package could not resolve shipped APIs. `npm run link:runtime` creates project-local links to the exact tested packages. It does not install another runtime or overwrite existing dependencies.
- No install scripts were approved or run. No version exemptions were granted.
- Profile package and patch changes used the plugin manager. The review-model metadata update used the public ConfigEditor service.

The dependency manager also moved two manually copied VS Code client packages to its ignored cache. Their rows became inactive or missing. The user approved a recovery. Both packages were copied to stable workspace directories and installed through the plugin manager. The runtime files match their cached sources. The bridge gained an empty bundle patch only. The original clipboard patch was retained. Both rows are restored.

Two existing optional-module import warnings remain: `otel` and `ui-settings-session-log`. This project did not change those components.

## Limits

- Browser control is not available. The GUI's permission-menu interaction was not tested.
- The installed test used synthetic carriers, not a driven main-agent loop.
- Full PTC transport and inner tool execution were not tested. PTC evidence validation passed.
- Plugin removal with the real live permission service was not exercised. Controlled lifecycle tests passed.
- Context and output declarations are local settings, not measured gateway capacities.
- A defective adapter that ignores abort can outlive the one-second cleanup wait. It cannot grant the pending call.
- Model review is probabilistic. These results are not a security guarantee.

The GPT Pro gateway uses HTTP. Review data has no TLS protection on that connection.

# Verification

## Automated tests

Run `npm run check` with DSH `0.2.0-rc.2` and Node 24.

Current result: 55 tests passed. No tests failed.

The tests cover:

- Separate provider, model, and reasoning settings.
- Main provider and model changes.
- Valid and invalid review decisions.
- Duplicate JSON members and unexpected fields.
- Instruction, checkpoint, constraint, and fact roles.
- Missing or mismatched logged actions and tool schemas.
- Stream completion, truncation, and data after completion.
- Review failure without a main-model fallback.
- Approval behavior under `ask` and `never`.
- Call cancellation and request timeout.
- Iterator closure after timeout and cancellation.
- Plugin removal and confined permissions.
- Concurrent review calls.
- Preservation of other routes during model setup.

Four tests use the actual DSH `ToolRuntime` and `LlmRuntime`. The test tool body runs after a valid allow. It does not run after malformed output, adapter failure, or a separate tool-guard denial. These tests use controlled session, preset, and approval fixtures.

The review policy matches the retained upstream source exactly.

## Independent code review

A read-only review found one cleanup defect. The first implementation did not request stream closure after a timeout. The current implementation owns the iterator, requests closure, and waits for bounded cleanup. Two tests check closure.

The review found no other concrete blocking source defect in that snapshot.

## Live test

The live test uses the official DSH pi-ai adapter and the saved credential reference. It sends three synthetic review requests. It does not send actual session history. It does not execute tool bodies. It does not change profile settings.

Run only with explicit permission:

```sh
DSH_ALLOW_LIVE_REVIEW=1 npm run test:live
```

The live test passed. Both synthetic main routes produced `low / allow`. The fictional credential-send action produced `high / deny`. All three requests used `gptpro / codex-auto-review / medium`. No tool body ran.

The model metadata was prepared in memory. This result does not prove that the plugin is installed or that the saved profile model entry is valid.

## Installation

The first setup installation failed because `pnpm` was absent. Corepack enabled the command.

The next installation failed because the profile references a missing local VS Code Git Rollback package. The missing dependency blocks the complete profile dependency tree. No setup or reviewer bundle was installed by these attempts.

Do not remove that package or change the profile manifest by hand. Repair it through a supported management path with the user's approval.

## Limits

- Full browser interaction is not available.
- The live GUI's Auto selection has not been exercised.
- Full PTC inner execution has not been tested.
- Real session replay passed. Real permission-service removal has not been tested.
- PTC action evidence passed. Full PTC transport and inner tool execution have not been tested.
- The local context and output declarations are not measured gateway limits.
- A defective adapter that ignores abort can outlive the one-second cleanup wait. It cannot grant the pending tool call.
- Model review is probabilistic. A successful test is not a security guarantee.

The GPT Pro gateway uses HTTP. Review data has no TLS protection on that connection.

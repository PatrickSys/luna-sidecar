---
phase: 04-agent-ux-and-delivery
status: passed
verified_commit: 8a0f902b9f5d66c4d609940a6425646060ea31fc
verifier_runtime: Codex desktop fresh-context verifier
requirements:
  - UX-01
  - PORTABLE-01
  - RELEASE-01
re_verification:
  previous_verification_commit: 9d6ce07ffa796f6bc6cc2283deb02b4bb1a4444a
  failed_ci_run: 31306116741
  recovery_commit: 8a0f902b9f5d66c4d609940a6425646060ea31fc
  recovery_ci_run: 31306925974
  gaps_closed:
    - "The same-cwd resume warning test now waits for durable prompt claim before mutating fallback fields."
  gaps_remaining: []
  regressions: []
---

# Phase 4 verification

## Verdict

PASS after test-only recovery. CI for the first verification commit exposed one Ubuntu Node 22.20.0 synchronization race in the same-cwd resume-warning test. The repaired test preserves the exact predicate, passes the independent focused check, and is green in the exact four-job recovery CI run. Direct Phase 4 evidence remains sufficient for UX-01, PORTABLE-01, and RELEASE-01 within the recorded claim boundary. The roadmap remains open; this file does not change it.

## Binding and adversarial repair check

- Recovery starting gate: `main`, clean tree, `HEAD`, local `origin/main`, and remote `refs/heads/main` were all `8a0f902b9f5d66c4d609940a6425646060ea31fc` before this file was updated.
- `testedCommit` is `5a85a7e76b8306203d380aa0c0ed15eec9fb4692`; `evidenceCommit` is `dbdbd7f93c484ce1fd21defccc602f0431e5fc3f`; the first verification commit is `9d6ce07ffa796f6bc6cc2283deb02b4bb1a4444a`; the recovery commit is `8a0f902b9f5d66c4d609940a6425646060ea31fc`.
- `git merge-base --is-ancestor testedCommit recoveryCommit`: exit 0.
- `git diff --name-only testedCommit..evidenceCommit`: exactly `.planning/phases/04-agent-ux-and-delivery/04-SUMMARY.md`, `docs/verification/v1-release-evidence.json`, and `docs/verification/v1-release-evidence.md`.
- `git diff --name-only evidenceCommit..firstVerificationCommit`: exactly `.planning/phases/04-agent-ux-and-delivery/04-VERIFICATION.md`.
- `git diff --name-only firstVerificationCommit..recoveryCommit`: exactly `test/safety.test.mjs`.
- The first live attempt is retained in `04-LIVE-ATTEMPTS.md`: tested `4baf0ad9b18aa38dc1755fe95ed6635b475c1110`, run `31303784939`, `releaseReady=false`, `resume_incomplete`, `markerAbsent=true`, and `markerCommandFailed=false`. Parent, cancellation, and cleanup predicates passed.
- Commit `5a85a7e` changes the resume prompt/test contract only. `buildResumePrompt` requires one exact marker command, read-only nonzero failure, no bypass/alternate mechanism/simulation, and cwd reporting. `failedMarkerCommandPredicate` still independently requires `item.completed`, `command_execution`, the marker basename, `status: failed`, and nonzero `exit_code`; `markerAbsent` remains a separate required predicate. The repair did not weaken the gate.

## Failed verification run and recovery

- CI run `31306116741`, bound to verification-only commit `9d6ce07ffa796f6bc6cc2283deb02b4bb1a4444a`, completed with one failure: Ubuntu Node 22.20.0 job `93226669793` failed test 75, `resume reports active write-capable same-cwd workers without blocking`, at `test/safety.test.mjs:141`. The assertion expected `active_same_cwd_writers:08d4e809-3848-4bfe-b150-0ce02c30d29d`; actual warnings were `[]`. The job reported 80/81 passing, one failure, zero cancelled/skipped, and duration `68514.416698ms`. Its three sibling matrix jobs passed.
- The failure was a synthetic test synchronization race, not an infrastructure failure or production-code regression. The fixture waited only for persisted `runnerPid`, directly rewrote the active worker manifest, and immediately invoked resume while the detached runner could still be claiming the prompt and persisting lifecycle state.
- Recovery commit `8a0f902` changes only `test/safety.test.mjs`: the affected call now additionally waits until the latest turn has durable `promptClaimedAt`, while the existing provider-start barrier remains held. The exact `active_same_cwd_writers:<workerId>` assertion is unchanged. The helper keeps its existing 10-second deadline and 10ms poll cadence; no recovery-specific retry, sleep, timeout increase, skip, production change, or predicate relaxation was added.
- Recovery CI run `31306925974` is bound exactly to `8a0f902b9f5d66c4d609940a6425646060ea31fc` and completed success in all four jobs.

## Acceptance matrix

| Phase 4 gate | Result | Direct evidence |
|---|---|---|
| Explicit three-phrase activation; host owns IDs, lifecycle, authority, and result evaluation | PASS | `skills/luna-sidecar/SKILL.md`, `skills/luna-sidecar/references/USAGE.md`, `test/ux.test.mjs`; UX focused test passed 20/20 and full suite passed 81/81. |
| Prompting patterns are guidance, not runtime modes; uncertainty, secrets, raw logs, and final messages are handled honestly | PASS | `USAGE.md`, `SKILL.md`, `README.md`, UX assertions, and the allowlisted evidence serializer. No host adapter or task mode was added. |
| Public CLI help, `stop`, actionable errors, and lifecycle compatibility | PASS | `test/ux.test.mjs`, `test/contract.test.mjs`, `skills/luna-sidecar/scripts/luna-sidecar.mjs`; full suite passed. |
| Same-cwd resume warning remains strict across fixture startup | PASS | Recovery diff waits for durable `promptClaimedAt` before fallback-field mutation; provider start remains barrier-controlled; the exact warning assertion is unchanged. Independent focused safety run passed 7/7, and recovery CI passed all four jobs. |
| Pinned non-global copied installer contract | PASS | `package.json`/lockfile pin `skills` to `1.5.22`; `test/install-parity.test.mjs` verifies engine/bin/help, isolated roots, no secrets, no symlinks, and copied Codex/Claude launchers. |
| Codex and Claude installed bytes are identical to canonical source | PASS | `v1-release-evidence.json`: canonical, Codex, and Claude manifest hash `b1bf85a0e066b9f905d26dabb67980274eb5d92abead00e8ca6305d14b4159ab`; final audit recomputed the canonical manifest and matched all three hashes. |
| Installed launchers execute the same fake-provider contract | PASS | Install-parity test runs both copied launchers; release-smoke test runs the copied Codex launcher through the recorded PATH shim; full suite passed. |
| Deterministic delivery gate precedes live work | PASS | CI workflow is Windows/Ubuntu x Node `22.20.0`/`24.x`, `npm ci`, one `npm test`, and `git diff --check`; implementation run `31304748019` and test-recovery run `31306925974` are exactly bound to their commits and all four jobs succeeded. The intervening failed run remains recorded below. |
| Bounded parent/resume/cancellation proof | PASS | Evidence predicates: parent authority/cwd/lineage/completion/provider completion/logs true; `nativeChildCount=2`; resume authority/cwd/lineage/completion/provider completion/logs/failed-marker/marker-absence true; cancellation running observation/acknowledgement/cancelled/result/known-PID absence true. |
| Cleanup ownership and process residue | PASS | Evidence: launched/discovered workers `2/2`, owned PID count `6`, stop failures `0`, identity uncertainty/mismatch `0/0`, lingering PIDs `0`, recovery unused, scratch cleanup successful. Final audit found no matching test/provider process and no `luna-release-smoke-*` scratch directory. |
| Redaction and bounded claim | PASS | JSON/Markdown are exact renderings; final audit found no forbidden prompt/env/argv/raw/stderr/event/receiver/final-message keys, sensitive sentinel strings, or absolute paths. Evidence has no raw PIDs or receiver IDs. |
| Release record truth and portability scope | PASS | `releaseReady=true`, `failureStage=null`, `unresolvedGaps=[]`; evidence records Node `24.14.1`, Codex `0.147.0`, `skills@1.5.22`, Windows host, tested commit, CI run, commands, hashes, and limitations. |

Phase 1-3 requirements are inherited from their prior independent verification records, not relabeled as new Phase 4 evidence: HARNESS-01, COMPAT-01, AUTH-01, LINEAGE-01, LIFE-01, CANCEL-01, CONCURRENCY-01, OBSERVE-01, RECEIPT-01, RESOURCE-01, and SAFETY-01.

## Exact checks and results

- Focused deterministic command: `node --test test/ux.test.mjs test/install-parity.test.mjs test/release-smoke.test.mjs` — exit 0; 20 passed, 0 failed.
- Full deterministic command: `cmd.exe /d /s /c npm test` — exit 0; 81 passed, 0 failed, duration `100442.8127ms`.
- The direct `npm.cmd test` wrapper launch returned `spawn EINVAL` before npm executed; the native Windows npm entry above completed the suite successfully. This is recorded as a launcher observation, not a test failure.
- `git diff --check` — exit 0.
- Final read-only consistency audit — PASS: JSON parses; Markdown embedded JSON and canonical rendering match; tested commit is an ancestor; implementation-to-evidence diff is exact; canonical manifest and path hashes match; CI fields and four job names match; all required predicates and cleanup facts pass; redaction scan passes; no matching processes or scratch roots remain.
- Recovery delta focused command: `node --test --test-concurrency=1 test/safety.test.mjs` — exit 0; 7 passed, 0 failed, duration `12555.7198ms`. The repaired test passed in `2045.7355ms`.
- Recovery scope and hygiene: `git diff --name-status 9d6ce07..8a0f902` returned only `M test/safety.test.mjs`; `git diff --check 9d6ce07..8a0f902` was clean; the worktree remained clean after the focused run. No package or production file changed.
- Writer-reported recovery checks were 20/20 consecutive focused safety runs and one 81/81 full suite; this delta verifier did not repeat those batches. The exact recovery CI and the single independent focused run are the independently checked proof.
- No full suite was rerun during this bounded recovery verification.
- No live smoke command was run by this verifier.

## Exact CI evidence

Implementation run `31304748019` (`testedCommit` `5a85a7e76b8306203d380aa0c0ed15eec9fb4692`):

- `93223188796` — `windows-latest / Node 22.20.0` — completed/success
- `93223188843` — `windows-latest / Node 24.x` — completed/success
- `93223188841` — `ubuntu-latest / Node 22.20.0` — completed/success
- `93223188819` — `ubuntu-latest / Node 24.x` — completed/success

Evidence/summary run `31305242653` (`dbdbd7f93c484ce1fd21defccc602f0431e5fc3f`):

- `93224426059` — `windows-latest / Node 22.20.0` — completed/success
- `93224426071` — `ubuntu-latest / Node 24.x` — completed/success
- `93224426081` — `windows-latest / Node 24.x` — completed/success
- `93224426106` — `ubuntu-latest / Node 22.20.0` — completed/success

Failed verification-document run `31306116741` (`9d6ce07ffa796f6bc6cc2283deb02b4bb1a4444a`):

- `93226669745` — `windows-latest / Node 24.x` — completed/success
- `93226669777` — `ubuntu-latest / Node 24.x` — completed/success
- `93226669779` — `windows-latest / Node 22.20.0` — completed/success
- `93226669793` — `ubuntu-latest / Node 22.20.0` — completed/failure; test 75 returned `[]` instead of the exact active-writer warning

Test-recovery run `31306925974` (`8a0f902b9f5d66c4d609940a6425646060ea31fc`):

- `93228662567` — `windows-latest / Node 22.20.0` — completed/success
- `93228662606` — `ubuntu-latest / Node 22.20.0` — completed/success
- `93228662616` — `windows-latest / Node 24.x` — completed/success
- `93228662617` — `ubuntu-latest / Node 24.x` — completed/success

## Claim boundary and follow-up

The supported live claim remains limited to Agent Skills copied-install portability and deterministic Codex CLI process evidence recorded at `5a85a7e`, on the documented platforms, Node `24.14.1`, Codex `0.147.0`, `skills@1.5.22`, and implementation CI run. Recovery commit `8a0f902` changes only deterministic test synchronization and adds no new live-runtime claim. This does not prove live provider task success, model quality, universal host routing, universal sandbox reliability, secret redaction of local state/raw logs/final messages, or cleanup of unrecorded child threads.

No unresolved release gaps remain within that bounded claim. Residual risk is limited to the usual scheduler sensitivity of a process-oriented fixture; the durable prompt-claim predicate closes the observed interleaving without masking failure. A lead may separately update only the Phase 4 roadmap checkbox under the documented remote-drift gate; no roadmap completion, tag, release, or package publication is performed here.

---
phase: 04-agent-ux-and-delivery
status: passed
verified_commit: dbdbd7f93c484ce1fd21defccc602f0431e5fc3f
verifier_runtime: Codex desktop fresh-context verifier
requirements:
  - UX-01
  - PORTABLE-01
  - RELEASE-01
---

# Phase 4 verification

## Verdict

PASS. Direct Phase 4 evidence is sufficient for UX-01, PORTABLE-01, and RELEASE-01 within the recorded claim boundary. The roadmap remains open; this file does not change it.

## Binding and adversarial repair check

- Starting gate: `main`, clean tree, `HEAD`, local `origin/main`, and remote `refs/heads/main` were all `dbdbd7f93c484ce1fd21defccc602f0431e5fc3f` before this file was written.
- `testedCommit` is `5a85a7e76b8306203d380aa0c0ed15eec9fb4692`; `evidenceCommit`/current pre-verification HEAD is `dbdbd7f93c484ce1fd21defccc602f0431e5fc3f`.
- `git merge-base --is-ancestor testedCommit HEAD`: exit 0.
- `git diff --name-only testedCommit..HEAD`: exactly `.planning/phases/04-agent-ux-and-delivery/04-SUMMARY.md`, `docs/verification/v1-release-evidence.json`, and `docs/verification/v1-release-evidence.md`.
- The first live attempt is retained in `04-LIVE-ATTEMPTS.md`: tested `4baf0ad9b18aa38dc1755fe95ed6635b475c1110`, run `31303784939`, `releaseReady=false`, `resume_incomplete`, `markerAbsent=true`, and `markerCommandFailed=false`. Parent, cancellation, and cleanup predicates passed.
- Commit `5a85a7e` changes the resume prompt/test contract only. `buildResumePrompt` requires one exact marker command, read-only nonzero failure, no bypass/alternate mechanism/simulation, and cwd reporting. `failedMarkerCommandPredicate` still independently requires `item.completed`, `command_execution`, the marker basename, `status: failed`, and nonzero `exit_code`; `markerAbsent` remains a separate required predicate. The repair did not weaken the gate.

## Acceptance matrix

| Phase 4 gate | Result | Direct evidence |
|---|---|---|
| Explicit three-phrase activation; host owns IDs, lifecycle, authority, and result evaluation | PASS | `skills/luna-sidecar/SKILL.md`, `skills/luna-sidecar/references/USAGE.md`, `test/ux.test.mjs`; UX focused test passed 20/20 and full suite passed 81/81. |
| Prompting patterns are guidance, not runtime modes; uncertainty, secrets, raw logs, and final messages are handled honestly | PASS | `USAGE.md`, `SKILL.md`, `README.md`, UX assertions, and the allowlisted evidence serializer. No host adapter or task mode was added. |
| Public CLI help, `stop`, actionable errors, and lifecycle compatibility | PASS | `test/ux.test.mjs`, `test/contract.test.mjs`, `skills/luna-sidecar/scripts/luna-sidecar.mjs`; full suite passed. |
| Pinned non-global copied installer contract | PASS | `package.json`/lockfile pin `skills` to `1.5.22`; `test/install-parity.test.mjs` verifies engine/bin/help, isolated roots, no secrets, no symlinks, and copied Codex/Claude launchers. |
| Codex and Claude installed bytes are identical to canonical source | PASS | `v1-release-evidence.json`: canonical, Codex, and Claude manifest hash `b1bf85a0e066b9f905d26dabb67980274eb5d92abead00e8ca6305d14b4159ab`; final audit recomputed the canonical manifest and matched all three hashes. |
| Installed launchers execute the same fake-provider contract | PASS | Install-parity test runs both copied launchers; release-smoke test runs the copied Codex launcher through the recorded PATH shim; full suite passed. |
| Deterministic delivery gate precedes live work | PASS | CI workflow is Windows/Ubuntu x Node `22.20.0`/`24.x`, `npm ci`, one `npm test`, and `git diff --check`; run `31304748019` is bound to `testedCommit` and all four jobs succeeded. |
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

## Claim boundary and follow-up

The supported claim is limited to Agent Skills copied-install portability and deterministic Codex CLI process evidence for the recorded commit, platforms, Node `24.14.1`, Codex `0.147.0`, `skills@1.5.22`, and CI runs. This does not prove live provider task success, model quality, universal host routing, universal sandbox reliability, secret redaction of local state/raw logs/final messages, or cleanup of unrecorded child threads.

No unresolved release gaps remain within that bounded claim. A lead may separately update only the Phase 4 roadmap checkbox under the documented remote-drift gate; no roadmap completion, tag, release, or package publication is performed here.

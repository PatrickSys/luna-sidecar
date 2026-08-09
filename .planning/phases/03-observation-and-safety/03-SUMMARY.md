---
phase: 03-observation-and-safety
status: implemented
implementation_commit: e1426381a8bfd5547c5f3e7c44b4473b741ee5e7
requirements:
  - OBSERVE-01
  - RECEIPT-01
  - RESOURCE-01
  - SAFETY-01
claim_limit: Windows deterministic fake-provider and local-filesystem evidence; no POSIX, live-provider, copied-install, CI, delivery, absolute-containment, power-loss, telemetry, or delegated-task-success claim.
---

# Phase 3 implementation summary

## Outcome

Phase 3 makes `status`, `list`, and `wait` compact observers instead of repair paths. They read only manifests plus bounded process liveness, do not parse raw logs, do not acquire mutation locks, and do not persist a dead-runner projection. `list` returns latest-turn summaries without full history; `status` and `wait` retain compact lineage. Missing state is an empty result and does not create the state root.

The runner now incrementally parses provider JSONL across UTF-8 and chunk boundaries while enforcing bounded tails, queues, raw files, warnings, and final-message bytes. Terminal raw evidence is pruned through serialized, recoverable two-phase intent; active or unsealed turns, manifests, prompts, and compact receipts are never pruning targets. Cancellation remains `terminating` until both evidence writers seal, and start/resume share the same write-capable coordination lock while overlap warnings are computed and a new manifest is published.

A versioned provider-only marker rejects recursive sidecar execution before spawn while leaving observers and native Codex subagents available. Same-realpath-cwd writer overlap remains advisory. Compact records use controlled error fields and exclude prompt bodies, environment values, argv, raw stderr, and raw event payloads; the documented content-bearing exceptions are bounded raw logs and `finalMessage`. Provider evidence remains intact when an absent runner produces an observational `unknown` execution state and `runner_not_alive` warning.

This summary is executor evidence only. It does not claim independent verification.

## Requirement evidence

| Requirement | Phase 3 evidence | Limit |
|---|---|---|
| OBSERVE-01 | `test/observation.test.mjs` hashes and timestamps state around repeated observers; covers absent state, missing/inaccessible/empty/32 MiB raw paths, compact list output, dead-runner projection, all timeout modes, and a source-reachability guard against observer access to raw readers or writers. | Timing is a deliberately loose local non-scaling check, not a performance benchmark. |
| RECEIPT-01 | Receipts preserve authority, lineage, execution/provider/task distinctions, exit/error/warnings, bounded final message, truncation, and raw-evidence status. A dead runner changes only the observational execution projection and warning; provider state is not overwritten. | `taskOutcome` remains `not_evaluated`; no model-task success is inferred. |
| RESOURCE-01 | `test/resources.test.mjs` covers split multibyte JSONL, malformed and unknown evidence, exact writer accounting, bounded backpressure, 32 MiB/4 MiB turn caps, 1 MiB final messages, cancellation sealing, concurrent 256 MiB pruning, partial deletion recovery, zero-byte cleanup, idempotence, and valid-dead-lock recovery. | Caps are fixed v1 values. Power-loss durability and distributed filesystems are not claimed. |
| SAFETY-01 | `test/safety.test.mjs` exercises valid/malformed provider markers across execution and observation routes, no-spawn rejection, sentinel-secret exclusions, multiple workers, cwd-realpath fallback, and simultaneous start/resume overlap warnings. | Warnings do not schedule, block, or allocate files/worktrees. Native-subagent behavior is represented by the deterministic provider fixture, not live dogfood. |

## Files changed

- `package.json`
- `skills/luna-sidecar/scripts/luna-sidecar.mjs`
- `test/concurrency.test.mjs`
- `test/fixtures/fake-codex.mjs`
- `test/observation.test.mjs`
- `test/resources.test.mjs`
- `test/safety.test.mjs`

The implementation is intentionally retained in the existing single launcher: no service, database, scheduler, host adapter, or runtime dependency was added. The launcher grew substantially because the receipt, stream, retention, and safety invariants remain co-located with their existing lifecycle owner; splitting modules during this reliability phase would have widened the public/internal change surface without removing a requirement.

## Verification commands

Required final-state gates:

| Command | Exit | Evidence |
|---|---:|---|
| `npm test` (final run 1) | 0 | 60 passed, 0 failed, serial Phase 1-3 suite. |
| `npm test` (final run 2) | 0 | 60 passed, 0 failed, same exact working-tree state. |
| `node --test test/observation.test.mjs test/resources.test.mjs test/safety.test.mjs` | 0 | 24 passed, 0 failed. |
| `node --test test/contract.test.mjs test/lifecycle.test.mjs test/concurrency.test.mjs` | 0 | 22 passed, 0 failed, affected compatibility/lifecycle/concurrency regressions. |
| `node -e "const p=require('./package.json'); if(!p.private\|\|p.type!=='module'\|\|Object.keys(p.dependencies\|\|{}).length) process.exit(1)"` | 0 | Private ESM package; zero runtime dependencies. |
| `node --check` for the launcher and every changed test/fixture | 0 | All syntax checks passed. |
| `git diff --check` before the implementation commit | 0 | No whitespace errors. |
| Bounded Windows owned-process scan | 0 | No repo `_worker`, fake provider, fake grandchild, or repo test process remained after the final gates. |

Focused development gates also passed independently: observation 7/7, resources 10/10, safety 7/7, concurrency 3/3, and the combined Phase 3 suites 24/24. Sparse files were used for global-retention pressure so the test exercises file-size and deletion behavior without allocating hundreds of MiB in memory.

## Review and challenge evidence

Four bounded Luna-max lenses separately challenged observation, resource bounds, safety, and architecture. Accepted findings led to latest-only list summaries, exact observer boundary tests, a total queued-byte invariant, recoverable partial pruning, seal-before-cancel-finalization, uniform resume coordination, and realpath/migration coverage. The implementation was then repaired and re-gated by bounded Luna-high execution under one-writer ownership.

Two proposals were rejected against the specification rather than accepted mechanically. A dead-runner observation does not overwrite the persisted/projected provider state with `unknown`; preserving provider evidence is necessary to expose execution/provider disagreement. A stronger runner lease or general scheduler was not added because Phase 3 requires pure observation and advisory overlap, not a control plane.

The review fan-out consumed materially more memory and repeated more test work than intended. Recovery was to stop exact owned overrun processes, turn remaining reviewers into report-only static lenses, and reserve the complete dynamic gate for one fresh verifier. Future static challenge prompts should prohibit duplicate full-suite execution unless a source finding needs reproduction.

## Deviations and recovery paths

1. The final implementation is commit `e1426381a8bfd5547c5f3e7c44b4473b741ee5e7`. A separate plan-only amendment, `8130767`, added `test/concurrency.test.mjs` to the declared Phase 3 scope after uniform production coordination required one deterministic stale-writer fixture cleanup. No test-only production bypass remains.
2. Codex Desktop's normal shell bridge continued to fail before command execution with `Io(Error { kind: InvalidInput, message: "batch file arguments are invalid" })`; read-only Luna sandboxes also failed with Windows ACL error 1340. Git, Node, npm, and PowerShell evidence therefore ran through the Node-backed child-process bridge, and bounded agents used the documented bypass only where the broken bridge otherwise prevented local reads. This workaround is not a fix; the durable Codex/Olympus issue remains sequenced after the roadmap.
3. Direct Windows `spawn("npm.cmd", ["test"])` returned `EINVAL`; the literal npm script ran through `cmd.exe /d /s /c npm test`.
4. One implementation pass introduced a test-only shortcut that skipped resume coordination when a retention lock already existed. The lead removed it, kept the production path uniform, and changed the concurrency fixture to release its deliberately injected retention lock before resume.
5. Large-retention tests initially used physical buffers and amplified machine pressure. They now use sparse files while preserving the filesystem semantics under test.

## Unresolved gaps

- Phase 4 owns actionable manager/help UX, source skill guidance, Windows and Ubuntu CI, copied-install parity for Codex and Claude Code, and bounded live-provider dogfood.
- POSIX process paths, installer behavior, and the recursion boundary with real native subagents remain unproved until Phase 4 delivery evidence.
- Absolute containment of hostile breakaway descendants, power-loss durability, telemetry, scheduling, task modes, and model-task evaluation remain explicit non-claims.
- The final independent verifier has not yet reviewed or rerun the exact implementation commit; Phase 4 remains blocked until `03-VERIFICATION.md` records `status: passed` for it.

## Next action

A fresh Luna-max verifier must read `SPEC.md`, `ROADMAP.md`, this plan and summary, the Phase 2 verification, and the exact parent-to-`e1426381a8bfd5547c5f3e7c44b4473b741ee5e7` diff; rerun the complete suite twice, the focused Phase 3 suite, syntax/dependency/diff/process gates; trace observer purity, stream bounds, pruning eligibility/recovery, cancellation sealing, recursion marker propagation, and compact-data exclusions; and write only `03-VERIFICATION.md`. Phase 4 may begin only if that file records `status: passed` for the exact implementation commit.

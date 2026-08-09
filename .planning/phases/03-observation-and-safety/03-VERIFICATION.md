---
phase: 03-observation-and-safety
status: passed
verified_commit: e1426381a8bfd5547c5f3e7c44b4473b741ee5e7
verifier_runtime: "codex-cli gpt-5.6-luna max"
requirements:
  - OBSERVE-01
  - RECEIPT-01
  - RESOURCE-01
  - SAFETY-01
claim_limit: "Windows deterministic fake-provider and local-filesystem evidence for the exact implementation commit; no POSIX, live-provider, copied-install, CI, delivery, absolute-containment, power-loss, telemetry, scheduling, or delegated-task-success claim."
---

# Phase 3 independent verification

## Verdict

`passed` for the exact implementation commit `e1426381a8bfd5547c5f3e7c44b4473b741ee5e7`.

The required planning/specification artifacts were read in full. The implementation evidence below comes from the exact target commit and its exact parent-to-target diff, not from later documentation. The current checkout is a clean `main` descendant whose implementation paths are unchanged from the target; the only later descendant change is `.planning/phases/03-observation-and-safety/03-SUMMARY.md`.

## Worktree and exact-commit boundary

- Initial `git status --porcelain=v1 --branch`: exit `0`; `## main...origin/main [ahead 3]`; no dirty paths.
- Initial `git rev-parse HEAD`: `b77fe6ee8107f4938ccb50efa834c71632648c53`.
- Target parent lookup and target type checks: exit `0`; target parent `8130767f3c6667c8868db987ff4375d44053aee6`; target is a commit.
- Exact target diff: 7 files, `1739` insertions and `134` deletions. Changed paths are `package.json`, the launcher, `test/concurrency.test.mjs`, `test/fixtures/fake-codex.mjs`, and the three Phase 3 suites.
- `git diff --quiet e1426381a8bfd5547c5f3e7c44b4473b741ee5e7 HEAD --` over all implementation paths: exit `0`.
- `git diff --name-status e1426381a8bfd5547c5f3e7c44b4473b741ee5e7 HEAD`: only `A .planning/phases/03-observation-and-safety/03-SUMMARY.md`.
- No stage, commit, push, install, publish, implementation repair, or live provider invocation was performed.

## Requirement evidence

| Requirement | Evidence at exact target | Result and boundary |
| --- | --- | --- |
| OBSERVE-01 | `skills/luna-sidecar/scripts/luna-sidecar.mjs:1153-1192` reads one compact manifest, performs only bounded runner liveness projection, and implements immediate read, omitted/zero indefinite wait, 250 ms polling, monotonic deadline, and a final boundary read. `:1735-1749` treats a missing state root as empty and omits full turn history from `list`. `test/observation.test.mjs:13-185` covers missing-root non-creation, hash/mtime read-only snapshots, missing/directory/32 MiB raw paths, dead-runner projection, timeout modes, observer call-graph exclusion, and latest-only list lineage. | Passed. Dead-runner projection changes execution state/error/warning while preserving provider state, exit evidence, logs, and final message. No raw-log read or observer write path is reachable. The timing assertion is a bounded local check, not a performance benchmark. |
| RECEIPT-01 | `:1751-1844` exposes schema, stable worker/turn lineage, authority, execution/provider/task distinctions, exit/signal/error, warnings, final message, aliases, and log metadata. `:1884-2218` normalizes v2/legacy reads, caps warnings/final text, controls error messages, and validates log accounting. `test/observation.test.mjs` and `test/safety.test.mjs` exercise provider/process disagreement, additive fields, and compact output. | Passed. `taskOutcome` remains `not_evaluated`; provider final text is evidence only and is not treated as delegated-task success. |
| RESOURCE-01 | `:27-34` fixes 32 MiB stdout, 4 MiB stderr, 256 MiB terminal-log, warning, final-message, and parser-tail limits. `:762-947` incrementally decodes UTF-8/JSONL, handles CRLF/no-final-newline/malformed/unknown/nonfatal events, bounds the tail and queue, and seals byte-correct writers. `:1544-1726` performs serialized terminal-only pruning with canonical-path validation, intent-before-delete, partial recovery, and idempotence. `:650-680`, `:961-980`, and `:1391-1429` keep cancellation terminalization after evidence sealing. The 10 resource tests in `test/resources.test.mjs` passed. | Passed. Persisted plus dropped bytes equal observed bytes and persisted file size; active logs, manifests, prompts, and compact receipts are not pruning targets. Local filesystem and fixed-cap limits only. |
| SAFETY-01 | `:58-102` validates the versioned marker before execution routes, strips it from detached runner environments, and injects it only into provider environments. `:1516-1542` computes advisory same-cwd writer warnings using realpath fallback; `:279-300` and `:1088-1129` coordinate write-capable start/resume under the retention lock. `:1793-1825` is an allowlisted compact turn view. `test/safety.test.mjs:12-220` covers valid/malformed marker rejection before spawn, observation allowance, native-subagent event evidence, independent workers, advisory start/resume overlap, and sentinel exclusion. | Passed. Recursion is rejected before runner/provider spawn; observation remains allowed; native-subagent behavior is represented by the deterministic provider fixture, not live dogfood. Same-cwd warnings never block or allocate. |

## Source predicate findings

- Observer purity: `status`, `list`, and `wait` call `readWorker`/normalization and `runnerLiveness` only. The exact target call-graph test passed and found no reachable writer, raw reader, retention lock, pruning, or state-root creation function. `observeWorker` uses `structuredClone` and does not persist a dead-runner projection.
- Lineage projection: `workerView` retains compact `turns` history for `status`/`wait`; `listWorkers` deletes `turns`, leaving the latest-turn summary and compatibility aliases.
- Wait semantics: `parseWait` maps omission and `--timeout 0` to no deadline; positive waits read immediately, poll at most every 250 ms against `performance.now()`, and perform a second observation at the deadline so a terminal state observed at the boundary wins over timeout.
- Provider/process disagreement: `observeWorker` sets only projected execution state/error/warning to `unknown`/`runner_not_alive`; it leaves provider state, exit/signal, final message, and log metadata intact.
- Streaming bounds: `IncrementalJsonlParser` retains only bounded partial-line parts and a decoder tail; `CappedRawWriter` limits persisted bytes and queued/in-flight bytes while continuing to consume and parse provider output. `validateLogs` enforces nonnegative accounting, truncation truth, and sealed/pruned state invariants.
- Pruning safety: candidates require terminal state, non-legacy source, sealed logs, unpruned metadata, and exact canonical log paths. A `pruning` intent is committed before deletion; subsequent starts retry unfinished intents, reconcile missing files, and retain compact manifests.
- Cancellation ordering: runner cancellation records acknowledgement and termination progress first. `finalizeCancelled` is reached after both writers seal and metadata is collected; starting cancellation uses sealed empty metadata without launching a provider.
- Coordination: write-capable start and resume both use the retention lock, resolve/persist cwd realpath where available, and issue sorted `active_same_cwd_writers:<ids>` warnings. Read-only paths do not emit writer-overlap warnings.
- Recursion boundary: `main` calls `assertExecutionAllowed` before `start`, `run`, `resume`, `cancel`, or `_worker`; valid and malformed marker values fail closed. `launchRunner` removes the marker from the runner environment, while managed and foreground provider spawns add the current marker.
- Compact allowlist: prompt bodies, process environments, argv, raw stderr, and raw event payloads are not copied into manifests or manager receipts. Controlled errors, prompt SHA-256, selected authority/lineage fields, final message, and bounded raw-log metadata are the only corresponding surfaces.

## Required command and count evidence

All commands were dispatched through the MCP Node REPL using `execFile`, with explicit cwd, timeout, `windowsHide: true`, and bounded `maxBuffer`. No prescribed gate failed.

| Command | Exit | Count/result |
| --- | ---: | --- |
| `C:\Windows\System32\cmd.exe /d /s /c npm test` — run 1 | 0 | 60 passed, 0 failed; 91,554 ms wall time. |
| `C:\Windows\System32\cmd.exe /d /s /c npm test` — run 2 | 0 | 60 passed, 0 failed; 90,925 ms wall time. |
| `node --test test/observation.test.mjs test/resources.test.mjs test/safety.test.mjs` | 0 | 24 passed, 0 failed; 17,893 ms wall time. |
| `git diff-tree --check e1426381a8bfd5547c5f3e7c44b4473b741ee5e7^ e1426381a8bfd5547c5f3e7c44b4473b741ee5e7` | 0 | No output; no whitespace errors. |
| `node --check skills/luna-sidecar/scripts/luna-sidecar.mjs` | 0 | Syntax valid. |
| `node --check test/concurrency.test.mjs` | 0 | Syntax valid. |
| `node --check test/fixtures/fake-codex.mjs` | 0 | Syntax valid. |
| `node --check test/observation.test.mjs` | 0 | Syntax valid. |
| `node --check test/resources.test.mjs` | 0 | Syntax valid. |
| `node --check test/safety.test.mjs` | 0 | Syntax valid. |
| `node -e "const p=require('./package.json'); if(!p.private||p.type!=='module'||Object.keys(p.dependencies||{}).length) process.exit(1)"` | 0 | Private ESM package with zero runtime dependencies. |

## Windows process scans

The before and after scans were bounded to the workspace and `luna-sidecar-cli-` temporary roots, and to command-line markers for the repo `_worker`, `fake-codex`, `fake-grandchild`, npm test, and repo test runners. Each scan was an explicit `powershell.exe` child dispatched through Node REPL, not a shell-wrapper tool.

- Before gates: exit `0`, exact result `[]`, count `0`.
- After gates: exit `0`, exact result `[]`, count `0`.
- No exact gate-owned survivor was found and nothing was killed. Unrelated processes were not enumerated for cleanup or touched.

## Failed commands

None in the required verification gate set. A few read-only verifier snippets were corrected during setup (one malformed REPL snippet and one mistyped `git show` path); they did not modify the repository or affect gate evidence.

## Residual risks and claim limit

- Evidence is Windows-only and uses the deterministic fake provider. POSIX process behavior, live Codex/Luna behavior, native subagent execution, copied Agent Skills installs, CI, and Phase 4 delivery remain unverified.
- Cancellation is proven for the specified normal Windows process tree. Intentional breakaway descendants, absolute OS containment, Job Objects/pidfds, and PID-reuse elimination are not claimed.
- Atomic local-filesystem visibility is in scope; power-loss durability, SMB/NFS/sync-backed roots, telemetry, scheduling, dashboards, and runtime task evaluation are not claimed.
- Raw logs and `finalMessage` remain documented content-bearing exceptions and the local state root remains sensitive. No redaction or model-task success claim is made.
- The exact-boundary wait result is source-proven by the immediate final observation; no broader latency or performance guarantee is claimed.

## Final write boundary

The report itself is the sole authorized write for this verification. Final status must remain `main` with the implementation paths unchanged from `e1426381`; only `.planning/phases/03-observation-and-safety/03-VERIFICATION.md` may be newly dirty after this write. Nothing is staged, committed, or pushed.

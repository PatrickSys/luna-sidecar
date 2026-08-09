---
phase: 02-lifecycle-and-authority
status: gaps_found
verified_commit: ca6560c667316d380ed4c71c6e53caa88b35c5b9
current_head: 2673378e12cd1816fa6d2e630d3661bd3f9e383b
verifier_runtime: "Node v24.14.1 via Node-backed local workspace child_process"
verifier_session: 019fe411-978a-7350-9fab-6d734d8c98f3
verified: 2026-08-09T01:22:44.707Z
verification_transport: "Node-backed local workspace/child-process path; normal Desktop shell failed before execution"
claim_limit: "Windows deterministic fake-provider evidence for the exact implementation commit, local-filesystem state, and specified normal process trees; no POSIX, native containment, live provider, later-phase, install, CI, task-success, or delivery claim"
---

# Phase 2 independent verification

## Verdict

`gaps_found` for implementation commit `ca6560c667316d380ed4c71c6e53caa88b35c5b9`.

`HEAD` is `2673378e12cd1816fa6d2e630d3661bd3f9e383b`. The exact ancestry check found one and only one commit beyond the implementation: `2673378` (`docs: record phase 2 implementation evidence`). `git diff ca6560c..HEAD` contains only `.planning/phases/02-lifecycle-and-authority/02-SUMMARY.md`.

The deterministic Windows gates passed, but the authority audit found one receipt-fidelity gap: resuming a worker stored as `sandbox: "read-only"` with explicit `--bypass` produces the correct provider argv (`--dangerously-bypass-approvals-and-sandbox`) while the persisted/returned authority tuple remains `sandbox: "read-only", bypass: true`. The effective provider authority is unsandboxed, so the receipt does not faithfully describe the selected authority under AUTH-01. The verifier made no implementation change.

## Requirement-to-evidence

| Requirement | Result | Evidence | Boundary |
| --- | --- | --- | --- |
| COMPAT-01 | Verified within the Phase 2 contract | Full suite passed. Legacy reads preserve bytes; explicit terminal cancel upgrades through the v2 allowlist; future schemas and poisoned v2 paths fail closed without rewrite. | Local files and current compatibility surface only. |
| AUTH-01 | Gap found | `test/authority.test.mjs` and the focused suite passed exact initial/resume argv and cwd, inheritance, explicit narrowing/broadening, contradiction rejection, and caller-cwd changes. Additional fake-provider audit confirmed explicit bypass argv, but receipt retained `sandbox: "read-only"` with `bypass: true`. | Provider argv and explicit human intent are correct; persisted authority representation is not normalized consistently. |
| LINEAGE-01 | Verified within the Windows seam | Stable worker ID, unique ordered turns, duplicate active resume rejection, and one active turn are covered by authority/concurrency tests. | No claim beyond the deterministic local harness. |
| LIFE-01 | Verified within the Windows seam | Tests cover provider spawn, close, nonzero exit, top-level failure, missing completion, completion while the process lingers, prompt claim, stdin acknowledgement, duplicate runner, and startup failure evidence. | `taskOutcome` remains `not_evaluated`; no delegated task-success claim. |
| CANCEL-01 | Verified within the specified normal-tree contract | Tests cover request shape, acknowledgement-before-signal, starting cancel, duplicate cancel, timeout/recovery, completion race, dead/stale runner refusal, Windows `/T /F`, provider close/root absence, and fixture grandchild disappearance. | No breakaway-descendant or absolute-containment claim. |
| CONCURRENCY-01 | Verified within the Windows seam | Token locks, revision fencing, malformed/stale/live-owner lock behavior, duplicate runner/resume serialization, and paused stale-writer rejection all passed. | Local filesystem only; no power-loss or distributed-filesystem claim. |

## Complete manifest state-write trace

The only direct `writeWorker` call sites in the implementation are:

1. `startWorker` (`skills/luna-sidecar/scripts/luna-sidecar.mjs:247-260`) publishes the prompt and writes the new worker once as `starting`, revision `0`, before detached runner launch. `launchRunner` (`:350-380`) only returns a projection containing the detached runner PID; it does not rewrite the manifest.
2. `mutateWorker` (`:1390-1402`) is the sole post-launch write path. It acquires the per-worker token lock (`:1405-1435`), runs the mutation, verifies token/base revision (`:1461-1467`), rereads the current revision, increments it, normalizes/validates the projection, and atomically replaces the manifest (`:1361-1388`).

Every state mutation reaching that path was traced:

- Runner ownership writes `runnerPid`/compatibility `pid` at `:405-435`.
- Prompt claim writes `promptClaimedAt` at `:443-452`; stdin acceptance writes `stdinAcceptedAt` and cleans the claimed prompt at `:557-580`.
- Provider spawn writes provider PID, start time, provider `running`, session, and operational `running` at `:632-643`.
- Provider close writes exit/signal, logs, warnings, final-message candidate, and exactly one terminal result at `:645-687`; completion requires provider completion plus close code `0`, while nonzero/fatal/missing evidence becomes `failed` or `unknown`.
- Runner/prompt/stdin/provider failures use the guarded failure paths at `:383-403`, `:456-473`, `:620-625`, and `:689-700`.
- Resume either revision-guards `runner_not_alive` to terminal `unknown` or appends one new turn under the same worker ID at `:702-735`; `markUnknown` is only called inside guarded mutation callbacks (`:744-752`).
- Controller cancellation publishes the atomically renamed request and writes `cancelling` at `:774-827`; timeout/dead-runner transitions are revision-guarded at `:847-884`.
- The runner writes acknowledgement/`terminating`, then `cancelled` only after cleanup, at `:912-970`; starting cancellation writes `cancelled` without provider launch at `:977-1015`.
- Cancellation failures write terminal `unknown`/`cancel_failed` through `persistUnknown` (`:1017-1030`). Request/prompt cleanup warnings use guarded mutations at `:1032-1085`. Legacy terminal cancellation is the explicit migration path at `:777-780`.

`status`, `wait`, and `list` read normalized manifests and do not repair lifecycle state or parse provider logs. No terminal assignment was found outside the guarded mutation path or the initial pre-launch `starting` write. Terminal callbacks return the current terminal record and cannot resurrect it.

## Complete signal/kill trace

- `runnerLiveness` (`:1478-1487`) calls `process.kill(pid, 0)` only as a liveness/uncertainty probe; it does not terminate a recorded PID.
- The controller (`cancelWorker`, `:774-884`) checks runner liveness and publishes a per-turn request. It never signals the manifest runner PID or provider PID.
- The live runner (`maybeRunnerCancel`, `:912-970`) validates worker/turn/request identity, records acknowledgement before action, and passes only its current `child` handle to `terminateProviderTree`.
- Windows termination (`:1527-1534`) invokes `taskkill /PID <current-child> /T /F`, requires exit `0`, waits for provider `close`, and checks the provider root is gone. POSIX termination (`:1536-1546`) targets the current child’s process group with `SIGTERM`, waits three seconds, escalates to `SIGKILL`, waits for close, and verifies the group is gone.
- Test-only cleanup paths in `test/helpers/cli-harness.mjs` (`:282-310`) terminate harness-owned children/PIDs; they are not production authority paths and were used only for deterministic fixture cleanup.

The discarded aggregate gate attempt left one exact test-owned tree under `luna-sidecar-cli-Qj579H`; after command-line/parent-chain validation, only that owned root (`PID 28816`) was cleaned with `taskkill /PID 28816 /T /F` (exit `0`). Two pre-existing `.codex\\skills\\luna-sidecar` `_worker` processes were observed and excluded as the verifier host chain; they were not touched. The final bounded scan returned `[]`.

## Command exits

| Command/check | Exit | Result |
| --- | ---: | --- |
| `cmd.exe /d /s /c npm test` — separate pass 1 | 0 | 36 passed, 0 failed; 56.579s. |
| `cmd.exe /d /s /c npm test` — separate pass 2 | 0 | 36 passed, 0 failed; 56.036s. |
| `node --test test/authority.test.mjs test/lifecycle.test.mjs test/concurrency.test.mjs` | 0 | 23 passed, 0 failed; 36.121s. |
| `node -e "const p=require('./package.json'); if(!p.private||p.type!=='module'||Object.keys(p.dependencies||{}).length) process.exit(1)"` | 0 | Private ESM package with zero runtime dependencies. |
| `git diff --check ca6560c667316d380ed4c71c6e53caa88b35c5b9^ ca6560c667316d380ed4c71c6e53caa88b35c5b9` | 0 | No whitespace errors. |
| Bounded exact Windows test-owned process scan, final run | 0 | `[]`. No matching test launcher, fake provider, fake grandchild, repo `_worker`, test runner, or npm process remained after owned-tree cleanup. |
| Exact process-tree cleanup of the discarded batch: `taskkill /PID 28816 /T /F` | 0 | Only the validated test-owned tree was terminated. |
| Extra fake-provider authority audit for explicit bypass receipt | 0 | Correct bypass argv; inconsistent persisted `sandbox`/`bypass` tuple recorded above. |

## Failed and omitted commands

- The normal Codex Desktop shell failed before command execution with `Io(Error { kind: InvalidInput, message: "batch file arguments are invalid" })`. The exact gates were therefore dispatched through the available Node-backed local workspace/child-process path. This workaround is execution transport only, not a product fix.
- The first aggregate Node-backed orchestration attempted to run all gates in one call, timed out, and reset its kernel before returning results. Its output was discarded and it was not counted as evidence. Every required gate was then rerun separately with captured exits.
- No required Phase 2 gate was omitted after recovery. POSIX execution, CI, live provider, network research, native containment, nested Luna sidecars, and later-phase work were intentionally not run because they are outside this verification boundary.

## Residual risks and claim limit

- This is Windows-only deterministic fake-provider evidence. The POSIX source path, Ubuntu CI, install parity, release proof, and later observation/safety work remain unverified.
- Cancellation is proven only for the specified normal process tree/group. Intentional breakaway descendants, PID-reuse elimination, native Job Objects/pidfds, and absolute OS containment are not claimed.
- State safety is bounded to local filesystems and process-crash-safe atomic visibility; power-loss durability and distributed filesystems are not claimed.
- The provider’s final message is evidence only; v1 deliberately leaves `taskOutcome: "not_evaluated"`. No live Codex/Luna provider was launched by the tests or supplemental audit.
- Because AUTH-01 has the receipt-fidelity gap above, this report does not authorize Phase 3. The minimal unresolved issue is to make explicit bypass authority and the persisted/returned `sandbox` field agree, or to formalize and validate a documented dominance invariant before claiming exact authority fidelity.

Only `.planning/phases/02-lifecycle-and-authority/02-VERIFICATION.md` was written by this verifier. Nothing was staged, committed, or pushed.

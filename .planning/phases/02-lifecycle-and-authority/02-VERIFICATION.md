---
phase: 02-lifecycle-and-authority
status: passed
verified_commit: 7acec18861fcac8ad53426739581166f02e3db35
current_head: eb2726d4506af30cfeceba38652ce74ea1cdc3a1
verifier_runtime: "Node v24.14.1 via Node-backed local workspace child_process"
verified: 2026-08-09
verification_transport: "Node-backed local workspace/child-process path; normal Desktop shell failed before execution"
claim_limit: "Windows deterministic fake-provider evidence for the exact implementation commit, local-filesystem state, and specified normal process trees; no POSIX, native containment, live provider, later-phase, install, CI, task-success, or delivery claim"
---

# Phase 2 independent re-verification

## Verdict

`passed` for the exact final implementation commit `7acec18861fcac8ad53426739581166f02e3db35`.

The checkout was `main` and clean before verification: `git status --short --branch` exited 0 with `## main...origin/main [ahead 5]`. `HEAD` was exactly `eb2726d4506af30cfeceba38652ce74ea1cdc3a1`. Its ancestry is:

```text
eb2726d docs: record phase 2 gap closure
7acec18 fix: normalize bypass authority receipts
abe8284 test: record phase 2 authority gap
2673378 docs: record phase 2 implementation evidence
ca6560c feat: make sidecar lifecycle authoritative
```

`git diff --name-status 7acec18861fcac8ad53426739581166f02e3db35 HEAD` returned only `M .planning/phases/02-lifecycle-and-authority/02-SUMMARY.md`. The implementation code is therefore the requested `7acec18` state with only the amended Phase 2 summary after it.

## Previous gap and closure

The replaced report was `status: gaps_found` for `ca6560c667316d380ed4c71c6e53caa88b35c5b9`. It found one AUTH-01 receipt-fidelity defect: resuming a stored `sandbox: "read-only"` worker with explicit `--bypass` sent the correct unsandboxed provider flag but returned and persisted `sandbox: "read-only", bypass: true`.

The authority fix commit closes that gap at every required boundary:

- Source: `resolvedTask` (`skills/luna-sidecar/scripts/luna-sidecar.mjs:149-165`) makes explicit bypass normalize to `sandbox: "workspace-write"` and `bypass: true`; `resolvedResumeTask` (`:167-191`) feeds that normalized task into the new turn.
- Returned receipt: `workerView` (`:1095-1125`) reads authority from the latest turn, so the resumed receipt returns `sandbox: "workspace-write", bypass: true`.
- Persisted latest turn: `makeTurn` (`:276-311`) stores the task tuple, and `resumeWorker` (`:702-735`) appends that turn under the existing worker before launching it. `syncProjection` (`:1128-1145`) mirrors the same tuple into the manifest's compatibility projection.
- Schema invariant: `validateNativeTurn` (`:1315-1337`) rejects `bypass: true` unless `sandbox` is `workspace-write`; `validateV2Worker` (`:1263-1313`) validates the latest-turn projection before reads/mutations can accept it.
- Tests: `test/authority.test.mjs:121-140` asserts provider bypass argv, returned `sandbox`, `bypass`, cwd, and the persisted latest-turn tuple. The same test then verifies the explicit read-only narrowing path (`:142-156`) and contradiction rejection (`:159-177`).

The complete initial implementation diff `ca6560c^..ca6560c` and the complete authority fix diff `7acec188^..7acec188` were reviewed. The fix is narrow and follows the existing task-resolution, turn-persistence, projection, and schema-validation patterns; no new dependency, abstraction, or later-phase behavior was introduced.

## Requirement-to-evidence

| Requirement | Result | Evidence | Boundary |
| --- | --- | --- | --- |
| COMPAT-01 | Passed | Both full suites passed. Legacy `status` reads remain byte-preserving; explicit terminal `cancel` upgrades through the allowlist; future schemas and poisoned paths fail closed without rewrite. | Current local compatibility surface only. |
| AUTH-01 | Passed | Exact initial/resume argv and provider cwd, inheritance, narrowing, explicit bypass broadening, contradiction rejection, caller-cwd changes, returned receipt, persisted latest turn, and the bypass/read-only invariant all passed. | No live provider claim. |
| LINEAGE-01 | Passed | Stable worker ID, unique ordered turns, and serialized duplicate resumes passed in the authority/concurrency suites. | Windows deterministic harness only. |
| LIFE-01 | Passed | Spawn failure, provider failure, nonzero exit, missing completion, completion while the process lives, close evidence, prompt claim, stdin acknowledgement, duplicate runner, dead runner, and startup failure cases passed. | `taskOutcome` remains `not_evaluated`; no delegated-task success claim. |
| CANCEL-01 | Passed | Request shape, acknowledgement-before-signal, starting cancellation, duplicate requests, timeout/recovery, completion race, stale/dead runner refusal, Windows `/T /F`, provider close/root verification, and fixture grandchild disappearance passed. | Specified normal tree/group only; no breakaway or absolute-containment claim. |
| CONCURRENCY-01 | Passed | Token locks, revision fencing, malformed/stale/live-owner lock behavior, duplicate runner/resume serialization, terminal monotonicity, and paused stale-writer rejection passed. | Local filesystems only; no power-loss/distributed-filesystem claim. |

## State-write and signal trace reliance

The final source was traced from the full implementation diff and fix diff:

- `startWorker` performs the sole pre-launch manifest write as `starting` (`:247-260`). `writeWorker` (`:1362-1376`) validates the v2 manifest and atomically replaces the file. After launch, all lifecycle mutations route through `mutateWorker` (`:1391-1404`), which acquires a token lock, checks the lock token/base revision, rereads the current revision, increments it, validates the projection, and writes atomically. `status`, `wait`, and `list` only read normalized manifests and project receipts.
- Runner ownership and prompt claim are in `runWorkerLifecycle` (`:405-631`); provider spawn and close/finalization are `persistProviderSpawn` (`:632-644`) and `finalizeProvider` (`:645-688`). Resume appends one turn only inside the guarded mutation at `:702-735`. Unknown and startup failure paths use guarded mutations (`:689-700`, `:744-752`, `:1017-1030`).
- Cancellation request publication and controller transitions are in `cancelWorker` (`:774-911`). Runner acknowledgement, current-child cancellation, and terminal persistence are in `maybeRunnerCancel` (`:912-976`) and `finishStartingCancel` (`:977-1016`). Terminal callbacks return the current terminal record and cannot resurrect it.
- `runnerLiveness` (`:1479-1488`) uses `process.kill(pid, 0)` only as a liveness/uncertainty probe. The controller never signals a PID loaded from a manifest. Windows termination (`:1528-1535`) invokes `taskkill /PID <current child> /T /F`, waits for provider `close`, and verifies the provider root; POSIX termination (`:1537-1546`) targets only the current child's process group and verifies it is gone. Test cleanup uses harness-owned PIDs separately.

No terminal state write or signal path outside these guarded/runner-owned paths was found in the reviewed final source.

## Command and exit evidence

All required commands were run separately through the Node-backed local child-process path after the normal shell failed before execution with `Io(Error { kind: InvalidInput, message: "batch file arguments are invalid" })` even for `echo hi`. The fallback is execution transport only, not a product change.

| Command | Exit | Result |
| --- | ---: | --- |
| `npm test` — separate pass 1, dispatched as `cmd.exe /d /s /c npm test` | 0 | 36 passed, 0 failed; 58.588s wall time. |
| `npm test` — separate pass 2, dispatched as `cmd.exe /d /s /c npm test` | 0 | 36 passed, 0 failed; 57.436s wall time. |
| `node --test test/authority.test.mjs test/lifecycle.test.mjs test/concurrency.test.mjs` | 0 | 23 passed, 0 failed; 36.819s wall time. |
| `node -e "const p=require('./package.json'); if(!p.private||p.type!=='module'||Object.keys(p.dependencies||{}).length) process.exit(1)"` | 0 | Private ESM package with zero runtime dependencies. |
| `git diff --check ca6560c667316d380ed4c71c6e53caa88b35c5b9^ ca6560c667316d380ed4c71c6e53caa88b35c5b9` | 0 | No whitespace errors. |
| `git diff --check 7acec18861fcac8ad53426739581166f02e3db35^ 7acec18861fcac8ad53426739581166f02e3db35` | 0 | No whitespace errors. |
| Node runtime check `node --version` | 0 | `v24.14.1`. |

### Exact bounded Windows test-owned survivor scan

The following single PowerShell child-process command was run from the repository root. It inspected only `Win32_Process` rows whose normalized command line matched this workspace or a `luna-sidecar-cli-` temp root and one of the Phase 1/2 test, launcher, fake-provider, fake-grandchild, `_worker`, or `npm test` markers:

```powershell
$workspaceMarker = ((Get-Location).Path).Replace('/','\').ToLowerInvariant(); $tempMarker = ([IO.Path]::GetTempPath()).Replace('/','\').ToLowerInvariant() + 'luna-sidecar-cli-'; $testMarkers = @('test/harness.test.mjs','test/contract.test.mjs','test/authority.test.mjs','test/lifecycle.test.mjs','test/concurrency.test.mjs','skills/luna-sidecar/scripts/luna-sidecar.mjs _worker','test/fixtures/fake-codex.mjs','test/fixtures/fake-grandchild.mjs','npm test'); $processRows = @(Get-CimInstance Win32_Process | ForEach-Object { $commandLine = [string]$_.CommandLine; $normalized = $commandLine.Replace('/','\').ToLowerInvariant(); $workspaceOwned = $normalized.Contains($workspaceMarker); $tempOwned = $normalized.Contains($tempMarker); $markerHit = $false; foreach ($marker in $testMarkers) { if ($normalized.Contains($marker)) { $markerHit = $true; break } }; if (($workspaceOwned -or $tempOwned) -and $markerHit) { [PSCustomObject]@{ ProcessId = $_.ProcessId; ParentProcessId = $_.ParentProcessId; Name = $_.Name; CommandLine = $commandLine } } }); if ($processRows.Count -eq 0) { '[]' } else { $processRows | ConvertTo-Json -Compress }
```

Exit `0`; exact stdout was `[]`. No matching test launcher, fake provider, fake grandchild, repo `_worker`, test runner, or npm process remained. No process was killed during this re-verification; the scan found nothing requiring cleanup. Pre-existing verifier/host-chain processes outside the bounded test-owned markers were not touched.

## Residual risks and claim limit

- Evidence is Windows-only deterministic fake-provider evidence. POSIX execution, Ubuntu CI, install parity, release proof, Phase 3 observation/retention/safeguards, and Phase 4 UX/delivery work remain unverified.
- Cancellation is proven only for the specified normal process tree/group. Intentional breakaway descendants, native Job Objects/pidfds, PID-reuse elimination, and absolute OS containment are not claimed.
- State safety is bounded to local filesystems and process-crash-safe atomic visibility; power-loss durability and distributed filesystems are not claimed.
- Provider final text remains evidence only; `taskOutcome: "not_evaluated"` is preserved and no task-success claim is made.
- No live Codex/Luna provider, nested Luna sidecar, network research, native containment, or later-phase work was run.

Only this verification file was edited. Nothing was staged, committed, or pushed.

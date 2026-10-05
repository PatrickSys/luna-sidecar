---
phase: 05-simple-subagent-ux
plan: 05-PR1
runtime: codex-cli
assurance: self_checked
verified: 2026-10-04
status: gaps_found
local_tests: passed
releaseReady: false
evidence_contract:
  observed_kinds: [code, test, judgment]
  missing_kinds: [exact_final_documentation_head_ci, real_host_runtime]
review_status: passed
git_delivery_check:
  snapshot_commit: 72151ea9cd52f4d1d748c6ac7587cfdc2682faa6
  snapshot_scope: original_pr_head_before_corrective_delivery
  branch: fix/phase5-live-evidence
  commits_ahead_of_main: 3
  pr_state: OPEN
  local_corrections: verified_before_commit
  delivery_authorization: commit_and_push_pr_branch_only
---

# PR 1 verification

The correction has executable local evidence, but review and release closure have gaps. This report supplements the existing Phase 05 verification; it does not replace historical evidence or close the roadmap.

| Requirement | Code and deterministic evidence | Verdict |
| --- | --- | --- |
| FINAL-RELEASE-01 invocation proof | Exact copied path and adjacent command; successful Codex events and correlated Claude tool results; relative/absolute positives and echo/root/chain/failure negatives | Local checks passed; live proof missing |
| AUTH-01 private host configuration | OAuth-only file copy, three supported environment routes, unchanged sentinel values, blank/missing failures, redaction and cleanup fixtures | Local checks passed; POSIX mode assertions conditional on platform |
| LIFE-01 prompt disposition | Failed/unknown archive, obstruction/collision source preservation, completed/cancelled disposal, independent resume archive | Focused and final suite checks passed |
| RESOURCE-01 bounded evidence | Archives and fallback prompts join existing canonical terminal pruning; fixture crosses 256 MiB only when prompt bytes are included | Final suite checks passed |
| SAFETY-01 observer purity | Existing read-only dead-runner projection restored; no recovery/file mutation from observer | Call-graph and final suite checks passed |

## Full-suite result

Final `npm test` completed with exit 0: 147 tests, 146 passed, 0 failed, 1 skipped, duration 163174.5017 ms. The suite uses `--test-concurrency=1` and includes authority, concurrency, contract, harness, lifecycle, observation, resources, safety, UX, installation parity and release-smoke checks. Syntax checks for both production modules and three modified test modules passed. `git diff --check` passed.

The skipped test is `host PowerShellCore transcription admission blocks before provider spawn`: its existing guard requires `LUNA_SIDECAR_HOST_PROOF=1`, which was not enabled. POSIX-specific permission assertions are conditional. The historical cancellation race passed this complete run; earlier failures are preserved in the summary rather than erased by that result.

## Candidate identity

Verification started from HEAD `72151ea9cd52f4d1d748c6ac7587cfdc2682faa6`. The implementation below was tested before committing; these hashes bind the tested source independently of the subsequently authorized commit. SHA-256 of final source/test/reference files:

| Path | SHA-256 |
| --- | --- |
| scripts/release-smoke.mjs | 082DFECBDCCAA28D52087BC2B1C8FBE7557C8EDF41209720C61F252494229C02 |
| skills/luna-sidecar/scripts/luna-sidecar.mjs | 9960E3BFE3F3BE37E89BA7D52B26A9FA20134D005362D7E73525B9BB88001BFF |
| test/lifecycle.test.mjs | 19F73C40112DB2EDF90ECF556969BC9B348623BC012AA4DFD6C59FE2E0FDC52F |
| test/release-smoke.test.mjs | 82C7013887CC038532B824EC42A41B168F80C76F293386D818AD3B1298B9FA28 |
| test/resources.test.mjs | 4DB421D62E5C4BDA2541B8E3901D5FCD7F42AD899D87A74F17B31EB724CC9DB5 |
| skills/luna-sidecar/references/USAGE.md | C9B44F187B1EB22B8087CF1C90CB78199AAB67A95FC4F9703F391B80BFA5C6BD |

## Gaps and next actions

- **Final independent review:** the intended final verifier could not run because account usage was exhausted. Earlier independent root-cause, plan and parser/auth reviews are partial judgment evidence. Root integration review does not satisfy this final review requirement.
- **Delivery:** owner subsequently authorized "Commit and push PR updates" on 2026-10-04. This authorizes the correction commit and PR-branch push followed by new CI checks. It does not authorize merge or issue closure. At the verification snapshot GitHub still held the original PR head; delivery results must be checked after the new commit exists.
- **Exact-candidate CI and runtime:** final release requires the existing four-job matrix and both real hosts on the exact committed candidate. No live provider execution took place; fake-provider test receipts are not real-host acceptance. Preserve existing evidence as historical.
- **Platform:** local Node 24.14.1 validation ran on Windows. Ubuntu/POSIX behavior and Node 22.20 require the matrix. Conditional POSIX permission assertions cannot establish Windows ACL privacy.
- **Workflow:** owner-approved legacy `.planning` authority was used. Current Workspine `missing_config` refusal remains; no `.work` migration or current-helper success was manufactured.

The owner can inspect the complete patch and this evidence. Final independent review and release proof remain unfinished; commit and PR-branch delivery are authorized with fresh CI verification next.

## Delivery follow-up, 2026-10-04

Commit `c370bbd8008db51de9a1f5cf2d33618fe3ec9b8f` reached PR 1. Exact-head CI runs 37232128409 and 37232126428 passed both Windows jobs but failed both Ubuntu jobs in `host adapters execute exact Codex and Claude shims and retain bounded failure diagnostics`. The fixture emitted Windows-only launcher separators on Linux. Correcting the fixture to construct both invocation paths with its existing native `join` leaves production validation and all assertions unchanged.

The corrected release-smoke module passed all 35 tests locally, 0 failed/skipped, duration 20556.3467 ms. Its new SHA-256 is `3FAD152A7EB862C948E56EC6ADEDDDD6C5607DA7E8271C39812F8A6ACEC39EFB`; other implementation hashes above are unchanged. Exact CI for the subsequent fixture commit remains pending at this snapshot. Main, merge, issue closure and release readiness remain unchanged.

## Corrective merge verification, 2026-10-05

This block supersedes the earlier reviewer-quota and delivery snapshots for the corrective PR; their historical outcomes are preserved. Owner now explicitly requests reliable merging of PR 1. This does not authorize release or Phase 05 closure.

- Verified GitHub head: `af42ec4d4e683be555f29abddb0b1f34b6361a3a`.
- Exact-head CI: runs 37232385668 and 37232381344 completed successfully, four distinct Ubuntu/Windows Node 22.20/24 jobs each.
- Fresh independent correctness review: PASS on the complete `f0f7df2..af42ec4` source/test diff, no blocking production finding. Reviewer reran the full local suite: 146 passed, 0 failed, 1 opt-in host test skipped. Same-runtime judgment; no real-provider acceptance claim.
- SPEC alignment: existing prompt deletion/retention wording now reflects the tested implementation, including read-only projected unknown versus durable terminal state. Runtime code/tests are unchanged.
- Remaining release gap: no successful exact-commit real Codex and Claude host observations. Keep `releaseReady: false` and FINAL-RELEASE-01 open. SPEC requirement 55 and Phase05 verification 163 explicitly bind these observations to release/phase closure; they do not prohibit merging a verified corrective implementation.

The documentation/verification follow-up needs exact-final-head CI before merge, then main CI verification afterward. Never bypass checks, replace live evidence with fixtures, or infer release acceptance from the merge.

## Intermittent cleanup evidence, 2026-10-05

Head `6cba0b4`: PR CI 37267736126 passed all four jobs; push CI 37267731733 failed only Windows Node24 in the list test's cleanup hook (`Owned fixture process 3028 survived cleanup`). Assertions passed before cleanup. The same unchanged helper failed at base `f0f7df2`, run 31595361497, Windows Node22, in a different contract test (`Owned fixture process 9676 survived cleanup`). Root verified the base SHA and failed log; both independent reviewers confirmed the unchanged list-test body and found no production regression mechanism. Eight focused local list repetitions passed. This supports an existing intermittent harness symptom; missing PID identity prevents claiming a proven reuse cause or proving no orphan from the failed log alone.

Full workflow rerun was requested for 37267731733. Cleanup assertions, timeouts, tests and production code remain unchanged. Require its successful result and both final-head matrices before merge; a repeat failure reopens investigation. This snapshot does not claim their future outcomes. The exact final delivery/main receipts are retained in the private handoff directory to avoid another documentation-only commit cycle.

## Reliability gate reopened, 2026-10-05

Run 37267731733 attempt2 repeated Windows24 cleanup failure (PID7152), so the preceding rerun path is exhausted and superseded by the bounded harness repair in the existing plan. Both `27df863` matrices passed, but merge stayed held. Prior run 37267594782 failed a separate concurrency fixture ordering assertion; its log is preserved as `luna-sidecar-pr1-concurrency-failure-20261005.log` in the private handoff directory. Existing exclusion assertions are retained and provider non-launch proof added.

Root intermediate full suite: 150 tests, 149 passed, 0 failed, 1 explicitly opt-in real-host skip, 188176.943 ms (`luna-sidecar-pr1-reliability-full-20261005.log`). This precedes final copied-launcher/ComSpec descriptor corrections; targeted checks, final reviews and exact-head full CI must verify those changes. No real host, release or phase-closure claim follows from fixture/process identity checks. Actual failed-CI PID reuse remains unproven; the repair removes the harness's inability to distinguish conclusively unrelated processes while preserving owned/uncertain failures.

Final candidate verification: full local suite 151 tests, 150 passed, 0 failed, 1 opt-in real-host skip, 167393.5881 ms on Windows Node24.14.1; final focused harness/concurrency/install-parity/resources 31 passed, 0 failed. Both independent final reviews PASS. New real Windows identity tests cover the Node fixture, actual ComSpec command wrapper and copied launcher runner, including genuine live owned-process rejection. The missing-provenance regression was RED under guessed identity and is GREEN with explicit fail-closed refusal. Its diagnostic expectation was aligned to the refusal; rejection and untouched live-process assertions remain required. Syntax/diff checks are clean; production implementation is unchanged from af42ec4.

Known bounded limitations: command identity does not prove OS creation time; identical same-harness reuse remains conservatively owned. Query timeout kills only the query child without awaiting its close event, following the existing harness watchdog pattern, and fails cleanup rather than claiming absence. Final head CI, matched-head merge and main tree/CI receipts must be verified separately and retained in the private handoff directory. No release gate is relaxed.

## Metadata query verification, 2026-10-05

90952b6 exact-head CI runs 37271537556/37271541458 passed both Linux jobs and failed both Windows jobs on the new live CIM probes' 5000 ms query watchdog. All functional assertions passed. The observed failure is metadata budget exhaustion; exact hosted query latency remains unknown until the next measured run. Separate the metadata budget at 15 seconds while retaining the original five-second liveness grace and strict orphan/uncertainty rejection. Query timeout now awaits its own child's bounded termination, superseding the preceding watchdog limitation.

The real timeout regression failed before close waiting and passed after it, with the target process left alive. Final local suite: 152 tests, 151 passed, 0 failed, 1 opt-in real-host skip, 164098.5072 ms. Focused suite: 32 passed, 0 failed. Both independent targeted reviews PASS; local CIM measurements are 0.75–0.83 seconds. New Windows test diagnostics report actual query duration without exposing command lines/environment. Require exact-head hosted green matrices and retain their timing/main receipts privately; no inference of real-host release proof is permitted.

Fresh independent regression/authority review returned PASS for the corrective merge gate. Executed focused results: lifecycle/resources/observation 72 passed and 1 opt-in skip; release-smoke 35 passed; syntax and diff checks clean. Assertions remain unchanged apart from added failure diagnostics. This reviewer independently confirmed the release-versus-merge distinction. The noted historical-document caution is resolved by preserving the original V1 text and adding the current behavior as a dated Phase5 amendment. Both final reviews are independent contexts on the same runtime, so assurance remains self_checked rather than cross-runtime.
## Superseding Windows metadata verification, 2026-10-05

Hosted a9302f1 runs 37272842232/37272845625 failed both Windows jobs despite the separate 15-second query budget. Both Linux jobs passed. The earlier local PASS and targeted review do not prove hosted compatibility, and increasing the budget did not resolve the observed hang.

Restore the five-second metadata bound and use the supported Get-WmiObject command on the explicit Windows PowerShell 5.1 executable. Query the same Win32_Process fields with the same exact numeric PID, validate the same response and command identity, retain UTF-8 base64 transport, and await only the query child's bounded close on timeout. Missing or uncertain provenance still rejects cleanup; genuine live owned processes still reject cleanup. Allowlisted stage diagnostics locate any continuing hang without publishing commands or environment. Focused local suite: 32 passed, 0 failed, 0 skipped, 57307.1148 ms. Two independent same-runtime reviewers approve the contract with hosted proof pending. This is self_checked assurance, not cross-runtime or real-provider proof. Merge requires full local verification and both exact final-head green matrices, followed by main verification; record those delivery receipts privately without another report.

Final WMI candidate full local suite: 152 tests, 151 passed, 0 failed, 1 existing opt-in real-host skip, 169592.1867 ms. Log: luna-sidecar-pr1-wmi-full-20261005.log. Final source correctness review found no blocker; hosted compatibility remains pending.

## Hosted layer isolation and final framework query, 2026-10-05

2768b95 still failed both Windows matrices; a63c309 comparisons showed OS/profile/module path and explicit import did not resolve the stall. The 45c2faa ladder (push 37275249806, PR 37275253728) proved plain command, encoded command and file execution work; encoded cmdlet resolution stalls; direct reflection WMI succeeds with exact PID on Node22 in 277 ms and Node24 in 212 ms. PowerShell7 CIM also succeeds, but no new runtime dependency is introduced. This isolates hosted Windows PowerShell cmdlet/module initialization, not a WMI provider or transport failure. Its deeper runner-specific cause remains unknown.

The final helper directly loads the verified strong-name System.Management .NET Framework assembly, queries the same root\cimv2 Win32_Process fields with a numeric PID filter, requires zero or exactly one result and validates the exact PID. Numeric and UTF-8 base64 fields enter controlled Console JSON; no serializer cmdlet, user module/profile or general inherited environment is loaded. Owned/uncertain/missing provenance checks, five-second bounds, own-query-child close waiting and untouched targets remain required. The temporary CI probe is removed. Simple-name Assembly.Load failed locally; the full verified identity corrected it, and all 13 harness tests passed in 8182.1463 ms. Production source remains unchanged from af42ec4, and releaseReady/FINAL-RELEASE-01 remain open. Final full-suite, independent review and exact-head/main receipts are retained privately.

Final framework-query candidate full local suite: 152 tests, 151 passed, 0 failed, 1 existing opt-in real-host skip, 168040.415 ms. Both independent final reviewers PASS; final focused checks total 32 passed. Syntax and diff checks clean. Full log: luna-sidecar-pr1-framework-full-20261005.log. Exact-head hosted/main delivery receipts still gate merge and will be stored privately.

---
phase: 05-simple-subagent-ux
plan: 05-PR1
runtime: codex-cli
assurance: self_checked
status: gaps_found
releaseReady: false
---

# PR 1 correction summary

## Authority and delivery

Owner selected the existing `.planning` contract on 2026-10-04. The current Workspine helper rejects this legacy project with `missing_config`; no helper gate or migration is claimed. This correction belongs to the existing Phase 05 requirements, not a new roadmap lane. The dirty original checkout at `C:/Users/bitaz/Documents/Codex/2026-08-08/dud/luna-sidecar-plan` was preserved; its separate uncommitted recovery work was not imported.

Isolated checkout: `C:/Users/bitaz/Repos/luna-sidecar-pr1`. Branch: `fix/phase5-live-evidence`. Base: `f0f7df21ec61971f47538e4424bbe8bad7a6e0b7`. Original PR 1 head: `72151ea9cd52f4d1d748c6ac7587cfdc2682faa6`, three commits ahead of base. PR remains open. At local verification the corrections were uncommitted and no outward action had occurred. Existing history was preserved.

## Root causes and implementation

1. Relative copied-launcher paths are valid, but substring matching certified echo commands, unrelated roots and command names embedded in prompts. A single literal invocation recognizer now requires the exact launcher, adjacent lifecycle command and successful provider command event. Claude Bash tool requests require matching successful tool results. Unsupported shell chains fail closed. This reuses one predicate for all six lifecycle commands and supports the observed direct Node/PowerShell forms.
2. Isolating Claude configuration solved ambient configuration leakage but incorrectly made an OAuth file mandatory. Supported nonblank environment credentials now remain valid, with inherited values unchanged. Only the login file is copied, scratch configuration receives restrictive POSIX modes, and cleanup/redaction remain covered. Windows tests do not establish POSIX mode or Windows ACL guarantees.
3. Failed-prompt copying both escaped retention and deleted the source on copy failure. Existing asynchronous terminal worker mutations now perform prompt disposition before durable terminal commit. Failed/unknown prompts are renamed into the canonical archive; obstruction retains the original and records a bounded warning. Completed/cancelled prompts are discarded. Canonical archives and fallback source/claimed files count toward the existing terminal retention cap and are pruned with their turn. No replay command, provider authority change or separate retention subsystem was added.

## Review and execution deviations

Three separate requested-Luna contexts challenged authentication, parser/recovery correctness and roadmap authority. The revised plan passed the authority review; the finished parser/auth changes passed a follow-up review. These are same-runtime judgment evidence, not cross-runtime or live-host proof.

The prompt worker and intended fresh final verifier hit the account usage limit. Root completed integration and review. A first full run found an actual observer regression: dead-runner observation had been changed into a mutation. Root restored the existing read-only projection, preserving the original prompt without moving files. The plan and usage reference explicitly distinguish a projected unknown state from a durable terminal commit. Existing observation assertions were preserved.

Two new prompt fixtures allowed provider close to race start readiness. They now use the harness's existing capture/release barrier, without weakening terminal assertions. The cancellation race also failed once on the untouched PR baseline and once in the first integrated suite; isolated runs passed. Final suite evidence, rather than isolated retries, determines the local test verdict.

Fresh independent review of the final complete patch remains unavailable because of reviewer quota. Do not treat the earlier partial reviews as a final approval.

## Validation

- Parser negative cases and environment-auth tests were observed failing before their correction and passing afterward. Do not infer RED evidence for every prompt test.
- First integrated full suite: 147 tests, 142 passed, 4 failed, 1 skipped. Three failures were new fixture/observer issues described above; the fourth was the previously observed cancellation race.
- After correction: the observer call-graph check passed, and five focused lifecycle/archive/cancellation checks passed.
- Final `npm test`: exit 0, 147 tests, 146 passed, 0 failed, 1 skipped; duration 163174.5017 ms. This included the original cancellation-race assertion, observer purity, retention, safety and install-parity checks. One passing full run does not prove the historical race impossible; no failing test is omitted from this report.
- Both production modules and all three changed test modules passed `node --check`; `git diff --check` passed.

Private local logs: `C:/Users/bitaz/Repos/_private-handoffs/luna-sidecar-pr1-tests-20261004.log` (first integrated run) and `C:/Users/bitaz/Repos/_private-handoffs/luna-sidecar-pr1-tests-final-20261004.log` (final run). These are local execution records, not committed delivery evidence.

## Handoff and remaining gates

Owner subsequently authorized "Commit and push PR updates" on 2026-10-04, specifically the PR branch followed by new CI checks. Merge and issue closure remain pending. This artifact travels with the correction commit; exact delivery and CI results are determined after that commit exists, not predicted here.

Complete a fresh independent review of the entire patch. The authorized delivery needs its own exact-commit Windows/Ubuntu Node 22.20/24 CI and both required real-host observations under the existing release-smoke contract. PR-head CI run 37207502995 covers the original head, not these corrections. No live providers were run here. Historical Phase 05 release artifacts remain unchanged; Phase 05 and FINAL-RELEASE-01 remain open and `releaseReady` remains false.

## Delivery follow-up, 2026-10-04

Correction commit `c370bbd8008db51de9a1f5cf2d33618fe3ec9b8f` was pushed to the existing PR branch under explicit owner authorization. PR and push CI runs 37232128409 and 37232126428 both passed Windows Node 22.20/24 and failed Ubuntu Node 22.20/24 in one host-adapter fixture. That fixture constructed Windows-only backslash paths on every platform. The exact-path recognizer correctly rejected those as noncanonical Linux launcher paths. The fixture now uses its existing `node:path.join` import for the actual native path. Production code, success assertions and fail-closed parser behavior are unchanged.

After this fixture correction, all 35 release-smoke tests passed locally, including three targeted invocation/adapter tests. Syntax and diff checks passed. A follow-up commit and exact-head matrix are required; this section does not predict their outcome. The earlier 147-test result binds the production patch before this two-line fixture correction. No live host or final independent review claim is added.

## Corrective merge follow-up, 2026-10-05

Owner directly requested taking over PR 1 and merging reliably without downgrading quality. GitHub head `af42ec4d4e683be555f29abddb0b1f34b6361a3a` has two completed successful exact-head CI runs, 37232385668 and 37232381344: all four Ubuntu/Windows Node 22.20/24 jobs passed in each. Earlier failed runs are retained and diagnosed above; no CI rerun or weakened assertion was substituted for the native-path fixture correction.

Fresh independent correctness review inspected the entire `f0f7df2..af42ec4` production/test diff and returned PASS with no blocking production finding. Its local full suite passed 146 tests, 0 failed, 1 skipped. The skipped real-host admission test remains explicitly opt-in. Review covered successful host-event correlation, literal launcher matching, private auth routes, atomic prompt disposition/collision handling, mutation ordering, resume isolation, bounded retention and read-only observation. This is same-runtime independent judgment, not cross-runtime or live-host proof.

Two existing canonical SPEC statements were stale: immediate claimed-prompt deletion and a cap counting only logs. They are aligned to the reviewed recovery/disposition and shared retention behavior. No production code, tests, assertions or release gate changed in this follow-up. FINAL-RELEASE-01 explicitly allows implementation to be present while missing exact-host runtime proof blocks release closure. The merge must preserve that distinction and leave Phase 05 in progress and releaseReady false.

Fresh independent regression/authority review also returned PASS for the corrective merge: lifecycle/resources/observation 72 passed plus 1 opt-in skip, release-smoke 35 passed, syntax/diff checks clean, and no weakened assertion. It confirmed live-host evidence gates release/Phase05 closure, not this bounded correction. Its documentation caution was incorporated: original V1 text remains unchanged and the current prompt/retention behavior is recorded as a dated Phase5 amendment. No old evidence is rewritten as new acceptance.

## Active continuation checkpoint, 2026-10-05

Objective remains reliably merging PR 1 without weakening quality. User explicitly authorizes taking over and merging; no release/phase/issue closure. Worktree `C:/Users/bitaz/Repos/luna-sidecar-pr1`, branch `fix/phase5-live-evidence`, HEAD `6cba0b425700e3f2490cd787b53d88c2411ee10b`; GitHub main still `f0f7df21ec61971f47538e4424bbe8bad7a6e0b7`. Original dirty checkout stays preserved. No merge occurred.

Final-head PR CI 37267736126 passed all four jobs, but same-head push CI 37267731733 failed Windows Node24 in the list-history resource test's after-hook: `Owned fixture process 3028 survived cleanup`, `test/helpers/cli-harness.mjs:378`, Promise.all index59. Actual test assertions passed before cleanup failed. Exact log is `C:/Users/bitaz/Repos/_private-handoffs/luna-sidecar-pr1-final-windows24-failure-20261005.log`. Merge is held; do not substitute the green parallel run or rerun-only evidence for a root-cause fix.

The harness accumulates bare PID sets from captures/manifests and waits with `process.kill(pid, 0)` at teardown. PID reuse versus true owned-process survival is being challenged, not yet proven as the failure's cause. Active independent readers `/root/pr1_final_correctness` and `/root/pr1_final_regressions` are inspecting ownership/cleanup and meaningful deterministic regression design. Their earlier source/test PASS applies to the reviewed production implementation, not this newly exposed cleanup defect. Runtime production process matching and cleanup remain unchanged.

At this checkpoint the next proposed step was a deterministic regression and bounded harness repair if the evidence justified it. The completed investigation below supersedes that proposal. Preserve V1 history and remaining real-host release gates. No live providers, secret reads, global config changes, assertion weakening, CI skipping or unrelated process kills.

Value is retained in this existing summary, verification, committed PR branch and private CI logs. No scratch cleanup/worktree deletion is appropriate during active work. Owner subsequently confirmed the retained-recall rule; it was added to the existing desktop trace note. Commercial/product experiment discipline is unrelated to this engineering task and skipped.

## Cleanup failure investigation, 2026-10-05

Both independent reviewers found the same raw-PID after-hook failure on base commit `f0f7df2`, CI run 31595361497, Windows Node22: `Owned fixture process 9676 survived cleanup` in `contract.test.mjs`. Root verified the base SHA and log independently. The harness and final failing list-test body are unchanged. The reviewers ran eight focused list repetitions in total without a failure; one also checked captured fixture PIDs after each of 21 terminal waits.

The changed completion path disposes prompts only after provider close and adds no process spawning or ownership changes. The list test discards completed prompts before retention accounting. No causal regression was identified. Bare-PID liveness cannot distinguish an original process from a later process with the same PID, but the failing logs do not prove reuse or disprove a true orphan. This is an existing intermittent cleanup symptom, not a precisely diagnosed process identity defect.

Decision: retain the failed-run evidence and rerun its complete exact-head workflow. Do not invent a harness fix or weaken cleanup assertions without identity evidence. If the symptom repeats, hold merge and investigate ownership further. This documentation follow-up also requires both complete exact-head matrices before matched-head merge and main CI afterward. No future success is predicted here.

## CI reliability repair, 2026-10-05

The permitted rerun repeated the Windows24 cleanup failure at `6cba0b4`, now PID7152, Promise.all index65. Log: `C:/Users/bitaz/Repos/_private-handoffs/luna-sidecar-pr1-cleanup-repeat-20261005.log`. Both later `27df863` matrices passed (37268653287 and 37268656263), but the repeated ownership ambiguity remained a held merge gate. No additional rerun-only path was used.

Review of prior run 37267594782 also found an Ubuntu22 concurrency assertion failure, `2 !== 1`. The test released its first provider before the competing process reached admission, allowing two legitimate sequential successes. The first fixture now uses existing `linger`/release support through the second admission. The original simultaneous attempt remains: the first test barrier is inside the held worker and retention locks. Existing exclusion/terminal assertions remain, with added proof that the rejected attempt launches no provider. Both independent reviewers confirmed the ordering; all four concurrency tests passed locally.

The cleanup repair stays in the existing test harness. Per-harness copies of the existing fake provider/grandchild give their command paths unique ownership identity. Captures and manifests retain per-PID expected identities. Direct manager close events prove their original child ended; historical surviving PIDs receive bounded identity inspection after the unchanged five-second liveness wait. Windows queries only the recorded PID with fail-closed CIM errors and UTF-8 transport; Linux uses exact `/proc` arguments. A conclusive command mismatch leaves the unrelated process untouched. A live owned process or uncertain identity still fails cleanup. No new historical-PID kill path, production change or weakened assertion is introduced.

Review caught and corrected Node-child versus Windows command-wrapper identity, Unicode command transport, copied launcher identity and the actual ComSpec shell. New regressions exercise actual live Windows processes as well as mismatched, malformed and uncertain identities. Same-harness reuse with the same command remains conservatively owned and must end before cleanup passes; command identity does not claim an OS creation-time witness.

The intermediate full local run passed 149 tests, 0 failed, 1 opt-in real-host skip, in 188176.943 ms. Subsequent descriptor corrections require focused verification and final independent review before delivery. Final full matrices must bind the committed head; their outcomes and main merge receipts belong in the existing private handoff directory, not another documentation-only commit cycle. Phase05/FINAL-RELEASE-01 remain open and releaseReady false.

Final local verification passed on Windows Node24.14.1: full suite 151 tests, 150 passed, 0 failed, 1 opt-in real-host skip, 167393.5881 ms; focused harness/concurrency/install-parity/resources 31 passed, 0 failed. The unknown observed-PID regression first failed with missing expected rejection under guessed identity. The final helper refuses missing identity; its assertion names that exact refusal and still verifies the live process is untouched. No acceptance assertion was weakened. Logs are `luna-sidecar-pr1-observed-pid-red-20261005.log`, `luna-sidecar-pr1-final-harness-green-20261005.log`, and `luna-sidecar-pr1-reliability-final-green-20261005.log` in the private handoff directory.

Both fresh independent reviewers returned final PASS after the copied-launcher, ComSpec and unknown-PID corrections. They confirmed architectural scope, actual Windows wrapper/runner identity, strict uncertainty handling, overlap exclusion and unchanged production code in this reliability follow-up. A nonblocking hygiene limitation remains in the existing-style query watchdog: it kills its own query child on timeout without waiting for its close event. Such a timeout fails inspection/cleanup; it cannot produce a green ownership result. Final exact-head CI and main verification remain delivery gates, not predicted outcomes.

## Metadata query deadline correction, 2026-10-05

Exact-head 90952b6 CI runs 37271537556 and 37271541458 passed Linux and failed Windows only in the two live process-identity probes, each exceeding the new 5000 ms metadata query budget. Root preserved the failed log as `luna-sidecar-pr1-90952b6-windows24-failure-20261005.log`. This proves budget exhaustion, not yet the precise hosted startup cost. Local measured CIM calls take approximately 0.75–0.83 seconds. A worker proposed WMI instead, with similar local timings; absent comparative hosted evidence, root retained the reviewed CIM mechanism and added measured hosted diagnostics rather than substituting an unmeasured API.

Only metadata inspection now has a separate 15-second budget; the original five-second fixture liveness wait and all live-owned/unknown assertions remain unchanged. Timeout terminates and awaits its own query child with the existing bounded close helper, superseding the earlier nonblocking watchdog limitation. A real timeout regression was RED without awaiting close (`false !== true`) and GREEN after correction; it verifies query close before rejection and that the target remains alive. Diagnostics contain elapsed time and PID, not command lines or environment.

Both independent reviewers passed this targeted correction. Final local full suite: 152 tests, 151 passed, 0 failed, 1 opt-in skip, 164098.5072 ms. Focused harness/concurrency/install-parity/resources: 32 passed. Logs: `luna-sidecar-pr1-query-close-red-20261005.log`, `luna-sidecar-pr1-query-close-green-20261005.log`, `luna-sidecar-pr1-query-budget-local-20261005.log`, and `luna-sidecar-pr1-query-budget-full-20261005.log`. Hosted timings and exact-head matrices remain required before merge. Production code and real-host release gates remain unchanged.
## Superseding Windows metadata correction, 2026-10-05

The a9302f1 candidate failed both exact-head hosted runs 37272842232/37272845625: the live probes still hung, including a 15000 ms metadata timeout. This falsifies the sufficiency of the budget-only correction; it does not establish the underlying hosted CIM delay. The next bounded correction uses Get-WmiObject against the same numeric-PID-filtered Win32_Process on the existing absolute Windows PowerShell 5.1 path, restoring the original five-second metadata bound. PID/schema/command checks, Unicode transport, query-child close waiting and untouched target processes remain required. Timeout diagnostics expose only elapsed time, target PID and allowlisted stages, never command lines or environment.

Focused local harness/concurrency/install-parity/resources checks passed all 32 tests (57307.1148 ms). Independent correctness and regression reviewers found the PS5.1 WMI identity contract compatible and strict, while explicitly requiring hosted confirmation. Full local results and exact-head CI delivery receipts will be retained in the existing private handoff directory. Production behavior remains unchanged from af42ec4; releaseReady remains false and FINAL-RELEASE-01 remains open.

Final WMI candidate full local suite: 152 tests, 151 passed, 0 failed, 1 existing opt-in real-host skip, 169592.1867 ms. Log: luna-sidecar-pr1-wmi-full-20261005.log. Final source correctness review found no blocker; hosted compatibility remains pending.

## Hosted layer isolation and final framework query, 2026-10-05

2768b95 still failed both Windows matrices; a63c309 comparisons showed OS/profile/module path and explicit import did not resolve the stall. The 45c2faa ladder (push 37275249806, PR 37275253728) proved plain command, encoded command and file execution work; encoded cmdlet resolution stalls; direct reflection WMI succeeds with exact PID on Node22 in 277 ms and Node24 in 212 ms. PowerShell7 CIM also succeeds, but no new runtime dependency is introduced. This isolates hosted Windows PowerShell cmdlet/module initialization, not a WMI provider or transport failure. Its deeper runner-specific cause remains unknown.

The final helper directly loads the verified strong-name System.Management .NET Framework assembly, queries the same root\cimv2 Win32_Process fields with a numeric PID filter, requires zero or exactly one result and validates the exact PID. Numeric and UTF-8 base64 fields enter controlled Console JSON; no serializer cmdlet, user module/profile or general inherited environment is loaded. Owned/uncertain/missing provenance checks, five-second bounds, own-query-child close waiting and untouched targets remain required. The temporary CI probe is removed. Simple-name Assembly.Load failed locally; the full verified identity corrected it, and all 13 harness tests passed in 8182.1463 ms. Production source remains unchanged from af42ec4, and releaseReady/FINAL-RELEASE-01 remain open. Final full-suite, independent review and exact-head/main receipts are retained privately.

Final framework-query candidate full local suite: 152 tests, 151 passed, 0 failed, 1 existing opt-in real-host skip, 168040.415 ms. Both independent final reviewers PASS; final focused checks total 32 passed. Syntax and diff checks clean. Full log: luna-sidecar-pr1-framework-full-20261005.log. Exact-head hosted/main delivery receipts still gate merge and will be stored privately.

---
phase: 05-simple-subagent-ux
plan: 05-PR1
type: execute
wave: 1
runtime: codex-cli
assurance: self_checked
autonomous: true
requested_level: high
effective_level: high
depends_on: [05-PLAN.md, 05-VERIFICATION.md]
requirements: [FINAL-RELEASE-01, AUTH-01, RESOURCE-01, SAFETY-01, LIFE-01]
files-modified:
  - .planning/SPEC.md
  - scripts/release-smoke.mjs
  - test/release-smoke.test.mjs
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
  - test/lifecycle.test.mjs
  - test/resources.test.mjs
  - test/concurrency.test.mjs
  - test/helpers/cli-harness.mjs
  - test/harness.test.mjs
  - skills/luna-sidecar/references/USAGE.md
  - .planning/phases/05-simple-subagent-ux/05-PR1-PLAN.md
  - .planning/phases/05-simple-subagent-ux/05-PR1-SUMMARY.md
  - .planning/phases/05-simple-subagent-ux/05-PR1-VERIFICATION.md
browser_proof_required: false
browser_proof_rationale: CLI adapter and deterministic harness only.
non_goals: [planning migration, global configuration changes, provider authority changes, automatic replay, publication, phase closure]
must_haves:
  truths:
    - Copied-launcher evidence recognizes actual direct Node and observed PowerShell invocations and rejects quoted mentions and alternate roots.
    - Private Claude configuration preserves existing OAuth file and environment credential routes without copying user settings or exposing credentials.
    - Failed prompt preservation is explicit, private, and covered by existing terminal retention; failed copies never silently destroy the only prompt.
    - Existing lifecycle, cancellation, observation, installation parity and safety regressions pass without weaker assertions.
  artifacts:
    - path: scripts/release-smoke.mjs
      provides: Evidence parsing and isolated host configuration
    - path: skills/luna-sidecar/scripts/luna-sidecar.mjs
      provides: Failure prompt preservation and existing retention integration
  key_links:
    - from: host event commands
      to: lifecycle predicates
      via: exact Node launcher invocation recognition
    - from: terminal prompt archive
      to: terminalRawCapBytes
      via: existing collectPruneCandidates and pruneOneTerminalTurn
---

# PR 1 correction within Phase 05

## Authority and scope

Owner request on 2026-10-04 authorizes analysis, multiple independent reviews, planning, implementation and verification of PR 1. Owner explicitly selected the existing `.planning` plan/execute/verify contract after current Workspine refused legacy state (`missing_config`). This is a bounded correction under the committed `05-PLAN.md`, not a new roadmap phase or a migration. No current Workspine helper gate is claimed to have passed. No `.work` state is created. Phase 05 and FINAL-RELEASE-01 remain open.

Base: f0f7df21ec61971f47538e4424bbe8bad7a6e0b7. PR head: 72151ea9cd52f4d1d748c6ac7587cfdc2682faa6. All three commits and four changed files are in scope. The original local checkout is dirty and is preserved. Its uncommitted Recovery-02 plans are separate historical context, not imported authority for this PR.

## Root cause challenge

The absolute-only parser rejected observed Codex relative paths, but widening string matching also admits echo/mention commands and sibling roots. Correct the proof predicate, rather than certifying an invocation from arbitrary substring presence. The removed Claude bare mode excluded ordinary login; copying only an OAuth file then incorrectly makes that file a prerequisite for existing environment auth. The failed-turn archive retains useful input, but is outside the 256 MiB retention machinery and copy failure silently deletes the original. These findings came from separate read-only requested-Luna reviewers; model request and same-runtime review do not establish cross-runtime assurance.

Baseline focused suite: 82 passed, one skipped, one cancellation race failed at lifecycle.test.mjs:435. Exact isolated rerun passed. This is unresolved intermittent evidence, not proven PR causality; preserve assertions and investigate if full-suite validation reproduces it.

## Tasks

<task type="auto" id="1">
<files>scripts/release-smoke.mjs, test/release-smoke.test.mjs</files>
<action>Add failing tests for echo/mention and sibling absolute roots, mismatched command adjacency, prompt-only lifecycle names and non-command events. Replace split substring predicates with one bounded invocation recognizer reused for start and all lifecycle commands. Support direct Node and the observed PowerShell -Command wrapper, exact absolute or project-relative launcher paths, and platform-correct path case. Unsupported shell structures fail closed; do not implement a general shell parser.</action>
<verify>node --test --test-name-pattern='host.*parsing|host schema|project-relative|copied.*invocation' test/release-smoke.test.mjs</verify>
<done>Positive source-backed fixtures and new adversarial negatives pass.</done>
</task>

<task type="auto" id="2">
<files>scripts/release-smoke.mjs, test/release-smoke.test.mjs</files>
<action>Add failing tests for environment auth with no OAuth file, blank credentials, and private configuration permissions on POSIX. Recognize exactly ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN and CLAUDE_CODE_OAUTH_TOKEN when a string has non-empty trimmed content. Preserve each inherited value unchanged and never record values. Keep OAuth-file copy as the existing login route and fail closed when neither file nor supported environment auth exists. Restrict scratch config directory/file permissions where supported and retain explicit cleanup. Keep the documented strict-MCP empty server set; do not change flags on speculative incompatibility alone.</action>
<verify>node --test --test-name-pattern='Claude host|Claude.*auth|private config|only the Claude' test/release-smoke.test.mjs</verify>
<done>Existing file login and supported environment auth reach the private config; missing auth does not spawn Claude; evidence excludes sentinels.</done>
</task>

<task type="auto" id="3">
<files>skills/luna-sidecar/scripts/luna-sidecar.mjs, test/lifecycle.test.mjs, test/resources.test.mjs, skills/luna-sidecar/references/USAGE.md</files>
<action>Add regressions for failure archive failure, cancelled/completed prompt disposal, resume isolation and terminal prompt retention. Failed/unknown turns preserve input for manual recovery; completed/cancelled turns discard it. Prefer an atomic rename to the existing logs/turn-id.prompt archive instead of a second copy. Archive failure leaves the original private prompt available and records a bounded warning on that exact turn. Integrate disposition inside existing asynchronous worker mutations on every terminal path: status/wait must never observe terminal state before file disposition and its warning are durably reflected. Include canonical archived prompt and fallback original/claimed prompt bytes and removal in existing terminal pruning; keep active evidence and compact manifests protected, including legacy and partial-log behavior. Document manual recovery path, local sensitivity and pruning; do not add automatic replay or a new command.</action>
<verify>node --test --test-concurrency=1 test/lifecycle.test.mjs test/resources.test.mjs</verify>
<done>Failed/unknown input is manually recoverable within bounded retention. Archive failure retains the source and exposes a warning before terminal visibility. Completed/cancelled input is discarded before terminal visibility. Existing resume authority and cleanup pass.</done>
</task>

<task type="auto" id="4">
<files>.planning/phases/05-simple-subagent-ux/05-PR1-SUMMARY.md, .planning/phases/05-simple-subagent-ux/05-PR1-VERIFICATION.md</files>
<action>Run focused checks, full serialized npm test, syntax checks and git diff --check. Obtain fresh independent review of final source/diff and regression evidence. Persist implementation summary, handoff, deltas, verification with code/test evidence, provenance and delivery warnings. Keep release-ready false: a changed candidate cannot reuse previous-head CI for live proof. Do not run providers or invent exact-commit CI, merge, push, rewrite history or publish. Collect local commits, branch and PR state.</action>
<verify>npm test; node --check scripts/release-smoke.mjs; node --check skills/luna-sidecar/scripts/luna-sidecar.mjs; git diff --check</verify>
<done>Durable local correction verdict, independent review and explicit remaining live/CI gates.</done>
</task>

## Evidence and stop conditions

Execution clarification: terminal visibility above means durably committed terminal state. The existing read-only observer can project unknown for a dead runner without changing the manifest or moving a prompt. Preserve that observer contract and the original prompt; do not turn observation into recovery. Final fresh-review availability must be recorded explicitly if reviewer quota prevents completion.

Tests must fail on the PR head before the relevant implementation and pass afterward. No assertion weakening, retries of providers or authority broadening. Source review is judgment; executed tests and command exit codes are deterministic. Local correction verification may pass while Phase 05 release remains gaps_found. If the same material blocker survives a bounded correction, preserve evidence and stop. A full-suite failure must be resolved or reported as a real blocker, never omitted.

Research uses established Node filesystem/harness patterns and official Claude CLI/auth references. Installed Claude 2.1.288 help supports strict MCP with no explicit configuration (empty server set); no general MCP manager is added. This has no browser or visual claim.

<checks><plan_check>
checker: independent same-runtime requested-Luna agent
checker_runtime: codex-cli
status: passed
blocking: false
notes: Independent authority_review context passed the revised exact auth key set, all-state prompt disposition and terminal visibility, retention, parser scope and local-only proof boundaries on 2026-10-04. Same runtime, self_checked assurance only.
</plan_check></checks>

## Owner-directed merge follow-up, 2026-10-05

Owner asked the agent to take over and merge PR 1 reliably without downgrading quality. This supersedes the earlier PR-branch-only delivery limit for this corrective merge; no release, publication, phase closure or issue closure is inferred. Obtain fresh independent correctness and regression/authority review, preserve failing CI history, verify the exact final head's complete matrix, merge without bypassing checks, then verify main CI. Align the two existing SPEC lifecycle/retention statements with the reviewed prompt implementation; do not relax FINAL-RELEASE-01 or run providers under this follow-up. The existing SPEC explicitly permits implementation to be present while missing real-host proof blocks release closure.

The subsequent Windows cleanup-hook failure was independently found on the original base commit with the same unchanged raw-PID helper. Review found no production regression mechanism; failing logs lack process identity. Permit one complete exact-head rerun with failure evidence preserved, and require both final-head matrices before merge. Do not expand into speculative harness changes or weaken checks. Repeated cleanup failure blocks merge pending further ownership evidence. Keep this decision in the existing summary/verification; no new report is needed.

### CI reliability repair after the repeated failure

The permitted rerun repeated Windows24 cleanup failure, so the earlier rerun-only path is exhausted. Extend only the existing test harness to distinguish owned surviving processes from reused historical PIDs using original child-close evidence and bounded process identity inspection. A live owned process must still fail cleanup; missing/uncertain identity must fail closed. Never kill a historical PID based solely on liveness. Add deterministic ownership/uncertainty regressions and validate real Windows inspection. Leave production runtime and existing deadlines unchanged.

An earlier documentation-head CI also failed the concurrent-resume assertion: both resumes succeeded because the test released its first provider before the second process reached admission. Hold the first fixture alive through the competing admission using the existing linger/release mechanism. Preserve the simultaneous attempt and every exclusion assertion; additionally prove the rejected attempt launched no provider. Release the first fixture before terminal assertions. Both independent reviewers challenge the ordering and final patch. Require focused harness/concurrency checks, the full suite, both exact-head matrices, matched-head merge and main CI. Do not infer release closure.

Exact-head CI at 90952b6 exposed a distinct metadata-tool deadline problem: both live Windows identity probes exceeded their new five-second query budget, while Linux and functional assertions passed. Preserve the original five-second fixture liveness wait. Give only PowerShell/CIM metadata inspection its own bounded 15-second budget, report per-query elapsed time from real Windows tests, and require hosted measurements/green CI before merging. Query timeout must terminate and await only its own subprocess through the existing three-second close helper, then fail closed. A real regression must fail before that close-wait correction and pass afterward. No target-PID kill, retries or platform test skips are permitted.

The 15-second candidate a9302f1 also failed both hosted Windows matrices (37272842232/37272845625); a budget-only explanation is insufficient. Supersede that budget increase: restore five seconds and query the same filtered Win32_Process identity through Get-WmiObject, supported by the explicitly selected Windows PowerShell 5.1 executable. Preserve the exact PID, command identity, Unicode transport and fail-closed checks. Add only allowlisted query-stage diagnostics to distinguish PowerShell startup from metadata lookup if hosted execution still fails. Require the full local suite, independent review and both exact-head hosted matrices; local timing alone cannot establish this correction.

2768b95 also failed hosted Windows identity queries at stage script_started. Permit a temporary Windows-only diagnostic step in the existing .github/workflows/ci.yml, retaining unchanged npm test and five-second bounds. Compare essential OS/profile/module variables and explicit module/direct assembly lookup; log only case, stage, elapsed, status and exact-PID boolean. Remove the probe before final verification/merge. Local probe validation passed every case, so only hosted comparative results can identify the cause. No provider, secret output, full inherited environment, retries or test skips.

Hosted execution ladder at 45c2faa isolates the failing layer: plain command/encoded/file succeed, WinPS cmdlet resolution stalls, and direct reflection Win32_Process queries succeed with exact PID on Node22 (277 ms) and Node24 (212 ms). Replace only cmdlet/module loading with the same numeric-PID-filtered root\cimv2 query through System.Management's verified full .NET Framework assembly identity. Emit controlled numeric/base64 JSON via Console, require exactly one matching record or explicit absence, retain all uncertainty/owned-process/timeout safeguards, and remove the temporary workflow probe. This is a supported bounded implementation correction; the deeper hosted cmdlet initialization cause remains unidentified. Require full local checks, independent final review and both final exact-head matrices before matched-head merge/main verification.

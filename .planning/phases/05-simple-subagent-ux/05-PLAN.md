---
phase: 05-simple-subagent-ux
plan: 05
type: execute
wave: 5
runtime: codex-cli
assurance: self_checked
depends_on:
  - "V1-VERIFICATION.md status: passed"
  - "04-agent-ux-and-delivery/04-VERIFICATION.md status: passed"
files-modified:
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
  - test/contract.test.mjs
  - test/authority.test.mjs
  - test/harness.test.mjs
  - test/fixtures/fake-codex.mjs
  - test/helpers/cli-harness.mjs
  - test/lifecycle.test.mjs
  - test/observation.test.mjs
  - test/resources.test.mjs
  - test/safety.test.mjs
  - skills/luna-sidecar/SKILL.md
  - skills/luna-sidecar/references/USAGE.md
  - README.md
  - test/ux.test.mjs
  - test/install-parity.test.mjs
  - test/release-smoke.test.mjs
  - scripts/release-smoke.mjs
  - docs/verification/phase5-final-shape-evidence.json
  - docs/verification/phase5-final-shape-evidence.md
autonomous: true
requirements:
  - SIMPLE-01
  - EXPLICIT-01
  - TRUST-01
  - READY-01
  - RETRY-01
  - MCP-01
  - USAGE-01
  - FINAL-UX-01
  - FINAL-RELEASE-01
non_goals:
  - "Do not add product modes, hidden defaults, compatibility aliases, a host policy engine, MCP management, orchestration control planes, or .work migration."
  - "Do not infer delegated task success, estimate price, schedule workers, allocate files, or add automatic worktrees."
  - "Do not rewrite historical audits, V1-VERIFICATION.md, Phase 1-4 closure artifacts, or unrelated dirty paths."
hard_boundaries:
  - "Only the six lifecycle commands are public: start, status, wait, resume, cancel, and list; the internal runner entry is not user-facing."
  - "Every accepted start has an explicit absolute cwd, sandbox, and effort; omission never selects a hidden authority or effort."
  - "Explicit cwd skips only the provider Git-repository admission check; it never changes sandbox, approval, MCP, or filesystem scope."
  - "Provider MCP configuration remains provider-owned; the launcher may summarize provider events but may not discover, rewrite, disable, or authenticate servers."
  - "Host coordination remains host work: multiple workers and native subagents are explicit, bounded, and not scheduled by Luna Sidecar."
  - "Live work uses fresh scratch/state roots, positive deadlines, copied installed assets, and exact owned-process cleanup."
escalation_triggers:
  - "Stop and replan in 05-02 gate 1 if the installed Codex CLI cannot express the three sandbox values or explicit-cwd admission without unsafe global mutation."
  - "Stop and replan in 05-02 gate 1 if no stable provider-side readiness acknowledgment can be observed from the actual source-backed invocation and reproduced in the fake fixture."
  - "Stop if readiness needs a daemon, recurring synthetic model fleet, hidden task probe, changed authority, or provider configuration rewriting."
  - "Stop if persisted workers cannot be read truthfully after command simplification, or if a failure would require an alias or silent fallback."
  - "Stop if usage event semantics, MCP fatality, the exact future retry classification, or host-facing invocation cannot be established from observed provider or host evidence."
  - "Stop if deterministic CI, installed-byte parity, scratch containment, or independent process cleanup is missing; record the gap rather than weakening the claim."
approval_gates:
  - "Ask before any tag, release, package publication, global install, global configuration change, or remote mutation beyond the repository's direct-main policy."
  - "Do not approve a broader authority mapping, new provider argument, or host-specific adapter as an implementation convenience; challenge the contract first."
  - "A missing or unsuccessful Codex CLI or Claude Code host observation leaves FINAL-RELEASE-01 false; it is not converted into certification by prose."
anti_regression_targets:
  - "Phase 1-3 deterministic harness, compatibility, authority, lineage, lifecycle, cancellation, concurrency, observation, receipt, resource, and recursion guarantees remain green."
  - "Native Codex subagents remain provider-owned and usable; recursive sidecar execution remains rejected."
  - "Cancellation, unknown state, terminal evidence, bounded logs, compact allowlist receipts, same-cwd warnings, and no-task-success inference remain unchanged unless directly required by Phase 5."
  - "Copied Codex and Claude Code skill trees remain byte-identical to canonical source and execute the same launcher contract."
known_unknowns:
  - "The exact installed Codex capability/readiness response and version-specific event shape must be confirmed in 05-02 gate 1; do not guess an unsupported probe or rely on a 05-01 artifact."
  - "Provider usage may be cumulative or per-event; implementation must establish one interpretation from the provider contract before aggregating."
  - "Claude Code availability and its host-facing invocation surface may vary; use only the documented availability-gated procedure and record the observed command/version without inventing syntax."
ui_proof_slots: []
no_ui_proof_rationale: "Agent Skill, CLI, copied-install, host-observation, and process evidence make no rendered browser UI claim."
high_leverage_surfaces:
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
  - skills/luna-sidecar/SKILL.md
  - skills/luna-sidecar/references/USAGE.md
  - scripts/release-smoke.mjs
  - test/contract.test.mjs
  - test/fixtures/fake-codex.mjs
  - test/release-smoke.test.mjs
second_pass_required: true
closure_claim_limit: "Claim only the six-command, explicit-control, provider-owned-MCP, bounded-readiness behavior and the recorded installed/Codex-CLI/Claude-Code observations for the exact source commit, versions, platforms, and scratch run. Do not claim host certification, universal routing, model quality, task success, secret redaction of content-bearing logs/final messages, or unrecorded child cleanup."
parallelism_budget:
  max_concurrent_plans: 1
  safe_parallelism: []
leverage:
  lost: "Some v1 convenience aliases and implicit defaults are removed, and release proof requires fresh installed and host-facing observations."
  kept: "The existing Node launcher, Agent Skills installation flow, provider-owned MCP boundary, v1 lifecycle and receipt internals, fake-provider harness, and Phase 4 CI/install conventions."
  gained: "A smaller explicit host contract, fail-fast readiness, narrow zero-default retry semantics, honest usage/history, and claim-matched cross-host evidence without a new orchestration subsystem."
must_haves:
  truths:
    - "The public protocol exposes only start, status, wait, resume, cancel, and list, with actionable structured failures for removed commands and aliases."
    - "Every accepted start carries absolute cwd, sandbox, and effort through validation, provider argv, receipt, and resume inheritance or override."
    - "Explicit-cwd admission skips only Codex's Git check; the parent waits for persisted runner readiness under the requested cwd/sandbox, and failed readiness leaves no owned process."
    - "Retries remain zero by default; at most one provider-only byte-identical retry is allowed only for an exact source-observed transient pre-activity child-spawn code proven by the fake fixture; runner and unknown/generic errors never retry."
    - "Provider MCP remains provider-owned, usage is passthrough-or-unavailable, list/history are bounded and deterministic, and task meaning remains host-owned."
    - "The installed artifact is tested, and successful real Codex CLI and Claude Code host observations are both recorded before FINAL-RELEASE-01 can become true."
  artifacts:
    - path: skills/luna-sidecar/scripts/luna-sidecar.mjs
      provides: "Canonical six-command parser, explicit-control persistence, provider invocation, persisted parent-to-runner readiness handshake, retry, lifecycle, receipt, MCP, usage, and list behavior."
      producer: "05-01 produces command parsing, validation, explicit-control persistence, and legacy rejection; 05-02 produces source-observed provider argv/sandbox/Git-admission realization, capability, readiness, retry, MCP, usage, and list changes."
      consumers: "test/contract.test.mjs, test/authority.test.mjs, test/lifecycle.test.mjs, test/observation.test.mjs, test/resources.test.mjs, test/safety.test.mjs, and copied launchers."
      verification: "node --test test/contract.test.mjs test/authority.test.mjs test/lifecycle.test.mjs test/observation.test.mjs test/resources.test.mjs test/safety.test.mjs"
    - path: scripts/release-smoke.mjs
      provides: "Parser/control smoke checks, copied-install checks, delivery gates, live host observations, and phase-5 evidence composition."
      producer: "05-01 updates internal release-smoke/test-harness parser-control checks; 05-03 produces installed-copy, live-observation, evidence, and delivery predicates."
      consumers: "test/release-smoke.test.mjs and docs/verification/phase5-final-shape-evidence.json/.md."
      verification: "node --test test/release-smoke.test.mjs; node --check scripts/release-smoke.mjs"
    - path: test/fixtures/fake-codex.mjs
      provides: "Source-observed provider invocation, persisted readiness success/failure, pre-activity child-spawn failure, MCP, usage, event, output, and cleanup fixtures."
      producer: "05-02 extends the existing tracked fake Codex fixture only after 05-02 gate 1 records the stable observed acknowledgment schema."
      consumers: "test/lifecycle.test.mjs, test/harness.test.mjs, test/resources.test.mjs, test/observation.test.mjs, and test/safety.test.mjs."
      verification: "node --test test/harness.test.mjs test/lifecycle.test.mjs test/resources.test.mjs test/observation.test.mjs test/safety.test.mjs"
    - path: skills/luna-sidecar/SKILL.md
      provides: "Canonical Agent Skill manifest and launcher guidance."
      producer: "05-03 updates the canonical skill manifest and references."
      consumers: "Pinned Codex and Claude Code copied-install trees and test/ux.test.mjs."
      verification: "node --test test/ux.test.mjs test/install-parity.test.mjs"
    - path: test/install-parity.test.mjs
      provides: "Byte-identical canonical/Codex/Claude skill-tree and launcher-copy verification, including the blocking start/readiness command path."
      producer: "05-01 keeps parser-dependent copied-launcher CLI assertions; 05-03 extends the existing pinned installer parity checks."
      consumers: "scripts/release-smoke.mjs and FINAL-RELEASE-01 evidence."
      verification: "node --test test/install-parity.test.mjs test/release-smoke.test.mjs"
    - path: docs/verification/phase5-final-shape-evidence.json
      provides: "Machine-readable deterministic, install, CI, live-host, cleanup, and release gate evidence."
      producer: "scripts/release-smoke.mjs in 05-03 after all delivery and host gates pass or fail closed."
      consumers: "docs/verification/phase5-final-shape-evidence.md, the fresh verifier, and later roadmap closure."
      verification: "node scripts/release-smoke.mjs --live --tested-commit <testedCommit> --ci-run-id <ciRunId>; validate JSON schema and releaseReady formula."
  key_links:
    - from: scripts/release-smoke.mjs
      to: skills/luna-sidecar/scripts/luna-sidecar.mjs
      via: "05-03 `scripts/release-smoke.mjs` and the installed-copy tests execute copied launchers as CLI child processes; parser/control helpers remain internal to release-smoke and the test harness. No launcher parser/control export or export refactor is allowed."
      verification: "test/release-smoke.test.mjs and test/install-parity.test.mjs assert copied-launcher process execution, command names, gap codes, clean pre-spawn controls, and parser-dependent behavior without importing launcher helpers."
    - from: test/fixtures/fake-codex.mjs
      to: "test/lifecycle.test.mjs, test/harness.test.mjs, test/resources.test.mjs, test/observation.test.mjs, and test/safety.test.mjs"
      via: "The existing harness injects scripted provider argv/stdin/cwd/events, readiness acknowledgments and typed failures, retry failures, usage, MCP warnings, and descendant processes; the launcher persists those outcomes in the existing worker/turn record for the parent to observe."
      verification: "The focused 05-02 test ordering asserts start blocking, persisted readiness predicates, exact attempt count, event schema, receipts, list buckets, typed failures, and owned-PID absence."
    - from: "start command in skills/luna-sidecar/scripts/luna-sidecar.mjs"
      to: "existing worker/turn record and test/helpers/cli-harness.mjs"
      via: "The parent creates the existing task record, launches the detached _worker, waits on a monotonic 10-second deadline, and returns only after a reload proves running/provider readiness under the requested cwd and sandbox or a typed failure is persisted."
      verification: "Command-level lifecycle tests hold the fake provider behind readiness, prove no start response precedes the persisted state transition, cover every typed failure and timeout, and independently verify no owned runner/provider/descendant PID remains before the nonzero response."
    - from: "skills/luna-sidecar/SKILL.md and skills/luna-sidecar/scripts/luna-sidecar.mjs"
      to: "pinned Codex and Claude Code installed skill copies"
      via: "The pinned --copy installer produces regular-file copies whose manifests and launcher bytes equal the canonical source."
      verification: "test/install-parity.test.mjs and scripts/release-smoke.mjs compare canonical/Codex/Claude manifests and execute both copied launchers against the fake provider."
    - from: scripts/release-smoke.mjs
      to: docs/verification/phase5-final-shape-evidence.json
      via: "Release smoke writes one bounded evidence object only after deterministic, CI, clean-worktree, host, cleanup, and allowlist gates."
      verification: "test/release-smoke.test.mjs validates the exact host evidence schema and releaseReady formula."
---

# Phase 5: Simple subagent UX - Plan 05

## Objective

Make Luna Sidecar feel like one ordinary, controllable subagent: the host agent explicitly chooses cwd, sandbox, effort, lifecycle, and task scope; the launcher fails fast when a worker is not usable; receipts expose operational facts without judging the task; and the installed Agent Skill works through deterministic checks plus successful real Codex CLI and Claude Code observations. Preserve the verified v1 lifecycle, cancellation, lineage, bounded-log, and recursion architecture unless a listed Phase 5 requirement requires a direct change.

## Context

- `.planning/SPEC.md` is authoritative for the Phase 5 final-shape amendment and the retry, list, MCP, usage, and release decisions locked for this run.
- `.planning/ROADMAP.md` defines the nine requirements, five success criteria, out-of-scope list, stop/replan conditions, and deferred `.planning -> .work` maintenance queue.
- `.planning/V1-VERIFICATION.md` is a passed cross-phase baseline, not fresh Phase 5 proof.
- `.planning/phases/04-agent-ux-and-delivery/04-SUMMARY.md` and `04-VERIFICATION.md` establish installed-skill, CI, and narrow Codex process-evidence conventions and their claim limits.
- The current source and fixtures are the architecture to extend. 05-01 owns parser/control migration; 05-02 gate 1 owns provider invocation and readiness schema discovery; 05-03 owns copied-install and live-evidence delivery.

## Requirements Covered

- SIMPLE-01 - exact six-command public surface and structured removed-command failures.
- EXPLICIT-01 - explicit initial cwd, sandbox, and effort plus truthful resume inheritance/overrides.
- TRUST-01 - explicit-cwd validation and Git-admission-only bypass.
- READY-01 - bounded same-authority readiness with typed fail-fast cleanup.
- RETRY-01 - zero retries by default and only the locked future provider-only exception.
- MCP-01 - provider-owned MCP with bounded nonfatal warning collapse and fatal readiness failure.
- USAGE-01 - provider-only input/cached-input/output passthrough or `unavailable`, with no cost/task inference.
- FINAL-UX-01 - simple visible host workflow, effort guidance, one-worker-first containment, bounded workers, native subagents, result evaluation, and history/list guidance.
- FINAL-RELEASE-01 - deterministic Windows/Linux proof, installed artifact parity, successful real Codex CLI and Claude Code observations, and no lingering owned process.

## Must-Haves

1. The public help and parser contract names only `start`, `status`, `wait`, `resume`, `cancel`, and `list`; removed `run`/`stop` and legacy authority flags fail with actionable structured errors.
2. Every accepted `start` carries absolute cwd, sandbox, and effort through validation, provider argv, receipt, and truthful resume inheritance or visible override; explicit cwd bypasses only Git admission.
3. Readiness is bounded and same-authority, failed readiness cleans up all owned processes, and retry behavior is zero by default with no runner retry.
4. Provider MCP remains provider-owned, usage is passthrough-or-`unavailable`, list/history are bounded and deterministic, and task meaning remains host-owned.
5. The canonical and copied skills agree, deterministic Windows/Linux checks pass, and both successful real host observations are recorded before release closure.

## Anti-Goals

- No `.work` migration, `EXECUTION.md`, `APPROACH.md`, new plan, config, daemon, queue, scheduler, mode system, MCP manager, provider registry, task judge, cost engine, or automatic worktree system.
- No host-specific runtime code, invented Claude CLI command, hidden provider probe, fan-out readiness task, or authority-changing retry.
- No implementation, test, summary, verification, roadmap closure, or release-evidence artifact is created by this planning run.

## Hard Boundaries

- Preserve the current launcher, fake-provider harness, Agent Skills copy flow, lifecycle records, locks, process cleanup, and provider-owned MCP boundary; extend existing patterns rather than creating parallel machinery.
- Do not change files outside the exact future implementation/evidence allowlist in frontmatter, and do not absorb the other dirty worktree paths into this plan.
- Keep source/control migration in 05-01, provider/readiness/retry/MCP/usage/list behavior in 05-02, and live-evidence changes in 05-03 for shared files.
- Never export parser/control helpers from the launcher or refactor the launcher export surface; `scripts/release-smoke.mjs` and installed-copy tests execute copied launchers as CLI processes, while parser/control helpers remain internal to release-smoke and the test harness.
- The only evidence-only staging allowlist is exactly `docs/verification/phase5-final-shape-evidence.json` and `docs/verification/phase5-final-shape-evidence.md`; staged-name inspection must reject any other evidence-commit path.

## Evidence Contract

- Execute `05-01 -> 05-02 -> 05-03` sequentially. `npm ci` is the first 05-01 command; no 05-01 test command runs before it succeeds. Each focused task gate must pass before the next task begins.
- Deterministic checks cover Windows and Linux behavior through the existing Node test suite and the exact CI job matrix. Copied Codex and Claude Code skill trees must be regular-file, byte-identical installs with no global mutation.
- Readiness, retry, MCP, usage, list/history, cleanup, and claim predicates are machine-checkable. Missing, malformed, timeout, schema-drift, or uncertain results fail closed.
- Immediately before each live host observation and immediately before writing live evidence, run `git status --porcelain`; require exit code 0 and an empty byte-for-byte output. Any output, including an untracked file, stops the run.
- Per-host evidence uses exactly this JSON shape for both `codex_cli` and `claude_code`:

```json
{
  "schemaVersion": 1,
  "hosts": {
    "codex_cli": {
      "available": true,
      "invocationRef": "evidence://codex-cli/observation-1",
      "procedureRef": "release-smoke.codex_cli.v1",
      "hostVersion": "<observed-version>",
      "sidecarReceipt": {
        "schemaVersion": 2,
        "schemaResult": "valid"
      },
      "cleanup": {
        "result": "verified",
        "ownedPidResult": "all_gone",
        "ownedPids": [],
        "ownedPidsGone": true
      },
      "failureCode": null,
      "claimEligible": true
    },
    "claude_code": {
      "available": true,
      "invocationRef": "evidence://claude-code/observation-1",
      "procedureRef": "release-smoke.claude_code.v1",
      "hostVersion": "<observed-version>",
      "sidecarReceipt": {
        "schemaVersion": 2,
        "schemaResult": "valid"
      },
      "cleanup": {
        "result": "verified",
        "ownedPidResult": "all_gone",
        "ownedPids": [],
        "ownedPidsGone": true
      },
      "failureCode": null,
      "claimEligible": true
    }
  },
  "otherGates": {
    "deterministic": true,
    "installedParity": true,
    "ci": true,
    "delivery": true,
    "evidence": true
  },
  "releaseReady": true
}
```

- For unavailable, failed, timed-out, schema-drifted, or uncertain observations, use `available: false` or the observed value, null refs/version as appropriate, `sidecarReceipt.schemaResult` of `missing`, `invalid`, or `not_run`, `cleanup.result` of `uncertain` or `not_run`, `ownedPidResult` of `uncertain`, `lingering`, or `not_run`, a non-null `failureCode`, and `claimEligible: false`.
- `claimEligible` is true only when `available` is true, both refs and `hostVersion` are non-empty, `sidecarReceipt.schemaVersion` is `2`, `sidecarReceipt.schemaResult` is `valid`, `cleanup.result` is `verified`, `cleanup.ownedPidResult` is `all_gone`, `cleanup.ownedPidsGone` is true, and `failureCode` is null. `releaseReady` is true only when both host `claimEligible` values are true and every `otherGates` value is true.
- FINAL-RELEASE-01 requires successful real host observations from both Codex CLI and Claude Code. Availability-gated absence is an honest incomplete result, not a substitute.
- Delivery evidence binds to the exact tested implementation commit and CI run. Evidence is staged only under the exact two-file allowlist, with staged-name inspection, remote refetch, ancestor/drift checks, ordinary push, an `evidenceCommit` handoff, a fresh verifier, and later `verificationCommit`/roadmap closure outside this planning run.

## Common Pitfalls

- Treating `spawn`, `thread.started`, `turn.completed`, or a fixture-only marker as readiness.
- Reintroducing `run`, `stop`, legacy authority flags, hidden defaults, or a runner-level retry while updating tests or release-smoke controls.
- Treating an imagined 05-01 invocation/readiness artifact as source evidence; 05-02 gate 1 must observe and pin the provider contract itself.
- Counting reasoning fields as usage, estimating cost, inferring task success, or treating a terminal lifecycle state as task success.
- Sorting list output by incidental object order or adding a new state to represent active workers.
- Treating install parity or fake-provider copied-launcher runs as real host observations.
- Writing a Claude Code command from memory, accepting unavailable host evidence as green, or staging summaries/verification/roadmap files in the evidence commit.

## Stop-And-Challenge

- Stop and replan in 05-02 gate 1 if the actual installed/source-backed Codex invocation has no stable acknowledgment schema; do not implement a guessed readiness probe.
- Stop if a proposed retry is not provider-only, not byte-identical, not exact-code allowlisted, or not fixture-proven before provider process/event/stdout/stdin activity; all other failures stay zero-retry.
- Stop if an active-state interpretation requires new lifecycle machinery or if list retention/order cannot be made deterministic from existing states and records.
- Stop if either real host is unavailable or the host-facing invocation/schema/cleanup is uncertain; record false/incomplete evidence and do not close release.
- Stop before any remote or release mutation if `git status --porcelain` is non-empty, `origin/main` moves unexpectedly, the tested commit is not an ancestor, staged names exceed the allowlist, or the evidence handoff cannot be made to a fresh verifier.

## Approval Gates

- Ask before tag/release/package publication/global installation/global configuration mutation or any remote mutation beyond the documented ordinary push.
- Require the exact tested commit, matching CI run, clean owned process set, and evidence allowlist before live provider or host-facing work.
- Treat `evidenceCommit` as a handoff to a fresh verifier; `verificationCommit`, summary, and roadmap closure are later workflow outputs and cannot be self-certified here.

<checks>
<plan_check cycle="1">
checker: self
checker_runtime: codex-cli
status: issues_found
blocking: false
notes: Cycle 1 issues_found: the roadmap allowed an unconditional one-retry path instead of the locked zero-default byte-identical provider-only exception; the plan used unsupported proof field names and invalid checker/runtime/status values; must_haves lacked concrete producer-consumer-verification artifacts and key links; 05-02 omitted the existing fake-Codex fixture and depended on an imaginary 05-01 readiness artifact; the release procedure lacked an exact per-host evidence schema and the immediate clean-worktree predicate.
</plan_check>
<plan_check cycle="2">
checker: self
checker_runtime: codex-cli
status: issues_found
blocking: false
notes: Cycle 2 issues_found: 05-01 still owned provider argv mapping, Codex sandbox mapping, explicit-cwd Git admission, and capability decisions; shared-file ownership and task gates were inconsistent; and the launcher-to-release-smoke key link incorrectly claimed exported parser/control helpers instead of copied-launcher CLI execution with internal release-smoke/test-harness helpers.
</plan_check>
<plan_check cycle="3">
checker: self
checker_runtime: codex-cli
status: passed
summary: 'PASS: the patched readiness handshake satisfies READY-01, cycle-2 ownership and copied-launcher constraints are preserved, and the authoritative schema requires the plan’s ui_proof_slots/no_ui_proof_rationale fields.'
issues: []
blocking: false
</plan_check>
</checks>

## Tasks

<task id="05-01" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - MODIFY: test/contract.test.mjs
    - MODIFY: test/ux.test.mjs
    - MODIFY: test/install-parity.test.mjs
    - MODIFY: test/release-smoke.test.mjs
    - MODIFY: scripts/release-smoke.mjs
  </files>
  <action>
    Run `npm ci` first and do not run any 05-01 test command before it succeeds. Inventory the current launcher parser and the current internal release-smoke/test-harness control surfaces before editing: public command dispatch/help, `run`/`stop` and legacy authority flags, `parseReleaseSmokeArgs`, controlled command names, gap-code predicates, and existing pre-provider-spawn validation. Migrate only those existing parser/control contracts in `scripts/release-smoke.mjs` and `test/release-smoke.test.mjs` together with the launcher parser. Parser/control helpers remain internal to release-smoke and the test harness; do not export them from the launcher or perform an export refactor. Do not discover or implement provider invocation/readiness in this task; 05-02 gate 1 owns that source-observed contract.

    Replace the public parser with exactly `start`, `status`, `wait`, `resume`, `cancel`, and `list`. Make removed `run`/`stop` commands and legacy authority flags return one actionable structured error with exit 2 and no state/provider side effect. Require every accepted start to provide an absolute existing directory, `--sandbox read-only|workspace-write|full-access`, and `--effort low|medium|high|xhigh|max`; reject omission, relative/unreachable/non-directory cwd, contradictory values, and unknown values before provider task launch. Persist the explicit cwd, sandbox, and effort as control data for start and resume validation, but do not map them to provider argv, choose Codex sandbox forms, apply explicit-cwd Git admission, or make provider capability decisions here.

    On resume, inherit stored cwd, sandbox, effort, and provider session when omitted; accept only visible explicit overrides, preserve worker identity, reject unsupported/contradictory combinations, and keep legacy manifests readable without eager migration. Update only parser-dependent assertions in `test/contract.test.mjs`, `test/ux.test.mjs`, `test/install-parity.test.mjs`, and `test/release-smoke.test.mjs`, keeping parser/control helpers internal as currently designed; leave provider-facing harness assertions, provider argv, Codex sandbox mapping, explicit-cwd Git admission, capability decisions, installed-copy parity, and live-evidence responsibilities to 05-02/05-03.
  </action>
  <verify>
    - Run `npm ci` first; only after it succeeds run `node --test test/contract.test.mjs test/ux.test.mjs test/install-parity.test.mjs test/release-smoke.test.mjs`.
    - Run `node skills/luna-sidecar/scripts/luna-sidecar.mjs --help` and confirm plain text names only the six public commands.
    - Run `node skills/luna-sidecar/scripts/luna-sidecar.mjs run --help`, `node skills/luna-sidecar/scripts/luna-sidecar.mjs stop --help`, and each removed legacy-flag path; confirm one structured actionable error, exit 2, and no state/provider side effect.
    - Run the parser/control matrix for all accepted sandbox and effort spellings, absolute existing cwd validation, spaces/Unicode/metacharacters, resume inheritance, explicit resume override, legacy manifests, and removed commands/flags; assert exact persisted/returned controls and no provider spawn for invalid input.
    - Assert `scripts/release-smoke.mjs` and `test/release-smoke.test.mjs` keep parser/control helpers internal, while installed-copy assertions execute the copied launcher as a CLI process; do not import launcher helpers or refactor exports.
    - Do not assert provider argv, Codex sandbox mapping, explicit-cwd Git admission, or capability decisions in this task; those remain 05-02 gate-1/source-observation outputs.
  </verify>
  <done>
    SIMPLE-01 and the parser/control portion of EXPLICIT-01 are green: the public surface is exactly six commands, every accepted start and resume carries validated explicit controls, legacy reads remain readable without eager migration, removed aliases cannot launch work, and all parser-dependent assertions pass before 05-02 begins. Provider argv realization, Codex sandbox mapping, explicit-cwd Git admission, capability decisions, and TRUST-01 remain 05-02 work.
  </done>
</task>

<task id="05-02" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - MODIFY: test/contract.test.mjs
    - MODIFY: test/authority.test.mjs
    - MODIFY: test/fixtures/fake-codex.mjs
    - MODIFY: test/helpers/cli-harness.mjs
    - MODIFY: test/lifecycle.test.mjs
    - MODIFY: test/harness.test.mjs
    - MODIFY: test/observation.test.mjs
    - MODIFY: test/resources.test.mjs
    - MODIFY: test/safety.test.mjs
  </files>
  <action>
    Gate 1 owns provider invocation and readiness schema discovery. After 05-01's parser/control tests pass, inspect the actual installed Codex CLI/source-backed invocation and run the exact supported command under the requested cwd and sandbox. Capture the provider-emitted startup/capability acknowledgment, its exact stable fields, host/provider version, and the invocation reference in the existing test harness. Reproduce that exact observed acknowledgment in the existing tracked `test/fixtures/fake-codex.mjs` and expose only the needed attempt/activity markers through `test/helpers/cli-harness.mjs`. Do not use a hidden task, model answer, daemon, recurring probe, a second readiness `spawn`, `thread.started`, `turn.completed`, or fixture-only readiness marker; the one existing detached runner is the only launch. If no stable source-observed acknowledgment exists, or the source schema drifts between observations, stop/replan before changing readiness or provider mapping; leave readiness, capability, and release claims false. There is no 05-01 readiness artifact to consume.

    Only after gate 1 records a stable source-observed acknowledgment and capability schema, implement and test provider control realization in the provider-facing portions of `test/contract.test.mjs` and `test/authority.test.mjs`. Map the validated cwd and effort exactly into the observed provider invocation, map `read-only`, `workspace-write`, and `full-access` only to the exact supported Codex sandbox forms, and apply only the provider-supported explicit-cwd Git-admission override. Capability decisions belong here: if the installed Codex CLI cannot express the exact combination, stop/replan rather than inventing an argument, exporting a helper, or changing global configuration. The override skips only Git admission and never changes sandbox, approval, MCP, or filesystem scope.

    Replace the current detached-runner fire-and-return path with the minimal parent-to-runner readiness handshake. `start` must first persist the existing task/turn record, launch exactly one detached `_worker` runner, then keep the parent command open while it polls/reloads that same persisted record against a 10-second monotonic deadline. The runner owns provider launch and must persist either source-observed provider-readiness success or a typed readiness failure into the existing task/receipt state; no daemon, new IPC channel, hidden task, recurring synthetic probe, fan-out, or parallel readiness record is allowed. A success response is emitted only after a fresh persisted-record validation proves the requested absolute cwd and sandbox, the owned runner/provider PIDs, `state: running`, `providerState: running`, and the stable source-observed acknowledgment/capability fields. `status` remains observational: it may read/project the record but does not perform readiness, repair, or cleanup writes.

    Classify provider rejection, readiness timeout, runner death before readiness, malformed/schema-drifted acknowledgment or task record, and cleanup uncertainty as distinct typed nonzero command errors in the existing error envelope/record, using stable codes `provider_rejected`, `readiness_timeout`, `runner_died`, `readiness_schema_mismatch`, and `cleanup_uncertain`. Every failure path performs bounded cleanup of the owned runner/provider/descendant PID set, independently verifies that no owned process remains, and emits the typed error only after that no-live-process condition is established; there is no usable-looking success and no fan-out. Use the existing task/receipt fields and persistence/locking conventions rather than introducing a new state store or readiness schema; if the source-observed acknowledgment cannot be represented and validated without such a new mechanism, stop/replan.

    Implement the monotonic 10-second deadline after explicit validation and before reporting a usable worker. The predicate must prove the acknowledgment under the exact cwd/sandbox/effort without performing the delegated task or multiplying workers. Missing/changed acknowledgment fields fail closed as `readiness_schema_mismatch`; provider rejection, timeout, runner death, malformed record/schema drift, and cleanup uncertainty each retain a distinct typed code.

    Keep automatic retries at zero by default and make that default explicit in code and fixtures. A provider-only retry branch may be enabled later only when gate 1 has an exact source-observed transient child-spawn error code and the fixture proves the decision occurs before any provider process, event, stdout, or stdin activity. The runner never retries. Unknown/generic errors, `ENOENT`, authentication, configuration, sandbox, authority, and task failures perform zero retries. Any permitted retry is at most one attempt and reuses byte-identical invocation, input, cwd, sandbox, effort, provider configuration, and task; record every attempt, code, pre-activity decision, and final outcome.

    Keep provider MCP configuration untouched. Pin observed event semantics: repeated nonfatal provider `item.error`/`item.completed` errors become one bounded warning; top-level `error` and `turn.failed` are fatal; `turn.completed` is completion only. Keep usage unavailable unless exact provider fields and cumulative/per-event meaning are observed and fixture-pinned; malformed recognized fields are also unavailable. Never count reasoning detail, estimate prices, or infer task success.

    Update observation without adding state machinery: active means the existing nonterminal states `starting`, `running`, and `cancelling`; terminal means the existing terminal states. Default `list` returns every active worker followed by the 20 newest terminal records, newest-first within each bucket with deterministic tie behavior. `list --all` returns every retained record newest-first. Preserve read-only status/list/wait, active logs/receipts, cancellation/unknown truth, recursion rejection, native Codex-subagent behavior, and same-cwd warnings.
  </action>
  <verify>
    - Do not run a 05-02 test command until 05-01's `npm ci` and focused parser/control suite have succeeded.
    - Complete gate 1 first and record the exact source-observed acknowledgment/capability fields and invocation reference; if that observation is missing, malformed, or unstable, leave readiness/capability/release false and stop before mapping or readiness implementation.
    - Run `node --test test/contract.test.mjs test/authority.test.mjs test/lifecycle.test.mjs test/harness.test.mjs` with exact provider argv/cwd/effort and every supported sandbox mapping, then prove at command level that `start` remains open behind a fake-provider readiness barrier, releases only after the persisted existing worker/turn record reload shows readiness/running under the requested cwd/sandbox, and never creates a second runner/provider attempt.
    - In the same command-level suite, cover `provider_rejected`, `readiness_timeout` at the monotonic 10-second deadline, `runner_died` before readiness, `readiness_schema_mismatch` for malformed/schema-drifted provider acknowledgment or persisted task record, and `cleanup_uncertain`. For each, assert the exact distinct typed nonzero error, bounded cleanup of every owned runner/provider/descendant PID, no owned live process before the error response, no fan-out, and no success response before readiness.
    - Extend `test/helpers/cli-harness.mjs` only with repo-native command/record/process observation helpers needed to hold the manager child open, read the persisted worker record, release readiness, and independently verify owned-PID absence; extend `test/fixtures/fake-codex.mjs` with source-observed readiness and typed provider-failure/cleanup scenarios, while `test/harness.test.mjs` controls runner-death and PID-accounting cases. Keep `test/harness.test.mjs` focused on helper/fixture process accounting and `test/lifecycle.test.mjs` focused on the public command contract.
    - Assert `status` remains observational by proving it only reads/projects the existing record and does not create readiness work, repair state, or perform cleanup writes.
    - Run `node --test test/resources.test.mjs test/observation.test.mjs test/safety.test.mjs` with repeated nonfatal MCP errors, fatal MCP evidence, cumulative/per-event/missing/malformed usage, exact default/all listing, large-log observation, recursion, native-subagent, and same-cwd warning fixtures.
    - Assert zero retries for every failure other than the exact source-observed provider child-spawn code whose pre-activity fixture proves eligibility; assert no runner retry and no changed argv, stdin, cwd, sandbox, effort, provider configuration, or task text.
    - Run `npm test` and require the Phase 1-4 lifecycle, cancellation, observation, resource, and safety assertions to remain green.
    - Gate check: missing/timeout/drifted provider acknowledgment, fatal/readiness schema mismatch, uncertain cleanup, or any non-allowlisted retry leaves readiness/release false and produces no fan-out.
  </verify>
  <done>
    EXPLICIT-01, TRUST-01, READY-01, RETRY-01, MCP-01, and USAGE-01 are green: after the source-observation gate, provider argv/cwd/effort and supported Codex sandbox mapping are exact, explicit cwd bypasses only Git admission, capability decisions fail closed, and `start` blocks until the runner persists a same-authority readiness/running proof in the existing task/receipt record. Provider rejection, the 10-second readiness timeout, runner death, malformed/schema-drifted state, and cleanup uncertainty each return a distinct nonzero typed command error only after all owned runner/provider/descendant processes are gone; no fan-out or premature success is possible. Default retry count is zero, only the locked future provider-only byte-identical exception can enable one retry, provider-owned MCP warnings and fatality are truthful, usage is passthrough-or-unavailable, `status` remains observational, and list/history are deterministic, bounded, and read-only without changing v1 safety invariants.
  </done>
</task>

<task id="05-03" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/SKILL.md
    - MODIFY: skills/luna-sidecar/references/USAGE.md
    - MODIFY: README.md
    - MODIFY: test/ux.test.mjs
    - MODIFY: test/install-parity.test.mjs
    - MODIFY: test/release-smoke.test.mjs
    - MODIFY: scripts/release-smoke.mjs
    - CREATE: docs/verification/phase5-final-shape-evidence.json
    - CREATE: docs/verification/phase5-final-shape-evidence.md
  </files>
  <action>
    Rewrite host guidance to the six-command surface with one exact start skeleton requiring absolute cwd, explicit sandbox, explicit effort, and one bounded task. Put lifecycle harvesting/result evaluation in `references/USAGE.md`; remove `run`, `stop`, legacy flags, hidden defaults, and runtime-mode claims. Preserve host ownership of intent, policy, IDs, visible lifecycle, one-worker-first containment, bounded independent workers, native-subagent bounds, effort guidance, authority mapping, Git-admission-only behavior, provider-owned MCP warnings, unavailable usage, `taskOutcome: not_evaluated`, failure/unknown/cancel truth, sensitive logs, and no-secret delegation. Examples remain prompt patterns and never recurse into the sidecar.

    Before parity checks, run `npm ci`. Keep the current pinned local copy install and require exactly the Codex and Claude Code project skill trees, byte-identical manifests, regular files, no symlinks or out-of-scope realpaths, and both copied launchers against the fake provider. Preserve the exact current installer command `npx skills add PatrickSys/luna-sidecar -a codex -a claude-code -y` and isolated deterministic command `node node_modules/skills/bin/cli.mjs add <repo-root> --skill luna-sidecar --copy -a codex -a claude-code -y`. This is copied-artifact parity, not live host certification.

    Bind delivery before any live provider/host spawn. Require `git branch --show-current` to be `main`, `git remote get-url origin` to identify `PatrickSys/luna-sidecar`, `git fetch origin main`, the expected `origin/main` SHA, and a dirty-path audit that rejects every path outside the explicit implementation paths. Stage only those implementation paths, inspect `git diff --cached --name-only`, commit them, record `testedCommit=git rev-parse HEAD`, run `npm ci`, `cmd.exe /d /s /c npm test`, and run `git diff --check`. Immediately before each live observation and immediately before each evidence write, run the exact predicate `git status --porcelain`; require exit code 0 and empty output bytes, otherwise stop. Require clean `HEAD==testedCommit` immediately before any spawn.

    Query the exact CI run with `gh run list --repo PatrickSys/luna-sidecar --workflow ci.yml --commit <testedCommit> --limit 10 --json databaseId,headSha,status,conclusion`, select the run whose `headSha` equals `testedCommit`, then run `gh run view <ciRunId> --repo PatrickSys/luna-sidecar --json databaseId,headSha,status,conclusion,jobs`. Require completed/success status and the four current jobs: Windows Node 22.20.0, Windows Node 24.x, Ubuntu Node 22.20.0, and Ubuntu Node 24.x. Only then run the current script command `node scripts/release-smoke.mjs --live --tested-commit <testedCommit> --ci-run-id <ciRunId>`.

    The release-smoke live procedure must record the exact machine-readable per-host schema in the Evidence Contract for both `codex_cli` and `claude_code`. Codex uses the source-backed command/runtime surface observed during the run. Claude Code is an availability-gated host observation: use an exact source-backed invocation only when the installed host exposes one, and do not invent Claude CLI syntax. Missing, unavailable, timeout, schema drift, failed predicates, or uncertain cleanup records a non-null failureCode and `claimEligible: false`; `releaseReady` remains false.

    After evidence is written, use the exact evidence-only staging allowlist `docs/verification/phase5-final-shape-evidence.json` and `docs/verification/phase5-final-shape-evidence.md`; inspect `git diff --cached --name-only` and stop if any other name is staged. Commit the evidence as `evidenceCommit`, refetch `origin/main`, reject unexpected remote drift, require the tested commit to be an ancestor, and use an ordinary push only. Hand the exact evidenceCommit to a fresh verifier. The verifier later writes `05-VERIFICATION.md`; a later `verificationCommit` and roadmap closure are separate workflow outputs and are not created or claimed by this plan.
  </action>
  <verify>
    - Do not begin 05-03 until 05-02's focused tests and `npm test` have succeeded; then run `npm ci` before the parity checks.
    - Run `node --test test/ux.test.mjs test/install-parity.test.mjs test/release-smoke.test.mjs`, `npm test`, `node --check skills/luna-sidecar/scripts/luna-sidecar.mjs`, `node --check scripts/release-smoke.mjs`, and `git diff --check`.
    - Run the pinned copied-install check for Codex and Claude Code and execute both recorded copied launchers against the fake provider; compare canonical/Codex/Claude manifests and assert no global skill/config mutation.
    - Run the exact `gh run list ...` and `gh run view ...` commands above; require the tested SHA and all four named jobs before any live spawn.
    - Immediately before each live observation and evidence write, run `git status --porcelain`; require exit code 0 and empty output bytes. Run `node scripts/release-smoke.mjs --live --tested-commit <testedCommit> --ci-run-id <ciRunId>` only after clean `HEAD==testedCommit` and green CI.
    - Execute one bounded successful real Codex CLI host observation and one bounded successful real Claude Code host observation only through source-backed, availability-gated procedures. Independently query every owned PID; require the exact per-host schema, `ownedPidResult: all_gone`, `claimEligible: true` for both hosts, and all `otherGates` true before `releaseReady` can be true. If either host is missing/unavailable/timeout/schema-drift/uncertain cleanup, record `FINAL-RELEASE-01: false` and stop release closure; do not substitute a fake host or invented syntax.
    - Stage only the two exact evidence files, inspect staged names, commit `evidenceCommit`, refetch and perform the remote ancestor/drift check, then hand off to a fresh verifier. Do not create `05-VERIFICATION.md`, `verificationCommit`, summary, or roadmap closure in this run.
  </verify>
  <done>
    FINAL-UX-01 is green when the canonical and copied skills teach the explicit visible workflow and parity checks pass. FINAL-RELEASE-01 and task 05-03 are green only when deterministic/CI gates, the exact per-host evidence schema, cleanup, and successful real Codex CLI and Claude Code observations all pass; any host absence or uncertainty leaves implementation possible but release closure false. The evidence handoff is exact and no broader claim is made.
  </done>
</task>

## Verification

- Execute `05-01 -> 05-02 -> 05-03` sequentially; each task must pass its focused commands and end green before the next begins.
- Re-run `npm test`, `node --check skills/luna-sidecar/scripts/luna-sidecar.mjs`, `node --check scripts/release-smoke.mjs`, and `git diff --check`.
- Verify copied-install manifest/hash parity and installed-launcher fake-provider checks for both Codex and Claude Code without global skill/config mutation.
- Verify exact Windows/Ubuntu x Node `22.20.0`/`24.x` CI binding to the unchanged implementation commit before any live spawn.
- Review `phase5-final-shape-evidence.json` against the exact host schema and evidence allowlist. Require explicit predicates for six-command surface, controls, Git admission, readiness, zero-default retry, MCP, usage, list/history, Codex CLI observation, Claude Code observation, and owned-process cleanup; missing evidence keeps `FINAL-RELEASE-01: false` and `releaseReady: false`.
- Independently inspect all recorded/known owned runner/provider PIDs after both host-facing runs. Completion race, `unknown`, timeout, cleanup uncertainty, host unavailability, schema drift, or evidence-redaction failure is unresolved and blocks release closure.
- After execution, a fresh verifier may create `05-VERIFICATION.md`; only later may the roadmap checkbox be updated under its remote-drift gate. None of those files is created by this planning run.

## Success Criteria

1. Only `start`, `status`, `wait`, `resume`, `cancel`, and `list` are public; every start requires explicit cwd, sandbox, and effort; resume inheritance and overrides are visible and truthful.
2. Explicit cwd skips only provider Git admission, and bounded same-authority readiness prevents unusable workers from being reported ready or multiplied through fanout.
3. Automatic retries are zero by default; at most one provider-only byte-identical retry is permitted only for the exact source-observed transient pre-activity child-spawn exception; runner and unknown/generic errors never retry, and sandbox, trust, authentication, MCP, task, and authority failures never retry.
4. Provider MCP remains provider-owned; compact receipts summarize nonfatal warnings and pass through provider usage without inventing cost or task success; list/history stay bounded and deterministic.
5. Source and copied-install checks pass on Windows and Linux, followed by successful real Codex CLI and Claude Code observations with no lingering owned process and no broader claim than the exact evidence schema supports.

## High-Leverage Review

The required second pass must inspect the launcher parser and provider argv, gate-1 source-observed acknowledgment and fixture parity, readiness cleanup, zero-default retry identity and pre-activity proof, MCP/usage aggregation, exact list buckets/order, skill wording, copied-install hashes, host-facing command records, redaction allowlists, CI binding, scratch containment, the immediate `git status --porcelain` predicates, staged-name allowlist, remote drift checks, exact host schema, releaseReady formula, and every claim sentence. Challenge any convenience alias, hidden default, host-specific assumption, invented Claude syntax, inferred task-success claim, or release claim that lacks both host observations.

## Leverage Review

- Lost: The plan removes familiar v1 shortcuts and requires fresh installed and two-host observations before final release claims.
- Kept: The existing zero-dependency launcher, Agent Skills flow, fake-provider harness, provider-owned MCP boundary, lifecycle safety model, and Phase 4 install/CI machinery.
- Gained: A smaller and more legible subagent contract, fail-fast readiness, honest zero-default retry/history/usage behavior, and evidence that tests the artifact and hosts actually used.

## Notes

- Research is intentionally skipped: Phase 5 extends technologies and test/install patterns already established by Phases 1-4. Provider-contract unknowns are escalation triggers, not invitations to invent a mechanism.
- The v1 and Phase 4 records remain historical evidence. This plan does not relabel them as fresh Phase 5 proof.
- `.planning -> .work` migration is explicitly queued by `ROADMAP.md` and remains deferred; no migration files or config belong in this plan.
- This run stops after rewriting the two owned planning artifacts in place. Do not create runtime code, tests, summaries, verification, release evidence, roadmap closure, `EXECUTION.md`, `APPROACH.md`, another plan, or configuration now.

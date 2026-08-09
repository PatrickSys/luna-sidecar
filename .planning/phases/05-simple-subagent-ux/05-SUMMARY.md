---
phase: 05-simple-subagent-ux
plan: 05
runtime: codex-cli
assurance: self_checked
---

# Phase 5 Simple Subagent UX Summary

**Completed locally:** 2026-08-09

**Status:** Implementation is complete through the locally executable 05-03 work, but release closure remains blocked. Verified implementation/source commit `1d6bfd9d245c2f1a3d65dae029aaa1906f37eae3` has green CI run `31341520422` and a local `98/98` suite, while the required host proof for that source commit is not complete.

## Scope and commits

- 05-02 implementation and recovered contract-ripple tests: `3fe970a497d54c50c745e6dbd1705d05b480be52` (`feat: enforce provider readiness boundary`).
- 05-03 guidance, README, release-smoke host schema, and UX assertions: `dfcb77af9daefa4558a0fa475c3565d7947580a6` (`feat: document explicit subagent workflow`).
- Planned evidence artifacts under the exact two-file allowlist: `6cec903bcded6f53f2a595a9f0b10b8406ae6a90` (`docs: record final shape evidence`).
- Release predicate allowlist correction: `c63913edf0e751dad1a85ebc6e1a68d06ae9c0c3` (`fix: preserve release evidence predicates`).

The 05-03 implementation net changed six files; the existing install-parity test already exercised both copied trees and explicit start controls, so it required no additional byte change.

## Verification

All commands below completed successfully unless noted:

- `node --test --test-concurrency=1 test/authority.test.mjs test/concurrency.test.mjs test/contract.test.mjs test/harness.test.mjs test/observation.test.mjs test/release-smoke.test.mjs test/safety.test.mjs test/lifecycle.test.mjs test/resources.test.mjs`: 82 passed, 0 failed.
- Native package suite before 05-02 commit: 87 passed, 0 failed.
- `npm ci`: exit 0; 8 packages installed, 0 vulnerabilities reported.
- `node --test test/ux.test.mjs test/install-parity.test.mjs test/release-smoke.test.mjs`: 21 passed, 0 failed.
- `node --test test/release-smoke.test.mjs`: 16 passed, 0 failed after the final evidence-predicate correction.
- Native package suite after 05-03 implementation: 87 passed, 0 failed.
- `node --check skills/luna-sidecar/scripts/luna-sidecar.mjs`: exit 0.
- `node --check scripts/release-smoke.mjs`: exit 0.
- `git diff --check`: exit 0 at each commit boundary.
- Copied Codex and Claude Code project installs: byte-identical manifests and fake-provider launcher checks passed in `test/install-parity.test.mjs`.
- Delivery predicates: branch `main`; origin `https://github.com/PatrickSys/luna-sidecar.git`; `git fetch origin main` succeeded; `origin/main` was `55034647954e6552233eab4f52125462083a26fc`; worktree was clean before evidence work.

## Historical evidence and limits (superseded)

The following paragraph describes an earlier pre-host-evidence snapshot only. It is retained as historical context and is superseded by the durable checkpoint below; it does not describe the current generated evidence files. At that time, `docs/verification/phase5-final-shape-evidence.json` and `.md` recorded both hosts as unavailable with `failureCode: ci_unavailable`, `claimEligible: false`, and `releaseReady: false`; no host process was started because the exact CI lookup returned no run. No push was performed, so no remote CI success was claimed for that snapshot.

## Recovered deltas

- The source-observed `thread.started` event is the readiness boundary. It proves invocation acceptance and a real provider session only; it does not prove task success, MCP health, or eventual completion.
- The omitted 05-02 test ripple was recovered across `test/authority.test.mjs`, `test/concurrency.test.mjs`, `test/contract.test.mjs`, `test/harness.test.mjs`, `test/observation.test.mjs`, `test/release-smoke.test.mjs`, and `test/safety.test.mjs`, plus the readiness fixture/explicit-start consumers in `test/fixtures/fake-codex.mjs`, `test/lifecycle.test.mjs`, and `test/resources.test.mjs`.
- The final observation migration asserts persisted pre-readiness `unknown`/`runner_died` cleanup with sealed stdout/stderr metadata marked missing, rather than asserting the old non-persistence behavior.
- No 05-03 runtime redesign, host-specific Claude syntax, push, remote-CI claim, or later-phase work was added.
- Verification-gap repair: Codex argv now maps public `full-access` to installed `danger-full-access`, explicit start/resume invocations carry `--skip-git-repo-check`, and receipts/state retain the public `full-access` value.
- TDD evidence for this repair was RED on the prior argv, then GREEN after the minimal boundary mapping: authority, contract, and harness tests cover all public sandbox values, start/resume skip-flag presence, receipt preservation, and rejection of legacy aliases.

<checks>
  <executor_check>Manual self-check passed: the planned local tests, syntax checks, evidence JSON validation, staged-name inspections, and diff checks passed; final worktree cleanliness is checked after this handoff commit.</executor_check>
</checks>

<handoff>
  <plan_runtime>codex-cli</plan_runtime>
  <plan_assurance>self_checked</plan_assurance>
  <plan_check_status>passed (cycle 3)</plan_check_status>
  <implementation_commit>c63913edf0e751dad1a85ebc6e1a68d06ae9c0c3</implementation_commit>
  <evidence_commit>6cec903bcded6f53f2a595a9f0b10b8406ae6a90</evidence_commit>
  <release_ready>false</release_ready>
  <next_action>Authenticate Claude Code on this machine with /login, then run one exact-commit green-CI live smoke; do not rerun before authentication. Do not close the roadmap phase from this summary.</next_action>
</handoff>

<deltas>
  <recoverable>Missing `.planning/bin/gsdd.mjs`, `.planning/config.json`, prior phase-5 SUMMARY, and session-fingerprint/control-map helpers required by the local skill workflow; bounded native/manual checks were used and this deviation is recorded.</recoverable>
  <factual>Readiness is persisted after provider `thread.started`; the stale test ripple was omitted by the prior executor and recovered here.</factual>
  <external>Matching CI and real host evidence are unavailable for the unpushed tested commit; this leaves release readiness false.</external>
</deltas>

<judgment>
  <active_constraints>Keep the six-command surface explicit, preserve host-owned task evaluation and provider-owned MCP, keep no hidden authority/effort defaults, and never claim a host or CI result not observed.</active_constraints>
  <unresolved_uncertainty>Claude Code has an exact bounded authentication failure; Codex exited 0 but the prior evidence records only host_schema_mismatch; the live evidence is bound to 7dfbc0b rather than the verified implementation/source commit, although cleanup was verified.</unresolved_uncertainty>
  <decision_posture>Implementation, green exact-commit CI, and deterministic local proof may advance; release closure and roadmap completion remain blocked pending Claude authentication and one fresh exact-commit host smoke. Latest parser diagnostics must make any Codex mismatch actionable.</decision_posture>
  <anti_regression>thread.started is an invocation/readiness boundary only. It is not task success, MCP health, or completion proof; persisted unknown cleanup must retain sealed missing-log metadata.</anti_regression>
</judgment>

## Durable blocked checkpoint — 2026-08-09T23:21:53Z

- Verified implementation/source commit: `1d6bfd9d245c2f1a3d65dae029aaa1906f37eae3`; the latest code adds exact host schema failure reasons.
- Delivery truth for that source commit: CI `31341520422` passed all Windows/Ubuntu × Node 22.20/24 jobs; the local full suite was `98/98` before push.
- The generated live evidence is committed and preserved at the two exact Phase 5 evidence paths. It is bound to tested commit `7dfbc0bcbae7b2d7d0939abecf0efbdb0248ae38` and CI `31340386540`; deterministic, installed-parity, CI, delivery, evidence, cancellation, and cleanup gates passed.
- Claude Code `2.1.220` failed the bounded host procedure with the exact authentication message `Not logged in · Please run /login`; this is an environmental release blocker, not a pass condition.
- Codex exited 0, but pre-diagnostic-parser evidence records only `host_schema_mismatch`; the exact predicate is unknown. The latest parser will name it on the next permitted run.
- No PIDs lingered or were uncertain, but `releaseReady` remains false. The generated evidence values were not altered by this checkpoint.
- Next action: authenticate Claude Code on this machine with `/login`, then run one exact-commit green-CI live smoke. Do not rerun before authentication. Keep the roadmap phase in progress; canonical `.work` migration remains queued/later and is not active.

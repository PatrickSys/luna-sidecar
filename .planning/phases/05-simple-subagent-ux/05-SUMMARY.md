---
phase: 05-simple-subagent-ux
plan: 05
runtime: codex-cli
assurance: self_checked
---

# Phase 5 Simple Subagent UX Summary

**Completed locally:** 2026-08-09

**Status:** Implementation complete through the locally executable 05-03 work. Release closure remains open; `FINAL-RELEASE-01` is false because the tested commit has no matching CI run and no live host observations were permitted by the preflight gate.

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

## Evidence and limits

`docs/verification/phase5-final-shape-evidence.json` and `.md` record the exact host schema. Both `codex_cli` and `claude_code` are `available: false`, `sidecarReceipt.schemaResult: not_run`, `failureCode: ci_unavailable`, `claimEligible: false`, and `releaseReady: false`. The installed CLIs were detected (`codex-cli 0.147.0`, Claude Code `2.1.220`), but no host process was started because the exact `gh run list --repo PatrickSys/luna-sidecar --workflow ci.yml --commit dfcb77af9daefa4558a0fa475c3565d7947580a6 --limit 10 --json databaseId,headSha,status,conclusion` returned `[]`; the attempted run lookup consequently returned GitHub 404. No push was performed, so no remote CI success is claimed.

## Recovered deltas

- The source-observed `thread.started` event is the readiness boundary. It proves invocation acceptance and a real provider session only; it does not prove task success, MCP health, or eventual completion.
- The omitted 05-02 test ripple was recovered across `test/authority.test.mjs`, `test/concurrency.test.mjs`, `test/contract.test.mjs`, `test/harness.test.mjs`, `test/observation.test.mjs`, `test/release-smoke.test.mjs`, and `test/safety.test.mjs`, plus the readiness fixture/explicit-start consumers in `test/fixtures/fake-codex.mjs`, `test/lifecycle.test.mjs`, and `test/resources.test.mjs`.
- The final observation migration asserts persisted pre-readiness `unknown`/`runner_died` cleanup with sealed stdout/stderr metadata marked missing, rather than asserting the old non-persistence behavior.
- No 05-03 runtime redesign, host-specific Claude syntax, push, remote-CI claim, or later-phase work was added.

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
  <next_action>Obtain a matching completed CI run for the exact tested commit, then a fresh verifier may re-run the gated live host procedures; do not close the roadmap phase from this summary.</next_action>
</handoff>

<deltas>
  <recoverable>Missing `.planning/bin/gsdd.mjs`, `.planning/config.json`, prior phase-5 SUMMARY, and session-fingerprint/control-map helpers required by the local skill workflow; bounded native/manual checks were used and this deviation is recorded.</recoverable>
  <factual>Readiness is persisted after provider `thread.started`; the stale test ripple was omitted by the prior executor and recovered here.</factual>
  <external>Matching CI and real host evidence are unavailable for the unpushed tested commit; this leaves release readiness false.</external>
</deltas>

<judgment>
  <active_constraints>Keep the six-command surface explicit, preserve host-owned task evaluation and provider-owned MCP, keep no hidden authority/effort defaults, and never claim a host or CI result not observed.</active_constraints>
  <unresolved_uncertainty>Real Codex CLI and Claude Code sidecar receipts, host versions in the procedure schema, and independent owned-PID cleanup remain unobserved for this commit.</unresolved_uncertainty>
  <decision_posture>Implementation and deterministic local proof may advance; release closure and roadmap completion remain blocked pending exact-commit CI and fresh host evidence.</decision_posture>
  <anti_regression>thread.started is an invocation/readiness boundary only. It is not task success, MCP health, or completion proof; persisted unknown cleanup must retain sealed missing-log metadata.</anti_regression>
</judgment>

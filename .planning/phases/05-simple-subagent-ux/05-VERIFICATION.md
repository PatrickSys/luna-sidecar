---
phase: 05-simple-subagent-ux
runtime: codex-cli
assurance: self_checked
verified: 2026-08-09T23:21:53Z
status: gaps_found
score: 5/6 must-haves verified
delivery_posture: delivery_sensitive
evidence_contract:
  required_kinds: [code, runtime, delivery]
  recommended_kinds: [test, human]
  observed_kinds: [code, test, delivery]
  missing_kinds: [runtime]
re_verification:
  previous_status: gaps_found
  previous_score: 3/6 must-haves verified
  gaps_closed:
    - "Provider contract repair is present in the verified implementation/source commit: public full-access maps to the installed Codex form and explicit cwd carries the Git-admission skip."
    - "Current HEAD has a completed green CI run across Windows and Ubuntu on Node 22.20 and 24.x."
    - "Latest live evidence records verified cleanup with no lingering or uncertain owned PIDs."
  gaps_remaining:
    - "Claude Code is available but the bounded observation exits 1 with the exact authentication message: Not logged in; run /login."
    - "Codex exited 0 but pre-diagnostic evidence records only host_schema_mismatch; the exact mismatch predicate is unknown until the next permitted run."
    - "Live evidence is bound to 7dfbc0bcbae7b2d7d0939abecf0efbdb0248ae38, not the verified implementation/source commit 1d6bfd9d245c2f1a3d65dae029aaa1906f37eae3."
  regressions: []
gaps:
  - truth: "Both required real-host observations are claim-eligible for the exact implementation commit under verification."
    status: failed
    required_evidence: [code, runtime, delivery]
    observed_evidence: [code, delivery]
    missing_evidence: [successful runtime on the verified implementation/source commit]
    severity: blocker
    reason: "Current implementation has green exact-commit CI, but the only recorded live evidence is for 7dfbc0b. Claude fails the bounded procedure before a valid receipt with the exact authentication message, while Codex exited 0 but its pre-diagnostic evidence records only host_schema_mismatch. Both hosts remain claim-ineligible and releaseReady remains false."
    artifacts:
      - path: "docs/verification/phase5-final-shape-evidence.json"
        issue: "Generated evidence remains bound to testedCommit 7dfbc0bcbae7b2d7d0939abecf0efbdb0248ae38 and records Claude authentication failure plus an unresolved Codex schema mismatch."
      - path: "scripts/release-smoke.mjs"
        issue: "Latest diagnostic parser is present in current implementation, but has not yet been used for a new live observation."
    missing:
      - "Authenticate Claude Code on this machine with /login."
      - "Run one exact-commit green-CI live smoke after authentication."
      - "Use latest parser diagnostics to make any Codex mismatch actionable; do not infer success from exit 0 alone."
  - truth: "The release evidence artifact is bound to the implementation being verified."
    status: failed
    required_evidence: [code, delivery]
    observed_evidence: [code, delivery]
    missing_evidence: [evidence regenerated for the verified implementation/source commit]
    severity: blocker
    reason: "The verified implementation/source commit is 1d6bfd9d245c2f1a3d65dae029aaa1906f37eae3 with CI run 31341520422, but existing generated evidence is keyed to 7dfbc0bcbae7b2d7d0939abecf0efbdb0248ae38 and CI run 31340386540."
    artifacts:
      - path: "docs/verification/phase5-final-shape-evidence.json"
        issue: "The committed generated artifact retains its recorded facts and cannot serve as release proof for the verified implementation/source commit."
      - path: "docs/verification/phase5-final-shape-evidence.md"
        issue: "The Markdown projection has the same prior-tested-commit binding and failed host predicates."
    missing:
      - "A fresh generated evidence pair for the exact current implementation commit after the single guarded live smoke."
<git_delivery_check>
  branch: "main"
  commits_ahead_of_main: 0
  pr_state: "none"
</git_delivery_check>
human_verification: []
---

# Phase 5 Verification Report

**Phase Goal:** Make Luna Sidecar feel like one ordinary, controllable subagent while preserving explicit authority, bounded readiness, honest receipts, provider-owned MCP, and claim-matched delivery proof.

**Verified:** 2026-08-09T23:21:53Z

**Status:** gaps_found — implementation is not release-closed.

**Re-verification:** Yes.

## Verification Basis

- Read the current ROADMAP, Phase 5 plan, summary, SPEC, prior verification report, relevant release-smoke source/tests, and the current generated evidence pair.
- Plan runtime/assurance: codex-cli / self_checked.
- Summary runtime/assurance: codex-cli / self_checked.
- Verification runtime/assurance: codex-cli / self_checked; this is same-runtime assurance, not cross-runtime assurance.
- Verified implementation/source commit: 1d6bfd9d245c2f1a3d65dae029aaa1906f37eae3 (fix: diagnose host schema mismatches).
- CI truth for that source commit: run 31341520422 passed all Windows/Ubuntu × Node 22.20/24 jobs.
- Current local execution truth supplied for this checkpoint: full native suite 98/98 passed before push.
- No hosts were run and no tests were rerun in this documentation-only checkpoint.
- External Workspine control-map and lifecycle preflight completed with allowed: true; the only warning is the two authorized dirty generated evidence paths.
- Delivery check: branch main, zero commits ahead of main, no matching PR (pr_state: none).
- Summary handoff, deltas, judgment, and anti-regression constraints were reviewed. Migration to canonical .work remains queued/later and is not active Phase 5 scope.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Public protocol is exactly six commands with actionable removed-command failures. | VERIFIED LOCALLY | Prior deterministic evidence and current implementation remain aligned; no current change reopens this seam. |
| 2 | Explicit cwd, sandbox, and effort remain truthful through provider argv, receipts, and resume. | VERIFIED LOCALLY | Provider-contract repair is included in current implementation lineage and current green CI; no live rerun was performed here. |
| 3 | Explicit-cwd admission and same-authority persisted readiness are fail-closed. | VERIFIED LOCALLY | Prior readiness/cleanup evidence and repaired provider argv satisfy the local contract; current live release proof is gated separately. |
| 4 | Retry, MCP, usage, list/history, and task-meaning semantics remain narrow and honest. | VERIFIED LOCALLY | Prior deterministic evidence and current CI cover these implementation predicates; no live task-success claim is made. |
| 5 | Canonical and copied skills teach and execute the same visible workflow. | VERIFIED LOCALLY | Installed parity and current four-job CI gates are green; generated evidence also records cleanup predicates as passed. |
| 6 | Final release proof exists for the exact implementation and both real hosts. | GAP | Claude is blocked by exact authentication failure; Codex has an unresolved pre-diagnostic schema mismatch; existing runtime evidence is for 7dfbc0b, not the verified implementation/source commit. |

## Artifact Verification

| Artifact | Exists | Substantive | Wired | Notes |
| --- | --- | --- | --- | --- |
| skills/luna-sidecar/scripts/luna-sidecar.mjs | yes | yes | yes | Six-command UX, explicit controls, readiness, receipts, lifecycle, MCP, usage, and bounded list paths remain connected. |
| scripts/release-smoke.mjs | yes | yes | yes | Release gates, copied-launcher execution, cleanup predicates, host procedures, and latest actionable-diagnostic path are wired. |
| test/release-smoke.test.mjs and native test surfaces | yes | yes | yes | Existing deterministic coverage is recorded green; no test rerun was performed for this checkpoint. |
| Canonical and copied Agent Skills | yes | yes | yes | Installed parity was recorded green in current delivery evidence. |
| docs/verification/phase5-final-shape-evidence.json/.md | yes | yes | partial | Generated facts are preserved, cleanup is verified, but host claims are ineligible and the pair is bound to 7dfbc0b rather than the verified implementation/source commit. |

## Key Link Verification

| From | To | Via | Status | Notes |
| --- | --- | --- | --- | --- |
| Launcher controls | Provider invocation | start/resume argv mapping | VERIFIED LOCALLY | Current code lineage contains the full-access and explicit-cwd admission repair. |
| Runner | Worker/turn record | persisted provider readiness boundary | VERIFIED LOCALLY | Prior evidence preserves the thread.started boundary and fail-closed cleanup constraints. |
| Canonical skill | Codex/Claude copies | pinned local install/parity | VERIFIED | Current delivery evidence records installed parity and cleanup gates as passed. |
| Host procedures | Final evidence | host output parsing and cleanup predicates | GAP | Claude authentication fails; Codex exact mismatch is unknown in the old diagnostic record; evidence is bound to an earlier source commit. |

## Requirements Coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| SIMPLE-01 | VERIFIED LOCALLY | Six-command surface and removed-command failures remain covered by prior deterministic evidence/current CI. |
| EXPLICIT-01 | VERIFIED LOCALLY | Explicit controls, resume inheritance, and repaired provider realization are covered by implementation lineage and green CI. |
| TRUST-01 | VERIFIED LOCALLY | Absolute cwd validation and provider Git-admission skip repair are present; no new live admission claim is made. |
| READY-01 | PARTIAL | Bounded source-observed readiness and cleanup are locally covered; current-HEAD successful real-host receipt evidence is absent. |
| RETRY-01 | VERIFIED LOCALLY | Zero-default retry and narrow provider-only exception remain covered by deterministic evidence/current CI. |
| MCP-01 | VERIFIED LOCALLY | Provider-owned MCP and bounded warning/fatal semantics remain covered locally. |
| USAGE-01 | VERIFIED LOCALLY | Provider passthrough-or-unavailable usage semantics remain covered locally. |
| FINAL-UX-01 | VERIFIED LOCALLY | Explicit host-owned lifecycle guidance and bounded history remain covered locally. |
| FINAL-RELEASE-01 | BLOCKED | Required current-commit successful Codex and Claude observations do not exist; releaseReady is correctly false. |

Orphan requirement check: all nine Phase 5 requirements remain claimed by the Phase 5 plan; no additional roadmap-scoped requirement was found without a coverage row.

## Evidence and Tests

- Current CI run 31341520422: all four Windows/Ubuntu × Node 22.20/24 jobs passed.
- Current local full suite: 98/98 passed before push, as recorded for current code truth.
- Existing live evidence tested commit 7dfbc0bcbae7b2d7d0939abecf0efbdb0248ae38 with CI 31340386540; all four matrix jobs and deterministic/installed-parity/CI/delivery/evidence/cancellation/cleanup gates passed.
- That evidence records Claude Code 2.1.220 exiting 1 with Not logged in · Please run /login.
- Codex exited 0, but pre-diagnostic evidence records only host_schema_mismatch; exact predicate is unknown.
- Existing evidence records no lingering or uncertain owned PIDs.
- No hosts were run and no tests were rerun in this checkpoint, per authorization.

## Anti-Patterns

No new source implementation was made in this checkpoint. The prior verification found no Phase 5 placeholder markers or orphaned implementation files. The current blocked state is an evidence/host-readiness gap, not a reason to weaken host predicates or infer success from partial output.

## Grouped Gaps Summary

1. **Claude runtime admission:** authenticate Claude Code on this machine with /login; its exact bounded auth failure is an environmental blocker for release evidence.
2. **Codex diagnostic closure:** run the next permitted smoke with the latest parser so the existing host_schema_mismatch becomes an actionable exact reason; do not treat exit 0 as receipt success.
3. **Exact-commit evidence binding:** after authentication, run one exact-commit green-CI live smoke and regenerate the two existing evidence paths for the verified implementation/source commit. Do not rerun before authentication.

## Claim Limit

This checkpoint supports the current implementation, green CI, recorded local suite, installed parity, deterministic gates, and the bounded failed-host observations for their recorded tested commit. It does not certify release readiness, a successful current-HEAD Codex receipt, a successful Claude host invocation, task success, universal host routing, or any broader migration work.

## Next Guarded Step

Keep Phase 5 in progress and blocked. Authenticate Claude Code on this machine with /login, then run one exact-commit green-CI live smoke. Do not rerun before authentication. The latest parser diagnostics will make any Codex mismatch actionable. Do not close the roadmap phase unless both current-commit host claims become eligible and releaseReady is true. Migration to canonical .work remains queued/later and is not active.

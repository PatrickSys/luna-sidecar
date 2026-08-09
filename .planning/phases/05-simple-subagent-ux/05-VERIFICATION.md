---
phase: 05-simple-subagent-ux
runtime: codex-cli
assurance: self_checked
verified: 2026-08-09T18:41:00Z
status: gaps_found
score: 3/6 must-haves verified
delivery_posture: delivery_sensitive
evidence_contract:
  required_kinds: [code, runtime, delivery]
  recommended_kinds: [test, human]
  observed_kinds: [code, test]
  missing_kinds: [runtime, delivery]
re_verification:
  previous_status: none
  previous_score: none
  gaps_closed: []
  gaps_remaining:
    - "Provider sandbox and explicit-cwd Git-admission realization do not match the installed Codex CLI contract."
    - "Exact-commit CI and successful real Codex CLI/Claude Code host evidence are absent."
    - "The recorded evidence artifact is keyed to dfcb77af9daefa4558a0fa475c3565d7947580a6, not the final implementation commit c63913edf0e751dad1a85ebc6e1a68d06ae9c0c3 or current HEAD."
  regressions: []
gaps:
  - truth: "Every accepted start carries the selected controls through the provider invocation, including full-access."
    status: failed
    required_evidence: [code, test, runtime]
    observed_evidence: [code, test]
    missing_evidence: [runtime]
    severity: blocker
    reason: "The launcher sends --sandbox full-access and sandbox_mode=\"full-access\", while installed Codex 0.147.0 advertises danger-full-access as the supported full sandbox value. Fake-provider argv tests accept the unsupported spelling and therefore do not prove the real provider contract."
    artifacts:
      - path: "skills/luna-sidecar/scripts/luna-sidecar.mjs"
        issue: "execArgs and resumeArgs use the public full-access spelling directly."
      - path: "test/authority.test.mjs"
        issue: "Assertions verify fake-provider argv, not the installed Codex parser."
    missing:
      - "Source-backed provider mapping for full-access and an exact installed-provider observation."
  - truth: "Explicit cwd skips only Codex Git admission without changing authority."
    status: failed
    required_evidence: [code, test, runtime]
    observed_evidence: [code, test]
    missing_evidence: [runtime]
    severity: blocker
    reason: "The installed Codex help exposes --skip-git-repo-check, but the launcher invocation contains -C <cwd> and no skip-git-repo-check flag. The current fake-provider tests do not exercise provider Git admission."
    artifacts:
      - path: "skills/luna-sidecar/scripts/luna-sidecar.mjs"
        issue: "execArgs and resumeArgs omit the provider Git-admission flag."
      - path: "test/authority.test.mjs"
        issue: "The expected argv contains -C but no Git-admission override."
    missing:
      - "A source-backed, provider-level admission check proving only Git admission is skipped."
  - truth: "The installed artifact and both real host observations support final release closure."
    status: failed
    required_evidence: [code, runtime, delivery]
    observed_evidence: [code, test]
    missing_evidence: [runtime, delivery]
    severity: blocker
    reason: "The exact CI queries for the evidence commit and current HEAD returned no runs; both recorded hosts are unavailable/not_run with claimEligible false and releaseReady false. No real Codex or Claude Code host process was started."
    artifacts:
      - path: "docs/verification/phase5-final-shape-evidence.json"
        issue: "ci is null, both host receipts are not_run, and releaseReady is false."
      - path: ".planning/phases/05-simple-subagent-ux/05-SUMMARY.md"
        issue: "Handoff records the missing exact-commit CI and host evidence."
    missing:
      - "A completed successful CI run bound to the exact tested implementation commit."
      - "Successful real Codex CLI and Claude Code observations with valid receipts and independently verified owned-PID cleanup."
  - truth: "Delivery evidence is bound to the exact implementation under verification."
    status: failed
    required_evidence: [code, delivery]
    observed_evidence: [code]
    missing_evidence: [delivery]
    severity: blocker
    reason: "phase5-final-shape-evidence.json records testedCommit dfcb77a, while the handoff names c63913e as implementation_commit and current HEAD is 04a4009. The later predicate-allowlist correction and handoff commit are therefore outside the evidence artifact's tested commit."
    artifacts:
      - path: "docs/verification/phase5-final-shape-evidence.json"
        issue: "testedCommit is dfcb77af9daefa4558a0fa475c3565d7947580a6."
      - path: ".planning/phases/05-simple-subagent-ux/05-SUMMARY.md"
        issue: "implementation_commit is c63913edf0e751dad1a85ebc6e1a68d06ae9c0c3."
    missing:
      - "Regenerated evidence for the final tested commit after provider-contract correction and successful delivery gates."
<git_delivery_check>
  branch: "main"
  commits_ahead_of_main: 0
  pr_state: "none"
</git_delivery_check>
human_verification: []
---

# Phase 5 Verification Report

**Phase Goal:** Make Luna Sidecar feel like one ordinary, controllable subagent while preserving explicit authority, bounded readiness, honest receipts, provider-owned MCP, and claim-matched delivery proof.

**Verified:** 2026-08-09T18:41:00Z

**Status:** gaps_found

**Re-verification:** No prior Phase 5 verification report existed.

## Verification Basis

- Read `.planning/ROADMAP.md`, `05-PLAN.md`, `05-SUMMARY.md`, `.planning/SPEC.md`, the relevant implementation/tests/evidence, and the handoff/deltas/judgment blocks.
- Plan runtime/assurance: `codex-cli` / `self_checked`.
- Summary runtime/assurance: `codex-cli` / `self_checked`.
- Verification runtime/assurance: `codex-cli` / `self_checked`; this is same-runtime self-checking, not cross-runtime assurance.
- Handoff status: downgraded for delivery; `release_ready=false`.
- Deltas reviewed: readiness is a persisted `thread.started` boundary; the stale 05-02 test ripple was recovered; pre-readiness unknown cleanup now retains sealed missing-log metadata; exact CI/host evidence remains unavailable.
- Required external Workspine control-map and lifecycle preflight both completed with `allowed: true`, no blockers, no warnings, and no intervention.
- Final checkout remained `main`, clean, at `04a400961c4381d9217b00d3991b503a9a95fb6c`; `origin/main` remained `55034647954e6552233eab4f52125462083a26fc`; local branch was six commits ahead of `origin/main`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Public protocol is exactly six commands with actionable removed-command failures. | VERIFIED | Direct help and removed `run`/`stop` probes; contract, UX, and release-smoke tests pass. |
| 2 | Explicit cwd, sandbox, and effort remain truthful through provider argv, receipts, and resume. | GAP | Read-only/workspace-write and resume tests pass, but the installed Codex full sandbox is `danger-full-access`, not `full-access`; no real provider invocation was run. |
| 3 | Explicit-cwd admission and same-authority persisted readiness are fail-closed. | GAP | Fake-provider readiness and cleanup tests pass, but `--skip-git-repo-check` is absent from the real provider argv. |
| 4 | Retry, MCP, usage, list/history, and task-meaning semantics remain narrow and honest. | VERIFIED LOCALLY | No provider retry path exists; usage remains `unavailable`; MCP handling is warning/fatal separation; list bounds and taskOutcome behavior pass tests. |
| 5 | Canonical and copied skills teach and execute the same visible workflow. | VERIFIED LOCALLY | UX, install-parity, and full native suite pass; Codex and Claude project copies are byte-identical and fake-provider executable. |
| 6 | Final release proof exists for the exact implementation and both real hosts. | GAP | Evidence has `ci: null`, both hosts `not_run`/ineligible, `releaseReady: false`, and an older `testedCommit` than the final implementation/current HEAD. |

## Artifact Verification

| Artifact | Exists | Substantive | Wired | Notes |
| --- | --- | --- | --- | --- |
| `skills/luna-sidecar/scripts/luna-sidecar.mjs` | yes | yes | partial | Six-command parser, explicit controls, persisted readiness, receipts, lifecycle, MCP warning, usage, and list paths are connected; real Codex mapping/admission gaps remain. |
| `scripts/release-smoke.mjs` | yes | yes | yes | Release gates, copied-launcher execution, cleanup predicates, and evidence composition are exercised by 16 passing tests. |
| `test/fixtures/fake-codex.mjs` | yes | yes | yes | Provides persisted `thread.started`, output, warning, failure, and cleanup scenarios to the harness. |
| `skills/luna-sidecar/SKILL.md` and `references/USAGE.md` | yes | yes | yes | Six-command explicit host workflow and claim limits are tested. |
| `test/install-parity.test.mjs` | yes | yes | yes | Pinned `skills@1.5.22` copied Codex/Claude trees, regular-file parity, and copied launcher execution pass. |
| `docs/verification/phase5-final-shape-evidence.json/.md` | yes | yes | partial | Schema is honest and release-gated, but it is keyed to `dfcb77a`, not the final implementation/current HEAD, and records no runtime/delivery proof. |

## Key Link Verification

| From | To | Via | Status | Notes |
| --- | --- | --- | --- | --- |
| Launcher parser | Provider invocation | `execArgs`/`resumeArgs` | GAP | Control persistence works, but full-access spelling and Git-admission realization do not match installed Codex help. |
| Runner | Existing worker/turn record | Persisted `thread.started` handshake | VERIFIED LOCALLY | Start waits for persisted readiness/running evidence; typed rejection/schema/runner-death paths and cleanup tests pass. |
| Fake Codex | Lifecycle/resource/safety tests | CLI harness scenarios | VERIFIED | Focused files and full suite pass. |
| Canonical skill | Codex/Claude copies | Pinned local `skills@1.5.22 --copy` install | VERIFIED LOCALLY | Byte-identical manifests/assets and copied launcher fake-provider runs pass. |
| Release smoke | Final evidence | CI/host/cleanup predicates | GAP | Predicate tests pass, but actual exact-commit CI and host evidence are absent and current artifact binding is stale. |

## Requirements Coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| SIMPLE-01 | VERIFIED | Exact six-command help, structured removed-command/legacy-flag errors, UX and contract tests. |
| EXPLICIT-01 | GAPS_FOUND | Explicit start/resume controls and most provider mappings pass fake-provider tests; installed full-access mapping is unsupported. |
| TRUST-01 | GAPS_FOUND | Absolute cwd validation passes, but provider Git-admission override is not present in argv. |
| READY-01 | PARTIAL | Persisted `thread.started` fake-provider handshake, bounded timeout, typed failures, and cleanup pass; no source-backed real-provider/host receipt exists for this commit. |
| RETRY-01 | VERIFIED LOCALLY | No provider retry implementation is present; persistence/file replacement retries are not provider attempts; release predicate tests pass. No exception retry is claimed. |
| MCP-01 | VERIFIED LOCALLY | No MCP discovery/rewrite path; repeated item errors collapse to bounded warnings and fatal provider errors remain failures. |
| USAGE-01 | VERIFIED LOCALLY | Receipts retain `unavailable`; no pricing, reasoning double-counting, or task-success inference path is present. |
| FINAL-UX-01 | VERIFIED LOCALLY | Skill/usage guidance and UX tests cover explicit controls, visible lifecycle, one-worker-first containment, native subagents, bounded history, and host-owned evaluation. |
| FINAL-RELEASE-01 | BLOCKED | Required exact-commit delivery and real Codex/Claude host evidence are missing; evidence correctly keeps `claimEligible` false and `releaseReady` false. |

Orphan requirement check: all nine Phase 5 requirements are claimed by `05-PLAN.md`; no additional roadmap-scoped requirement was found without a coverage row.

## Tests and Checks

- `npm ci`: exit 0; 8 packages installed; 0 vulnerabilities.
- Isolated focused files: authority 6/6, concurrency 3/3, contract 7/7, harness 8/8, observation 7/7, resources 12/12, safety 7/7, lifecycle 16/16.
- The combined focused command timed out at the 122-second tool ceiling before producing a summary; the same files were then run independently and all passed.
- `node --test --test-concurrency=1 test/release-smoke.test.mjs`: 16/16 passed.
- `npm test`: 87/87 passed.
- `node --check skills/luna-sidecar/scripts/luna-sidecar.mjs`: exit 0.
- `node --check scripts/release-smoke.mjs`: exit 0.
- `git diff --check`: exit 0.
- Direct six-command help and removed-command/legacy-flag probes: exit 0 for help, exit 2 with structured actionable errors for each removed/legacy path.
- `gh pr list --head main --state all ...`: `[]` (`pr_state: none`).
- `gh run list` for both recorded `dfcb77a` and current `04a4009` returned `[]`; no exact CI run is claimed.

## Anti-Patterns

No `TODO`, `FIXME`, `HACK`, `XXX`, or non-test `console.log` markers were found in the Phase 5 surfaces. Empty catches are limited to best-effort cleanup/lock/stream sealing paths and are not placeholder handlers. No orphaned Phase 5 implementation file was found; all listed artifacts are referenced by tests or delivery flow.

## Grouped Gaps Summary

1. **Provider contract realization:** map the public `full-access` control to the installed Codex `danger-full-access` form and add the provider-supported `--skip-git-repo-check` behavior for explicit cwd, with provider-level tests/source evidence.
2. **Runtime and delivery closure:** obtain successful exact-commit CI, then run the availability-gated real Codex CLI and Claude Code observations with valid receipts and independently verified owned-PID cleanup. Regenerate evidence against that exact tested commit.
3. **Evidence binding:** do not treat the current `dfcb77a` evidence artifact as proof for `c63913e` or `04a4009`; evidence must be regenerated after the final tested source commit is fixed and delivered.

## Claim Limit

This verification supports only the locally tested six-command parser, explicit-control persistence for supported fake-provider paths, persisted fake-provider readiness/lifecycle behavior, provider-owned MCP boundary, unavailable-usage semantics, bounded list/history, and copied-install parity. It does not certify installed Codex provider admission/full-access mapping, real Codex or Claude host behavior, exact-commit CI, release readiness, task success, universal routing, secret redaction of content-bearing logs/final messages, or unrecorded child cleanup.

## Next Guarded Step

Keep Phase 5 in progress. Fix and re-verify the provider contract gaps; then bind one final tested commit, obtain its successful required CI run, rerun the gated release smoke with real Codex and availability-gated Claude Code observations, regenerate evidence, and perform a fresh verification before any roadmap closure or push.

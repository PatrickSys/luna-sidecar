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

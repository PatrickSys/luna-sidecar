---
phase: 02-lifecycle-and-authority
status: implemented
implementation_commit: 7acec18861fcac8ad53426739581166f02e3db35
requirements:
  - COMPAT-01
  - AUTH-01
  - LINEAGE-01
  - LIFE-01
  - CANCEL-01
  - CONCURRENCY-01
claim_limit: Windows deterministic fake-provider evidence for local-filesystem state and normal process trees; no POSIX execution, native containment, observer/retention, agent UX, install, CI, live-provider, or delivery claim.
---

# Phase 2 implementation summary

## Outcome

Phase 2 replaces optimistic lifecycle inference with one revisioned worker manifest and runner-owned provider lifecycle. A stable worker ID now owns unique turns; resume preserves or explicitly overrides cwd, effort, sandbox, and bypass authority; prompt publication and consumption have durable claims; provider events, process close, execution state, and delegated-task outcome remain separate.

Mutations use tokenized per-worker locks plus revision fencing. Known legacy records remain byte-preserving on reads and upgrade through an allowlisted schema-v2 migration only on explicit mutation; future schemas and poisoned native paths fail closed. One live runner owns a turn, duplicate runners cannot replay a claimed prompt, and startup failures converge to inspectable terminal evidence instead of leaving an indefinite `starting` record.

Cancellation is a runner-owned request/acknowledgement protocol. The controller never signals a manifest PID. The current runner validates the committed request, acknowledges before acting on its own child handle, verifies the supported process root/group is gone, and only then records `cancelled`. Starting, duplicate, timeout-and-later-recovery, completion-before-acknowledgement, dead-runner, stale-provider-PID, and normal descendant-tree cases are deterministic tests. `taskOutcome` intentionally remains `not_evaluated`.

This summary is executor evidence only. It does not claim independent verification.

## Requirement evidence

| Requirement | Phase 2 evidence | Limit |
|---|---|---|
| COMPAT-01 | Existing command names and manager fields remain characterized; legacy status/list/wait reads preserve bytes and metadata; an explicit terminal cancel upgrades through an allowlist while stripping prompt/env/argv/raw-event fields; future schemas are rejected without rewrite. | Phase 1 supplied the baseline; Phase 2 supplies the explicit-mutation migration clause. Error/help normalization remains Phase 4. |
| AUTH-01 | `test/authority.test.mjs` captures exact initial and resume argv plus provider cwd for default, inherited, explicitly broadened, and explicitly narrowed authority, including max effort, bypass, read-only, contradiction rejection, and a different caller cwd. Explicit bypass also asserts the persisted/returned normalized authority tuple, not just provider argv. | Installed Codex resume syntax was checked locally. No live provider was invoked. |
| LINEAGE-01 | One `workerId` survives resumes, every turn has a unique UUID, history remains ordered, and concurrent duplicate resumes select one active turn. | Resume is intentionally non-idempotent after a prior turn has fully completed; hosts inspect status before issuing new work. |
| LIFE-01 | Tests distinguish provider spawn failure, top-level provider failure, nonzero exit, missing completion, completion with a living process, process close, prompt claim, stdin callback, duplicate runner, dead runner, and startup failures outside the provider block. | Delegated task success is not inferred from agent prose. |
| CANCEL-01 | Tests cover committed request fields, pre-signal acknowledgement, starting cancellation, one duplicate request ID, durable timeout with later completion, completion-before-ack `not_applied`, stale runner/provider PID refusal, Windows `/T /F`, root-close verification, and independently observed grandchild disappearance. | Guarantee is the specified normal tree/group only. Breakaway descendants, PID-reuse elimination, and absolute OS containment remain outside v1. |
| CONCURRENCY-01 | Token locks, live-owner-aware stale recovery, malformed-lock recovery, base revisions, final token/revision checks, duplicate runner refusal, duplicate resume serialization, and a paused stale writer all have deterministic evidence. Failed pre-commit prompt/request publications are ownership-checked and cleaned. | Local filesystems only; no power-loss durability or distributed filesystem claim. |

## Files changed

- `package.json`
- `skills/luna-sidecar/scripts/luna-sidecar.mjs`
- `test/authority.test.mjs`
- `test/concurrency.test.mjs`
- `test/contract.test.mjs`
- `test/harness.test.mjs`
- `test/helpers/cli-harness.mjs`
- `test/lifecycle.test.mjs`

The Phase 1 fake provider and grandchild fixtures already exposed the required controls, so `test/fixtures/fake-codex.mjs`, `test/fixtures/fake-grandchild.mjs`, and `test/fixtures/legacy-worker.json` did not need implementation changes.

## Verification commands

Required final-state gates:

| Command | Exit | Evidence |
|---|---:|---|
| `npm test` (final run 1) | 0 | 36 passed, 0 failed, serial Phase 1+2 suite. |
| `npm test` (final run 2) | 0 | 36 passed, 0 failed, same exact working-tree state. |
| `node --test test/authority.test.mjs test/lifecycle.test.mjs test/concurrency.test.mjs` | 0 | 23 passed, 0 failed. |
| `node -e "const p=require('./package.json'); if(!p.private\|\|p.type!=='module'\|\|Object.keys(p.dependencies\|\|{}).length) process.exit(1)"` | 0 | Private ESM package; zero runtime dependencies. |
| `node --check` for launcher and every changed test/helper | 0 | All syntax checks passed. |
| `git diff --check` before implementation commit | 0 | No whitespace error; only configured LF-to-CRLF working-copy warnings. |
| Bounded Windows owned-process scan | 0 | `[]`; no test temp-root launcher, fake provider, fake grandchild, repo `_worker`, or repo test process remained. |

Supplemental evidence:

| Check | Result |
|---|---|
| Focused terminal-event matrix, starting cancellation, and concurrency suite repeated five times before closure | All iterations passed after the actual Windows manifest-rename race and stream-drain race were corrected. |
| Max-reasoning adversarial review before final gates | Four local reviewers found ownerless starting cancellation, malformed locks, duplicate runners, unsafe schema migration, startup stranding, and missing deterministic evidence; accepted findings were fixed and covered. |
| Fresh post-fix max closure panel | One reviewer reached the local checkout and found no additional ownership/lifecycle blocker. Two recommendations were correctly left to their locked boundaries: exact wait-deadline semantics is Phase 3, and native/runtime descendant enumeration exceeds Phase 2's explicit Windows contract. Two other reviewers could only see stale remote code and their findings were excluded. |
| First independent verifier | All commands passed for `ca6560c...`, but the verifier correctly recorded `gaps_found`: explicit bypass after stored read-only launched unsandboxed while retaining `sandbox: read-only` in the receipt. Commit `7acec18...` normalizes that tuple to the existing bypass convention (`sandbox: workspace-write`, `bypass: true`), adds a schema invariant, strengthens persisted-turn assertions, and passed the full suite twice plus the focused matrix. The committed gap report remains the audit trail; fresh re-verification is still required. |
| Anti-pattern scan over changed implementation/tests | No TODO/FIXME/HACK/XXX or `console.log` matches. |

## Deviations and recovery paths

1. Codex Desktop's normal shell path still fails before command execution with `Io(Error { kind: InvalidInput, message: "batch file arguments are invalid" })`. All authoritative Git/Node/npm/PowerShell checks ran through a Node-backed child-process path with explicit timeouts. This workaround is not treated as a fix; the durable Codex/Olympus side quest remains sequenced after the Luna roadmap.
2. Direct Windows `spawn("npm.cmd", ["test"])` returned `EINVAL`. The exact `npm test` command ran through native `cmd.exe /d /s /c npm test`, twice on the final state.
3. The first Luna-high implementation worker exceeded its bounded window and oscillated on race symptoms. The lead validated and terminated only that exact owned process tree, traced the real Windows `rename` `EPERM`, serialized provider stream draining, fixed barrier semantics, and retained sole write authority.
4. Luna-max reviewers repeatedly inherited the same broken shell bridge. Findings based only on remote commit `ae596e5...` were explicitly discarded as stale; local source, deterministic tests, and exact process evidence were not replaced by synthetic review output.
5. The plan's positive wait-deadline boundary is deliberately not pulled forward: `.planning/phases/03-observation-and-safety/03-PLAN.md` owns exact bounded observer semantics. Phase 2 proves persisted `unknown` is terminal for `wait`.
6. Runtime cancellation follows the exact no-native v1 design: POSIX process groups or Windows `taskkill /T /F`, provider close/root absence checks, and independent fixture descendant verification. It does not claim enumeration or containment of intentional breakaway descendants.

## Unresolved gaps

- Phase 3 must make status/list/wait observably pure and bounded, implement exact monotonic timeout semantics, harden incremental receipt parsing, add same-cwd/recursive-delegation safeguards, and cap/prune evidence.
- Phase 4 must deliver actionable help/stop/error UX, skill guidance, Windows and Ubuntu CI, copied-install parity for Codex and Claude Code, and bounded live dogfood before any portability/release claim.
- POSIX source paths are present but remain unexecuted until Phase 4 CI.
- Normal process-tree cancellation is proven only within the stated bounded contract; absolute containment and power-loss durability are not claims.

## Next action

A fresh Luna-max verifier must read `SPEC.md`, `ROADMAP.md`, the Phase 2 plan, this summary, the prior `gaps_found` verification, and exact final implementation commit `7acec18861fcac8ad53426739581166f02e3db35`; rerun every Phase 2 closure command; confirm the AUTH-01 receipt gap is closed; trace every state write and signal path; and replace `02-VERIFICATION.md` with a re-verification verdict. Phase 3 remains blocked until that file records `status: passed` for this exact implementation commit.

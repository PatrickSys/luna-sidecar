# Luna sidecar v1 cross-phase verification

## Verdict

**PASS — bounded v1 scope only.** The reviewed implementation, phase evidence, release evidence, and current deterministic checks support the intended low-friction Agent Skills-compatible Luna background-worker/subagent layer. This is not a claim of universal host support, task success, secret redaction, or package publication.

The audit ran no `--live` command and did not mutate generated evidence. The historical live claim remains bound to tested production commit `5a85a7e76b8306203d380aa0c0ed15eec9fb4692` and CI run `31304748019`.

## Acceptance matrix

| Scope / SPEC IDs | Direct evidence | Result |
| --- | --- | --- |
| Harness and compatibility (`HARNESS-01`, `COMPAT-01`) | Phase 1 plan/summary/verification; fake provider captures argv, stdin, cwd, selected env, PIDs, chunks, exit; additive state/command reads and explicit mutation gates | PASS |
| Authority and lineage (`AUTH-01`, `LINEAGE-01`) | Phase 2 verification and authority/lineage tests; exact start/resume argv, inherited authority, contradiction rejection, stable worker IDs and unique turns | PASS |
| Lifecycle (`LIFE-01`) | Phase 2 lifecycle evidence; runner-owned provider spawn, close plus `turn.completed` requirement, separate provider/process/task facts | PASS |
| Cancellation and concurrency (`CANCEL-01`, `CONCURRENCY-01`) | Phase 2 verification/tests; locked revisions, serial same-worker turns, acknowledgement-before-signal, process-tree checks, bounded `cancelling`/`unknown` recovery | PASS |
| Observation and receipts (`OBSERVE-01`, `RECEIPT-01`) | Phase 3 verification/tests; pure compact projections, bounded wait/liveness, schema-2 lineage/authority/execution/provider/task facts, no task-success inference | PASS |
| Resources and safety (`RESOURCE-01`, `SAFETY-01`) | Phase 3 verification/tests; incremental JSONL caps, terminal-only pruning, recursion rejection, native subagent events, same-cwd warning, compact allowlist and secret sentinels | PASS |
| UX and control (`UX-01`) | Phase 4 verification plus `SKILL.md`, `USAGE.md`, README, UX tests; three exact activation phrases, start/run/status/wait/resume/cancel/list, `stop`, help and actionable errors | PASS |
| Agent Skills portability (`PORTABLE-01`) | Pinned `skills@1.5.22` installer evidence; copied Codex and Claude assets are byte-identical and run the same launcher | PASS |
| Release discipline (`RELEASE-01`) | `docs/verification/v1-release-evidence.{json,md}`, exact four-job CI evidence, deterministic release-smoke gates and cleanup predicates | PASS |
| Product boundary / non-goals | SPEC, README, SKILL, usage guidance and source contain no silent delegation, host adapter, runtime mode, daemon, scheduler, universal, or task-success claim | PASS |

## Phase and evidence chain

- Phase 1 implementation `9dcd892`; verification `f851710`; the roadmap marker was added only after the recorded PASS.
- Phase 2 implementation `7acec18`; verification `539ba93`; its authority-receipt gap was explicitly closed before PASS and the roadmap marker.
- Phase 3 implementation `e142638`; verification `a3e539c`; observer purity, caps, pruning, recursion and safety evidence were recorded before PASS and the roadmap marker.
- Phase 4 delivery was tested at `5a85a7e`; release evidence was recorded at `dbdbd7f`; independent verification exposed the Ubuntu synchronization failure in CI `31306116741`, and the deterministic-only repair `8a0f902` was recovered by CI `31306925974`. Recovery verification is recorded at `aea375b`; the Phase 4 roadmap marker was added by `67f1b63`.
- The later diff from tested production commit to current pre-audit HEAD was exactly:

  ```text
  M .planning/ROADMAP.md
  A .planning/phases/04-agent-ux-and-delivery/04-SUMMARY.md
  A .planning/phases/04-agent-ux-and-delivery/04-VERIFICATION.md
  A docs/verification/v1-release-evidence.json
  A docs/verification/v1-release-evidence.md
  M test/safety.test.mjs
  ```

  The only non-document change is the deterministic test synchronization repair. Production launcher, package, installer, and CI source were unchanged after `5a85a7e`; the live proof is therefore not stale due to later production behavior.

The recorded Phase 4 live evidence is narrow and internally checkable: Windows Node 24.14.1, Codex `0.147.0`, `skills@1.5.22`; copied Codex/Claude installs; parent completion with exactly two native child events; resume marker command failure and marker absence; cancellation acknowledgement/terminal state and owned-PID cleanup; `releaseReady: true`, `gaps: []`. It does not infer task success.

## Focused checks completed in this continuation

| Command / check | Result |
| --- | --- |
| `node --test --test-concurrency=1 test/ux.test.mjs test/install-parity.test.mjs test/release-smoke.test.mjs` | Exit 0; 20 passed, 0 failed, 0 cancelled, 0 skipped; 17.527 s |
| `node --check skills/luna-sidecar/scripts/luna-sidecar.mjs` | Exit 0 |
| `node --check scripts/release-smoke.mjs` | Exit 0 |
| `npm ls --omit=dev --depth=0 --json` | Exit 0; root name only, no runtime tree |
| Package/lock/source dependency assertion | PASS; root and lock root have no runtime dependency fields; production launcher imports only `node:` built-ins |
| `git diff --check` before this document | Exit 0; no output |
| Process/temp residue scan after focused tests | PASS; no matching process and no `luna-sidecar-cli-*` or `luna-release-smoke-*` temp directory |
| `npm pack --dry-run --ignore-scripts --json` | Exit 1: `Invalid package, must have name and version` |

The `npm pack` result is not treated as a v1 product failure: the root is deliberately `private`, named `luna-sidecar-private-tests`, has no version, and Phase 4 explicitly excludes package publication/tagging. The applicable repo-native packaging/release equivalent is the pinned installer, copied-install parity, hash, CI, evidence, and cleanup gate; that gate passed all 20 focused tests. If npm publication becomes scope, a versioned publishable package and a new pack gate are required.

The previously completed full suite is not rerun here: the checkpoint recorded `npm test` at 81/81 passing. Current pre-audit HEAD CI run `31307531763` was also green across all four matrix jobs:

```text
93230115550  ubuntu-latest  Node 22.20.0  success
93230115572  ubuntu-latest  Node 24.x      success
93230115575  windows-latest Node 22.20.0  success
93230115578  windows-latest Node 24.x      success
```

The exact required live-proof run `31304748019` was green across:

```text
93223188796  windows-latest Node 22.20.0  success
93223188819  ubuntu-latest  Node 24.x      success
93223188841  ubuntu-latest  Node 22.20.0  success
93223188843  windows-latest Node 24.x      success
```

The recorded failed/recovered verification trail was also checked: `31306116741` failed only Ubuntu Node 22 at the known prompt-claim synchronization assertion; `31306925974` recovered all four jobs, and `31307304389` verified the recovery on all four jobs.

## Claim boundary and residual risks

Supported claims are limited to the checked local Agent Skills delivery, Codex/Claude copied-asset parity, deterministic Windows/Linux Node 22/24 CI, bounded host-owned lifecycle/control, local-filesystem ownership/recovery semantics, and the historical bounded Windows live process evidence above.

Not claimed: a fresh live run by this audit; Claude runtime/provider behavior; native task success; all shells or host launchers; shared/hostile filesystems, power-loss durability, breakaway descendants, or universal process containment; redaction of content-bearing final messages/raw logs; package publication; daemon/service/scheduler behavior; or research/audit/planning/execution runtime modes.

The external Codex Windows launcher failure `helper_sandbox_lock_failed / SetNamedSecurityInfoW 1340` remains a bounded host-platform residual. The reviewed Luna source and evidence do not attribute it to luna-sidecar; the Codex/Olympus sidequest is outside this audit.

Required follow-up is limited to those explicit boundaries: keep the live claim tied to `5a85a7e`/`31304748019`, preserve the deterministic synchronization repair, and add a publishable package contract only if package publication is later authorized. No v1 production fix is required by this audit.

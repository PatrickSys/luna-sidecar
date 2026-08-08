---
phase: 03-observation-and-safety
plan: 03
type: execute
wave: 3
runtime: codex-cli
assurance: self_checked
depends_on:
  - 02
files-modified:
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
  - test/fixtures/fake-codex.mjs
  - test/observation.test.mjs
  - test/resources.test.mjs
  - test/safety.test.mjs
  - .planning/phases/03-observation-and-safety/03-SUMMARY.md
  - .planning/phases/03-observation-and-safety/03-VERIFICATION.md
autonomous: true
requirements:
  - OBSERVE-01
  - RECEIPT-01
  - RESOURCE-01
  - SAFETY-01
non_goals:
  - Do not add runtime task modes, worktree/file scheduling, telemetry, a dashboard, or host adapters.
hard_boundaries:
  - Observer commands read manifests and bounded process liveness only; they never repair, migrate, prune, lock, signal, or parse raw logs.
  - Retention may delete only raw logs for terminal turns; manifests and compact receipts are permanent until the user removes state.
escalation_triggers:
  - Stop if observation requires raw-log access, retention can touch active evidence, or recursion protection blocks native Codex subagents.
approval_gates:
  - Ask before adding telemetry, changing fixed retention caps, or turning same-cwd warnings into enforcement.
anti_regression_targets:
  - Preserve Phase 1/2 contract, authority, state, lineage, cancellation, and concurrent top-level workers.
known_unknowns:
  - Provider JSONL may add event kinds; unknown complete events must remain nonfatal and available in bounded raw evidence.
no_ui_proof_rationale: Observation, receipts, logs, and safeguards are CLI-only behavior.
high_leverage_surfaces:
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
second_pass_required: true
closure_claim_limit: Claim bounded read-only observation and stated safeguards only; do not claim model-task success, global scheduling, or absolute containment.
parallelism_budget:
  max_concurrent_plans: 1
  safe_parallelism: []
leverage:
  lost: Raw logs may be truncated or pruned under explicit caps.
  kept: Full compact lineage/receipts, simple local state, and unrestricted independent workers.
  gained: Polling cost independent of log size, honest errors, bounded disk use, and recursion protection.
must_haves:
  truths:
    - Repeated observation is byte-for-byte read-only and independent of transcript size.
    - Receipts expose evidence and uncertainty without interpreting task success.
    - Raw evidence has deterministic limits and nested sidecar recursion stops before spawn.
  artifacts:
    - path: test/observation.test.mjs
      provides: Read-only bounded status/list/wait and receipt proof.
    - path: test/resources.test.mjs
      provides: Incremental parsing and retention proof.
    - path: test/safety.test.mjs
      provides: Recursion, same-cwd warning, multiworker, and native-subagent-boundary proof.
  key_links:
    - from: runner JSONL decoder
      to: worker manifest receipt
      via: Incremental materialization of known provider facts.
    - from: status/list/wait
      to: worker manifest
      via: Pure reads with no raw-log dependency.
---

# Phase 3: Observation and safeguards

## Objective

Make the sidecar cheap to observe, explicit about what it knows, bounded on disk, and safe against recursive self-delegation without becoming a scheduler.

## Context

- `.planning/SPEC.md`, receipt/reliability boundaries
- `.planning/ROADMAP.md`, Phase 3
- `.planning/research/00-HARNESS-ENGINEERING.md`
- Phase 2 verification and schema

## Requirements Covered

- OBSERVE-01
- RECEIPT-01
- RESOURCE-01
- SAFETY-01

## Must-Haves

1. The runner materializes every persisted field needed by manager commands; observers add only a read-only liveness projection for unexpectedly missing runners.
2. Observers tolerate missing/pruned/inaccessible raw logs.
3. Truncation, malformed events, launch errors, and uncertainty are visible in JSON.
4. Recursion protection distinguishes invoking the sidecar script from Luna using native subagents.

## Anti-Goals

- No automatic task allocation, worker pool, resource scheduler, or write collision blocker.
- No attempt to summarize or score the delegated task inside the launcher.

## Hard Boundaries

- `status/list/wait` may call only compact record reads, sorting, validation, delays, and non-signalling liveness checks for recorded active runners.
- Per-turn caps: 32 MiB JSONL and 4 MiB stderr. Global terminal raw-log cap: 256 MiB.
- Global pruning occurs only as part of a mutating `start`; active turns, manifests, prompts, and compact receipts are never deleted.

## Evidence Contract

- Code: no observer path calls the raw-log reader or worker writer.
- Test: file hashes/mtimes, inaccessible-log fixtures, parser boundaries, caps/pruning, recursion, and concurrent workers pass.
- Runtime: fake-process streams and process-spawn counters prove behavior; no live model.
- Delivery: not claimed yet.

## Common Pitfalls

- Replacing full-log scans with repeated tail scans that still grow with log size.
- Dropping an incomplete final JSON fragment instead of retaining it for the next chunk.
- Treating a provider warning as fatal or hiding a fatal event behind exit code 0.
- Pruning logs while a runner still has an open handle.
- Blocking all nested agents instead of only nested sidecar invocation.

## Stop-And-Challenge

Stop if a requirement pushes task evaluation, scheduling, or host-specific behavior into the launcher.

## Approval Gates

No routine checkpoint. Changing caps or enforcing writer allocation requires a product decision and SPEC update.

<checks>
<plan_check>
checker: luna-max independent-plan-checker
checker_runtime: codex-cli gpt-5.6-luna max
status: passed
blocking: false
notes: Three bounded review cycles ended with zero blockers after exact lifecycle, closure, evidence, and direct-main gates were resolved across the packet.
</plan_check>
</checks>

## Tasks

Execute `03-01 -> 03-02 -> 03-03`. First require Phase 2's verification file to say `status: passed`; do not begin a task until every command in the prior task exits 0.

<task id="03-01" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - MODIFY: test/fixtures/fake-codex.mjs
    - CREATE: test/observation.test.mjs
  </files>
  <action>
    Materialize the SPEC receipt fields in the worker manifest while the runner already owns the
    stream and lifecycle. Keep current top-level fields as aliases/additive compatibility. Replace
    `inspectWorker()`-style repair with pure projection: `status` reads one requested manifest,
    `list` reads manifest summaries, and `wait` polls only that manifest with a bounded interval
    and exact timeout semantics. When an active turn's recorded runner is observably absent, project
    `unknown` with warning `runner_not_alive` without persisting or signalling. Remove observer
    writes and whole-log parsing. Preserve wait compatibility exactly: omitted timeout and
    `--timeout 0` wait indefinitely; a positive timeout reads immediately, polls every 250 ms using
    a monotonic deadline, lets an observed terminal state win at the boundary, and otherwise returns
    the latest receipt with `timedOut: true`. A stale active manifest whose runner is definitely absent must be
    projected as terminal `unknown`/`runner_not_alive`; `wait` returns it before timeout and a later
    resume still follows Phase 2's guarded persistent rejection. Tests must hash and timestamp every state file before/after
    repeated commands and compare empty, 32 MiB, missing, and directory-as-log-path fixtures. The
    latter three must return the same compact receipt without raw-log errors, and a source-level
    call-graph assertion must fail if an observer reaches the raw-log reader or writer. Test omitted,
    zero, positive-before-deadline, exact-boundary-terminal, and positive-timeout cases. Keep
    `taskOutcome` fixed at `not_evaluated`; expose provider/process disagreement through fields and
    warnings.
  </action>
  <verify>
    - Run `node --test test/observation.test.mjs`
    - Run `node --test test/contract.test.mjs`
  </verify>
  <done>
    OBSERVE-01 and RECEIPT-01 pass: observers are byte-for-byte read-only, work without raw logs,
    retain additive compatibility, and never convert provider/process evidence into task success.
  </done>
</task>

<task id="03-02" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - MODIFY: test/fixtures/fake-codex.mjs
    - CREATE: test/resources.test.mjs
  </files>
  <action>
    Complete the runner's incremental UTF-8/JSONL decoder: retain partial byte/text tails, accept
    CRLF and no final newline, preserve unknown events in raw evidence, record malformed complete
    lines and nonfatal item errors as warnings, and classify top-level error/turn.failed separately.
    Stream raw output into capped writers without blocking the provider. At 32 MiB stdout or 4 MiB
    stderr, stop persisting extra raw bytes while continuing to parse and record dropped-byte counts.
    Before a new start, if terminal raw logs exceed 256 MiB, delete oldest terminal raw files only
    until under cap; mark pruned turn metadata. Make pruning idempotent under simultaneous starts.
  </action>
  <verify>
    - Run `node --test test/resources.test.mjs`
    - Run `node --test test/lifecycle.test.mjs`
  </verify>
  <done>
    RESOURCE-01 passes for split UTF-8/JSON at every fixture boundary, malformed/unknown/error
    events, both per-turn caps, concurrent global pruning, and preservation of active/compact evidence.
  </done>
</task>

<task id="03-03" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - CREATE: test/safety.test.mjs
  </files>
  <action>
    Add a runner-to-provider environment marker containing the current worker/turn identity.
    When the sidecar script sees that marker, reject nested `start`, `run`, or `resume` before any
    runner/provider spawn; allow observation commands. Do not affect native Codex subagent tools.
    Before a write-capable start or resume, resolve the effective inherited/overridden authority and
    realpath cwd, inspect compact active manifests, and add a warning listing active same-cwd writer
    IDs; never block. Define compact state as an allowlist: do not persist prompt bodies, process
    environments, argv, raw stderr, or raw event payloads; persist only controlled error
    codes/messages, prompt SHA-256, selected fields, and the provider final message. Add sentinel
    secrets independently to env, prompt, stderr, and an unknown event, then assert they are absent
    from every manifest and manager output (raw logs are intentionally outside this claim). Add
    tests for nested script rejection, no spawn count increase, observation from a worker, multiple
    independent top-level workers, write-capable start/resume overlap warnings, read-only silence,
    and a fake provider event representing native subagent use.
  </action>
  <verify>
    - Run `node --test test/safety.test.mjs`
    - Run `npm test`
    - Run `git diff --check`
  </verify>
  <done>
    SAFETY-01 passes without a scheduler: recursive sidecar work is stopped before spawn, native
    subagents/multiple parents remain allowed, writer overlap is visible but advisory on start and
    resume, and sentinel secrets are absent from every compact receipt surface.
  </done>
</task>

## Verification

- Run `npm test` twice; both runs and every fixture PID-survival assertion must pass.
- Run `node --test test/observation.test.mjs test/resources.test.mjs test/safety.test.mjs`; it must exit 0, including the observer call-graph and sentinel-secret assertions.
- Run `git diff --check`; it must exit 0.

## Phase Closure

- The executor creates `.planning/phases/03-observation-and-safety/03-SUMMARY.md` using the roadmap closure contract.
- A fresh-context verifier reviews the bounded-read, pruning, redaction, and recursion predicates, reruns the three commands above, and creates `.planning/phases/03-observation-and-safety/03-VERIFICATION.md`. Phase 4 is blocked unless it records `status: passed` for the exact Phase 3 implementation commit.

## Success Criteria

- All five Phase 3 roadmap criteria pass on the current OS.
- A 32 MiB transcript fixture does not change observer correctness or file reads.

## High-Leverage Review

Second pass must inspect streaming backpressure, byte/UTF-8 boundaries, every pruning predicate, and the exact recursion marker propagation.

## Leverage Review

- Lost: Unlimited raw transcripts.
- Kept: The final message, lineage, authority, exit evidence, warnings, and optional bounded raw evidence.
- Gained: Predictable disk/CPU behavior and a receipt useful to any host agent.

## Notes

Do not add a `prune` mode or tuning flags in v1. Fixed conservative bounds and automatic terminal-only pruning keep the human UX at zero configuration.

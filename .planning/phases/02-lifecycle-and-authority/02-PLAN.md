---
phase: 02-lifecycle-and-authority
plan: 02
type: execute
wave: 2
runtime: codex-cli
assurance: self_checked
depends_on:
  - 01
files-modified:
  - .planning/ROADMAP.md
  - .planning/phases/02-lifecycle-and-authority/02-PLAN.md
  - package.json
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
  - test/helpers/cli-harness.mjs
  - test/fixtures/fake-codex.mjs
  - test/fixtures/fake-grandchild.mjs
  - test/fixtures/legacy-worker.json
  - test/harness.test.mjs
  - test/contract.test.mjs
  - test/authority.test.mjs
  - test/lifecycle.test.mjs
  - test/concurrency.test.mjs
  - .planning/phases/02-lifecycle-and-authority/02-SUMMARY.md
  - .planning/phases/02-lifecycle-and-authority/02-VERIFICATION.md
autonomous: true
requirements:
  - COMPAT-01
  - AUTH-01
  - LINEAGE-01
  - LIFE-01
  - CANCEL-01
  - CONCURRENCY-01
non_goals:
  - Do not implement log retention, observer redesign, skill UX, CI, install proof, or native containment helpers.
hard_boundaries:
  - The controller never signals a PID loaded from a stale manifest; active runner ownership is required.
  - Do not claim absolute cleanup of breakaway descendants or power-loss durability.
escalation_triggers:
  - Stop if normal Windows tree cleanup cannot pass without risking an unrelated process.
  - Stop if preserving resume authority requires unsupported Codex flags or a native/runtime dependency.
approval_gates:
  - Ask before adding a native helper, daemon, database, dependency, or changing the bounded cancellation guarantee.
anti_regression_targets:
  - Preserve Phase 1 contract tests, stdin prompt transport, multiple independent workers, and current public command names.
known_unknowns:
  - Intentional POSIX `setsid()` or Windows job breakaway remains outside v1 and must surface as cleanup uncertainty.
no_ui_proof_rationale: Process lifecycle and authority work makes no visible UI claim.
high_leverage_surfaces:
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
second_pass_required: true
closure_claim_limit: Claim truthful behavior only for the specified local-filesystem and normal process-tree contract; do not claim task success or absolute OS containment.
parallelism_budget:
  max_concurrent_plans: 1
  safe_parallelism: []
leverage:
  lost: Resume changes from one manifest per turn to stable worker identity, and mutations gain short lock/revision machinery.
  kept: Detached background runner, local files, existing commands, and zero runtime dependencies.
  gained: Authority preservation, durable exit truth, race resistance, and cancellation that fails honestly.
must_haves:
  truths:
    - Resume preserves authority and one worker identity without allowing duplicate active turns.
    - Terminal states follow actual process/provider evidence and cannot be overwritten by stale writers.
    - Cancellation never reports success before supported cleanup is verified.
  artifacts:
    - path: test/authority.test.mjs
      provides: Start/resume authority and lineage proof.
    - path: test/lifecycle.test.mjs
      provides: Spawn, event, close, exit, and cancellation failure matrix.
    - path: test/concurrency.test.mjs
      provides: Lock, revision, race, and crash-window proof.
  key_links:
    - from: cancel command
      to: active runner
      via: Per-turn cancellation request and runner-owned child handle.
    - from: runner process events
      to: worker manifest
      via: Locked revisioned monotonic transitions.
---

# Phase 2: Lifecycle and authority

## Objective

Replace optimistic/stale lifecycle behavior with one runner-owned, revisioned contract. Preserve the simple detached-runner architecture.

## Context

- `.planning/SPEC.md`, authority/state/reliability sections
- `.planning/ROADMAP.md`, Phase 2
- `.planning/research/00-HARNESS-ENGINEERING.md`
- Phase 1 verification and tests

## Requirements Covered

- COMPAT-01
- AUTH-01
- LINEAGE-01
- LIFE-01
- CANCEL-01
- CONCURRENCY-01

## Must-Haves

1. Cwd/authority/effort are explicit and test-captured on every initial and resumed provider process.
2. The runner is the only lifecycle writer after launch; observers never repair state.
3. Process exit, provider events, and delegated-task outcome remain distinct.
4. Cancel is an acknowledged state transition, not a blind PID signal.

## Anti-Goals

- No native Job Object/pidfd layer, service, heartbeat, event store, or general process supervisor.
- No log-size/polling/skill-documentation work from later phases.

## Hard Boundaries

- Validate worker IDs as canonical UUIDs before joining paths; confirm resolved state paths remain under the configured root.
- Mutating operations use a short per-worker lock and revision comparison. `status/list/wait` do not acquire it.
- State roots are supported only on local filesystems for v1.

## Evidence Contract

- Code: one manifest schema/transition table and one cancellation ownership path.
- Test: authority, lifecycle, cancellation, concurrency, legacy-upgrade, and process-tree fixtures all pass.
- Runtime: real OS subprocess and normal descendant behavior through the fake; no real model.
- Delivery: not claimed yet.

## Common Pitfalls

- Passing `-C` or `--sandbox` in the wrong `codex exec resume` position instead of using the locked contract.
- Marking `completed` from JSONL before `close`.
- Treating `item.type="error"` as unconditionally fatal.
- Deleting a prompt before there is a durable consumption claim.
- Locking reads or allowing stale lock owners to commit against a newer revision.
- Killing a stored PID after the owning runner has vanished.

## Stop-And-Challenge

Stop on any test that can kill an unrelated process, any silent authority widening, or any need to exceed the SPEC's process/local-filesystem boundary.

## Approval Gates

No routine checkpoint. A native dependency, stronger containment promise, or public protocol break requires explicit user approval and a revised SPEC/roadmap.

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

Execute `02-01 -> 02-02 -> 02-03`. First require Phase 1's verification file to say `status: passed`; do not begin a task until every command in the prior task exits 0.

<task id="02-01" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - MODIFY: test/fixtures/legacy-worker.json
    - MODIFY: test/harness.test.mjs
    - MODIFY: test/contract.test.mjs
    - CREATE: test/authority.test.mjs
  </files>
  <action>
    Introduce additive schema version 2 with `revision`, stable `workerId`, unique `turnId`, compact
    turn history, explicit authority, and latest-turn compatibility fields. Validate UUID/path/cwd
    inputs before filesystem access. Implement `<workersRoot>/<workerId>.lock` with `open("wx")`;
    store a random token, PID, acquisition time, and base revision, retry for at most 2 seconds, and
    release only the caller's token in `finally`. A lock older than 30 seconds may be atomically
    renamed to a unique stale path before reacquisition, but the eventual write must still compare
    the current manifest revision with its base revision and abort on mismatch. Normalize v1 records
    in memory; read commands do not migrate, while first resume/cancel may upgrade atomically.
    Change resume to append a turn under the same worker ID. Under the lock, reject another active
    turn when its runner is alive or liveness is uncertain. When a fixture leaves the manifest
    `running` but that runner is definitely absent, apply the same bounded liveness check used by
    observers, revision-guard a terminal `unknown`/`runner_not_alive` write, and return
    `worker_unknown` without creating a turn. An already-unknown worker always returns
    `worker_unknown` and directs the host to a separate `start`.
    Capture and assert the exact SPEC matrix: initial non-bypass uses `exec --json --model ... -c
    model_reasoning_effort=<effort> --sandbox <mode> -C <cwd> -`; resume non-bypass uses `exec
    resume --json --model ... -c model_reasoning_effort=<effort> -c
    sandbox_mode=\"<mode>\" <sessionId> -`; both spawn with `cwd: <cwd>`; bypass replaces only the
    sandbox selector with the bypass flag. Inherit omitted cwd/effort/sandbox/bypass, reject
    `--read-only` plus `--bypass`, and stop/replan if the supported Codex version rejects this form.
    Update the Phase 1 cwd characterization assertions from the known AUTH-01 defect to the desired
    child-cwd contract while preserving their exact argv/stdin/raw-output and compatibility coverage.
  </action>
  <verify>
    - Run `node --test test/authority.test.mjs`
    - Run `node --test test/contract.test.mjs`
  </verify>
  <done>
    COMPAT-01's explicit-mutation upgrade clause, AUTH-01, and LINEAGE-01 pass for initial,
    inherited, narrowed, explicitly broadened, contradictory, different-caller-cwd,
    duplicate-resume, and legacy-upgrade fixtures without eager read mutation.
  </done>
</task>

<task id="02-02" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - MODIFY: test/helpers/cli-harness.mjs
    - MODIFY: test/fixtures/fake-codex.mjs
    - CREATE: test/lifecycle.test.mjs
  </files>
  <action>
    Make the parent leave the record `starting`, handle the detached runner's `spawn`/`error`, and
    return the worker ID without any post-spawn manifest rewrite or provider-readiness claim. On
    runner spawn error the parent records `failed`; otherwise the runner records its own PID under
    lock before provider launch and owns every later lifecycle write. The runner must install guarded
    error/spawn/close listeners before stdin. The parent publishes `<turnId>.prompt` by same-directory
    temp rename and stores its SHA-256 in the initial turn. Under the worker lock, the runner renames
    that file to `<turnId>.prompt.claimed` and records `promptClaimedAt` before reading it; after the
    stdin callback it records `stdinAcceptedAt` and removes the claimed file. A crash never
    auto-replays a claimed prompt. Spawn with explicit cwd/env, record provider PID/start, consume
    output, and persist exit code/signal/error. Implement the SPEC transition table. A provider
    completion event with a living process remains running; successful terminal state requires
    close code 0 plus provider completion; nonzero/spawn/top-level provider failure is failed;
    missing evidence observed by the live runner is unknown. Treat persisted `unknown` as terminal
    for `wait`; make resume return exit 1 with `worker_unknown` and guidance to start a new worker,
    without force-clearing the old record. Add a force-killed-runner fixture that invokes resume to
    persist `runner_not_alive`, then proves wait returns immediately and a separate start creates a
    new worker ID. Keep task outcome `not_evaluated`.
  </action>
  <verify>
    - Run `node --test --test-name-pattern="spawn|close|exit|provider|prompt" test/lifecycle.test.mjs`
    - Run `node --test test/authority.test.mjs`
  </verify>
  <done>
    LIFE-01 passes for delayed exit, immediate failure, nonzero exit, error/exit race, missing
    terminal event, provider failure, and prompt-claim crash windows with one monotonic terminal write.
  </done>
</task>

<task id="02-03" type="auto">
  <files>
    - MODIFY: package.json
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - MODIFY: test/fixtures/fake-codex.mjs
    - MODIFY: test/fixtures/fake-grandchild.mjs
    - MODIFY: test/lifecycle.test.mjs
    - CREATE: test/concurrency.test.mjs
  </files>
  <action>
    Implement the SPEC request at `<stateRoot>/requests/<turnId>.cancel.json` with exactly
    `schemaVersion`, UUID `requestId`/`workerId`/`turnId`, `baseRevision`, and `requestedAt`; publish
    it by temp rename while holding the worker lock, then persist the exact `cancel` receipt fields.
    The runner polls every 250 ms, validates identity under lock, records `acknowledgedAt` and
    `result: terminating` before using only its current child handle. POSIX sends TERM to the process
    group, waits 3 seconds, sends KILL, and verifies the group absent. Windows runs
    `taskkill /PID <current-child> /T /F`, requires exit 0 and provider `close`, verifies the provider
    root absent, and lets the harness independently verify the recorded grandchild. Persist
    `cancelled` only after those checks. A second cancel joins the existing request; an already
    terminal worker returns unchanged with `already_terminal`; completion before acknowledgement
    records `not_applied`; a definitely absent runner becomes revision-guarded `unknown` with
    `cancel_failed` without signalling; a live runner exceeding the controller's 10-second wait
    remains `cancelling` and returns exit 1/`cancel_timeout`. For a request while `starting`, make the
    runner check before provider spawn: with no child it records acknowledgement, `cancelled`,
    `result: cancelled`, and exits 0 without launching the fake provider; runner launch failure
    remains `failed/not_applied`, while a stale absent runner is `unknown/cancel_failed`. Remove a
    handled request only after terminal persistence; cleanup failure adds
    `cancel_request_cleanup_failed` without changing state. Add runner-crash, starting-state cancel,
    duplicate cancel, cancel/complete/resume, survivor, and paused-stale-writer tests; every revision
    race must select one specified result without resurrecting terminal state. For the paused stale
    writer, use a fixture-only file barrier accepted only when its resolved path is inside the
    isolated `LUNA_SIDECAR_HOME`; pause after lock/base-revision capture and before the final
    lock-token/revision ownership check. Do not use timing sleeps as assertions or add a public test
    command. Extend the private package test script so `npm test` runs all Phase 1+2 suites serially.
  </action>
  <verify>
    - Run `node --test --test-name-pattern="cancel|tree|grandchild" test/lifecycle.test.mjs`
    - Run `node --test test/concurrency.test.mjs`
    - Run `npm test`
    - Run `git diff --check`
  </verify>
  <done>
    CANCEL-01 and CONCURRENCY-01 pass on the current OS; no recorded fixture PID survives; stale
    or conflicting operations fail closed; the full Phase 1+2 suite is green.
  </done>
</task>

## Verification

- Run `npm test` twice; both runs and every fixture PID-survival assertion must pass.
- Run `node --test test/authority.test.mjs test/lifecycle.test.mjs test/concurrency.test.mjs`; it must exit 0 and cover every named argv, crash, cancellation, and race row.
- Run `git diff --check`; it must exit 0.

## Phase Closure

- The executor creates `.planning/phases/02-lifecycle-and-authority/02-SUMMARY.md` using the roadmap closure contract.
- A fresh-context verifier traces every state write and signal path, reruns the three commands above, and creates `.planning/phases/02-lifecycle-and-authority/02-VERIFICATION.md`. Phase 3 is blocked unless it records `status: passed` for the exact Phase 2 implementation commit.

## Success Criteria

- All five Phase 2 roadmap criteria pass on Windows before merge.
- Ubuntu CI proof is deferred to Phase 4; do not claim cross-platform completion yet.

## High-Leverage Review

Second-pass review must trace every state write and every signal/kill path. Any path that can write terminal state without guarded evidence is a blocker.

## Leverage Review

- Lost: The manifest becomes more structured and cancellation waits for acknowledgement.
- Kept: Simple commands, detached work, and no long-lived service.
- Gained: A state protocol the host can trust and test under races.

## Notes

The cancellation guarantee is deliberately bounded. If deterministic normal-tree tests fail, stop; do not quietly import native containment or weaken `cancelled` semantics.

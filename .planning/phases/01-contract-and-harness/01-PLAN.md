---
phase: 01-contract-and-harness
plan: 01
type: execute
wave: 1
runtime: codex-cli
assurance: self_checked
depends_on: []
files-modified:
  - package.json
  - test/helpers/cli-harness.mjs
  - test/fixtures/fake-codex.mjs
  - test/fixtures/fake-grandchild.mjs
  - test/fixtures/legacy-worker.json
  - test/harness.test.mjs
  - test/contract.test.mjs
  - .planning/phases/01-contract-and-harness/01-SUMMARY.md
  - .planning/phases/01-contract-and-harness/01-VERIFICATION.md
autonomous: true
requirements:
  - HARNESS-01
  - COMPAT-01
non_goals:
  - Do not fix lifecycle, resume, cancellation, observation, retention, or skill UX in this phase.
hard_boundaries:
  - No live Codex or Luna process, credentials, network, global install, or user sidecar state.
  - Production launcher behavior does not change in this phase.
escalation_triggers:
  - Stop if a deterministic Windows launch fixture requires shell interpolation or a runtime dependency.
  - Stop if current Codex argument behavior contradicts the locked SPEC contract.
approval_gates:
  - Ask before adding any runtime dependency or weakening the no-live-provider boundary.
anti_regression_targets:
  - Preserve all current command names, default one-off run behavior, stdin prompt transport, and top-level manager JSON fields.
known_unknowns:
  - Windows CI may expose quoting differences not visible on the planning machine; capture them as failing fixtures, not ad hoc escaping.
no_ui_proof_rationale: CLI and test-harness work makes no visible UI claim.
high_leverage_surfaces:
  - test/helpers/cli-harness.mjs
second_pass_required: true
closure_claim_limit: Claim only a deterministic green harness and characterized compatibility surface; no reliability defect is fixed yet.
parallelism_budget:
  max_concurrent_plans: 1
  safe_parallelism: []
leverage:
  lost: A small private package and platform shim fixtures are added.
  kept: One self-contained production launcher, zero runtime dependencies, and the existing public CLI.
  gained: Fast reproducible failure scenarios that do not spend model tokens or touch user state.
must_haves:
  truths:
    - The real sidecar entrypoint can be tested against a deterministic fake Codex process on Windows and POSIX.
    - Existing command and legacy-record compatibility is executable, not prose-only.
  artifacts:
    - path: test/fixtures/fake-codex.mjs
      provides: Scripted provider/process behavior and invocation capture.
    - path: test/helpers/cli-harness.mjs
      provides: Isolated state-root and subprocess test orchestration.
    - path: test/contract.test.mjs
      provides: Additive public-contract and legacy-record characterization.
  key_links:
    - from: test/helpers/cli-harness.mjs
      to: skills/luna-sidecar/scripts/luna-sidecar.mjs
      via: Real Node subprocess invocation with isolated environment.
    - from: skills/luna-sidecar/scripts/luna-sidecar.mjs
      to: test/fixtures/fake-codex.mjs
      via: Production PATH lookup resolving a temporary platform-specific Codex shim.
---

# Phase 1: Contract and deterministic harness

## Objective

Create the deterministic test boundary that every later phase depends on. Leave the repository green and do not fix the known defects yet.

## Context

- `.planning/SPEC.md`
- `.planning/ROADMAP.md`, Phase 1
- `.planning/research/00-HARNESS-ENGINEERING.md`
- `skills/luna-sidecar/scripts/luna-sidecar.mjs`

## Requirements Covered

- HARNESS-01
- COMPAT-01

## Must-Haves

1. The fake process captures exact invocation behavior and produces controlled process/output failures.
2. Tests use temporary state/cwd only and never resolve the real Codex executable.
3. Compatibility checks allow additive fields but reject removed/renamed current fields.

## Anti-Goals

- No state-machine redesign, resume fix, cancellation change, or documentation rewrite.
- No snapshots of unstable timestamps, PIDs, absolute temp paths, or model prose.

## Hard Boundaries

- `LUNA_SIDECAR_HOME` must point inside each test's temporary directory.
- The fake provider may record only an explicit allowlist of environment keys; never dump the full environment.
- Tests prepend only their temporary shim directory to `PATH` while retaining the minimum system path needed for `cmd.exe`; no production injection hook is added.

## Evidence Contract

- Code: listed files exist and the real launcher reaches the fake through the guarded seam.
- Test: focused harness and contract commands exit 0 on Windows and the current machine.
- Runtime/delivery: explicitly not claimed in this phase.

## Common Pitfalls

- Testing helper functions while bypassing the actual CLI entrypoint.
- Invoking `.cmd` fixtures through interpolated shell strings.
- Recording secrets from inherited env.
- Freezing current bugs as desired behavior.

## Stop-And-Challenge

Stop if the only way to fake Codex changes the production argv/cwd/stdin contract, or if a test requires real user/global state.

## Approval Gates

No routine checkpoint. Adding dependencies, network access, or a live provider requires explicit approval and a plan revision.

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

Execute `01-01 -> 01-02 -> 01-03`. Do not begin a task until every command in the prior task exits 0.

<task id="01-01" type="auto">
  <files>
    - CREATE: package.json
    - CREATE: test/fixtures/fake-codex.mjs
    - CREATE: test/fixtures/fake-grandchild.mjs
    - CREATE: test/harness.test.mjs
  </files>
  <action>
    Create a private ESM test package with no runtime dependencies and scripts for `test`,
    `test:harness`, and `test:contract`. Build a fake Codex executable that accepts scripted
    scenarios through fixture files/env, captures argv/stdin/cwd/an allowlisted env/PIDs, writes
    stdout and stderr in exact byte chunks, exits with requested code/signal behavior, can linger
    after `turn.completed`, and can spawn one grandchild. Use file-based ready/release signals so
    assertions do not depend on arbitrary sleeps. Cover spaces, Unicode, quotes, shell
    metacharacters, CRLF, and multiline stdin.
  </action>
  <verify>
    - Run `node --test test/harness.test.mjs`
    - Run `node -e "const p=require('./package.json'); if(!p.private||p.type!=='module'||Object.keys(p.dependencies||{}).length) process.exit(1)"`
  </verify>
  <done>
    HARNESS-01's fake process records every required field, all scripted scenarios terminate
    cleanly, descendants are reported for later cancellation tests, and both commands exit 0.
  </done>
</task>

<task id="01-02" type="auto">
  <files>
    - CREATE: test/helpers/cli-harness.mjs
    - MODIFY: test/harness.test.mjs
  </files>
  <action>
    Build platform shims in each test temp root: an npm-style `codex.cmd` on Windows and an
    executable shebang `codex` shim on POSIX, both forwarding argv/stdin to the Node fake without
    interpolating the prompt. Prepend that directory to the child `PATH` so the unmodified
    production `cmd.exe`/bare-`codex` launch path is exercised. Build a helper that creates unique
    temporary cwd/state roots, invokes the real launcher, captures stdout/stderr/exit code, parses
    exactly one manager JSON value, and always verifies fixture processes are gone.
    Add a focused fixture proving `--help` cannot accidentally launch a provider before Phase 4
    implements successful help output.
  </action>
  <verify>
    - Run `node --test test/harness.test.mjs`
    - Run `node --test --test-name-pattern="help does not launch provider" test/harness.test.mjs`
  </verify>
  <done>
    Tests reach the fake only through the real entrypoint and production executable lookup, exact
    stdin/argv/cwd are asserted, the launcher source is unchanged, and no test process survives.
  </done>
</task>

<task id="01-03" type="auto">
  <files>
    - CREATE: test/fixtures/legacy-worker.json
    - CREATE: test/contract.test.mjs
    - MODIFY: package.json
  </files>
  <action>
    Characterize the stable public surface without asserting known defects: command recognition,
    option validation, stdin prompt transport, current manager field presence/types, `run` exit
    propagation, unknown-worker behavior, and read-only loading of an unversioned legacy manifest.
    Assert minimum/additive shapes rather than full dynamic snapshots. Hash and timestamp the
    legacy fixture before and after read commands so eager migration fails the test. Wire the
    focused scripts and run all tests serially to avoid state collisions.
  </action>
  <verify>
    - Run `node --test test/contract.test.mjs`
    - Run `npm test`
    - Run `git diff --check`
  </verify>
  <done>
    COMPAT-01 has green executable characterization, all tests pass without Codex/network/user
    state, and the phase changed only listed files.
  </done>
</task>

## Verification

- Run `npm test` twice; both runs must exit 0, and the harness's recorded-PID assertions must report no survivors.
- Run `node --test test/harness.test.mjs test/contract.test.mjs`; it must exit 0 without credentials, network, or live Codex/Luna.
- Run `git diff --check`; it must exit 0.

## Phase Closure

- The executor creates `.planning/phases/01-contract-and-harness/01-SUMMARY.md` using the roadmap closure contract.
- A fresh-context verifier reruns the three commands above and creates `.planning/phases/01-contract-and-harness/01-VERIFICATION.md`. Phase 2 is blocked unless it records `status: passed` for the exact Phase 1 implementation commit.

## Success Criteria

- All four Phase 1 roadmap criteria pass.
- The repository is green while known reliability tests remain scheduled for Phase 2/3 rather than silently skipped here.

## High-Leverage Review

Second-pass review is required for the launcher seam and test harness. Confirm the seam cannot activate in normal use and cannot leak inherited secrets.

## Leverage Review

- Lost: Test setup carries two small platform shims.
- Kept: Existing architecture and runtime dependency footprint.
- Gained: Cheap deterministic iteration for every risky behavior that follows.

## Notes

Research was required because Windows process launch, Codex JSONL, and Agent Skills delivery are external contracts. It is recorded once in `00-HARNESS-ENGINEERING.md`; do not create another Phase 1 research artifact.

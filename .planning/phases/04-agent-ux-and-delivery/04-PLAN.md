---
phase: 04-agent-ux-and-delivery
plan: 04
type: execute
wave: 4
runtime: codex-cli
assurance: self_checked
depends_on:
  - 03
files-modified:
  - .gitignore
  - README.md
  - package.json
  - package-lock.json
  - skills/luna-sidecar/SKILL.md
  - skills/luna-sidecar/references/USAGE.md
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
  - test/authority.test.mjs
  - test/contract.test.mjs
  - test/harness.test.mjs
  - test/helpers/cli-harness.mjs
  - test/ux.test.mjs
  - test/install-parity.test.mjs
  - test/release-smoke.test.mjs
  - scripts/release-smoke.mjs
  - .github/workflows/ci.yml
  - docs/verification/v1-release-evidence.json
  - docs/verification/v1-release-evidence.md
  - .planning/ROADMAP.md
  - .planning/phases/04-agent-ux-and-delivery/04-SUMMARY.md
  - .planning/phases/04-agent-ux-and-delivery/04-VERIFICATION.md
autonomous: true
requirements:
  - UX-01
  - PORTABLE-01
  - RELEASE-01
non_goals:
  - Do not publish/tag a release, create an npm runtime package, add host adapters, or promise model performance/latency.
hard_boundaries:
  - Install tests use temporary project scope plus `--copy`; never global agent directories.
  - Live dogfood runs only after deterministic proof, in a new scratch repo/state root, read-only except an intentional blocked write attempt, and never with bypass.
  - Repository evidence proves activation wording, not proprietary host-routing behavior; no host adapter or trigger engine is added.
  - Live scenarios use positive deadlines, one outer supervisor, and finally-path cleanup; the claim is limited to recorded/known owned PIDs.
escalation_triggers:
  - Stop on source/install hash drift, red Windows/Linux CI, lingering processes, installer contract drift, unsafe scratch isolation, or unsupported compatibility claims.
approval_gates:
  - Publishing a tag/release/package remains a separate explicit user action; this plan stops at verified `main` evidence.
anti_regression_targets:
  - Preserve all Phase 1-3 protocol, lifecycle, authority, observation, resource, and recursion tests.
known_unknowns:
  - Live provider/auth/network availability may block dogfood; record it as missing release evidence rather than weakening deterministic gates.
  - Agent Skills metadata can request the three-phrase activation boundary, but host routing itself is outside repository control and is not claimed as deterministically enforced.
no_ui_proof_rationale: Agent Skill, CLI, CI, installation, and process evidence make no rendered UI claim.
high_leverage_surfaces:
  - skills/luna-sidecar/SKILL.md
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
  - .github/workflows/ci.yml
  - scripts/release-smoke.mjs
second_pass_required: true
closure_claim_limit: Claim Agent Skills portability and tested Codex/Claude installation only to the recorded versions/platforms; do not claim universal host behavior or task success.
parallelism_budget:
  max_concurrent_plans: 1
  safe_parallelism: []
leverage:
  lost: Development installs gain a pinned installer dependency and release proof takes a bounded live run.
  kept: One standard skill, one launcher, natural-language human UX, and no host-specific implementation.
  gained: Precise activation, progressive guidance, cross-platform CI, installed-byte parity, and honest release evidence.
must_haves:
  truths:
    - A host agent can discover and operate Luna Sidecar without making the human manage CLI details.
    - Codex and Claude Code installs contain the same tested skill assets.
    - Release claims are backed by deterministic, delivery, and bounded live evidence in that order.
  artifacts:
    - path: skills/luna-sidecar/references/USAGE.md
      provides: On-demand prompting, parallelism, authority, and result-harvesting guidance.
    - path: test/install-parity.test.mjs
      provides: Scratch installation and byte-parity proof for Codex and Claude Code.
    - path: scripts/release-smoke.mjs
      provides: Explicit bounded live dogfood with machine-readable evidence.
    - path: docs/verification/v1-release-evidence.md
      provides: Versions, commands, hashes, outcomes, limitations, and claim boundary.
  key_links:
    - from: skills/luna-sidecar/SKILL.md
      to: skills/luna-sidecar/references/USAGE.md
      via: One-level progressive-disclosure link.
    - from: temporary Codex and Claude installs
      to: canonical skill assets
      via: SHA-256 manifest equality and installed-script fake-provider run.
---

# Phase 4: Agent UX and delivery proof

## Objective

Finish the agent-facing experience and prove the exact thing being shipped, without adding another integration layer or turning live model behavior into a deterministic test.

## Context

- `.planning/SPEC.md`, fixed product decisions and completion contract
- `.planning/ROADMAP.md`, Phase 4
- `.planning/research/00-HARNESS-ENGINEERING.md`
- Historical audit response and Phase 3 verification

## Requirements Covered

- UX-01
- PORTABLE-01
- RELEASE-01

## Must-Haves

1. Skill activation is explicit and the host, not the human, operates the protocol.
2. Examples teach use cases as prompts rather than runtime modes.
3. Source, copied installs, fake-provider behavior, CI, and live scratch behavior agree.
4. The release record says exactly what was and was not proven.

## Anti-Goals

- No Codex/Claude adapter, custom installer, slash-command layer, dashboard, or npm runtime publication.
- No vague “any agent” claim without Agent Skills and Node/Codex prerequisites.
- No live test in CI and no repeated Luna-max fleet as a quality gate.

## Hard Boundaries

- `SKILL.md` stays concise; detailed examples live one reference hop away.
- `skills@1.5.22` is pinned for reproducible installation proof; do not use `latest` in the gate.
- Live smoke script must require `--live`, create its own scratch/state roots, print planned scope before launch, and refuse bypass or a non-scratch cwd.

## Evidence Contract

- Code: skill/script/docs/workflow are substantive and linked.
- Test: full deterministic suite passes on Windows and Ubuntu.
- Runtime: bounded live scratch start/wait/resume/cancel and OS process checks.
- Delivery: copied Codex/Claude assets hash-match canonical source and installed script passes the fake suite.
- Human: not required; there is no UI claim.

## Common Pitfalls

- Leaving the broad current skill description, which permits implicit invocation without the chosen trigger.
- Duplicating detailed guidance in both `SKILL.md` and README/reference.
- Testing only source while users execute copied/symlinked installed assets.
- Treating installer success as host runtime proof.
- Trusting sidecar manifest state instead of independent process checks during dogfood.
- Hiding a blocked/failed task behind process exit 0.

## Stop-And-Challenge

Stop before weakening a claim/gate to make release look green. Record external outage or unsupported host behavior as an unresolved gap.

## Approval Gates

No routine checkpoint through verified `main`; the user already selected direct-main development. Stop before tag, GitHub release, package publication, or any global install.

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

Execute `04-01 -> 04-02 -> 04-03`. First require Phase 3's verification file to say `status: passed`; do not begin a task until every command in the prior task exits 0. Task 04-03 also has an external CI gate and may not run live work early.

<task id="04-01" type="auto">
  <files>
    - MODIFY: skills/luna-sidecar/SKILL.md
    - CREATE: skills/luna-sidecar/references/USAGE.md
    - MODIFY: skills/luna-sidecar/scripts/luna-sidecar.mjs
    - MODIFY: README.md
    - MODIFY: test/authority.test.mjs
    - MODIFY: test/contract.test.mjs
    - MODIFY: test/harness.test.mjs
    - CREATE: test/ux.test.mjs
  </files>
  <action>
    Change skill metadata to request activation only when the human explicitly mentions, case
    insensitively, `Luna subagent`, `Luna sidecar`, or `sidecar`; remove generic delegation wording.
    Tests prove the repository wording and make no claim that every host routes metadata identically.
    Keep the body short: host owns commands/IDs/results; choose authority and effort; state that
    narrowing is allowed, omitted resume authority inherits, and changing cwd, sandbox, or bypass is
    an explicit host choice. Bypass or any broader reachable scope requires direct human intent;
    default workspace-write is compatibility behavior rather than inferred approval. Start
    independent workers; bound requested native subagents; never invoke the sidecar recursively;
    surface failed/unknown/task-not-evaluated honestly; do not delegate secrets; and treat the local
    sidecar state root, raw logs, and provider final messages as sensitive because they are not
    generically redacted. Put examples for web research, local inspection, audits, adversarial
    review, planning, and execution in one `references/USAGE.md` as prompting patterns, not modes.
    Keep one exact start-command skeleton and a `--help` pointer in the root skill; put exact
    status/wait/resume/stop/list harvesting examples in the reference so a host can operate the full
    lifecycle without making the human use the CLI.
    The reference must explain that `starting` is unconfirmed spawn, `completed` is not task success,
    `unknown` is terminal and requires a new `start`, cancellation timeout/failure is not
    cancellation, and the host evaluates `taskOutcome: not_evaluated` plus final evidence. Update
    README to describe the same host-neutral Agent Skills boundary and narrow prerequisites.

    Implement global `--help` and `<command> --help` for every public command with plain-text stdout,
    exit 0, and no state-root/provider side effect. Add `stop` as a lifecycle-identical alias for
    `cancel`; manager errors retain the invoked command token (`stop` when typed). Implement the SPEC
    manager error envelope: malformed options/UUIDs and unknown workers produce exactly one JSON
    value on stdout and exit 2; valid-target mutation failures produce JSON and exit 1; foreground
    `run` keeps provider passthrough and its separate failure behavior. Update existing contract tests
    plus any prior harness/authority characterization assertions that directly contradict the new
    help/error protocol, instead of preserving stderr-only carveouts or duplicating that dynamic
    matrix in the UX suite.
    Same-cwd dynamics remain owned by `test/safety.test.mjs`; UX adds only static interpretation.
    The UX test must assert the three activation phrases, human-only authority broadening, no-secret
    delegation guidance, and the distinction between compact-receipt redaction and sensitive raw
    logs/final messages.
  </action>
  <verify>
    - Run `node --test test/ux.test.mjs`
    - Run `node skills/luna-sidecar/scripts/luna-sidecar.mjs --help`
    - Run `node skills/luna-sidecar/scripts/luna-sidecar.mjs stop --help`
    - Run `npm test`
  </verify>
  <done>
    UX-01 passes: the activation boundary is exact, an agent can operate every lifecycle command,
    detailed guidance loads on demand, examples add no runtime modes, secret boundaries are explicit,
    and CLI help/errors are useful.
  </done>
</task>

<task id="04-02" type="auto">
  <files>
    - CREATE: .gitignore
    - MODIFY: package.json
    - CREATE: package-lock.json
    - MODIFY: test/helpers/cli-harness.mjs
    - CREATE: test/install-parity.test.mjs
    - CREATE: test/release-smoke.test.mjs
    - CREATE: scripts/release-smoke.mjs
    - CREATE: .github/workflows/ci.yml
  </files>
  <action>
    Pin `skills` exactly at `1.5.22` as a development/install-verification dependency, generate the
    lockfile, and ignore only `node_modules/` so `npm ci` cannot violate the roadmap dirty-path gate.
    Record/assert the resolved local package version, Node engine, bin path, and relevant help flags;
    invoke `node_modules/skills/bin/cli.mjs` through `process.execPath`, never `npx`, PATH, or network
    resolution. Build an install test that creates a temporary project with isolated HOME,
    USERPROFILE, APPDATA, LOCALAPPDATA, and XDG roots, disables installer telemetry, and runs that
    local pinned CLI against this repository with `--skill luna-sidecar`, `--copy`, `-a codex`,
    `-a claude-code`, and `-y`. Require exactly `.agents/skills/luna-sidecar` and
    `.claude/skills/luna-sidecar` inside the temporary project; reject duplicate roots, symlinks,
    non-regular files, or realpaths outside the scratch root. Compare sorted POSIX-relative paths
    plus SHA-256 bytes and fail on missing/extra/different assets. Include spaces, Unicode, and shell
    metacharacters in scratch paths while using argv arrays only. Generalize the existing CLI harness
    with an optional launcher path (canonical by default), then run each copied launcher through
    `process.execPath` against the fake provider without duplicating lifecycle machinery.

    Build the opt-in release-smoke script now, before live use. It must require `--live`, create new
    scratch git/state/install roots, invoke the pinned local `skills` CLI itself with `--copy` for
    both Codex and Claude Code, discover and hash both copied trees, and invoke only the recorded
    copied Codex launcher path. It must refuse bypass, existing/nonempty paths, symlinks, or any
    source/global/PATH launcher fallback. Before provider spawn it emits one redacted JSON preflight
    record; after cleanup it emits one redacted final JSON record. Suppress installer/provider raw
    output. Export pure predicate/orchestration helpers for fail-closed unit tests while keeping one
    complete copied-install fake-provider run; do not add production test flags or a launcher runtime
    mode. Fixtures emit the exact provider-version event shapes used by the live gate. Prove that
    missing `--live`, unsafe scope, install failure, hash drift, CI mismatch, or source fallback
    spawns nothing. Add every Phase 4 deterministic suite to `npm test` and add GitHub Actions with
    the exact matrix Windows/Ubuntu x Node `22.20.0`/`24.x`, running `npm ci`, one `npm test`, and
    `git diff --check`; CI always uses the fake and never runs live Luna.
  </action>
  <verify>
    - Run `npm ci`
    - Run `npm test`
    - Run `git diff --check`
  </verify>
  <done>
    PORTABLE-01 passes locally: copied Codex and Claude Code assets are byte-identical, installed
    launchers and release-smoke orchestration pass the fake contract, lockfile/install are
    reproducible, and the CI matrix is wired without a live provider.
  </done>
</task>

<task id="04-03" type="auto">
  <files>
    - CREATE: docs/verification/v1-release-evidence.json
    - CREATE: docs/verification/v1-release-evidence.md
  </files>
  <action>
    Apply the roadmap's branch/remote/dirty-path/staging checks, commit only the deterministic Phase
    4 paths, and push that commit to `main`; record it as `testedCommit`. Immutable commit roles are:
    `testedCommit` = deterministic implementation commit exercised by CI; `evidenceCommit` = later
    evidence/summary commit; `verificationCommit` = later verification/roadmap commit. No artifact
    embeds its own future hash. If `origin/main` moves unexpectedly, preserve local commits/evidence,
    report expected and actual SHAs, and stop without reset, rebase, force-push, or evidence rewrite.
    Require one GitHub Actions run for `testedCommit` whose four declared
    Windows/Ubuntu x Node 22.20.0/24.x jobs all completed with `success`. Pass `testedCommit` and the
    selected CI run ID to the release-smoke script. Immediately before its first provider spawn, the
    script independently requires clean HEAD equal to `testedCommit`, inspects the matching workflow
    SHA and all four expected jobs, and fails closed on drift, red/missing jobs, or unavailable run
    evidence. The release-smoke script creates its own pinned copied install, records
    canonical/Codex/Claude root roles and hashes, and uses only its recorded copied Codex launcher.
    In fresh scratch roots, use fixed ceilings of 15 minutes for the Luna-max parent, 8 minutes for
    resume, 2 minutes to observe the cancellation worker running, 30 seconds for cancellation, and
    15 seconds for known-PID absence, all under one 30-minute outer supervisor. Every path has
    finally cleanup; after a normal sidecar stop attempt, OS cleanup may target only an exact PID
    created by this run whose current command/cwd identity still matches the scratch record, and such
    recovery can never turn a failed run green:
    (1) start one read-only Luna-max parent instructed to use exactly two read-only native Codex
    subagents and return a bounded answer; (2) resume that stable worker from a different caller
    directory and request cwd reporting plus one harmless marker-file write attempt; (3) start one
    low-effort delayed read-only worker and cancel it. For every scenario, wait and independently
    query all recorded/known owned PIDs. Poll the cancellation worker until `providerState: running`
    with a recorded provider PID before requesting cancellation; require acknowledgement, terminal
    `state: cancelled`, `cancel.result: cancelled`, and independent absence of the recorded
    runner/provider tree. Completion races, `unknown`, timeout, cleanup failure, or missing PID
    evidence leave `releaseReady` false. For the recorded Codex version, count a successful native child only
    when outer `type` is `item.completed` and `item.type`, `item.tool`, and `item.status` are
    `collab_tool_call`, `spawn_agent`, and `completed`, with a nonempty
    `item.receiver_thread_ids`; require exactly two unique receiver IDs. Count the write attempt only
    when an outer `item.completed` contains `item.type: command_execution`, the command includes the
    random marker basename, `item.status: failed`, and nonzero `item.exit_code`; also require the
    marker file absent. Fake fixtures use these exact predicates. Any schema mismatch is incomplete
    evidence, not a guessed pass. Compare receipt cwd/authority/lineage with expected values and
    retain provider/process/task facts separately. Write `v1-release-evidence.json` through an
    explicit allowlist with schema version, `testedCommit`, OS/Node/Codex/skills versions,
    canonical/installed root roles, relative install paths and path/asset hashes, CI run/job IDs and
    conclusions, command names/exit codes, per-scenario predicate booleans/counts, unresolved gaps,
    and the narrow supported claim. Include no usernames/absolute paths, prompt, env, argv, raw event,
    stderr, random marker basename, receiver IDs, or final-message bodies. Native receiver IDs are
    counted and uniqued but not stored; no OS-cleanup claim is made for child threads without recorded
    PIDs. Every failure after launch still emits a redacted final record with `releaseReady: false`,
    failure stage, and cleanup evidence. Render the Markdown evidence from that JSON. Missing machine evidence leaves
    RELEASE-01 incomplete; model prose cannot fill it. Commit truthful evidence even when
    `releaseReady` is false, then stop with the roadmap open instead of discarding the failed run.
  </action>
  <verify>
    - Run `git branch --show-current`, `git remote get-url origin`, `git fetch origin main`, `git rev-parse origin/main`, and `git status --short`; enforce the roadmap checks and record the expected remote SHA.
    - Run `npm test` and `git diff --check`; stage only Task 04-01/04-02 paths, inspect `git diff --cached --name-only`, commit, re-fetch/compare the expected remote SHA, run ordinary `git push origin HEAD:main`, and record `git rev-parse HEAD` as `testedCommit`.
    - Run `gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)" --json databaseId,headSha,status,conclusion,url --limit 10`; select the exact completed successful run or stop.
    - Run `gh run view <run-id> --json headSha,status,conclusion,jobs` and require all four declared Windows/Ubuntu/Node jobs successful for that HEAD.
    - Run `node scripts/release-smoke.mjs --live --tested-commit <testedCommit> --ci-run-id <run-id>`
    - Run `node -e "const e=require('./docs/verification/v1-release-evidence.json'); if(e.testedCommit!==require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()) process.exit(1)"`
    - Run `git diff --check`
    - Create the Phase 4 summary, stage only the two evidence files and summary, inspect `git diff --cached --name-only`, commit them, re-fetch/compare `origin/main` to `testedCommit`, push normally, and record the new HEAD as `evidenceCommit` for independent verification.
    - Run `node -e "const e=require('./docs/verification/v1-release-evidence.json'); if(!e.releaseReady) process.exit(1)"`; on exit 1, leave the evidence commit published and stop with Phase 4 incomplete.
  </verify>
  <done>
    RELEASE-01 has deterministic, runtime, and delivery evidence committed after `testedCommit`; all
    recorded/known owned live PIDs are independently gone; the evidence document records limitations;
    no tag/package/release was published.
  </done>
</task>

## Verification

- Run `npm test` twice and `git diff --check`; all commands must exit 0.
- Run the exact `gh run list` and `gh run view` checks from Task 04-03 again; the recorded run, HEAD, and all four declared Windows/Ubuntu/Node job conclusions must match the JSON evidence.
- Read `testedCommit` from the JSON, record current pre-verification HEAD as `evidenceCommit`, run `git merge-base --is-ancestor <testedCommit> <evidenceCommit>`, and run `git diff --name-only <testedCommit>..<evidenceCommit>`; the former must exit 0 and the latter may contain only the two release-evidence files plus the Phase 4 summary. Assert `releaseReady: true` and empty recorded/known-owned post-run PID lists. `04-VERIFICATION.md` must use `verified_commit: <evidenceCommit>` and distinguish direct UX/PORTABLE/RELEASE evidence from inherited Phase 1-3 verification; it does not rerun or relabel all 14 requirements as new Phase 4 evidence.

## Phase Closure

- The executor creates `.planning/phases/04-agent-ux-and-delivery/04-SUMMARY.md` using the roadmap closure contract after the evidence files reflect actual results.
- A fresh-context verifier reviews the exact diff, evidence JSON/Markdown, CI jobs, and all 14 requirement IDs; reruns the three verification bullets above; and creates `.planning/phases/04-agent-ux-and-delivery/04-VERIFICATION.md`. The roadmap closes only if it records `status: passed` for the exact Phase 4 implementation/evidence commit. Tagging, release creation, and publication remain separately gated and are not performed.
- After a passed verifier record, the lead changes only the Phase 4 checkbox in `.planning/ROADMAP.md`, stages that file plus `04-VERIFICATION.md`, records the resulting commit as `verificationCommit`, and pushes through the ordinary remote-drift gate. The roadmap's top-level status remains in progress until the separate cross-phase final audit passes.

## Success Criteria

- All five Phase 4 roadmap criteria pass.
- The README claim is no broader than the recorded Agent Skills, Node, OS, Codex CLI, and host-install evidence.

## High-Leverage Review

Second pass must review activation wording, every install hash, CI platform behavior, scratch containment, process cleanup, and claim wording.

## Leverage Review

- Lost: A release now waits for installed-artifact and bounded live proof.
- Kept: No extra human-facing workflow or host integration layer.
- Gained: The thing users install is the thing tested, and host agents get concise operational guidance.

## Notes

If live provider availability fails, implementation may still be code-complete, but release proof is incomplete and the roadmap stays open. Do not retry fleets of max workers to brute-force an external outage.

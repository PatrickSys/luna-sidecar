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
  - README.md
  - package.json
  - package-lock.json
  - skills/luna-sidecar/SKILL.md
  - skills/luna-sidecar/references/USAGE.md
  - skills/luna-sidecar/scripts/luna-sidecar.mjs
  - test/ux.test.mjs
  - test/install-parity.test.mjs
  - test/release-smoke.test.mjs
  - scripts/release-smoke.mjs
  - .github/workflows/ci.yml
  - docs/verification/v1-release-evidence.json
  - docs/verification/v1-release-evidence.md
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
escalation_triggers:
  - Stop on source/install hash drift, red Windows/Linux CI, lingering processes, installer contract drift, unsafe scratch isolation, or unsupported compatibility claims.
approval_gates:
  - Publishing a tag/release/package remains a separate explicit user action; this plan stops at verified `main` evidence.
anti_regression_targets:
  - Preserve all Phase 1-3 protocol, lifecycle, authority, observation, resource, and recursion tests.
known_unknowns:
  - Live provider/auth/network availability may block dogfood; record it as missing release evidence rather than weakening deterministic gates.
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
    - CREATE: test/ux.test.mjs
  </files>
  <action>
    Change skill metadata to activate only when the human explicitly says `Luna subagent`,
    `Luna sidecar`, or `sidecar`. Keep the body short: host owns commands/IDs/results; choose
    authority and effort; state that narrowing is allowed but bypass or any resume broadening needs
    explicit human intent; start independent workers; bound requested native subagents; never invoke
    the sidecar recursively; surface failed/unknown/task-not-evaluated honestly; do not delegate
    secrets; and treat the local sidecar state root, raw logs, and provider final messages as
    sensitive because they are not generically redacted. Put examples for
    web research, local inspection, audits, adversarial review, planning, and execution in one
    `references/USAGE.md` as prompting patterns, not modes. Update README to describe the same
    host-neutral Agent Skills boundary and prerequisites. Implement tested `--help` for every
    command plus `stop` alias, UUID/option errors, and same-cwd warnings. Test the SPEC output matrix
    separately: manager success/error JSON and exit codes, plain-text help, and foreground `run`
    provider passthrough. The UX test must assert the three activation phrases, human-only authority
    broadening, no-secret delegation guidance, and the distinction between compact-receipt redaction
    and sensitive raw logs/final messages.
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
    - MODIFY: package.json
    - CREATE: package-lock.json
    - CREATE: test/install-parity.test.mjs
    - CREATE: test/release-smoke.test.mjs
    - CREATE: scripts/release-smoke.mjs
    - CREATE: .github/workflows/ci.yml
  </files>
  <action>
    Pin `skills` exactly at `1.5.22` as a development/install-verification dependency and generate
    the lockfile. Build an install test that creates a temporary project, disables installer
    telemetry, runs the local pinned CLI against this repository with `--skill luna-sidecar`,
    `--copy`, `-a codex`, `-a claude-code`, and `-y`, discovers both installed roots, hashes every
    source/installed skill file, fails on missing/extra/different bytes, and runs each installed
    launcher against the fake provider. Build the opt-in release-smoke script now, before live use:
    it must require `--live`, create new scratch git/state/install roots, invoke the pinned local
    `skills` CLI itself with `--copy` for both Codex and Claude Code, discover and hash both copied
    trees, and invoke only the recorded copied Codex launcher path. It must refuse bypass,
    existing/nonempty paths, or any source-launcher fallback and emit only a redacted JSON bundle.
    Its test drives the complete script through copied installs and the production PATH lookup with
    the fake provider; fixtures emit the exact provider-version event shapes used by the live gate.
    Prove that missing `--live`, unsafe scope, install failure, hash drift, or source fallback spawns
    nothing. Add GitHub Actions for Windows and Ubuntu using Node 22.20+ (and Node 24 where
    available), `npm ci`, `npm test`, and `git diff --check`; CI always uses the fake and never runs
    live Luna.
  </action>
  <verify>
    - Run `npm ci`
    - Run `node --test test/install-parity.test.mjs`
    - Run `node --test test/release-smoke.test.mjs`
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
    4 paths, and push that commit to `main`; record it as `testedCommit`. Require one GitHub
    Actions run for that exact commit whose Windows and Ubuntu matrix jobs all completed with
    `success`. Refuse live execution if HEAD/worktree changed, either job is absent/red, or the run
    cannot be inspected. The release-smoke script must create its own pinned copied install, record
    canonical/Codex/Claude roots and hashes, and use only its recorded copied Codex launcher. In its
    fresh scratch roots:
    (1) start one read-only Luna-max parent instructed to use exactly two read-only native Codex
    subagents and return a bounded answer; (2) resume that stable worker from a different caller
    directory and request cwd reporting plus one harmless marker-file write attempt; (3) start one
    low-effort delayed read-only worker and cancel it. For every scenario, wait and independently
    query all recorded PIDs. For the recorded Codex version, count a successful native child only
    when outer `type` is `item.completed` and `item.type`, `item.tool`, and `item.status` are
    `collab_tool_call`, `spawn_agent`, and `completed`, with a nonempty
    `item.receiver_thread_ids`; require exactly two unique receiver IDs. Count the write attempt only
    when an outer `item.completed` contains `item.type: command_execution`, the command includes the
    random marker basename, `item.status: failed`, and nonzero `item.exit_code`; also require the
    marker file absent. Fake fixtures use these exact predicates. Any schema mismatch is incomplete
    evidence, not a guessed pass. Compare receipt cwd/authority/lineage with expected values and retain
    provider/process/task facts separately. Write `v1-release-evidence.json` with schema version,
    `testedCommit`, OS/Node/Codex/skills versions, canonical/installed roots and asset hashes, CI
    run/job IDs and conclusions,
    commands/exit codes, per-scenario receipt/event/filesystem/process checks, unresolved gaps, and
    the narrow supported claim; include no prompt, env, argv, raw event, stderr, or final-message
    bodies. Render the Markdown evidence from that JSON. Any missing machine evidence leaves
    RELEASE-01 incomplete; model prose cannot fill it. Commit truthful evidence even when
    `releaseReady` is false, then stop with the roadmap open instead of discarding the failed run.
  </action>
  <verify>
    - Run `git branch --show-current`, `git remote get-url origin`, `git fetch origin main`, `git rev-parse origin/main`, and `git status --short`; enforce the roadmap checks and record the expected remote SHA.
    - Run `npm test` and `git diff --check`; stage only Task 04-01/04-02 paths, inspect `git diff --cached --name-only`, commit, re-fetch/compare the expected remote SHA, run ordinary `git push origin HEAD:main`, and record `git rev-parse HEAD` as `testedCommit`.
    - Run `gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)" --json databaseId,headSha,status,conclusion,url --limit 10`; select the exact completed successful run or stop.
    - Run `gh run view <run-id> --json headSha,status,conclusion,jobs` and require successful Windows and Ubuntu jobs for that HEAD.
    - Run `node scripts/release-smoke.mjs --live`
    - Run `node -e "const e=require('./docs/verification/v1-release-evidence.json'); if(e.testedCommit!==require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()) process.exit(1)"`
    - Run `git diff --check`
    - Create the Phase 4 summary, stage only the two evidence files and summary, inspect `git diff --cached --name-only`, commit them, re-fetch/compare `origin/main` to `testedCommit`, push normally, and record the new HEAD as `evidenceCommit` for independent verification.
    - Run `node -e "const e=require('./docs/verification/v1-release-evidence.json'); if(!e.releaseReady) process.exit(1)"`; on exit 1, leave the evidence commit published and stop with Phase 4 incomplete.
  </verify>
  <done>
    RELEASE-01 has deterministic, runtime, and delivery evidence committed after `testedCommit`; all
    launched live process trees are independently gone; the evidence document records limitations;
    no tag/package/release was published.
  </done>
</task>

## Verification

- Run `npm test` twice and `git diff --check`; all commands must exit 0.
- Run the exact `gh run list` and `gh run view` checks from Task 04-03 again; the recorded run, HEAD, and Windows/Ubuntu job conclusions must match the JSON evidence.
- Read `testedCommit` from the JSON, run `git merge-base --is-ancestor <testedCommit> HEAD`, and run `git diff --name-only <testedCommit>..HEAD`; the former must exit 0 and the latter may contain only the two release-evidence files plus Phase 4 summary/verification files. Assert `releaseReady: true` and empty post-run PID lists from the JSON. Record the current pre-verification HEAD as `evidenceCommit` inside `04-VERIFICATION.md`, then commit that verification file separately.

## Phase Closure

- The executor creates `.planning/phases/04-agent-ux-and-delivery/04-SUMMARY.md` using the roadmap closure contract after the evidence files reflect actual results.
- A fresh-context verifier reviews the exact diff, evidence JSON/Markdown, CI jobs, and all 14 requirement IDs; reruns the three verification bullets above; and creates `.planning/phases/04-agent-ux-and-delivery/04-VERIFICATION.md`. The roadmap closes only if it records `status: passed` for the exact Phase 4 implementation/evidence commit. Tagging, release creation, and publication remain separately gated and are not performed.

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

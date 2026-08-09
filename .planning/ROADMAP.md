# Roadmap: Luna Sidecar v1 reliability

**Status:** In progress

**Execution order:** `Phase 1 -> Phase 2 -> Phase 3 -> Phase 4`
**Parallel phase execution:** Not allowed. All phases touch the launcher contract.

## Execution rules

1. Before a phase, read `SPEC.md`, this roadmap, `research/00-HARNESS-ENGINEERING.md`, the phase plan, and the prior phase verification if one exists.
2. Execute only the current phase. Do not pull later-phase cleanup forward.
3. Run the exact task commands and record exit codes. A command that cannot run is missing evidence, not a pass.
4. Close each phase with the exact summary/verification files named by its plan. Do not mark the phase complete before an independent verifier records `status: passed` for the exact implementation commit.
5. Direct-to-`main` work is authorized through small verified commits. At each phase start require `git branch --show-current` to equal `main`, verify `origin` identifies `PatrickSys/luna-sidecar`, run `git fetch origin main`, record the expected remote SHA, and reject dirty paths not named by the current/prior closure plans. Before every commit, stage only explicit plan paths and inspect `git diff --cached --name-only`. Before every push, fetch again, require `origin/main` still equals the recorded expected SHA and is an ancestor of local HEAD, then use ordinary `git push origin HEAD:main`; update the expected SHA after success. Stop on any mismatch and never force-push.
6. Stop after planning in this packet. Implementation starts only in a later execution run.

### Phase closure contract

After the listed tasks pass, the executor writes the phase `SUMMARY.md` with: phase and requirement IDs, implementation commit, files changed, every verification command and exit code, deviations, unresolved gaps, and the next action. It must not declare independent verification.

A fresh agent context then reads `SPEC.md`, this roadmap, the phase plan, the summary, and the exact commit diff; reruns every phase verification command; and writes the named `VERIFICATION.md` with: `status` (`passed`, `gaps_found`, or `blocked`), verified commit, verifier runtime, requirement-to-evidence table, failed commands, residual risks, and claim limit. If a fresh context is unavailable or any command is missing, the status is not `passed`. The next phase must read that file and may begin only when its status is `passed`; it does not rerun already accepted scope.

## Phase 1 — Contract and deterministic harness

**Status:** `[x]`

**Plan:** [`phases/01-contract-and-harness/01-PLAN.md`](phases/01-contract-and-harness/01-PLAN.md)

**Requirements:** HARNESS-01, COMPAT-01
**Depends on:** None

**Goal:** Establish a cross-platform fake-provider harness and additive compatibility contract before changing lifecycle behavior.

**Success criteria:**

1. Tests invoke the real sidecar entrypoint against a fake Codex executable and capture exact argv, stdin bytes, cwd, selected env, output chunks, exit state, and descendant PIDs.
2. Fixtures cover Windows/POSIX launch forms, spaces/Unicode/metacharacters, partial JSONL, delayed exit, nonzero exit, cancellation, and a spawned grandchild without network or credentials.
3. Existing commands/top-level JSON fields and legacy manifests have executable characterization tests.
4. `npm test` is green and no live Codex/Luna process is used.

**Out of scope:** Fixing resume, lifecycle, cancellation, observation, logs, skill wording, or delivery claims.

**Stop/replan when:** A shell-free fake executable cannot reproduce the Windows launch boundary; current Codex arguments differ from the documented/local contract; or the harness needs a runtime dependency.

## Phase 2 — Lifecycle and authority

**Status:** `[x]`

**Plan:** [`phases/02-lifecycle-and-authority/02-PLAN.md`](phases/02-lifecycle-and-authority/02-PLAN.md)

**Requirements:** COMPAT-01, AUTH-01, LINEAGE-01, LIFE-01, CANCEL-01, CONCURRENCY-01
**Depends on:** Phase 1 verified

**Goal:** Make authority, identity, state transitions, process exit, and cancellation truthful under normal starts, resumes, races, and failures.

**Success criteria:**

1. Start/resume tests prove exact cwd, effort, sandbox, and bypass behavior, including inheritance, explicit overrides, contradiction rejection, and no silent escalation.
2. One worker ID survives resumes; each turn has a unique ID; two active resumes cannot both launch.
3. `turn.completed` followed by a living process remains running; success/nonzero/spawn failure/missing terminal event produce the specified states and durable exit evidence.
4. Cancel-vs-complete and duplicate-controller tests are deterministic; `cancelled` requires verified normal-tree termination and stale/uncertain identity never triggers a blind kill.
5. Concurrent mutations and forced process crashes do not produce invalid JSON, lost revisions, or terminal-state resurrection.

**Out of scope:** Log caps, global pruning, user documentation, host adapters, native Job Objects/pidfds, or absolute cleanup of intentional breakaway descendants.

**Stop/replan when:** Correctness requires a daemon/database/native helper; current Codex resume cannot preserve authority with supported options; a Windows normal descendant tree cannot be terminated without risking unrelated processes; or any state transition remains ambiguous.

## Phase 3 — Observation and safeguards

**Status:** `[x]`

**Plan:** [`phases/03-observation-and-safety/03-PLAN.md`](phases/03-observation-and-safety/03-PLAN.md)

**Requirements:** OBSERVE-01, RECEIPT-01, RESOURCE-01, SAFETY-01
**Depends on:** Phase 2 verified

**Goal:** Make observation cheap and read-only, results honest and useful, evidence bounded, and nested delegation safe.

**Success criteria:**

1. Hash/mtime tests prove repeated `status`, `list`, and `wait` calls do not mutate manifests or logs.
2. Polling a large-log fixture reads compact records only; measured bytes/time do not scale with raw log size.
3. Receipts expose execution/provider/task distinctions, lineage, authority, exit/error/warnings, final message, and truncation without turning agent prose into a success claim.
4. Incremental parsing handles split UTF-8/JSON, CRLF, missing final newline, malformed complete lines, unknown events, and nonfatal item errors.
5. Per-turn/global limits work; active logs and compact receipts survive pruning; compact receipts exclude sentinel prompt/env/stderr/event secrets; recursive sidecar starts fail before spawning while native-subagent and multiple-top-level-worker fixtures still pass.

**Out of scope:** Runtime task modes, file locks, automatic worktrees, automatic worker scheduling, telemetry, or dashboards.

**Stop/replan when:** Observation still needs whole-log reads; retention can delete active evidence; recursion protection blocks native subagents; or same-cwd warnings become an unrequested scheduling policy.

## Phase 4 — Agent UX and delivery proof

**Status:** `[x]`

**Plan:** [`phases/04-agent-ux-and-delivery/04-PLAN.md`](phases/04-agent-ux-and-delivery/04-PLAN.md)

**Requirements:** UX-01, PORTABLE-01, RELEASE-01
**Depends on:** Phase 3 verified

**Goal:** Ship a low-friction Agent Skill whose source, installed artifacts, documentation, CI, and bounded live behavior support the exact claims made.

**Success criteria:**

1. Skill metadata activates only on the three explicit phrases; concise instructions teach host ownership, effort/authority choice, parallel workers, native subagents, result harvesting, and honest uncertainty.
2. `--help`, `stop`, invalid-option, invalid-ID, and same-cwd warning outputs are tested and actionable.
3. Windows and Ubuntu CI pass deterministic tests on supported Node versions.
4. A scratch `skills@1.5.22` local install for Codex and Claude Code is non-global, copied, and byte-identical to every source skill asset; installed-script fake-provider tests pass.
5. Only after a green Windows/Ubuntu workflow for the exact unchanged commit, bounded scratch dogfood verifies start/wait/resume/cancel, one Luna-max parent with two native subagents, authority preservation, and no observed lingering process tree. Versions, commands, hashes, limitations, and failures are written to verification evidence.

**Out of scope:** Publishing a new npm runtime package, release/tag creation, host-specific code, performance promises about the model/provider, or “works everywhere” claims beyond the Agent Skills/runtime prerequisites.

**Stop/replan when:** Installed bytes differ; the pinned installer contract changed; deterministic CI is red; live work cannot be isolated to scratch/read-only boundaries; a process remains; or evidence cannot support the proposed README claim.

# Luna Sidecar Reliability Plan

**Status:** Ready for implementation  
**Development policy:** Work directly on `main`; keep commits small and verified. Do not create planning or evidence branches.

## Outcome

Make Luna-sidecar a reliable Agent Skill that any coding agent can invoke to run one or more real Luna background workers, while the human continues speaking naturally to the host agent.

The implementation must remain small:

`human → coding agent → Agent Skill → luna-sidecar CLI → Codex CLI/Luna → native Luna subagents`

The CLI is an agent-facing protocol and debugging surface. It is not the main human UX.

## Product contract

These decisions are fixed:

- Invoke Luna-sidecar only when the human mentions **“Luna subagent,” “Luna sidecar,” or “sidecar.”**
- The host agent owns starting, waiting, resuming, cancelling, and reporting results.
- Keep the Agent Skills installation flow. Do not build host-specific adapters or another installer.
- Codex CLI is the current backend used to reach Luna.
- Support multiple independent top-level workers.
- Let Luna use native Codex subagents; do not reimplement them.
- Do not encode research, audit, adversarial, planning, or execution as runtime modes.
- Preserve cwd and authority across resume; never silently broaden authority.
- Keep results traceable without making the human handle IDs or commands.
- Prefer clear automatic safeguards over routine configuration.

## Non-goals

Do not build:

- a daemon or service;
- a control plane or scheduler;
- a GUI or human dashboard;
- Codex/Claude host adapters;
- a custom installer or synchronization layer;
- an automatic worktree manager;
- file-level locking;
- a generic multi-agent framework;
- adaptive CPU/RAM orchestration;
- silent Luna invocation.

## Evidence baseline

### Accepted historical evidence

Use the 43 pre-existing work-laptop worker lineages as historical evidence. The audit found:

- 29 recorded completed;
- 11 failed;
- 2 cancelled;
- 1 remained recorded running;
- 9 of the 11 failures were trust-directory rejections;
- 25 of 43 emitted repeated local MCP transport noise;
- a recursive sidecar invocation consumed 224,072 input tokens;
- at least two workers were reported completed while Codex process trees remained alive;
- Claude Code repeatedly invoked the same Agent Skill successfully;
- Luna used native subagents in real work;
- the work-laptop install is one canonical skill copy symlinked into agent-specific locations.

### Quarantined evidence

W044/W045 were created during an audit that explicitly prohibited starting or resuming workers. Do not count them as historical usage. Their isolated probe can inform a test case, but the process violation must remain visible.

The audit response is preserved as historical evidence, not as an implementation specification. Its W044/W045 boundary violation remains explicit; its exact source diff and independently corroborated findings are usable.

## Problems to fix, in order

1. Resume can lose its original cwd and sandbox.
2. Completion state is not tied to actual process exit.
3. Successful worker exit is not durably written by the runner.
4. Cancellation can claim success without verifying termination.
5. Status/list/wait mutate state and repeatedly parse complete logs.
6. Startup and terminal transitions can race through stale record rewrites.
7. Concurrent resumes can target the same session.
8. PID reuse can target an unrelated process.
9. Trust-directory and launch errors are hidden from the normal result.
10. Recursive sidecar invocation is unbounded.
11. Multiple writing workers can target the same checkout.
12. Raw logs have no retention bound.
13. Skill discovery, help, command naming, and effort selection create avoidable friction.

## Implementation approach

Repair the existing tool; do not rewrite it into a platform.

Keep the public commands:

- `start`
- `run`
- `status`
- `wait`
- `resume`
- `cancel`
- `list`

Add only:

- `--help`;
- `stop` as an alias for `cancel`;
- the minimum internal fields needed for truthful state and lineage.

Use Node's built-in test runner and no runtime dependencies.

## Batch 1 — Baseline and regression harness

### Work

- Add a minimal `package.json` with test and validation scripts; do not publish a second npm runtime package.
- Add Node `node:test` coverage.
- Add a fake Codex executable that can:
  - emit valid JSONL;
  - emit `turn.completed` and remain alive;
  - exit zero or nonzero;
  - fail before producing output;
  - delay until cancelled;
  - expose received arguments, cwd, and environment.
- Make the Codex executable injectable in tests while resolving the normal installed Codex CLI in production.
- Snapshot current CLI JSON fields so compatibility changes are deliberate.
- Test on Windows and Linux in CI.

### Exit criteria

- Tests reproduce the resume regression.
- Tests reproduce false completion before process exit.
- Tests reproduce hidden launch errors.
- Tests prove `status` and `list` currently change persisted state.
- No live Luna worker is needed for these tests.

## Batch 2 — Resume and authority safety

### Work

- Apply the recovered work-laptop fix:
  - pass the stored sandbox through `-c sandbox_mode="<mode>"` during resume;
  - launch Codex with `cwd: task.cwd`.
- Always store and report the effective cwd, sandbox, effort, and bypass state.
- Resume inherits the previous turn's cwd and authority unless the host explicitly provides a permitted override.
- Reject contradictory authority flags such as read-only plus bypass.
- Never allow resume to become more permissive silently.
- Reject a second active resume of the same worker/session.
- Preserve backward reading of existing worker records.

### Exit criteria

- A read-only worker resumed from another caller directory still runs in its original cwd and cannot write.
- A workspace-write worker resumes in the same cwd and mode.
- Contradictory or silent authority escalation fails with a clear error.
- Existing records remain inspectable.

## Batch 3 — Truthful lifecycle and cancellation

### State ownership

- The detached runner owns normal transitions:
  - `starting → running → completed|failed`.
- The parent command writes the initial record and returns after the runner is created.
- The runner writes `running` only after Codex launches successfully.
- The runner writes a terminal record after the Codex process actually exits.
- `turn.completed` means the model turn ended; it does not mean the process exited.
- Exit code and signal are persisted.

### State safety

- Add a small per-worker lock around state transitions.
- Keep terminal transitions monotonic; a stale writer cannot restore `running`.
- Use atomic replacement for the manifest.
- Give each resume turn its own internal turn ID while preserving the stable worker ID used by the host agent.
- Store timestamps for created, started, last event, exit, and terminal transition.

### Cancellation

- Record `cancelRequestedAt`.
- Verify that the stored PID still belongs to the expected Luna-sidecar runner before killing it.
- Wait for the process tree to terminate.
- Record `cancelled` only after verified termination.
- If termination fails, return an explicit cancellation failure and retain truthful observed state.
- A historical successful cancellation is a positive example, not proof that unchecked cancellation is safe.

### Exit criteria

- A lingering process after `turn.completed` remains `running`.
- Zero exit produces `completed`; nonzero/spawn failure produces `failed`.
- Cancellation cannot report success while the process remains alive.
- Concurrent completion/cancellation cannot resurrect an earlier state.
- PID mismatch never kills the unrelated process.
- Resume uses one stable worker ID with distinct turn lineage.

## Batch 4 — Read-only observation and bounded logs

### Work

- Parse Codex JSONL incrementally inside the runner.
- Persist the latest useful progress, session ID, final message, provider errors, usage, and child events in the small manifest/receipt.
- Make `status`, `list`, and `wait` read the manifest rather than reparsing complete logs.
- Make `status` and `list` filesystem-read-only.
- `wait` may wait, but must not rewrite state or reread an entire growing log every 250 ms.
- Surface stderr/launch failure summaries through normal JSON instead of returning only `finalMessage: null`.
- Preserve raw logs for debugging, but prune terminal raw logs with simple fixed defaults after tests establish safe limits.
- Keep compact receipts after raw-log cleanup.
- Do not add a database or background cleanup service.

### Result receipt

Return one machine-readable truth containing:

- stable worker ID and current turn ID;
- execution state and terminal reason;
- session and parent lineage;
- effective cwd, sandbox, effort, and bypass;
- process exit code/signal;
- final agent message;
- provider/transport/launch warnings;
- observable native-child summary;
- usage and duration when available;
- explicit uncertainty when task success or evidence coverage cannot be verified.

Do not turn process completion into a claim that the task succeeded.

### Exit criteria

- Repeated `status/list/wait` calls do not change manifest hashes or timestamps.
- Polling cost is independent of total raw-log size.
- Trust-directory rejection is visible in the normal result.
- A completed worker with missing evidence is reported honestly.
- Raw storage is bounded without deleting the compact receipt.

## Batch 5 — Minimal delegation and workspace safeguards

### Recursion

- Mark the environment of a Luna-sidecar worker with its stable worker/lineage identity.
- Reject `start`, `run`, or `resume` when invoked recursively from inside a Luna-sidecar worker.
- Native Codex subagents remain allowed.
- Do not expose depth/fan-out configuration to the human.

### Concurrent writers

- Canonicalize cwd.
- Allow parallel read-only workers.
- Before starting a writing worker, detect another verified active sidecar writer in the same cwd.
- Return a clear conflict asking the host agent to use a separate cwd/worktree or an explicit shared-write override.
- Do not create worktrees or lock individual files.

### Resource pressure

- First remove zombie processes and whole-log polling—the two demonstrated amplification mechanisms.
- Add only a visible active-worker warning in the first pass.
- Do not add adaptive RAM/CPU scheduling or a hard concurrency policy until post-fix dogfood shows it is needed.

### Exit criteria

- The 224,072-token recursive pattern is blocked before another sidecar process starts.
- Multiple read-only workers can share a checkout.
- A second writing worker in the same checkout receives a clear, actionable conflict.
- No daemon, queue, or worktree manager exists.

## Batch 6 — Agent-mediated UX

### Work

- Update `SKILL.md` so its description and body say it is used only after the human mentions “Luna subagent,” “Luna sidecar,” or “sidecar.”
- Lead with natural-language examples for the human.
- Teach the host agent to:
  - choose explicit authority from task intent;
  - capture worker IDs internally;
  - continue its own work;
  - harvest Luna results before finishing when practical;
  - resume the intended stable worker;
  - report partial/failed/uncertain outcomes;
  - avoid exposing commands and IDs unless debugging.
- Keep direct commands in an agent/debugging reference section.
- Add working `--help`.
- Add `stop` as a harmless alias for `cancel`.
- Preserve an explicitly requested effort; never silently change high to max.
- Keep use-case guidance in examples, not runtime modes.

### Exit criteria

- A natural-language explicit Luna request routes correctly from the skill.
- Generic research/parallel-work wording alone does not authorize Luna.
- A host agent can start, wait, resume, cancel, and summarize without human CLI use.
- Help and command errors are actionable.

## Batch 7 — Dogfood and release

### Deterministic verification first

Run the full fake-runtime suite on Windows and Linux.

Required scenarios:

1. fresh read-only success;
2. fresh workspace-write success in a temporary git repository;
3. resume preserves cwd/read-only;
4. nonzero exit and launch failure;
5. `turn.completed` followed by a delayed process exit;
6. verified cancellation;
7. concurrent cancel/completion race;
8. duplicate resume rejection;
9. recursive sidecar rejection;
10. parallel readers;
11. same-cwd writer conflict;
12. large-log polling benchmark;
13. old-record compatibility;
14. retention cleanup.

### Live dogfood second

Only after deterministic tests pass:

- install from the current verified `main` commit through the normal Agent Skills path;
- run one read-only Luna worker;
- resume it with a write attempt and verify blocking/cwd;
- cancel one intentionally slow worker and verify the complete process tree is gone;
- run multiple parallel read-only workers;
- run one Luna-max worker that uses native subagents;
- verify no recursive sidecar worker appears;
- measure process count, working set, log growth, wait/status cost, and cleanup;
- do not use bypass.

### Documentation and release

- Preserve the audit response as historical evidence and keep its W044/W045 boundary violation explicit.
- Keep 43 as the historical work-laptop count; separate audit-created probes.
- Update README and skill instructions to match verified behavior.
- Record test commands, versions, results, and known limitations.
- Keep implementation commits small, coherent, and direct on `main`.
- Update installed copies with the normal `npx skills` flow; never patch installed files manually again.
- Add a concise linked synthesis to IdeaSpine after canonical release truth exists.

## Definition of done

The work is done only when:

- resume preserves cwd and authority on a supported current Codex CLI;
- the runner records every terminal state and exit result;
- `completed` proves process exit, not merely a provider event;
- cancellation proves termination;
- status/list are read-only and do not parse whole logs;
- stale and failed launches are visible;
- recursive sidecar invocation is blocked;
- native Luna subagents still work;
- parallel readers and separated writers work;
- results expose errors, lineage, usage, and uncertainty;
- raw logs are bounded;
- the skill remains installable through `npx skills add`;
- Windows and Linux deterministic tests pass;
- live dogfood leaves no orphan processes or stray files;
- `main` remains the single canonical branch, with no planning or evidence branches.

## Commit sequence

Use small commits directly on `main`:

1. `test: add Luna-sidecar regression harness`
2. `fix: preserve resume cwd and authority`
3. `fix: make worker lifecycle and cancellation truthful`
4. `perf: make observation incremental and bound logs`
5. `feat: add minimal recursion and writer safeguards`
6. `docs: align agent-mediated Luna UX`
7. `test: add verified Luna dogfood evidence`

Do not begin implementation from an installed skill copy. Change canonical repository source and validate the installed artifact from that source.

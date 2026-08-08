# Harness engineering research

**Researched:** 2026-08-08

**Scope:** Implementation techniques for the four roadmap phases.
**Authority:** Advisory. `SPEC.md` owns product decisions; local source and deterministic tests own implementation truth.

## Bottom line

Luna Sidecar needs a deterministic process harness and a truthful state machine, not a bigger orchestration system. The smallest sound design is still a detached Node runner with local per-worker files, but the runner—not observer commands—must own provider lifecycle, JSONL parsing, cancellation, and terminal persistence.

The test suite must prove the wrapper with a fake executable before any live Luna run. Live model behavior is too expensive and nondeterministic to be a release gate by itself.

## Standard stack

- Node.js built-ins only at runtime: `node:child_process`, `node:fs`, `node:path`, `node:crypto`, `node:os`, `node:stream`, and `node:test`.
- Private repository test package; no second runtime package.
- Supported test baseline: Node 22.20+ on Windows and Ubuntu. The launcher should avoid unnecessary host-specific assumptions beyond its documented OS adapters.
- `skills@1.5.22`, pinned as a dev/install-verification dependency or exact command version. Its current engine requires Node 22.20+.
- Existing Agent Skills repository layout: required `SKILL.md`, bundled `scripts/`, and one optional `references/USAGE.md` for progressive disclosure.

## Architecture patterns

### 1. Black-box fake provider

Exercise the actual CLI entrypoint as a subprocess. Put a temporary npm-style `codex.cmd` (Windows) or executable `codex` shim (POSIX) first on the test process `PATH`, so the production launch path is exercised without a product seam. The fake behind that shim must:

- record exact argv, raw stdin, cwd, selected non-secret environment values, PID, and descendant PID;
- emit stdout/stderr in scripted byte chunks and delays;
- support exit 0/nonzero, spawn failure, no provider terminal event, `turn.completed` then linger, cancellation, and a grandchild;
- split JSON and UTF-8 at arbitrary boundaries;
- use deterministic fixture files and explicit signals instead of sleeps as assertions.

Keep parser/state unit tests process-free, but retain one subprocess contract suite so quoting, stdin, detached launch, and tree cancellation are real. If PATH isolation cannot exercise a supported platform, stop and justify the smallest injectable seam instead of adding one pre-emptively.

### 2. Runner-owned lifecycle

The parent writes `starting`, waits for the detached runner's Node `spawn`/`error`, then returns. The runner installs all listeners before writing stdin, records provider spawn, streams output, and persists one guarded terminal transition after `close`.

Node's documented distinctions are load-bearing:

- `spawn` means the child process was created, not that Codex is application-ready.
- `error` may be followed by `exit`; completion handlers must be guarded once.
- `exit` can precede stdio closure.
- `close` follows process termination and stream closure.

Therefore `thread.started`, `turn.completed`, process `close`, and task success are different facts.

### 3. Incremental JSONL adapter

Pipe provider stdout through the runner. Append raw bytes up to the cap while feeding a decoder that retains an incomplete tail. Only complete lines are parsed. Record:

- `thread.started` -> session ID/provider running;
- `turn.completed` -> provider completed, but not process terminal;
- `turn.failed` or top-level `error` -> provider failed;
- latest `agent_message` -> final-message candidate;
- unknown/malformed/nonfatal item errors -> warnings, never silent deletion.

Codex JSONL is an external adapter boundary, not a versioned sidecar schema. Preserve unknown events in raw logs while keeping compact known facts in the manifest.

### 4. Additive worker record

Keep one manifest per stable worker and compact turn summaries inside it. Retain existing top-level output names; add `schemaVersion`, `revision`, turn/process/provider fields, warnings, and log metadata. Normalize legacy records in memory. Reads never migrate; a mutating command can upgrade under the worker lock.

Use same-directory temp-file replacement for atomic visibility. Do not claim power-loss durability. Serialize short mutations with exclusive creation plus a revision check; no shared index or daemon is needed.

### 5. Exact Codex adapter contract

The local Codex CLI is `0.147.0`. Its `exec resume --help` exposes `--config`, `--model`, bypass, JSONL, and stdin prompt support but no resume-specific `--sandbox` or `-C`. Current official config source names the supported key `sandbox_mode`. Therefore initial turns keep `--sandbox <mode>` and `-C <cwd>`, while resumes pass one argv value `sandbox_mode="<mode>"` through `-c` and set the spawned child's cwd. The fake must capture the complete argv array and cwd for both forms. Treat this as a versioned provider adapter: record the tested version and stop if a later CLI rejects it.

### 6. Honest process control

- The controller writes a cancellation request; it does not signal a stale recorded PID.
- The live runner owns the current child handle.
- POSIX launches a separate process group and terminates/verifies that group, with bounded TERM then KILL escalation.
- Windows uses `taskkill /T /F` only against the runner's current child and verifies the supported tree is gone.
- If the runner is missing, identity is stale, a child broke away, or cleanup cannot be checked, return state `unknown` with error code `cancel_failed`; do not say `cancelled`.

Windows Job Objects and Linux pidfds are stronger primitives, but adding a native helper is not justified for the bounded v1 contract. Revisit only if deterministic normal-tree tests fail.

### 7. Agent Skills as the portability layer

Keep `SKILL.md` short. Put detailed examples and result-harvesting guidance one reference hop away. Installation and host placement belong to the existing `skills` CLI. Prove copied artifact parity for Codex and Claude Code; do not add adapters that duplicate the standard.

## Don't hand-roll

- Do not implement a daemon, queue, scheduler, database, event store, dashboard, or heartbeat fleet.
- Do not build a generic subagent API; Luna uses native Codex subagents.
- Do not build a host adapter or installer; Agent Skills plus the CLI/JSON contract is the boundary.
- Do not parse logs in `status/list/wait`; materialize compact facts while the runner already sees the stream.
- Do not infer task success from model prose or `turn.completed`.
- Do not use PID existence, image name, or command line as proof of process identity.
- Do not add power-loss fsync machinery for local ephemeral worker metadata.
- Do not enforce same-cwd file scheduling. Warn and let the host allocate work.
- Do not gate releases on live Luna text, latency, authentication, quota, or network behavior.

## Common pitfalls and required tests

| Pitfall | Required deterministic scenario |
|---|---|
| Parent reports running before provider launch | Missing executable and immediate spawn failure never produce `running`. |
| Provider event treated as process exit | Emit `turn.completed`, keep process/grandchild alive, and assert state remains `running`. |
| Error/exit double handling | Trigger spawn error and exit races; one monotonic terminal write occurs. |
| Lost resume authority | Resume from a different caller cwd and assert recorded cwd/sandbox/effort/bypass at the fake provider. |
| Unknown lineage guessed forward | Crash a runner, assert `wait` returns unknown, resume fails, and a separate start gets a new worker ID. |
| Duplicate active resume | Launch two resumes concurrently; exactly one turn starts. |
| Stale writer resurrects terminal state | Pause one writer across a newer revision and assert its commit fails. |
| PID reuse/wrong kill | Present stale runner metadata and assert cancellation refuses to signal. |
| Child survives cancellation | Fake provider spawns a grandchild; normal supported tree/group is verified absent. |
| Whole-log polling | Compare observation reads against tiny and 32 MiB fixtures; bytes read stay bounded. |
| Partial JSON loss | Split every boundary including multibyte UTF-8, CRLF, and no final newline. |
| Nonfatal stream warning becomes failure | Emit `item.type="error"` plus successful provider/process completion; preserve warning without false failure. |
| Observer mutation | Hash and timestamp every state file before/after repeated status/list/wait calls. |
| Recursive sidecar amplification | Set the runner marker and invoke start/run/resume; reject before a process starts; native-subagent fixture still succeeds. |
| Secret copied into compact state | Put distinct sentinels in env, prompt, stderr, and an unknown event; none may appear in manifests or manager output. |
| Retention destroys evidence | Exceed caps; active logs and manifests remain, old terminal raw logs prune, receipt says truncated/pruned. |
| Source/install drift | Install copied assets into temporary Codex/Claude targets and compare all hashes before running installed tests. |

## Luna-max research wave: useful evidence and warning

The persisted cross-machine inputs are [`docs/audits/2026-08-08-work-laptop-evidence-handoff.md`](../../docs/audits/2026-08-08-work-laptop-evidence-handoff.md) and [`docs/audits/2026-08-08-work-laptop-evidence-response.md`](../../docs/audits/2026-08-08-work-laptop-evidence-response.md).

Three read-only Luna-max parents were asked to use exactly two native Codex subagents each. Six child reviews were requested; five returned usable bounded reports and one was closed without a usable report. The three parent turns reported approximately 11.6 million aggregate input tokens, mostly cached, and 46 thousand output tokens.

All three parents emitted `turn.completed`, and an independent OS query found their process trees gone, but all three sidecar manifests still said `running`. That directly confirms the need to separate provider events, process state, and persisted sidecar state.

Their JSONL exposed a successful native child as outer `type: "item.completed"` with `item.type: "collab_tool_call"`, `item.tool: "spawn_agent"`, `item.status: "completed"`, and a nonempty `item.receiver_thread_ids`. It exposed a completed shell attempt as `item.type: "command_execution"` with command, status, and exit code. Release dogfood can version-pin and count those exact predicates without treating parent prose as proof; schema mismatch blocks the claim, and only redacted counts/hashes belong in compact release evidence.

The workers' local shell access repeatedly failed with `helper_sandbox_lock_failed` (Windows error 1340), so they fell back to public-web inspection. Their final reports cited inconsistent supposed `main` commits and disagreed about which files were public. An independent `git ls-remote` and local checkout check confirmed canonical `main` at `5dbbc5402dd221166521ebc70b6960a09c5cb9df`. Consequently:

- their OS/Node/testing recommendations were retained only where primary sources or local source confirmed them;
- their repository-state claims were discarded;
- raw worker output is not copied into the planning packet;
- Luna-max/native-subagent dogfood remains useful integration evidence but is too costly and unreliable to be the default planning or release mechanism.

## Primary sources

- [Node.js child process lifecycle](https://nodejs.org/api/child_process.html)
- [Node.js filesystem APIs and flags](https://nodejs.org/api/fs.html)
- [Microsoft `taskkill`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)
- [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [Linux `kill(2)` process-group semantics](https://man7.org/linux/man-pages/man2/kill.2.html)
- [OpenAI Codex non-interactive CLI source](https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs)
- [OpenAI Codex configuration source](https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs)
- [OpenAI Codex non-interactive mode](https://developers.openai.com/codex/non-interactive-mode)
- [Agent Skills specification](https://agentskills.io/specification)
- [Agent Skills CLI](https://www.skills.sh/docs/cli)
- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [`skills` 1.5.22 package metadata](https://registry.npmjs.org/skills/1.5.22)

## Research closure

The v1 implementation approach is resolved under the explicit limits in `SPEC.md`: local filesystems, process-crash safety, no native dependency, honest best-effort cleanup outside the supported tree, and deterministic verification first. If Phase 2 cannot meet that bounded contract, execution stops and revises the contract instead of quietly adding platform machinery.

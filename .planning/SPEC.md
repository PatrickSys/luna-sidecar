# Luna Sidecar reliability contract

**Status:** V1 verified; Phase 5 final-shape amendment locked for implementation

**Planning baseline:** `main` at `fef0a699bd78463244d5377fd6e6ced269bfa490`

**Canonical source:** `PatrickSys/luna-sidecar`
**Delivery policy:** Small verified commits may go directly to `main`; never force-push and never overwrite unexpected remote movement.

## Phase 5 final-shape amendment

This amendment is the implementation target for Phase 5. The verified v1 contract remains below as historical evidence. Where this amendment conflicts with the v1 command or option surface, this amendment controls the next implementation; it does not claim that the current launcher already supports the new surface.

### Product boundary

Luna Sidecar is a thin adapter for one ordinary Luna subagent. The human talks to a coding agent; that host explicitly starts, observes, resumes, cancels, and evaluates Luna workers. Luna Sidecar owns reliable background process lifecycle and compact evidence. It does not own task decomposition, worker scheduling, file allocation, native-subagent policy, MCP configuration, or semantic task evaluation.

```text
human -> host coding agent -> Agent Skill -> Luna Sidecar -> Codex CLI/Luna -> optional native Codex subagents
```

The host may start more than one independent worker. Same-worktree coordination remains host-agent work: use disjoint write scopes when they are obvious and separate worktrees when overlap is possible. Do not add path ownership, locks, or scheduling to Luna Sidecar.

### Final agent-facing contract

- Public lifecycle commands are exactly `start`, `status`, `wait`, `resume`, `cancel`, and `list`. Remove `run`, the `stop` alias, and compatibility aliases for authority flags.
- Every `start` explicitly supplies an absolute `--cwd`, `--sandbox read-only|workspace-write|full-access`, and `--effort low|medium|high|xhigh|max`. There is no hidden initial authority or effort default.
- The skill normally chooses `high`; chooses `max` for research, review, adversarial analysis, or unusually difficult reasoning; and chooses `medium` for narrow bounded execution. Other supported effort values remain available only when the host selects them deliberately.
- The host maps its current effective authority to `--sandbox`. Existing host full access is sufficient authority to select `full-access`; Luna Sidecar does not ask the human to re-authorize an already-authorized host mode. If the host cannot establish its mode, it selects `workspace-write` and reports that conservative choice.
- An explicit `--cwd` authorizes the target location for Codex's Git-repository admission check, so the provider invocation skips that check. This never disables the selected sandbox or broadens filesystem authority.
- Resume inherits the worker's stored cwd, sandbox, effort, and provider session unless the host supplies a visible explicit override. No omission broadens authority.
- `start` performs one bounded readiness check under the exact cwd and sandbox before it reports the worker usable. A readiness failure returns a typed error, launches no expensive/fan-out work, and leaves no owned process alive. The normal human workflow has no separate `doctor` command.
- Retries are zero by default. A provider-only single retry may be enabled later only for an exact source-observed transient child-spawn error code that is fixture-proven before any provider process, event, stdout, or stdin activity. The runner never retries; unknown/generic, `ENOENT`, authentication, configuration, sandbox, and task failures never retry.
- Provider MCP configuration is inherited normally. Luna Sidecar has no MCP option, allowlist, discovery layer, isolated config home, or authentication manager. Nonfatal MCP startup failures collapse into one compact warning; a provider-fatal startup failure fails readiness.
- Every command emits one compact structured JSON value to stdout. Raw logs remain referenced by path rather than replayed into host context.
- Receipts expose lifecycle truth separately from task meaning. Luna Sidecar never decides that the delegated task succeeded from free-form model text; the host evaluates the final message and evidence.
- Receipts include provider-reported input, cached-input, and output usage when available and the explicit value `unavailable` otherwise. Do not estimate prices, invent missing usage, or build budgets/accounting.
- `list` defaults to every active worker plus the 20 newest terminal records, with active records first and each active/terminal bucket ordered newest-first deterministically. Active means the existing nonterminal lifecycle states `starting`, `running`, and `cancelling`; no new state machinery is introduced. `list --all` returns every retained record newest-first. Active evidence and compact receipts are retained; oldest terminal raw logs remain bounded by the existing disk cap.
- The skill manages worker IDs and lifecycle steps for the human, but every launch, retry, wait, resume, and cancel remains an explicit host action visible in the task. No hidden worker creation or permission change is allowed.

### Phase 5 requirements

| ID | Requirement | Done when |
|---|---|---|
| SIMPLE-01 | Minimal public surface | Help, parser tests, skill guidance, and installed assets expose only `start`, `status`, `wait`, `resume`, `cancel`, and `list`; removed commands and aliases fail with an actionable structured error. |
| EXPLICIT-01 | Explicit initial controls | `start` rejects omitted cwd, sandbox, or effort; valid values reach the provider exactly; resume inheritance and explicit overrides remain truthful. |
| TRUST-01 | Explicit-cwd admission | Every accepted start validates the cwd and skips only Codex's Git-repository check; deterministic tests prove sandbox flags are unchanged and invalid/unreachable paths fail before provider task launch. |
| READY-01 | Bounded readiness | `start` reports usable only after a bounded provider-side capability check under the selected cwd/sandbox; timeout, trust, sandbox, authentication, and provider-start failures are typed and leave no owned process alive. |
| RETRY-01 | Narrow recovery | Retries are zero by default; only a later exact source-observed transient child-spawn code, fixture-proven before provider process/event/stdout/stdin activity, may enable one provider-only retry. The runner and all unknown/generic, `ENOENT`, authentication, configuration, sandbox, and task failures perform zero retries, with decisions visible in the receipt. |
| MCP-01 | Provider-owned MCP | The launcher neither discovers nor rewrites MCP configuration; repeated nonfatal startup errors become one bounded warning, while fatal initialization evidence fails readiness. |
| USAGE-01 | Honest usage passthrough | Receipts aggregate only provider-emitted input/cached-input/output usage and otherwise report `unavailable`; tests prevent double-counting reasoning fields or inventing prices. |
| FINAL-UX-01 | Subagent-like host workflow | The skill teaches explicit, visible lifecycle control, effort selection, one-worker-first failure containment, result evaluation, and bounded history without modes, schedulers, or human-facing CLI work. |
| FINAL-RELEASE-01 | Claim-matched proof | Deterministic Windows/Linux tests, copied Agent Skill parity, and successful real host observations from both Codex CLI and Claude Code support only the final documented claim and leave no owned process behind. Missing, unavailable, timeout, schema-drift, or uncertain-cleanup evidence may leave the implementation present but keeps FINAL-RELEASE-01 false and blocks release closure. |

### Explicit non-goals for Phase 5

Do not add an MCP manager, provider adapter registry, daemon, queue, scheduler, concurrency budget, path-ownership system, automatic worktrees, task modes, semantic result judge, cost engine, or global configuration mutation. Do not rewrite the historical audits or `.planning/V1-VERIFICATION.md`.

## V1 verified baseline (preserved)

### What v1 built

Luna Sidecar is a small Agent Skill that lets a coding agent start and manage one or more real Luna background workers while the human keeps talking naturally to the host agent.

```text
human -> coding agent -> Agent Skill -> luna-sidecar CLI -> Codex CLI/Luna -> native Codex subagents
```

The human-facing UX is conversation. The CLI and its JSON are an agent-facing protocol and a debugging surface. The current backend is Codex CLI with `gpt-5.6-luna`; the skill boundary remains host-neutral.

### V1 fixed product decisions

- Activate only when the human explicitly mentions **“Luna subagent,” “Luna sidecar,” or “sidecar.”** Never invoke it silently because a task merely looks delegable.
- The host agent owns worker IDs, starting, waiting, resuming, cancelling, and reporting. A human should not need to run manager commands.
- Install through the existing Agent Skills flow. Do not add host adapters, an installer, or a synchronization layer.
- Support multiple independent top-level workers.
- Luna may spawn native Codex subagents. Do not reimplement native subagent orchestration.
- Do not encode research, audit, adversarial, planning, or execution as runtime modes. Teach prompting patterns in skill guidance.
- Preserve cwd, effort, and authority on resume unless the host supplies an explicit override. Never broaden authority by omission.
- Keep the current public commands: `start`, `run`, `status`, `wait`, `resume`, `cancel`, and `list`. Add only `--help` and `stop` as an alias for `cancel`.
- Same-cwd writing workers produce a clear warning; they are not blocked. File/worktree ownership remains the host agent's responsibility.
- Repair the existing Node launcher. Do not turn it into an orchestration platform.

### V1 requirements

Each requirement has one acceptance statement. The roadmap and phase plans reference these IDs instead of rewriting their meaning.

| ID | Requirement | Done when |
|---|---|---|
| HARNESS-01 | Deterministic provider harness | A fake Codex executable records argv, stdin, cwd, selected non-secret env, process IDs, output chunks, and exit behavior; the suite runs without a model, credentials, network, or user state. |
| COMPAT-01 | Additive protocol evolution | Existing commands and top-level JSON fields remain available; unversioned worker records are readable without mutation and upgrade only during an explicit mutating command. |
| AUTH-01 | Authority fidelity | Start and resume pass the selected cwd, effort, sandbox, and bypass exactly; omitted resume options inherit; contradictory options fail; silent escalation is impossible. |
| LINEAGE-01 | Stable worker identity | Resume keeps one host-facing worker ID, creates a unique turn ID, records compact turn history, and rejects a second active turn for the same worker. |
| LIFE-01 | Truthful lifecycle | `running` requires provider OS spawn; `completed` requires provider `close`, exit code 0, and a provider completion event; provider events, process exit, and task outcome remain separate facts. |
| CANCEL-01 | Honest cancellation | An active runner owns cancellation, the normal process tree/group is checked after termination, and `cancelled` is never reported when termination or identity is uncertain. |
| CONCURRENCY-01 | Monotonic state | Same-worker mutations are serialized, revisions prevent stale overwrites, terminal states cannot be resurrected, and invalid IDs cannot escape the state root. |
| OBSERVE-01 | Pure bounded observation | `status`, `list`, and `wait` never write files or parse complete raw logs; they may perform bounded read-only process-liveness checks, and polling cost depends on compact records rather than transcript size. |
| RECEIPT-01 | Traceable result | Manager output includes schema version, worker/turn lineage, authority, execution state, provider state, exit/signal/error, warnings, log metadata, and final message without inferring task success. |
| RESOURCE-01 | Bounded local evidence | JSONL is parsed incrementally across partial/malformed lines; each turn and total terminal logs have fixed bounds; pruning never deletes active logs or compact receipts. |
| SAFETY-01 | Delegation safeguards | Recursive sidecar execution from a Luna worker is rejected while native Codex subagents still work; concurrent same-cwd writers are warned; compact receipts never copy prompt bodies, process environments, argv, raw stderr, or raw event payloads. |
| UX-01 | Low-friction agent use | The skill tells hosts exactly when to invoke, how to select effort/authority, how to run several workers, how to harvest results, and how to surface uncertainty; CLI help and errors are actionable. |
| PORTABLE-01 | Host-neutral delivery | A local Agent Skills install for Codex and Claude Code contains byte-identical skill assets and works through the same script with no host-specific runtime code. |
| RELEASE-01 | Evidence-gated release | Windows and Linux deterministic matrices pass before bounded scratch dogfood; source/install hashes, versions, commands, process checks, and unresolved gaps are recorded before any release claim. |

## Agent-facing protocol

### Authority

- Initial default remains `workspace-write` for compatibility.
- `--read-only` selects read-only. `--bypass` selects unsandboxed execution and is valid only when the human explicitly requested it through the host.
- `--read-only` and `--bypass` together are invalid.
- Resume inherits stored `cwd`, `effort`, `sandbox`, and `bypass` when omitted.
- An explicit resume option may narrow or broaden authority, but the skill must tell the host that broadening requires explicit human intent. The CLI must never broaden because a flag or cwd was dropped.
- Initial non-bypass turns use argv `codex exec --json --model gpt-5.6-luna -c model_reasoning_effort=<effort> --sandbox <read-only|workspace-write> -C <cwd> -` and spawn the child with `cwd: <cwd>`.
- Resumed non-bypass turns use argv `codex exec resume --json --model gpt-5.6-luna -c model_reasoning_effort=<effort> -c sandbox_mode=\"<read-only|workspace-write>\" <sessionId> -` and spawn the child with `cwd: <cwd>`. The quotes are part of the single config-override argv value, not shell quoting.
- Bypass forms replace the sandbox selector/config override with exactly one `--dangerously-bypass-approvals-and-sandbox`; they still set child cwd. If the installed Codex version no longer accepts these forms, stop and revise the provider contract instead of guessing.

### Worker and turn identity

- A UUID `workerId` is stable for the worker conversation.
- Every initial run and resume gets a UUID `turnId`.
- One worker manifest owns a compact ordered turn array. Raw stdout/stderr paths are per turn.
- `status <workerId>` returns the latest turn plus compact turn history. `list` returns latest-turn summaries only.
- Legacy manifests have no eager migration. A mutating command may atomically upgrade the requested legacy record in place while retaining its host-facing ID.

### State meanings

Top-level `state` is the sidecar's combined operational result, not proof that the delegated task achieved its goal:

- `starting`: the runner record exists, but provider spawn is not confirmed.
- `running`: the provider process spawned and has not closed.
- `cancelling`: a cancel request is accepted and termination is being checked.
- `completed`: the process closed with exit code 0 and the provider emitted `turn.completed`.
- `failed`: launch failed, the process closed nonzero, or the provider emitted a top-level fatal/`turn.failed` event.
- `cancelled`: cancellation was requested and the supported process tree/group was verified gone.
- `unknown`: execution ended or became unreachable without enough evidence for another terminal state. This is terminal for `wait`, never success, and blocks resume with `worker_unknown`; v1 keeps the record for inspection and tells the host to use `start` for a new worker rather than guessing, force-clearing, or adding a resolve command.

`providerState` is one of `not_started`, `running`, `completed`, `failed`, or `unknown`. A nonfatal `item.type="error"` is a warning unless the process or top-level provider outcome also fails. `taskOutcome` is `not_evaluated` in v1: the host evaluates the final message against the requested task.

### Receipt shape

Manager commands retain current top-level fields and add fields rather than silently renaming them:

```json
{
  "schemaVersion": 2,
  "workerId": "uuid",
  "turnId": "uuid",
  "turnCount": 1,
  "state": "running",
  "providerState": "running",
  "taskOutcome": "not_evaluated",
  "sessionId": "codex-thread-id-or-null",
  "parentWorkerId": null,
  "pid": 1234,
  "runnerPid": 1234,
  "providerPid": 5678,
  "cwd": "absolute-path",
  "effort": "max",
  "sandbox": "read-only",
  "bypass": false,
  "exitCode": null,
  "signal": null,
  "errorCode": null,
  "error": null,
  "warnings": [],
  "createdAt": "ISO-8601",
  "startedAt": "ISO-8601-or-null",
  "completedAt": null,
  "finalMessage": null,
  "logs": {
    "stdoutPath": "absolute-path",
    "stderrPath": "absolute-path",
    "stdoutBytes": 0,
    "stderrBytes": 0,
    "truncated": false
  },
  "cancel": null
}
```

`start`, `resume`, `cancel`/`stop`, `status`, `wait`, and `list` write exactly one JSON value to stdout. A parsed manager failure writes `{ "schemaVersion": 2, "ok": false, "command": "...", "workerId": null, "error": { "code": "...", "message": "..." } }`; diagnostics may also go to stderr. Missing/malformed options, malformed UUIDs, and unknown worker IDs exit 2. A mutation that has a valid target but cannot complete exits 1. Successful mutations and queries exit 0; `wait` timeout is a successful query with `timedOut: true`, while an `unknown` worker returns immediately with `timedOut: false`. `--help` is plain text on stdout and exits 0. Foreground `run` is deliberately outside the manager JSON protocol: it passes provider stdout/stderr through and returns the provider/launch result.

`wait` preserves current timeout-zero compatibility:

| Input | Behavior |
|---|---|
| omitted `--timeout` | Wait without a deadline. |
| `--timeout 0` | Wait without a deadline; zero does not mean an immediate timeout. |
| `--timeout N`, `N > 0` | Read immediately, then poll compact state every 250 ms (clamped to remaining time) against a monotonic deadline. A terminal state observed on the deadline wins over timeout; otherwise return the latest receipt with `timedOut: true`. |

All forms are read-only. Terminal states, including projected or persisted `unknown`, return immediately with `timedOut: false`.

## Reliability boundaries

- v1 guarantees process-crash-safe atomic visibility on private, owner-controlled, hard-link-capable local filesystems. It does not claim hostile shared-directory protection, power-loss durability, or support for SMB/NFS/sync-backed state roots; a filesystem that cannot publish a same-directory hard link fails closed instead of using a weaker lock protocol.
- Worker and retention locks are fully written and closed at a unique sibling path before an atomic no-clobber hard link publishes the canonical lock. Only canonical `EEXIST` means contention; other publication errors fail closed, and staging cleanup cannot bypass token-checked canonical release. Use a short per-worker lock plus a manifest revision for mutating read-modify-write sections. Readers do not lock or write. A structurally valid lock whose recorded owner PID is definitely dead may be recovered immediately; live or uncertain owners remain fail-closed, and externally malformed/incomplete locks retain the 30-second stale grace. Recovery uses an atomic stale rename and must still re-check the manifest revision before committing.
- Normal paths remove their sub-kilobyte `.publish-*` staging name before entering the protected callback. A process crash may leave an inert staging orphan, but staging names never block acquisition or count as worker state; remove them only during maintenance when no sidecar process is active.
- The parent records `starting`, waits only for the detached runner's Node `spawn`/`error`, and returns the worker ID without a post-spawn manifest rewrite. The runner records its own PID before provider launch and alone owns later lifecycle transitions.
- The parent publishes `<turnId>.prompt` by same-directory temp rename and records its SHA-256 in the initial turn. Under the worker lock, the runner renames it to `<turnId>.prompt.claimed` and records `promptClaimedAt` before reading; after the stdin callback it records `stdinAcceptedAt` and removes the claimed file. A crash after claim never auto-replays the prompt.
- The runner consumes stdout/stderr, parses JSONL incrementally, and waits for `close`. `turn.completed` alone never changes the worker to terminal.
- Cancellation uses one atomically renamed request at `<stateRoot>/requests/<turnId>.cancel.json`: `{ "schemaVersion": 1, "requestId": "uuid", "workerId": "uuid", "turnId": "uuid", "baseRevision": 7, "requestedAt": "ISO-8601" }`. While holding the worker lock, the controller validates the latest active turn, publishes that request, and records `state: "cancelling"` plus `cancel: { requestId, requestedAt, acknowledgedAt: null, finishedAt: null, result: "requested", errorCode: null }`. The runner polls every 250 ms, validates request/worker/turn under the same lock, records acknowledgement before signalling, and alone signals its current child handle.
- A second cancel while `cancelling` waits on the existing request; a terminal worker is returned unchanged with warning `already_terminal`. If completion wins before acknowledgement, preserve that terminal result and record `cancel.result: "not_applied"`. If the runner is definitely absent, the controller may revision-guard a transition to `unknown`/`cancel_failed` without signalling. If the runner remains alive but no result arrives within 10 seconds, leave `cancelling` and return exit 1 with `cancel_timeout`; a later runner result may still finish the transition.
- A request received while `starting` is checked by the runner before provider spawn. If no provider child exists, the runner acknowledges it, persists `cancelled` with `result: "cancelled"` and exit 0, and never launches Codex. Runner launch failure wins as `failed`/`not_applied`; an absent stale runner becomes `unknown`/`cancel_failed`. After any persisted terminal cancel result, remove the request best-effort; cleanup failure adds `cancel_request_cleanup_failed` without changing the truthful terminal state.
- On POSIX the runner terminates the launched process group with `SIGTERM`, waits 3 seconds, escalates to `SIGKILL`, and verifies the group is absent. On Windows it runs `taskkill /PID <current-child> /T /F`, requires exit 0, waits for provider `close`, and verifies the provider root is absent; deterministic fixtures and release dogfood independently check recorded descendants. Only then does it persist `cancelled`, `cancel.result: "cancelled"`, and `finishedAt`.
- Breakaway descendants and a runner crash before cleanup are outside the strong v1 containment guarantee. Report state `unknown` with error code `cancel_failed` and remediation; never claim success. Do not add a native Job Object/pidfd helper unless Phase 2's deterministic tests prove the no-dependency design cannot meet this stated contract and the plan is explicitly revised.
- Per-turn caps are 32 MiB JSONL and 4 MiB stderr. Before a new start, prune oldest terminal raw logs when total terminal raw logs exceed 256 MiB. Never prune active logs, manifests, or compact receipts.
- Compact manifests/manager output are allowlists: never serialize prompt text, environment objects, argv, raw stderr, or complete provider events. Store prompt SHA-256, controlled error codes/messages, selected authority fields, and the provider's final message only. Raw logs and `finalMessage` may themselves contain provider/user content and are not claimed to be secret-redacted; the skill must tell hosts not to delegate secrets and to treat the local state root as sensitive.

## Non-goals

Do not build:

- a daemon, service, scheduler, queue, database, dashboard, or control plane;
- host-specific Codex/Claude adapters or another installer;
- a general multi-agent framework or replacement for native Codex subagents;
- runtime task modes;
- automatic worktrees, file locking, or automatic task/file allocation;
- adaptive CPU/RAM scheduling or resource heuristics;
- silent invocation;
- power-loss durability, remote-filesystem coordination, or absolute containment of intentionally breakaway processes;
- a native process-management dependency without an approved plan revision.

## V1 planning-time evidence and claim limits

- Canonical source is one Node launcher plus `SKILL.md` and README; there is no deterministic test harness yet.
- Historical audit evidence records resume authority loss, false completion with live process trees, recursive invocation, hidden launch failures, and substantial log/polling pressure. It is problem evidence, not current release proof.
- W044/W045 remain quarantined because they were created in violation of the audit's no-run boundary.
- The work-laptop audit found 43 pre-existing lineages and real Claude Code usage through the shared Agent Skill installation. Those counts must not be presented as current runtime verification.
- Planning research used Luna-max workers and native subagents, but their repository fallbacks contained commit/source contradictions. Only conclusions independently checked against this checkout or primary documentation are accepted.

## V1 implementation completion gate

Implementation is complete only when every requirement above is verified, all four roadmap phases have independent verification records, the working tree contains only planned changes, and the delivery evidence supports the exact compatibility claim being made. Passing tests alone does not prove a published/installable artifact; a `turn.completed` event does not prove process exit or task success.

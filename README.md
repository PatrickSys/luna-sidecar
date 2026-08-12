# Luna Sidecar

Luna Sidecar is an Agent Skill asset plus a zero-dependency Node launcher for a host agent to manage one bounded Luna worker at a time. The human asks the host agent; the host owns intent, policy, worker IDs, commands, lifecycle, results, and reporting. The CLI is an agent-facing protocol, not the human workflow.

## Install

Install the copied skill for both supported Agent Skills targets:

~~~sh
npx skills add PatrickSys/luna-sidecar -a codex -a claude-code -y
~~~

The deterministic project-scope parity command is:

~~~sh
node node_modules/skills/bin/cli.mjs add <repo-root> --skill luna-sidecar --copy -a codex -a claude-code -y
~~~

This repository does not add a host adapter or claim that every host routes skill metadata identically.

## Host contract

Every `start` names an absolute existing cwd, explicit sandbox, explicit effort, and one bounded task:

~~~sh
node "<skill-folder>/scripts/luna-sidecar.mjs" start --cwd "<absolute-existing-directory>" --sandbox read-only --effort high -- "<bounded task>"
~~~

The public commands are `start`, `status`, `wait`, `resume`, `cancel`, and `list`. Readiness is the provider’s persisted `thread.started` event; it proves invocation acceptance and a real provider session, not task success, MCP health, or later shell usability. Match the host's existing authority first; a host already operating with full access may explicitly choose Luna `full-access`. If a read-only host receives `powershell_transcription_admission_blocked` from `start`, no Luna provider was started, requested read-only authority was preserved, and the host must route the bounded task directly to a native Codex subagent with read-only authority. Luna Sidecar never auto-spawns that agent, retries, broadens authority, or changes policy, ACLs, Codex configuration, transcript/writable roots, or sandbox authority. After admission succeeds, the host evaluates task meaning, keeps lifecycle actions visible, starts one real worker and inspects its terminal receipt before bounded independent work, and stops fan-out when the receipt reports `provider_command_blocked:sandbox_lock_1340`, `provider_command_blocked:invalid_batch_shim`, or the defense-in-depth `provider_command_blocked:powershell_transcription` warning. Luna Sidecar cannot stop independently issued `start` calls. Treat failure, unknown, timeout, cancellation uncertainty, warnings, and unavailable usage honestly.

## Claim boundary

The host needs Agent Skills support, Node.js, and a configured provider CLI. Copied-install parity is deterministic artifact evidence, not live host certification. Claude Code observation is availability-gated and uses only a source-backed invocation discovered on that host; no Claude command syntax is inferred. Missing host evidence keeps release readiness false.

The repository claim is limited to the six-command host boundary, explicit controls, provider-owned MCP configuration, readiness and lifecycle receipts, deterministic copied-install checks, and the recorded evidence for the exact tested commit, versions, platforms, and scratch run. It does not claim universal-host behavior, model task success, secret redaction of local state/raw logs/final messages, or unrecorded child cleanup.

Detailed lifecycle harvesting and prompt patterns are in [skills/luna-sidecar/references/USAGE.md](skills/luna-sidecar/references/USAGE.md).

## License

MIT.

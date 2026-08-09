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

The public commands are `start`, `status`, `wait`, `resume`, `cancel`, and `list`. Readiness is the provider’s persisted `thread.started` event; it proves invocation acceptance and a real provider session, not task success or MCP health. The host evaluates task meaning, keeps lifecycle actions visible, starts one worker before bounded independent work, and treats failure, unknown, timeout, cancellation uncertainty, warnings, and unavailable usage honestly.

## Claim boundary

The host needs Agent Skills support, Node.js, and a configured provider CLI. Copied-install parity is deterministic artifact evidence, not live host certification. Claude Code observation is availability-gated and uses only a source-backed invocation discovered on that host; no Claude command syntax is inferred. Missing host evidence keeps release readiness false.

The repository claim is limited to the six-command host boundary, explicit controls, provider-owned MCP configuration, readiness and lifecycle receipts, deterministic copied-install checks, and the recorded evidence for the exact tested commit, versions, platforms, and scratch run. It does not claim universal-host behavior, model task success, secret redaction of local state/raw logs/final messages, or unrecorded child cleanup.

Detailed lifecycle harvesting and prompt patterns are in [skills/luna-sidecar/references/USAGE.md](skills/luna-sidecar/references/USAGE.md).

## License

MIT.

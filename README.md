# Luna Sidecar

Luna Sidecar is an Agent Skill asset plus a zero-dependency Node launcher for a host agent to manage Luna workers. The human asks the host agent; the host owns worker IDs, commands, results, and reporting. The CLI is an agent-facing protocol, not the human workflow.

## Install

Install through an existing Agent Skills flow in the project or user scope:

~~~sh
npx skills add PatrickSys/luna-sidecar -a codex -y
~~~

This repository does not add a host adapter or claim that every host routes skill metadata identically.

## Prerequisites and claim boundary

The host needs Agent Skills support, Node.js, and a signed-in Codex CLI with access to `gpt-5.6-luna`. The launcher uses the host-selected cwd, effort, sandbox, and bypass authority; bypass requires direct human intent through the host.

The current repository claim is limited to this Agent Skills boundary and the deterministic local launcher contract. It does not claim universal-host behavior, live Claude execution, model task success, or secret redaction of local state, raw logs, or final messages.

Detailed prompting patterns are in [skills/luna-sidecar/references/USAGE.md](skills/luna-sidecar/references/USAGE.md).

## License

MIT.

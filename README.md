# Luna Sidecar

Luna Sidecar is an Agent Skill asset plus a zero-dependency Node launcher for a host agent to manage Luna workers. The human asks the host agent; the host owns worker IDs, commands, results, and reporting. The CLI is an agent-facing protocol, not the human workflow.

The verified v1 launcher is currently shipped. A smaller final command and authority surface is planned in [`.planning/SPEC.md`](.planning/SPEC.md) and [`.planning/phases/05-simple-subagent-ux/05-PLAN.md`](.planning/phases/05-simple-subagent-ux/05-PLAN.md); those Phase 5 flags and removals are not current runtime claims.

## Install

Install through an existing Agent Skills flow in the project or user scope:

~~~sh
npx skills add PatrickSys/luna-sidecar -a codex -y
~~~

This repository does not add a host adapter or claim that every host routes skill metadata identically.

## Prerequisites and claim boundary

The host needs Agent Skills support, Node.js, and a signed-in Codex CLI with access to `gpt-5.6-luna`. The current v1 launcher uses the host-selected cwd, effort, sandbox, and bypass authority. Host full access is not automatically visible to the child process: until Phase 5 ships explicit authority handoff, the host must deliberately map its current authority to the existing v1 flags.

The current repository claim is limited to this Agent Skills boundary and the deterministic local launcher contract. It does not claim universal-host behavior, live Claude execution, model task success, or secret redaction of local state, raw logs, or final messages.

The final product boundary remains deliberately small: one background Luna subagent, explicit host-controlled lifecycle, truthful readiness and receipts, provider-owned MCP configuration, and no scheduler, modes, MCP manager, task judge, or cost platform.

Detailed prompting patterns are in [skills/luna-sidecar/references/USAGE.md](skills/luna-sidecar/references/USAGE.md).

## License

MIT.

---
name: luna-sidecar
description: Request activation only when a human explicitly mentions “Luna subagent”, “Luna sidecar”, or “sidecar”, case-insensitively.
---

# Luna Sidecar

Use this skill only after the human explicitly mentions “Luna subagent”, “Luna sidecar”, or “sidecar”. The host agent owns commands, worker IDs, lifecycle results, and the final report; the human talks to the host agent, not this CLI.

Start one worker with the bundled launcher and retain the returned worker ID. This command is the current verified v1 surface; Phase 5's explicit `--sandbox` interface is not implemented yet:

```sh
node "<skill-folder>/scripts/luna-sidecar.mjs" start --effort high --read-only -- "<bounded task>"
```

Use `node "<skill-folder>/scripts/luna-sidecar.mjs" --help` for the protocol surface.

- Choose effort explicitly in the host's invocation: normally `high`; `max` for research, review, adversarial analysis, or unusually difficult reasoning; `medium` for narrow bounded execution. Never silently escalate.
- Map host authority deliberately. In current v1, `workspace-write` is compatibility behavior, not inferred approval; no authority flag selects it, `--read-only` narrows, and `--bypass` maps an already-authorized full-access host mode. Host authority is not automatically inherited across the child-process boundary. Resume inherits stored effort, cwd, sandbox, and bypass when omitted.
- An explicit cwd, sandbox, or bypass change is a host choice. Broadening beyond the host's current authority requires direct human intent; never broaden authority as failure recovery.
- Start one worker first. Launch additional independent workers only for distinct work after the first worker proves the environment usable. File/worktree coordination belongs to the host agent, not Luna Sidecar. Bound requested native subagents, and never invoke this sidecar recursively.
- Keep lifecycle actions explicit and visible: retain the ID, inspect or wait, resume deliberately, and use `cancel` when abandoning work. Do not hide retries, extra workers, or permission changes from the task record.
- Provider MCP configuration is inherited by current v1. Treat repeated nonfatal MCP startup failures as warnings; do not ask Luna Sidecar to manage or rewrite MCP configuration.
- Treat `failed`, `unknown`, cancellation timeout/failure, and `taskOutcome: not_evaluated` honestly. The host evaluates the final evidence against the task.
- Never delegate secrets. The local state root, raw logs, and provider final messages are sensitive and are not generically redacted; compact receipts use an allowlist.

For prompting patterns and lifecycle meanings, read [references/USAGE.md](references/USAGE.md).

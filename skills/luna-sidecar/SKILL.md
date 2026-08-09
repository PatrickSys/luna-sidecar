---
name: luna-sidecar
description: Request activation only when a human explicitly mentions “Luna subagent”, “Luna sidecar”, or “sidecar”, case-insensitively.
---

# Luna Sidecar

Use this skill only after the human explicitly mentions “Luna subagent”, “Luna sidecar”, or “sidecar”. The host agent owns commands, worker IDs, lifecycle results, and the final report; the human talks to the host agent, not this CLI.

Start with the bundled launcher and retain the returned worker ID:

```sh
node "<skill-folder>/scripts/luna-sidecar.mjs" start --effort high --read-only -- "<bounded task>"
```

Use `node "<skill-folder>/scripts/luna-sidecar.mjs" --help` for the protocol surface.

- Choose effort and authority deliberately. Default `workspace-write` is compatibility behavior, not inferred approval. Resume inherits stored effort, cwd, sandbox, and bypass when omitted.
- An explicit cwd, sandbox, or bypass change is a host choice. Bypass or any broader reachable scope requires direct human intent through the host; narrowing is allowed.
- Start independent workers with separate file/worktree ownership. Bound requested native subagents, and never invoke this sidecar recursively.
- Treat `failed`, `unknown`, cancellation timeout/failure, and `taskOutcome: not_evaluated` honestly. The host evaluates the final evidence against the task.
- Never delegate secrets. The local state root, raw logs, and provider final messages are sensitive and are not generically redacted; compact receipts use an allowlist.

For prompting patterns and lifecycle meanings, read [references/USAGE.md](references/USAGE.md).

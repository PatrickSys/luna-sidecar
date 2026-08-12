---
name: luna-sidecar
description: Request activation only when a human explicitly mentions “Luna subagent”, “Luna sidecar”, or “sidecar”, case-insensitively.
---

# Luna Sidecar

Use this skill only after the human explicitly mentions “Luna subagent”, “Luna sidecar”, or “sidecar”. Require direct human intent before activation. The host agent owns intent, policy, commands, worker IDs, lifecycle results, and the final report; the human talks to the host agent, not this CLI.

Start one worker with the bundled launcher and retain the returned worker ID. Every start names an absolute existing cwd, sandbox, effort, and one bounded task:

```sh
node "<skill-folder>/scripts/luna-sidecar.mjs" start --cwd "<absolute-existing-directory>" --sandbox read-only --effort high -- "<bounded task>"
```

The public command surface is exactly `start`, `status`, `wait`, `resume`, `cancel`, and `list`. Use `node "<skill-folder>/scripts/luna-sidecar.mjs" --help` for the launcher’s protocol help. `start` returns only after the runner has observed and persisted the provider’s `thread.started` readiness event; that proves invocation acceptance and a real provider session, not task success, MCP health, or eventual completion.

- Choose effort explicitly: `high` normally, `max` for research, review, adversarial analysis, or unusually difficult reasoning, and `medium` for narrow bounded execution. Never silently escalate.
- Match the host's existing authority before choosing a sandbox. `read-only`, `workspace-write`, and `full-access` are explicit host choices. When the host is already operating with full access, it may explicitly select Luna `full-access`; that is not a read-only workaround. A cwd outside the provider’s Git admission path changes only that admission check and does not grant authority. Broadening authority, changing transcription policy or ACLs, and retrying are never failure recovery.
- If `start` returns `powershell_transcription_admission_blocked`, no Luna provider was started and the requested read-only authority was preserved. Route the bounded task directly to a native Codex subagent with read-only authority. Luna Sidecar never auto-spawns that agent, retries, broadens authority, or changes PowerShell policy, ACLs, Codex configuration, transcript/writable roots, or sandbox authority.
- Start one real worker first only after admission succeeds. Before launching independent workers, wait for its terminal receipt and inspect its warnings. If it reports `provider_command_blocked:sandbox_lock_1340`, `provider_command_blocked:invalid_batch_shim`, or the defense-in-depth `provider_command_blocked:powershell_transcription` warning during read-only work, stop Luna fan-out and use a native Codex subagent for the read-only task; surface the host-environment failure. The sidecar cannot stop independently issued `start` calls. File/worktree coordination belongs to the host agent. Bound requested native subagents, and never invoke this sidecar recursively.
- Keep lifecycle actions visible: retain the ID, inspect or wait, resume deliberately, cancel when abandoning work, and use `list` for bounded history. Harvest compact receipts and evaluate them against the task.
- Provider MCP configuration remains provider-owned. Surface nonfatal MCP startup warnings once; do not ask Luna Sidecar to manage or rewrite MCP configuration. Usage is passed through when available and otherwise reported as unavailable.
- Treat `failed`, `unknown`, cancellation timeout/failure, and `taskOutcome: not_evaluated` honestly. A completed provider turn is operational evidence, not an automatic task-success claim.
- Never delegate secrets. The local state root, raw logs, and provider final messages are sensitive and are not generically redacted; compact receipts use an allowlist.

For lifecycle harvesting, result evaluation, and prompt patterns, read [references/USAGE.md](references/USAGE.md).

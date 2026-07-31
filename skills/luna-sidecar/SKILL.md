---
name: luna-sidecar
description: Delegate one bounded task to gpt-5.6-luna while another Codex task remains the coordinator. Use when native spawn_agent cannot select Luna, or when a user asks to use Luna like a subagent without making it the main model.
---

# Luna Sidecar

Run Luna as a separate, one-shot Codex task. Read its stdout, then validate and use the result in the coordinating task. It is not a native `spawn_agent` child.

```sh
codex exec --model gpt-5.6-luna --ephemeral --sandbox read-only -C "." "<one bounded task>"
```

- Give Luna one self-contained objective, relevant paths, and the expected output.
- Keep `read-only` unless the user explicitly authorizes edits. For authorized edits, replace it with `workspace-write` and give Luna exclusive file ownership.
- Run another one-shot command for a follow-up; do not expect native messaging or resume behavior.
- Treat Luna's response as input to review, not as final truth.
- If Luna cannot execute a simple shell command, report the local Codex runtime failure; do not weaken the sandbox just to force it through.

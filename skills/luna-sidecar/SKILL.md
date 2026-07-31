---
name: luna-sidecar
description: Let Luna do a clear piece of work while you stay on the main task. Use when someone wants Luna to research, review, plan, or make a change without switching the main model.
---

# Luna Helper

Give Luna one clear job. It keeps its session, so you can come back to it.

```sh
codex exec --model gpt-5.6-luna -c model_reasoning_effort=medium --sandbox workspace-write -C "." "<what Luna should do>"
```

- Luna can edit the current project by default.
- Pick the thinking level you want: `low`, `medium`, `high`, `xhigh`, or `max`.
- Keep the session id printed by the command if you want a follow-up:

```sh
codex exec resume <session-id> "<what to do next>"
```

- Want Luna to only look? Change `workspace-write` to `read-only`.
- If Luna cannot run commands, say that the local Codex setup is broken.

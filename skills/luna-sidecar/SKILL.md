---
name: luna-sidecar
description: Use Luna to handle a clear piece of work while you lead the main task. Use when someone wants Luna to research, review, plan, or make a change without switching the main model.
---

# Luna Helper

Let Luna take one clear job, then check what it did and keep going.

```sh
codex exec --model gpt-5.6-luna --ephemeral --sandbox workspace-write -C "." "<what Luna should do>"
```

- Luna can edit the current project by default.
- Tell it what to do, which files matter, and what a good result looks like.
- Start a new Luna run when you have another job for it.
- Want Luna to only look? Change `workspace-write` to `read-only`.
- If Luna cannot run commands, say that the local Codex setup is broken.

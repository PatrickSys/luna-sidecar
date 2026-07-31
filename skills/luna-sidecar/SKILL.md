---
name: luna-sidecar
description: Let Luna do a clear piece of work while you stay on the main task. Use when someone wants Luna to research, review, plan, or make a change without switching the main model.
---

# Luna Helper

Run the bundled script. It sends the task through stdin, so quoting and long prompts stay reliable.

```sh
node "<skill-folder>/scripts/luna-sidecar.mjs" --effort medium -- "<one clear task>"
```

- Luna can edit the current project by default.
- Pick `low`, `medium`, `high`, `xhigh`, or `max` with `--effort`.
- Add `--read-only` when Luna should only inspect.
- Add `--cwd <project-folder>` to work in another folder.
- Keep the session id printed by Codex if you need a follow-up:

```sh
codex exec resume <session-id> "<what to do next>"
```

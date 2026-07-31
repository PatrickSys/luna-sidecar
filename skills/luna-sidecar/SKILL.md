---
name: luna-sidecar
description: Let Luna do a clear piece of work while you stay on the main task. Use when someone wants Luna to research, review, plan, or make a change without switching the main model.
---

# Luna Helper

Run the bundled script. It sends tasks through stdin and keeps real Luna workers after `start` returns.

```sh
node "<skill-folder>/scripts/luna-sidecar.mjs" start --effort medium -- "<one clear task>"
```

- The command prints a worker id immediately. Start independent workers in parallel when the host supports parallel shell calls.
- Give writing workers separate files or worktrees. Do not point two workers at the same edits.
- Check a worker with `status <worker-id>` or wait for it with `wait <worker-id>`.
- Continue its Luna session with `resume <worker-id> -- "<follow-up>"`.
- Stop it with `cancel <worker-id>` and see saved workers with `list`.
- Use `run` instead of `start` when you want the old blocking one-off command.
- Luna can edit the current project by default.
- Pick `low`, `medium`, `high`, `xhigh`, or `max` with `--effort`.
- Add `--read-only` when Luna should only inspect.
- Add `--bypass` when you explicitly want full access with no approvals or sandbox.
- Add `--cwd <project-folder>` to work in another folder.

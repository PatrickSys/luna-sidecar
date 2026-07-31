# Luna Sidecar

Use `gpt-5.6-luna` as a bounded external worker while your current Codex task stays in charge.

## Install for Codex

```sh
npx skills add PatrickSys/luna-sidecar -g -a codex -y
```

The Skills CLI installs Codex skills into its shared `.agents/skills` location. Codex discovers that location globally, so do not manually duplicate the skill.

Start a new Codex task after installing.

## Use

Ask Codex:

```text
Use $luna-sidecar to inspect the authentication flow and return a minimal fix plan.
```

Luna runs as an isolated `codex exec` task. It is not a native `spawn_agent` child: give it one self-contained task, then review and integrate its response in the coordinating task.

## Safety

The skill defaults to `read-only`. Use `workspace-write` only when edits are explicitly authorized and Luna owns a non-overlapping file slice.

## License

MIT.

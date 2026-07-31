# Luna Sidecar

Let your AI hand a clear piece of work to Luna.

## Install

For Codex:

```sh
npx skills add PatrickSys/luna-sidecar -g -a codex -y
```

For another supported AI, replace `codex` with that AI's name.

The installer puts Codex skills in `.agents/skills`. Codex reads that folder automatically.

## Use

Tell your AI:

```text
Use luna-sidecar to fix the validation bug in src/auth and run the focused tests.
```

Luna can edit the project by default. Give it one clear job, the files it should touch, and the result you want.

## What you need

The machine needs the Codex CLI, signed in with access to `gpt-5.6-luna`. Any AI that understands skills can use this skill to launch Luna through that CLI.

## License

MIT.

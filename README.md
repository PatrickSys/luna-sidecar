# Luna Sidecar

Give Luna a clear piece of work while your main AI keeps going.

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

## Pick the thinking level

The default is `medium`. Change it to `low`, `high`, `xhigh`, or `max` when you need to.

```sh
codex exec --model gpt-5.6-luna -c model_reasoning_effort=high --sandbox workspace-write -C "." "Find the root cause and fix it."
```

## Keep talking to the same Luna

Luna jobs keep their session. The command prints a session id. Keep it, then use it for follow-ups:

```sh
codex exec resume <session-id> "Run the tests and fix anything that fails."
```

## What you need

The machine needs the Codex CLI, signed in with access to `gpt-5.6-luna`. Any AI that understands skills can use this skill to launch Luna through that CLI.

## License

MIT.

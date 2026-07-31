# Luna Sidecar

Give Luna a clear piece of work while your main AI keeps going.

## Install

Install the skill once:

~~~sh
npx skills add PatrickSys/luna-sidecar -g -a codex -y
~~~

For another supported AI, replace codex with that AI name. The installer copies the skill and its bundled launcher into that AI skills folder.

## Use

Tell your AI:

~~~text
Use luna-sidecar to fix the validation bug in src/auth and run the focused tests.
~~~

The skill runs its local bundled script. It does not use npx for each Luna job.

## Direct use

~~~sh
node "<installed-skill-folder>/scripts/luna-sidecar.mjs" --effort high -- "Find the root cause and fix it."
~~~

Luna can edit the project by default. Use --read-only for inspection only, --cwd <project-folder> for another project, and choose low, medium, high, xhigh, or max with --effort.

The launcher passes the task over stdin, avoiding shell quoting and command-length trouble.

## Continue a Luna session

Codex prints a session id. Use it for a follow-up:

~~~sh
codex exec resume <session-id> "Run the tests and fix anything that fails."
~~~

## What you need

The machine needs the Codex CLI, signed in with access to gpt-5.6-luna. Any AI that understands skills can use this skill; the Codex CLI is only the route used to reach Luna.

## License

MIT.

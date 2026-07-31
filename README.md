# Luna Sidecar

Give Luna clear work while your main AI keeps going. Start one or several real Luna workers, then inspect, resume, or stop them by id.

## Install

Install the skill once:

~~~sh
npx skills add PatrickSys/luna-sidecar -g -a codex -y
~~~

For another supported AI, replace codex with that AI name. The installer copies the skill and its bundled launcher into that AI skills folder.

## Start workers

Tell your AI:

~~~text
Use luna-sidecar to start two independent Luna workers: one reviews auth and one reviews billing. Keep them on separate files.
~~~

Or call the installed script directly:

~~~sh
node "<installed-skill-folder>/scripts/luna-sidecar.mjs" start --effort high -- "Review src/auth and report the bug."
~~~

Start returns a worker id immediately. The worker keeps running after the command ends. Start more workers when your AI host can make parallel shell calls. Do not give two writing workers the same files.

## Control workers

~~~sh
node "<installed-skill-folder>/scripts/luna-sidecar.mjs" status <worker-id>
node "<installed-skill-folder>/scripts/luna-sidecar.mjs" wait <worker-id>
node "<installed-skill-folder>/scripts/luna-sidecar.mjs" resume <worker-id> -- "Run the focused tests and fix failures."
node "<installed-skill-folder>/scripts/luna-sidecar.mjs" cancel <worker-id>
node "<installed-skill-folder>/scripts/luna-sidecar.mjs" list
~~~

The manager commands print JSON with the real worker id, Codex session id, state, and final message. Luna session records persist locally, so resume continues the same Luna conversation.

## Options

Luna can edit the project by default. Use --read-only for inspection only, --bypass for full access with no approvals or sandbox, --cwd <project-folder> for another project, and choose low, medium, high, xhigh, or max with --effort.

Use run instead of start for a blocking one-off command. Leaving off run keeps the same one-off behavior for older uses.

The launcher passes tasks over stdin, avoiding shell quoting and command-length trouble. It does not use npx for each Luna job.

## What you need

The machine needs the Codex CLI, signed in with access to gpt-5.6-luna. Any AI that understands skills can use this skill; the Codex CLI is only the route used to reach Luna.

## License

MIT.

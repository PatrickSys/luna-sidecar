# Luna Sidecar usage patterns

These are prompt patterns for the host agent. They are not CLI modes or runtime task types.

## Before delegating

Confirm that the human explicitly mentioned “Luna subagent”, “Luna sidecar”, or “sidecar”. Keep the task bounded, name the expected evidence, choose effort and authority, and preserve the existing cwd unless the human asks for a change. Do not pass secrets or assume that a provider final message proves task success.

## Host command flow

The host agent, not the human, runs these commands and retains `<worker-id>` from the first JSON receipt:

```sh
node "<skill-folder>/scripts/luna-sidecar.mjs" start --effort high --read-only -- "<bounded task>"
node "<skill-folder>/scripts/luna-sidecar.mjs" status <worker-id>
node "<skill-folder>/scripts/luna-sidecar.mjs" wait <worker-id> --timeout 600000
node "<skill-folder>/scripts/luna-sidecar.mjs" resume <worker-id> -- "<bounded follow-up>"
node "<skill-folder>/scripts/luna-sidecar.mjs" stop <worker-id>
node "<skill-folder>/scripts/luna-sidecar.mjs" list
```

`resume` inherits cwd, effort, sandbox, and bypass when their flags are omitted. `stop` is an alias for `cancel`. Use `run` only for a blocking one-off provider passthrough. Start independent workers concurrently only when their ownership is disjoint, then harvest each compact receipt and evaluate its evidence.

## Prompt patterns

- Web research: “Research the primary sources for `<question>`. Return a short source list, the key claims, and unresolved uncertainty. Do not change files.”
- Local inspection: “Inspect `<paths>` read-only. Report the relevant implementation, tests, and exact evidence; do not edit.”
- Audit: “Audit `<surface>` against `<contract>`. Enumerate each finding with file/line evidence, severity, and a reproduction or missing-proof note.”
- Adversarial review: “Try to falsify this design: `<claim>`. Check failure paths, authority changes, races, and data leakage. Return only evidence-backed findings and residual risks.”
- Planning: “Plan `<change>` within the current architecture. Identify touched files, invariants, tests, and stop conditions. Do not implement.”
- Execution: “Implement `<bounded change>` in the explicitly owned files. Preserve existing invariants, run the named tests, and report changed paths plus failures.”

For multiple independent workers, give each a disjoint question and file/worktree ownership. Native subagents may be requested within a bounded task; do not ask a worker to invoke Luna Sidecar again.

## Authority and results

`workspace-write` is the compatibility default, not inferred approval. `--read-only` narrows access. A bypass or broader cwd/sandbox scope requires direct human intent through the host. Resume inherits stored cwd, effort, sandbox, and bypass when omitted; any explicit change is visible in the host report.

The lifecycle describes operational evidence, not delegated-task success:

- `starting`: a runner record exists, but provider spawn is not confirmed.
- `completed`: provider completion, clean close, and exit 0 were observed; this is not proof that the requested task succeeded.
- `unknown`: evidence is insufficient or the worker became unreachable. It is terminal for waiting; inspect it and use a new `start` rather than guessing or resuming it.
- cancellation timeout or failure: cancellation is not verified and must not be reported as `cancelled`.
- `taskOutcome: not_evaluated`: the host must compare the final evidence with the requested task. A final message is content-bearing evidence, not an automatic success claim.

Surface provider failures, unknown state, incomplete evidence, and warnings plainly. Treat the local sidecar state root, raw logs, and provider final messages as sensitive: compact receipts are allowlisted, but those content-bearing files are not generically redacted.

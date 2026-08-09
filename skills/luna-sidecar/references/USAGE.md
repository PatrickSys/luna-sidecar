# Luna Sidecar usage patterns

These are prompt patterns for the host agent. They are not CLI modes or runtime task types. Confirm that the human explicitly mentioned “Luna subagent”, “Luna sidecar”, or “sidecar”; the host agent remains responsible for intent, policy, IDs, lifecycle, and the final evaluation.

## Host command flow

Start with an absolute existing cwd, explicit sandbox, explicit effort, and one bounded task. Retain the first JSON receipt’s `<worker-id>`:

```sh
node "<skill-folder>/scripts/luna-sidecar.mjs" start --cwd "<absolute-existing-directory>" --sandbox read-only --effort high -- "<bounded task>"
node "<skill-folder>/scripts/luna-sidecar.mjs" status <worker-id>
node "<skill-folder>/scripts/luna-sidecar.mjs" wait <worker-id> --timeout 600000
node "<skill-folder>/scripts/luna-sidecar.mjs" resume <worker-id> --cwd "<absolute-existing-directory>" --sandbox read-only --effort high -- "<bounded follow-up>"
node "<skill-folder>/scripts/luna-sidecar.mjs" cancel <worker-id>
node "<skill-folder>/scripts/luna-sidecar.mjs" list
```

`start` acknowledges only after the runner persists the provider’s `thread.started` readiness/running proof. Harvest the receipt, status, wait result, logs, warnings, and final state. `resume` keeps the worker identity and creates a new turn; omitted controls inherit the stored values, while explicit cwd, sandbox, and effort changes remain visible. Use `cancel` when abandoning work. `list` is bounded deterministic history plus active workers.

Run one worker first and confirm its environment is usable before bounded independent work. The host owns file and worktree coordination; native subagents must remain bounded and must not invoke Luna Sidecar recursively.

## Result evaluation

Operational completion is not task success. Compare the final receipt and content-bearing evidence with the requested task and report `taskOutcome: not_evaluated` until the host has made that judgment. Surface provider failures, unknown state, incomplete evidence, warnings, cancellation timeout/failure, and unavailable usage plainly. A `starting` or `running` receipt is not proof of task success; readiness proves only invocation acceptance and a real provider session.

`unknown` is terminal for waiting; inspect it and use a new `start` rather than guessing or resuming it.

Cancellation timeout or failure is not `cancelled`.

`read-only`, `workspace-write`, and `full-access` are explicit authority choices. A cwd outside provider Git admission does not grant authority. Never broaden authority as failure recovery. Provider MCP setup remains outside this skill; pass through usage when present and report `unavailable` when the provider supplies no usage event.

Treat the local state root, raw logs, and provider final messages as sensitive. Compact receipts are allowlisted, but content-bearing files are not generically redacted. Do not pass secrets in prompts or delegate secret handling.

## Prompt patterns

- Web research: “Research the primary sources for `<question>`. Return a short source list, the key claims, and unresolved uncertainty. Do not change files.”
- Local inspection: “Inspect `<paths>` read-only. Report the relevant implementation, tests, and exact evidence; do not edit.”
- Audit: “Audit `<surface>` against `<contract>`. Enumerate each finding with file/line evidence, severity, and a reproduction or missing-proof note.”
- Adversarial review: “Try to falsify this design: `<claim>`. Check failure paths, authority changes, races, and data leakage. Return only evidence-backed findings and residual risks.”
- Planning: “Plan `<change>` within the current architecture. Identify touched files, invariants, tests, and stop conditions. Do not implement.”
- Execution: “Implement `<bounded change>` in the explicitly owned files. Preserve existing invariants, run the named tests, and report changed paths plus failures.”

Examples are prompts only; none asks a worker to invoke this sidecar again.

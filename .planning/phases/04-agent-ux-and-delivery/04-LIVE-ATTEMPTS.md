# Phase 4 live attempts

## Failed top-level release smoke

- Tested SHA: `4baf0ad9b18aa38dc1755fe95ed6635b475c1110`
- CI run: `31303784939`; all four expected Windows/Ubuntu x Node 22.20.0/24 jobs passed.
- Result: `releaseReady=false`; failure stage/provider; unresolved gap: `resume_incomplete`.
- Parent predicates passed: authority, cwd, lineage, completion, provider completion, logs, and exactly two native children.
- Resume predicates passed: authority, cwd, lineage, completion, provider completion, and logs. `markerCommandFailed=false`; `markerAbsent=true`.
- Cancellation and cleanup passed: running observation, acknowledgement, cancelled state/result, owned-process absence, and scratch cleanup.
- Marker absence without a failed command is incomplete evidence. The worker apparently did not attempt the vague write request, so a prompt-only repair is justified: the launcher, authority, lineage, completion, logging, cancellation, and cleanup paths already satisfied the approved contract; only the resume instruction failed to deterministically elicit the required controlled attempt.

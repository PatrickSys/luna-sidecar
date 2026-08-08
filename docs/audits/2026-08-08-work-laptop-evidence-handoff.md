# Work-laptop Luna-sidecar evidence handoff

**Status:** Completed historical handoff; preserved on `main`.  
**Historical note:** These are the original instructions for the temporary evidence branch. That branch was folded into `main` and deleted. Do not execute this handoff again.

## Original instructions

**Audience:** The user's coding agent on the other Windows laptop  
**Constraint at the time:** Do not implement Luna-sidecar changes during this pass.

## Mission

Recover the Luna-sidecar evidence that exists only on the work laptop and return a useful, privacy-safe audit to this branch.

The goal is not to dump transcripts. The goal is to establish:

1. what Luna-sidecar source was installed there;
2. how Claude Code, Codex, and humans actually invoked it;
3. what work the workers and their native subagents performed;
4. which lifecycle, safety, resource, and UX behaviors occurred;
5. the exact work-laptop-only resume patch and its verification;
6. which current design conclusions are supported, contradicted, or still unknown.

Create the response as:

`docs/audits/2026-08-08-work-laptop-evidence-response.md`

Commit and push that response to this same branch. Do not edit this handoff unless correcting a factual typo.

## Authority and hard boundaries

This is a read-only audit of local evidence, with one permitted write: the redacted response file in this repository branch.

- Do not modify the installed Luna-sidecar skill or launcher.
- Do not repair, update, reinstall, cancel, resume, or start Luna workers.
- Do not invoke `status`, `list`, or `wait` through the current sidecar. Those commands can rewrite stale state and repeatedly parse complete logs.
- Do not stop or interfere with Claude Code, Codex, or other agent sessions.
- Do not commit raw transcripts, raw prompts, raw JSONL logs, session archives, credentials, tokens, environment dumps, personal paths, private repository content, client data, or a reversible redaction map.
- Do not expand into implementation proposals until the evidence section is complete.
- If local access is blocked, report the exact blocker and the evidence not covered. Do not bypass permissions.

Use bounded, structured parsing. Search metadata and exact Luna-related terms before opening content.

## Product intent already decided

Treat these as accepted constraints, not questions to reopen:

- The human interacts naturally with a coding agent. The human normally does not run Luna-sidecar commands.
- A host agent may invoke Luna-sidecar only when the human request mentions **“Luna subagent,” “Luna sidecar,” or “sidecar.”** Generic research or parallel-work requests are not permission.
- The Agent Skill plus its shell/JSON interface is the host-neutral boundary. We are not building separate Codex-host and Claude-host adapters.
- Codex CLI is currently the backend used to reach the Luna model.
- One or several independent Luna workers are allowed. Luna may use its native Codex subagents.
- Do not encode research, audit, adversarial, planning, or execution as runtime modes. Those are usage patterns taught to agents.
- The host agent owns worker IDs, waiting, status checks, continuation, cancellation, and reporting to the human.
- Resume should preserve a stable worker identity for the host while retaining distinct internal turn lineage.
- Preserve cwd and authority across continuation. Never silently broaden permissions.
- Native child-agent lifecycle should be reported when observable and marked opaque when it is not.
- Add only pragmatic safeguards: recursion/cycle protection, bounded logs, truthful completion, minimal same-checkout writer protection, and a small overload guard justified by evidence.
- Use `npx skills add` as the installer. Do not add another installer or synchronization layer.
- Do not build a daemon, control plane, human dashboard, generic scheduler, automatic worktree manager, or universal subagent implementation.

## Current personal-PC audit: evidence to compare

These findings came from source review and live, read-only observation on the personal PC on 2026-08-08. Treat them as comparison data, not assumptions about the work laptop.

### Source and lifecycle

- The public/current launcher is a compact Codex-specific Node process manager behind an Agent Skill.
- Resume records cwd and sandbox intent but the current public launcher does not explicitly restore them.
- Successful workers do not authoritatively commit terminal state and exit metadata.
- Observers infer completion from provider events; clean process completion, task success, and evidence coverage are conflated.
- Cancellation records success without proving the process tree terminated.
- Startup, inspection, and cancellation can race through stale whole-record rewrites.
- Concurrent continuations of the same Codex session are not prevented.
- PID liveness checks do not bind the PID to process identity.
- Worker records are unversioned and weakly validated.
- Runtime resolution depends on ambient PATH and, on Windows, the command shell.

### Resource snapshot

At one bounded snapshot:

- 232 worker manifests existed.
- 15 manifests said `running`, but only 8 corresponding worker processes were live.
- Eight active Luna stacks used approximately 1.87 GB for worker CLI/runner processes, or about 2.1 GB including code-mode hosts.
- Sidecar logs occupied approximately 197 MB; the largest was about 28.4 MiB.
- `wait` polled every 250 ms and each inspection reread and parsed the whole JSONL log. A waiter on the largest log could imply roughly 114 MiB/s of repeated reads before allocation and parsing overhead.
- Luna was meaningful memory pressure, but the desktop renderer/app-server was the larger short-sample CPU consumer.

### Luna-max audit wave

Three read-only Luna-max parents were launched for this audit:

- all three processes ended;
- two manifests remained falsely `running`;
- all three spawned two native child agents;
- several children failed local access with Windows sandbox setup error `SetNamedSecurityInfoW 1340`;
- one child remained silent until closed;
- MCP stderr included an OAuth `invalid_token` event;
- parents still produced prose despite incomplete local evidence.

This demonstrates why a useful result needs separate execution state, agent-reported result, evidence coverage, child outcomes, and effective authority.

## Work-laptop claims that require verification

IdeaSpine currently preserves these claims from the work laptop. Confirm, correct, or qualify each one:

- Claude Code had Luna-sidecar installed under its skills directory.
- A user-approved fix was applied there on 2026-08-04 so resumed workers retained the original cwd and parent sandbox.
- Before that fix, a read-only worker resumed with broader authority and wrote a stray file.
- The work-laptop audit counted approximately 14 Claude Code sessions, 151 Codex rollouts, and 44 Luna worker logs in the inspected evidence set.
- Seven trust-directory launch failures were observed.
- One opaque run lasted about 42 minutes and involved roughly 307 tool uses.
- One recursive Luna-sidecar invocation turned a trivial task into 224,072 input tokens versus roughly 16,000 expected and timed out.
- Twelve workers showed MCP transport failures over more than two hours.
- Some “background task completed” notifications corresponded to empty or zero-byte useful output.

Relevant IdeaSpine starting points:

- commit `6904c79`;
- `staging/workspine/launch-brief-personal-pc-2026-08-04.md`;
- `staging/workspine/session-graveyard-audit-2026-08-04.md`;
- the local work-laptop Claude and Codex session stores referenced by that audit.

Do not trust the prose over the underlying source. Reconcile both.

## Collection procedure

### 1. Record the collection environment

Report only non-sensitive technical facts:

- operating system and architecture;
- Node version;
- Codex CLI resolved path, version, and SHA-256 when practical;
- Claude Code version;
- installed Luna-sidecar skill locations using `<HOME>` rather than the username;
- whether each install is a symlink, junction, hardlink, or independent copy;
- SHA-256 of each installed `SKILL.md` and `luna-sidecar.mjs`;
- Git remote and commit corresponding to the canonical source, if determinable.

Do not include environment-variable values or complete process command lines.

### 2. Recover the work-laptop patch exactly

Compare the installed Claude launcher with public `main`.

Return:

- a small unified diff containing only Luna-sidecar source;
- source and destination SHA-256 values;
- when and why it was applied;
- the user approval evidence;
- the test or probe used;
- observed output proving cwd and sandbox preservation;
- whether Codex and any other installed copies contain the same fix.

Inspect the diff for secrets before committing it. If clean, place it in a fenced diff block in the response. Do not patch another copy during this audit.

### 3. Build a metadata-first usage inventory

Search these sources only as needed:

- Claude Code session metadata and transcripts under its normal local session store;
- Codex rollout metadata and JSONL under its normal local session store;
- Luna-sidecar worker manifests and bounded log segments;
- the relevant IdeaSpine audit/evidence files.

Search for exact terms such as:

- `luna-sidecar`
- `luna sidecar`
- `luna subagent`
- `gpt-5.6-luna`
- `luna-sidecar.mjs`
- known sidecar commands and worker IDs found through those matches

Parse structured records locally. Do not paste raw searches or whole sessions into the report.

Deduplicate resumed turns into stable worker lineages.

### 4. Create the redacted run register

Include one row per meaningful worker lineage, not one row per log line.

Required columns:

| Field | Meaning |
|---|---|
| `run_ref` | Stable pseudonym such as `W001` |
| `date` | Date only unless finer timing is technically necessary |
| `host_agent` | Claude Code, Codex, or other |
| `invocation` | Natural-language skill use, direct script, recursive child, or unknown |
| `purpose` | Short category plus plain-language summary |
| `effort` | Recorded effort or unknown |
| `authority` | Read-only, workspace-write, bypass, changed-on-resume, or unknown |
| `cwd_class` | Same checkout, separate worktree, other repo, or unknown |
| `turns` | Initial turn plus continuation count |
| `native_children` | Count and whether outcomes were observable |
| `duration` | Rounded duration or bucket |
| `process_end` | Clean exit, nonzero, signaled, killed, stale, or unknown |
| `recorded_state` | What the manifest/status claimed |
| `result_utility` | Useful, partial, empty, misleading, or unknown |
| `friction_tags` | Small controlled list |
| `source_refs` | Redacted evidence identifiers |

Suggested friction tags:

`trust-dir`, `sandbox`, `cwd-loss`, `authority-drift`, `stale-state`, `empty-result`, `cancel-uncertain`, `recursive-spawn`, `child-silent`, `mcp-auth`, `mcp-transport`, `log-growth`, `human-recovery`, `other`.

### 5. Reconstruct representative workflows

Select a small representative set, including when available:

- successful Claude-hosted research;
- successful Codex-hosted work;
- a resume/continuation;
- a writing task;
- parallel workers;
- a worker using native subagents;
- the authority/cwd regression;
- the recursive sidecar incident;
- an empty or misleading completion;
- a cancellation or abandoned worker.

For each, report:

1. what the human asked, summarized rather than quoted;
2. what the host agent actually invoked;
3. what the Luna parent and children did;
4. what the host surfaced to the human;
5. whether intervention was required;
6. the useful outcome;
7. the friction and likely root cause;
8. exact redacted evidence references.

### 6. Audit agent behavior

Answer from evidence:

- Did Claude and Codex discover and invoke the skill correctly?
- Did they use `start`, blocking `run`, polling, or repeated `status/list`?
- Did they retain worker IDs and continue the intended worker?
- Did they expose IDs/commands unnecessarily to the human?
- Did they wait for and harvest results before ending their turn?
- Did they treat process completion as task success?
- Did they notice missing evidence, child failures, or stderr?
- Did they create overlapping writers?
- Did Luna recursively invoke its own sidecar?
- Which instructions in `SKILL.md` helped, were ignored, or caused ambiguity?
- What manual recovery did the human perform?

Separate observed behavior from inference.

### 7. Audit lifecycle and resource behavior

Using bounded reads only:

- reconcile manifest state against terminal events and verified process identity where still possible;
- count stale `starting` and `running` records;
- count clean, failed, cancelled, empty, and unknown outcomes;
- report total and largest log sizes;
- identify repeated whole-log polling from session evidence;
- estimate concurrent Luna stacks in representative incidents;
- record available memory/CPU only if it can be sampled without disturbing active work;
- distinguish Luna-sidecar overhead from Codex/Claude desktop or renderer overhead.

Do not run a load test.

### 8. Record negative findings

Explicitly state when the evidence does **not** support a suspected problem. Examples:

- no confirmed install failure;
- no confirmed concurrent-write collision;
- no evidence that a proposed feature would have helped;
- no proof of effective permission mode;
- insufficient data to attribute system slowness.

Negative evidence prevents synthetic requirements.

## Redaction protocol

Apply redaction before anything enters Git.

### Replace

- username and home directory with `<HOME>`;
- private repositories with stable labels such as `<REPO-A>`;
- client/project names with neutral categories;
- emails and human names with role labels;
- worker/session/thread IDs with `W001`, `S001`, and `T001`;
- private hosts and URLs with `<PRIVATE-HOST>`;
- prompts with short semantic summaries.

Keep the pseudonym mapping only in temporary local scratch and do not commit it.

### Never commit

- API keys, OAuth tokens, cookies, JWTs, authorization headers;
- environment-variable dumps;
- raw prompts or complete assistant responses;
- raw JSONL/transcript archives;
- absolute user paths;
- private source code or diffs unrelated to Luna-sidecar;
- proprietary issue text, customer data, or personal communications;
- complete process command lines that embed prompts or paths.

### Preserve when safe

- exact public Luna-sidecar source diff;
- tool and runtime versions;
- SHA-256 hashes;
- non-secret error names and numeric codes;
- aggregate counts and rounded durations;
- event types, exit codes, and state transitions;
- short excerpts only when paraphrase would destroy the technical meaning.

### Final redaction check

Before commit, scan the response for:

- the local username and home path;
- email addresses;
- `Bearer `;
- common key prefixes such as `ghp_`, `github_pat_`, `sk-`, `xox`;
- JWT-shaped strings;
- private repository names and remotes;
- raw UUIDs from workers or sessions;
- long prompt/response passages.

If uncertain, redact more and note the omission.

## Required response structure

Use this exact top-level structure:

```markdown
# Work-laptop Luna-sidecar evidence response

## Executive findings
## Collection scope and limitations
## Environment and installation topology
## Canonical-versus-installed source reconciliation
## Resume patch and verification
## Aggregate usage register
## Representative workflows
## Host-agent behavior and UX friction
## Native subagent behavior
## Lifecycle and cancellation audit
## Resource and log behavior
## Confirmed negative findings
## Contradictions with the current personal-PC audit
## Evidence-backed implications
## Redaction statement
## Evidence index
```

For every material claim, provide a redacted evidence reference. An evidence index row should include:

| Evidence ref | Source kind | SHA-256 or stable fingerprint | Bounded location | What it proves | Redactions |
|---|---|---|---|---|---|

Recommendations under “Evidence-backed implications” are advisory. Do not silently convert them into product decisions.

## Completion criteria

The pass is complete only when:

- every work-laptop claim listed above is confirmed, corrected, or marked unverified;
- the exact resume patch is recovered or its absence is explained;
- Claude-hosted and Codex-hosted Luna usages are separately counted;
- resumed lineages and native children are deduplicated;
- useful, partial, empty, misleading, and failed results are distinguished;
- lifecycle state is checked against actual terminal evidence;
- privacy checks pass;
- only the redacted response is committed;
- no installed runtime or session source was modified.

## Hand-back

Commit with a message such as:

`docs: add redacted work-laptop Luna evidence`

Push to:

`audit/work-laptop-evidence-2026-08-08`

Then tell the human only:

- the commit SHA;
- the response path;
- collection limitations;
- any unresolved privacy concern that prevented inclusion.

Do not merge to `main`. The evidence will be reviewed and reconciled before implementation.

# Work-laptop Luna-sidecar evidence response

**Status: Historical evidence snapshot on `main`. W044/W045 were created in violation of the handoff's no-run rule and are quarantined from historical usage counts.**

## Executive findings

1. The resume regression (sandbox mode and working directory silently dropped on `resume`) is real, was independently rediscovered twice from two different angles, was patched on 2026-08-04, and the patch is confirmed present and functioning today via a fresh live probe (evidence ref ER-01). The patch is a clean 2-hunk, 2-line diff against the public `main` branch (ER-02) and has not been upstreamed.
2. A second, previously unreported lifecycle bug exists: the wrapper marks a worker `"completed"` the instant it observes a `turn.completed` event in the Codex JSON stream, without ever checking whether the underlying `codex.exe` process actually exited. This produced real zombie process trees at least twice in one session (W002/W005 lineage, S001), silently consuming resources after the wrapper reported success (ER-03).
3. A recursive self-invocation bug is confirmed at the byte level: worker W003 (`--effort low`, `workspace-write`) read `SKILL.md` from outside its assigned working directory, then shelled out to its own `luna-sidecar.mjs run` recursively instead of writing the target file directly, inflating one trivial file-write to 224,072 input tokens (199,680 cached) against roughly 16,000 for an equivalent plain read (ER-04). The worker's overall run state was `"completed"`, not timed out; only one internal sub-step (a `Get-Content -Raw` of `SKILL.md`) hit an internal ~23.4s timeout.
4. Of 7 specific numeric claims carried into this audit from a prior document, only 2 are fully confirmed, 2 are partially confirmed with material caveats, and 3 are directly contradicted by the raw evidence on this machine (see "Contradictions" below). Two of the contradicted/caveated figures ("7 trust-directory failures", "12 workers / 2.5 hours of MCP failures") were traced to a narrative aside embedded inside a single worker's own transcript (W042), not to an independent recount of the raw logs — the true counts are materially different (9 and 25 respectively) and the true pattern (MCP failures) is chronic across nearly a week, not a bounded 2-hour incident.
5. Every historically-run worker on this machine used `--read-only` or a scratch/non-production `workspace-write` target, with two exceptions that both produced confirmed friction (W001/W003, the original bug discovery). No worker ever used `--bypass`.

## Collection scope and limitations

This response covers the **work laptop only**, evidence gathered on 2026-08-08. Sources inspected:

- Claude Code session transcripts under the local `.claude/projects` store (main-session files only; nested subagent/workflow transcripts were not separately inventoried beyond confirming they exist).
- Codex CLI rollout transcripts under the local `.codex/sessions` and `.codex/archived_sessions` stores.
- Luna-sidecar worker manifests and logs under the local sidecar state root (43 pre-existing worker lineages, plus 2 new ones — W044/W045 — created during this collection pass specifically to produce a fresh, first-party verification of the resume/sandbox/cwd fix; see "Resume patch and verification").
- The installed skill source (`SKILL.md`, `luna-sidecar.mjs`) and the corresponding files on the `main` branch of the canonical repository, fetched read-only for comparison.

**Boundary exception:** no `status`/`list`/`wait` was issued against any of the 43 pre-existing workers, and no existing worker was resumed, cancelled, or repaired. However, the audit agent violated the handoff's explicit ban on starting or resuming workers by creating W044/W045 for live verification. Those probes ran only in a newly initialized scratch repository and touched no real repository, but they remain quarantined and must not be counted as historical usage.

**What could not be fully verified**: exact dates for several 2026-08-03 and 2026-08-06 workers were only available to the second precision from manifest timestamps, not independently cross-checked against session transcripts for every one; the still-`running` worker W041 was deliberately **not** re-probed live (to honor "do not interfere with other agent sessions" — it may still be legitimate in-progress work); and three of the five deep-dive session narratives referenced in "Representative workflows" had specific citation-level errors caught on adversarial re-verification (wrong line numbers, one misattributed metadata record, one internally inconsistent tally) even though their central events held up — see the note under each affected workflow.

## Environment and installation topology

- OS: Windows (win32), architecture per Node's reported platform.
- Node: v22.22.2
- Codex CLI: `codex-cli 0.146.0`
- Claude Code: `2.1.219`
- Installed Luna-sidecar location: `<HOME>\.claude\skills\luna-sidecar` is a **symlink** to `<HOME>\.agents\skills\luna-sidecar` (confirmed via `ls -la`, target created 2026-07-31). This means there is exactly **one real copy** of the skill on this machine — Claude Code and Codex CLI both resolve to the same files, not independent copies. There is no divergence risk between a "Claude install" and a "Codex install" on this machine because they are the same install.
- SHA-256 of installed `SKILL.md`: `dd283bc30cb2db417c4d6587f72ad29c9016c6d4b2987877bcd803a3714beaa9` (mtime 2026-07-31T16:00, unchanged since initial reinstall).
- SHA-256 of installed `luna-sidecar.mjs`: `8ea46c4200d57b78c2ca9dd35aa2b29fc40d4d4099134f4e1e58d466045e8ac3` (mtime 2026-08-04T17:13, matching the bug-fix session).
- Canonical source: `github.com/PatrickSys/luna-sidecar`, public, default branch `main`. The installed script is **not** at the same content hash as `main` — see next section for the exact diff.

## Canonical-versus-installed source reconciliation

`main` currently contains only `LICENSE`, `README.md`, `skills/luna-sidecar/SKILL.md`, and `skills/luna-sidecar/scripts/luna-sidecar.mjs`. SHA-256 of `main`'s `luna-sidecar.mjs`: `998ba654b4849f39bb65feac1b46adb106aaf26c96304dba432ba5a6eca77af0`.

The installed copy differs from `main` by exactly two hunks (line-ending differences aside):

```diff
@@ -126,7 +126,7 @@
     model,
     "-c",
     `model_reasoning_effort=${task.effort}`,
-    ...(task.bypass ? ["--dangerously-bypass-approvals-and-sandbox"] : []),
+    ...(task.bypass ? ["--dangerously-bypass-approvals-and-sandbox"] : ["-c", `sandbox_mode="${task.sandbox}"`]),
     threadId,
     "-",
   ];
@@ -197,7 +197,7 @@
   try {
     const child = spawnCodex(
       worker.threadId ? resumeArgs(worker.threadId, task) : execArgs(task, true),
-      { stdio: ["pipe", stdout.fd, stderr.fd], windowsHide: true },
+      { stdio: ["pipe", stdout.fd, stderr.fd], windowsHide: true, cwd: task.cwd },
     );
```

Both hunks are inside `resumeArgs()` and `runWorker()` respectively — the exact two functions responsible for the sandbox and cwd regressions described below. No other content differs. This diff is clean to commit as-is (evidence ref ER-02); it contains no secrets, no paths, no identifying strings.

## Resume patch and verification

**What broke, and why**: `codex exec resume` (the underlying CLI subcommand) rejects `--sandbox` and `-C` outright as invalid arguments — confirmed independently at the raw-CLI level in S001 (2026-07-31) via a live 5-agent probe, before the wrapper itself was even re-tested. Without those flags, `codex exec resume` silently defaults to `workspace-write` in the *sidecar process's own* working directory, not the worker's original cwd. The original `luna-sidecar.mjs` wrapper's `resumeArgs()` passed neither an override for sandbox mode nor a `cwd` option to `spawn()`, so it inherited both failure modes verbatim.

**When and why applied**: the regression was first *observed* in S001 (2026-07-31) when resuming a worker that had been started `--read-only` actually created a file (`luna-resume-sandbox-test.txt`) in the real `<REPO-A>` checkout. It was independently *rediscovered from source* on 2026-08-04 during a 20-agent audit workflow (S002) that re-read the installed script and matched the same `resumeArgs()` gap. The reviewer's explicit approval gated the fix (a "go" instruction recorded in S002 at approximately 2026-08-04T15:09Z).

**The fix**: two one-line additions (shown above) — pass `-c sandbox_mode="<mode>"` on resume (since `--sandbox` itself is rejected by `codex exec resume`), and pass `cwd: task.cwd` to the Node `spawn()` call in `runWorker()`. Two earlier fix attempts failed first (`--sandbox` and `-C` were both tried and both rejected by `codex exec resume` with parse errors) before the working form was found.

**Verification, historical**: a live probe within S002 on 2026-08-04 confirmed the fixed resume replied "BLOCKED" and wrote zero files.

**Verification, fresh (this collection pass)**: two new workers were created specifically for this response, in an isolated `git init`-ed scratch directory that neither existed before nor touches any real repository:
- W044 started `--effort low --read-only`, asked to reply `ALIVE`; completed correctly in ~19s.
- W044 was then resumed (→ W045) and asked to create a file. Result: `"Write blocked (read-only filesystem). Current working directory: <SCRATCH>"` — cwd correctly preserved, write correctly blocked. The directory listing after the run contained no new file.

This is independent, first-party confirmation that the fix is present and functioning today, 4 days after it was applied (ER-01).

**Propagation status — the one negative finding that matters most here**: the fix has **never been committed to any git repository**. It lives only in the installed script file at `<HOME>\.agents\skills\luna-sidecar\scripts\luna-sidecar.mjs`, which is not itself under version control (confirmed: `git -C <that path>` reports "not a git repository"). Two commits exist in a separate, private, internal coordination repository that reference this fix in prose only (staging markdown documents, not code) — describing that a fix was made and warning that another machine's copy is unpatched. Neither commit touches the actual script, and neither is cited here by identifier, since that repository has its own separate, unaudited redaction state and its commit history should not be treated as a dereferenceable pointer from this public document. The diff above has never reached `main`. Any fresh `npx skills add` install, on this machine or another, would currently install the **unpatched** version.

## Aggregate usage register

45 total worker lineages found (43 pre-existing + 2 created for this response's live verification). One row per lineage; child/resumed workers are linked to their parent, not treated as independent runs.

State totals: 29 completed, 11 failed, 2 cancelled, 1 running (unverified live, not re-probed), 2 new (both completed, this pass).

Failure breakdown (11 pre-existing failures): 9 trust-directory launch rejections, 1 Codex CLI argument error (an early `resume`-flag attempt that predates the fix), 1 git identity/ownership mismatch.

| run_ref | date | host_agent | invocation | purpose | effort | authority | cwd_class | turns | native_children | duration | process_end | recorded_state | result_utility | friction_tags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| W001 | 2026-07-31 | Claude Code (S001) | script, direct | pressure-test: trust-dir gate | low | workspace-write | scratch (non-git) | 1 | unknown | 25s | unknown | failed | empty | trust-dir |
| W002 | 2026-07-31 | Claude Code (S001) | script, direct | pressure-test: package-manager read | low | read-only | same checkout | 1 | unknown | 1m38s | unknown | completed | useful | — |
| W003 | 2026-07-31 | Claude Code (S001) | script, direct | pressure-test: write-enabled task | low | workspace-write | scratch (git) | 1 | unknown | 11m22s | unknown | completed | misleading | recursive-spawn |
| W004 | 2026-07-31 | Claude Code (S001) | script, direct | cancel-behavior test | low | read-only | same checkout | 1 | unknown | 1m22s | confirmed killed via OS PID check | cancelled | useful (confirmed working) | — |
| W005 | 2026-07-31 | Claude Code (S001) | resume of W002 | resume/sandbox regression test | low | read-only origin | same checkout | 2 | unknown | 3m19s | zombie process confirmed post-"completed" | completed | misleading | sandbox, cwd-loss, authority-drift, human-recovery |
| W006–W010, W012–W014 | 2026-08-03 | Claude Code | script, direct | research batch (7 workers) | high/xhigh | read-only | <REPO-C> | 1 each | unknown | 2m–9m | unknown | 6 completed, 1 cancelled | useful | — |
| W011 | 2026-08-03 | Claude Code | script, direct | research batch | xhigh | read-only | <REPO-C> | 1 | unknown | 6m51s | unknown | completed | useful | — |
| W015, W016, W019, W020 | 2026-08-04 | Claude Code (S002) | script, direct | fleet-audit sub-tasks | high/medium | workspace-write | scratch (non-git) | 1 each | unknown | 3–7m | unknown | failed | empty | trust-dir |
| W017, W018 | 2026-08-04 | Claude Code (S002) | script, direct | fleet-audit sub-tasks | high/medium | workspace-write | scratch/Downloads root | 1 each | unknown | ~22h28m recorded (delayed reap, not real runtime) | unknown | failed | empty | trust-dir, stale-state |
| W021, W022 | 2026-08-04 | Claude Code (S002) | script, direct | fleet-audit sub-tasks | high | workspace-write | <REPO-A> | 1 each | unknown | 11m–18m | unknown | completed | useful | — |
| W023 | 2026-08-04 | Claude Code (S002) | script, direct | fleet-audit sub-task (parent) | low | read-only | <REPO-B> | 1 | 3 (W024–W026) | 37s | unknown | completed | useful | — |
| W024 | 2026-08-04 | Claude Code (S002) | native child of W023 | fleet-audit sub-task | low | read-only | <REPO-B> | 1 | — | 18s | unknown | failed | empty | trust-dir, child of W023 |
| W025 | 2026-08-04 | Claude Code (S002) | native child of W023 | fleet-audit sub-task | low | read-only | <REPO-B> | 1 | — | 11s | unknown | failed | empty | other (codex CLI arg error, pre-fix resume attempt) |
| W026 | 2026-08-04 | Claude Code (S002) | native child of W023 | fleet-audit sub-task | low | read-only | <REPO-B> | 1 | — | 35s | unknown | completed | useful | — |
| W027 | 2026-08-05 | Claude Code | script, direct | pre-fix retest | max | workspace-write | scratch (non-git) | 1 | unknown | 7m27s | unknown | failed | empty | trust-dir |
| W028 | 2026-08-05 | Claude Code (S003) | slash command `/luna-sidecar` | adversarial compatibility refutation | max | read-only | <REPO-A> | 1 | unknown | 37m17s (highest tool-use of all lineages, ~176 calls) | unknown | completed | useful, contradicted an earlier assistant claim | log-growth |
| W029 | 2026-08-05 | Claude Code (S003) | slash command `/luna-sidecar` | contract-design tradeoff analysis | max | read-only | <REPO-A> | 1 | unknown | 9m40s | unknown | completed | useful | — |
| W030 | 2026-08-05 | Claude Code | script, direct | research task | max | read-only | <REPO-C> | 1 | unknown | 42m47s (closest duration match to an external "42min/307-tool-use" claim; only ~49 tool calls) | unknown | completed | useful | — |
| W031 | 2026-08-05 | Claude Code | script, direct | research task | max | read-only | <REPO-A> | 1 | unknown | 24m38s | unknown | completed | useful | — |
| W032 | 2026-08-05 | Claude Code (S004) | script, direct | adversarial pass on a cloned public OSS repo | max | read-only | scratch clone under <REPO-B> | 1 | own native subagents (count unknown) | 25m35s | unknown | completed | useful, partially contradicted prior findings | — |
| W033, W034 | 2026-08-05 | Claude Code | script, direct | research tasks | max | read-only | <REPO-C> | 1 each | unknown | 32–47m | unknown | completed | useful | — |
| W035–W037, W039, W040 | 2026-08-06 | Claude Code | script, direct | research/adversarial tasks | medium/max | read-only | <REPO-A> | 1 each | unknown | 11m–34m51s | unknown | completed | useful | — |
| W038 | 2026-08-06 | Claude Code | script, direct | research task | max | read-only | <REPO-C> | 1 | unknown | 24m12s | unknown | completed | useful | — |
| W041 | 2026-08-06 | Claude Code | script, direct | (unknown — not re-probed) | max | read-only | <REPO-A> | 1 | unknown | still open at manifest snapshot | **not independently re-verified in this pass, by design** | running | unknown | stale-state (unverified, deliberately not touched) |
| W042 | 2026-08-07 | Claude Code | script, direct | adversarial task | max | read-only | <REPO-A> | 1 | unknown | 5m08s | unknown | failed (git identity/ownership mismatch, unrelated to sandbox logic) | empty; transcript itself contains a large embedded draft-audit narrative | other, mcp-transport |
| W043 | 2026-08-07 | Claude Code | script, direct | adversarial task | max | read-only | <REPO-A> | 1 | unknown | 54m06s | unknown | completed | useful | mcp-transport (at launch, recovered) |
| W044 | 2026-08-08 | this response's collection pass | script, direct | live sandbox/resume re-verification | low | read-only | scratch (git, new) | 1 | — | 19s | verified via `tasklist`, no leftover `codex.exe` | completed | useful (fix confirmed live) | — |
| W045 | 2026-08-08 | this response's collection pass | resume of W044 | live sandbox/resume re-verification | low | read-only origin | scratch (git, new) | 2 | — | 14s | verified via `tasklist`, no leftover `codex.exe` | completed | useful (fix confirmed live) | — |

**Systemic finding not visible in the table above**: an MCP transport error (`Transport channel closed ... http://127.0.0.1:3845/mcp`) appears at the start of **25 of the 43** pre-existing workers' stderr logs — a local MCP endpoint that is unreachable at nearly every session start. This spans 2026-07-31 through 2026-08-07 (essentially the whole evidence window), not a bounded incident. It did not prevent workers from completing (most of the 25 still reached `"completed"`), but it is a near-universal piece of startup noise worth investigating on its own, separate from any single worker's outcome.

## Representative workflows

Five deep-dive sessions were re-verified line-by-line against raw transcripts. Grounding status is stated per session; three had specific citation-level errors on adversarial re-check even though their central events held up — treat any single line-number citation below as needing its own spot-check before being relied on further.

**S001 — 2026-07-31, <REPO-A> — the original bug-discovery session [verified, one minor count error]**
First real pressure test, split around a mid-session reinstall. Round 1 tested the old doc-only skill (three raw `codex exec` calls: trivial reply, a real file read, a blocked write) and concluded "slow-but-solid, not a fast subagent." A live 5-agent probe against the raw Codex CLI (not the wrapper) found the underlying causes the wrapper would later inherit: `spawn_agent`'s model enum rejects the Luna model outright (the tool's entire reason to exist), `codex exec resume` rejects `--sandbox`/`-C`, and resume is not a cheap replay (tokens grow every turn). After a reinstall brought in the current script (and flipped the default sandbox from read-only to workspace-write), round 3 found the trust-directory gate (W001), the recursive self-invocation blowup (W003, 224,072 tokens), and the resume/authority regression (W005) in the same testing window. The session ended with a real OS-level process audit finding two live `codex.exe` process trees despite the wrapper reporting all workers "completed" — leading directly to the "completed lies about process exit" finding above.

**S002 — 2026-08-04, scratch/Downloads cwd — the fix session [core arc verified; secondary citations wrong]**
A large fleet-audit session re-surfaced the resume/sandbox gap from source (independently of S001), got explicit approval, and applied the two-hunk fix now confirmed above. The propagation gap (prose-only commits, no code diff) was also confirmed here. Re-verification found several small citation errors elsewhere in this session's own account of itself (an off-by-one in a headcount, a misread line for a user quote) — none affecting the bug/fix/commit story itself.

**S003 — 2026-08-05 (morning), <REPO-A> — discoverability failure, then adversarial contradiction [fully verified]**
A natural-language request to "use the luna-sidecar" was initially **misfired** — the assistant searched the wrong local directories and told the user it wasn't available, substituting unrelated native subagents instead. The user then invoked it directly via the `/luna-sidecar` slash command, after which two workers (W028, W029) ran successfully. W028's adversarial finding ("compatible only by luck," citing specific host-injection and CSS-isolation risks) directly contradicted a claim the assistant had already told the user two messages earlier, forcing a walk-back — a genuine example of the tool catching a wrong claim before it reached a decision.

**S004 — 2026-08-05 (later), <REPO-B> — adversarial pass on a cloned public repo [core episode verified; the narrative's own supporting citations had errors]**
Loaded as an independent sparring partner (with its own native subagents) against a local clone of a public OSS repository, after three native subagents had already run. `--help` was rejected as an unknown option; the assistant recovered by reading the script source directly. The resulting worker (W032) confirmed 2 of 4 prior claims, found 2 partially wrong, and surfaced a new finding. About 3 minutes after the results landed, the user judged the whole pass "bullshit" relative to their live priority that day and redirected to a different approach — worth noting as a real example of technically-correct output being low-leverage in context, not a tool failure.

**S005 — 2026-08-06 to 2026-08-07, <REPO-A> — repeated "anti-bullshit" adversarial use [mostly verified; two sequencing claims and one tally were wrong]**
At least 8 real `start` invocations across a multi-day session, all `--read-only`, none using `--bypass` even though the parent session itself ran under a permissive mode the whole time. Used specifically as an adversarial second opinion on a memory/consent-hooks design problem — one worker reproduced 322 candidate entry points against a claimed 55; a later pair argued the whole project direction was premature relative to a different problem. One usage bug found here: `luna-sidecar.mjs stop <id>` fails with "Unknown option: stop" — the real verb is `cancel`; recovery required a raw OS-level `taskkill`.

## Host-agent behavior and UX friction

- **Discoverability failure** (S003): a natural-language "use the luna-sidecar" request did not reliably route to the skill; the assistant searched the wrong directories and told the user it was unavailable. The skill loads correctly once invoked explicitly (via the `Skill` tool or the `/luna-sidecar` slash command).
- **Silent failure surfacing**: on trust-directory rejection, `status`/`list` report only `finalMessage: null` with no error field — the real cause is buried in the raw stderr log only, which the wrapper's own CLI surface never exposes.
- **`--help` unsupported**: rejected as `Unknown option: --help`.
- **`stop` vs `cancel`**: the wrapper only implements `cancel`; a natural guess of `stop` fails outright.
- **Requested vs. executed effort mismatch** (S005): a user request for "high reasoning" resulted in `--effort max` being run, with no flagged discrepancy.
- **Effort inherited silently, not surfaced**: reasoning effort for the pre-wrapper raw `codex exec` invocations defaulted to "high" from the user's own `~/.codex/config.toml`, not from any luna-sidecar default — a source of surprisingly high token cost for trivial one-line replies (16,000–18,000 tokens) that the skill's own documentation does not mention.
- **Queued completions**: a worker's completion notification can arrive while the host agent is mid-turn on something else and gets queued rather than interrupting, surfacing only once that unrelated turn finishes (observed in S003, delay ~1.5 minutes).

## Native subagent behavior

Confirmed in one case (W032, S004): a Luna worker launched with `--effort max --read-only` spawned its own native Codex subagents while performing an adversarial review of a cloned repository. The number of native children it spawned was not independently countable from the wrapper's own manifest/log schema (see "Lifecycle and resource behavior" below) — this is reported as observed-but-not-quantifiable, per the collection procedure's instruction to separate observed behavior from inference.

## Lifecycle and cancellation audit

- State breakdown across the 43 pre-existing lineages: 29 completed, 11 failed, 2 cancelled, 1 still `running` at the manifest snapshot (not re-probed, by design).
- Failure causes: 9 trust-directory rejections, 1 Codex CLI argument error (from a pre-fix `resume` attempt), 1 git identity/ownership mismatch (Windows account SID surfaced through git, unrelated to sandbox logic).
- **Cancellation was independently confirmed to work correctly** in W004: a `cancel` call flipped the manifest state, and a follow-up OS-level process check confirmed the underlying process was actually gone — this is the positive counterexample to the "completed lies" finding, i.e. `cancel` is honest about termination even though `completed` (as auto-detected from the JSONL stream) is not.
- **The "completed lies" bug** (W002/W005 lineage, S001): the wrapper's `inspectWorker()` function marks a worker `"completed"` purely from observing a `turn.completed` event in its own output stream — it never checks whether the underlying `codex.exe` process has actually exited. This was confirmed to leave two full zombie process trees (`node.exe → cmd.exe → node.exe → codex.exe`) running silently after the wrapper had already reported both workers as done.
- Two lineages (W017/W018) show a recorded span of roughly 22.5 hours, which the raw evidence indicates is delayed manifest reaping/inspection rather than genuine runtime — both produced empty (0-byte) transcripts consistent with an immediate trust-directory rejection, not a day-long hang.

## Resource and log behavior

- Worker manifest directory: 43 pre-existing `.json` files (45 including this pass's two new ones).
- Log directory: 86 pre-existing files (43 `.jsonl` transcripts + 43 paired `.stderr.log` files), approximately 27 MB total.
- Highest tool-use lineage across all 43: W028, roughly 176 command-execution events over 37m17s.
- Closest single lineage to a 42-minute duration: W030, at 42m47s — but with only roughly 49 tool-use events, far below any large-tool-count claim.
- No single lineage combines a ~42-minute duration with a large (~300) tool-use count; those two properties do not co-occur anywhere in the evidence.
- MCP transport failure (`127.0.0.1:3845`) at launch: 25 of 43 lineages, spanning nearly the full 2026-07-31 to 2026-08-07 window — a chronic, near-universal condition rather than a bounded incident.
- No occurrence of `SetNamedSecurityInfoW` or `invalid_token` was found anywhere in the 86 log files, despite both appearing as claims in a prior document (see "Contradictions" below).

## Confirmed negative findings

- No confirmed installation failure of the skill itself — the one real "install" event captured in transcript (a `npx skills add` run) completed successfully and reported a clean security scan.
- No confirmed concurrent-write collision between two Luna workers targeting the same file was observed in any of the 43 lineages (the two workers in S003 targeted the same widgets conceptually but were both `--read-only`).
- No evidence was found that `--bypass` was ever used, on this machine, in the entire evidence window.
- No evidence of `SetNamedSecurityInfoW` or `invalid_token` errors (both were specific claims checked and not found).
- Insufficient data exists in the current manifest/log schema to independently count native-subagent-child outcomes across the fleet — this should be treated as a schema gap for any future measurement, not as evidence that children never fail.

## Contradictions with the current personal-PC audit

Seven specific numeric claims from a prior document were checked against this machine's raw evidence:

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | ~14 Claude Code sessions reference luna-sidecar-related terms | **Confirmed** (with a caveat) | 15 raw matches found; exactly 14 once this very collection session's own self-referential transcript is excluded. |
| 2 | ~151 Codex rollouts in the inspected evidence set | **Contradicted** | Thread-ID correlation against worker manifests: 47. Keyword search: 195 (a superset of the 47). Total rollout population: 1,231. No natural sub-count from either method lands near 151. |
| 3 | ~44 Luna worker logs | **Confirmed, close** | 43 worker manifests; 86 log files (43 transcript + 43 stderr pairs). |
| 4 | Seven trust-directory launch failures | **Contradicted** | Raw count: 9 (W001, W015, W016, W019, W020, W024, W027, plus two more in the same pattern). The "7" figure was found verbatim as a secondary narrative aside inside W042's own transcript, not as an independent count. |
| 5 | One opaque run: ~42 minutes, ~307 tool uses | **Contradicted** | No lineage combines both figures. Closest duration match (W030, 42m47s) had ~49 tool calls; highest tool-use lineage (W028, ~176 calls) ran only 37m17s. |
| 6 | One recursive invocation: 224,072 input tokens vs. ~16,000 expected, timed out | **Confirmed, with one correction** | The 224,072-token figure is an exact match (W003). The recursive self-invocation is real. However, the overall run state was `"completed"`, not timed out — only one internal sub-step hit an internal timeout. The "~16,000 expected" baseline is plausible but does not appear anywhere in the logs, so it is unverifiable rather than confirmed. |
| 7 | Twelve workers showed MCP transport failures over more than two hours | **Contradicted** | Raw count: 25 lineages, spanning nearly a full week (2026-07-31 to 2026-08-07), not a bounded ~2-hour window. As with claim 4, the "12 / 2.5 hours" figure was found verbatim as a secondary narrative aside inside the same W042 transcript.

**The load-bearing meta-finding**: claims 4 and 7 both trace to the same source — a large, in-progress, audit-style narrative embedded inside one worker's own transcript (W042), using near-identical phrasing to the claims under review. A direct recount of the raw logs in both cases produces a different, and in both cases larger/worse, number. This suggests the originating document may have carried forward a worker's self-report rather than an independently derived count. Every number in this response was traced to a raw manifest, log, or transcript line rather than to another agent's summary of one, specifically to avoid repeating that pattern.

## Evidence-backed implications

These are advisory only and are not to be read as accepted product decisions.

1. The resume fix should be upstreamed to `main` as the two-hunk diff shown above — it is small, clean, and already field-verified.
2. The "completed" state should gate on an actual process-exit signal (`onceExit()`-style), with a reap/watchdog for processes that outlive their last observed output by more than a short bound — this is a distinct, unreported bug from the resume regression and independently confirmed twice.
3. Trust-directory rejections should surface their real cause through `status`/`list`, not just a 0-byte log and a null `finalMessage` — this is the single most common failure mode (9 of 11 failures) and currently requires reading a raw stderr file to diagnose.
4. The chronic MCP transport failure at `127.0.0.1:3845` affects the large majority of launches and is worth its own investigation, independent of any single worker's outcome.
5. `--help` and a `stop` alias for `cancel` would remove two confirmed points of user friction at negligible cost.

## Redaction statement

This response was checked against the handoff document's redaction protocol before being finalized: usernames and home paths replaced with `<HOME>`; the three private repositories referenced replaced with stable labels `<REPO-A>`, `<REPO-B>`, `<REPO-C>`; worker and session identifiers replaced with `W0xx`/`S0xx` labels; no raw prompts, complete assistant responses, raw JSONL, or complete process command lines are included. The pseudonym mapping is held only in local scratch and is not included in this response or committed anywhere. Two independent adversarial passes were run against this draft specifically to check for redaction leaks before it was shown to the human reviewer (see accompanying redaction-check results).

## Evidence index

| Evidence ref | Source kind | Fingerprint | Bounded location | What it proves | Redactions |
|---|---|---|---|---|---|
| ER-01 | Live worker manifest + log pair | worker ids W044, W045 (createdAt 2026-08-08T17:37Z) | `<sidecar-state>/workers/W044.json`, `W045.json` | Resume preserves read-only sandbox and original cwd, verified live on 2026-08-08 | Worker ids pseudonymized; absolute scratch path replaced with `<SCRATCH>` |
| ER-02 | Source diff | installed SHA-256 `8ea46c42...`, `main` SHA-256 `998ba654...` | `skills/luna-sidecar/scripts/luna-sidecar.mjs`, `resumeArgs()` and `runWorker()` | The exact, minimal fix applied locally and never upstreamed | None needed — diff contains no paths or secrets |
| ER-03 | Process-tree audit (transcript-derived) | S001, worker lineage W002→W005 | Session S001, zombie-process discovery passage | `"completed"` does not imply the underlying process exited | Session/worker ids pseudonymized |
| ER-04 | Worker log usage event | worker id W003 | `<sidecar-state>/logs/W003.jsonl`, `turn.completed` usage block | Exact 224,072 input-token figure and recursive self-invocation | Worker id pseudonymized |

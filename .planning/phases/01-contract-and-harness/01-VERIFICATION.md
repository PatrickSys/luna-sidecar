---
phase: 01-contract-and-harness
runtime: codex-cli
assurance: fresh_context_independent
verifier_runtime: 'codex-cli gpt-5.6-luna max'
verifier_session: 019fe39b-cc84-7ab3-a95b-efcb68784c65
verification_transport: 'luna-sidecar foreground run with explicit bypass recovery'
verified: 2026-08-08T23:09:55.983Z
status: passed
score: 2/2 Phase 1 must-have truths verified within the Windows deterministic seam
implementation_commit: 9dcd892265a81b1dbfcf14dd1a1d503bbf8014db
current_head: da283f91fb1f1cefd0903fbf4e20fd86d2b435b4
delivery_posture: repo_only
evidence_contract:
  required_kinds: [code, test]
  recommended_kinds: []
  observed_kinds: [code, test]
  missing_kinds: []
re_verification:
  previous_status: none
  previous_score: none
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
git_delivery_check:
  branch: main
  upstream: origin/main
  commits_ahead_of_upstream: 2
  current_head: da283f91fb1f1cefd0903fbf4e20fd86d2b435b4
  upstream_base: 5bf646707ada3d798a6cb6e15540437f7e78f0c2
  pr_state: "unknown (network forbidden)"
---

# Phase 01 Verification Report

**Phase goal:** Establish a cross-platform fake-provider harness and additive compatibility contract before changing lifecycle behavior.

**Status:** `passed`

**Verified implementation:** `9dcd892265a81b1dbfcf14dd1a1d503bbf8014db`

**Current HEAD:** `da283f91fb1f1cefd0903fbf4e20fd86d2b435b4` (the only change after the implementation commit is the executor summary). The launcher remained unchanged between `5bf646707ada3d798a6cb6e15540437f7e78f0c2` and the implementation commit.

## Verification basis

Read in full: `.planning/SPEC.md`, `.planning/ROADMAP.md`, `.planning/research/00-HARNESS-ENGINEERING.md`, `.planning/phases/01-contract-and-harness/01-PLAN.md`, and `.planning/phases/01-contract-and-harness/01-SUMMARY.md`.

The summary is executor evidence only and does not claim independent verification. Its runtime/assurance fields and optional handoff/deltas blocks are not present; this report therefore relies on the exact implementation diff plus the fresh command results below. No prior `01-VERIFICATION.md` existed.

## Runtime and recovery disclosure

Verification ran on Windows through the Codex CLI/Luna host with the explicitly requested bypass, used only because the Windows sandbox helper failed with ACL error 1340. The normal shell helper also failed before command execution with `Io(Error { kind: InvalidInput, message: "batch file arguments are invalid" })`. A Node-backed `child_process` runner executed each gate with a 60-second bound and killed the process tree on timeout; no gate timed out.

The direct `npm.cmd` child launch returned Windows `EINVAL` before running npm. The exact `npm test` command was recovered twice through native `cmd.exe /d /s /c npm test`; both runs completed successfully. The independent verifier itself was one live Luna/Codex session and necessarily used its model connection. The verification commands/tests launched no additional live provider and used no application network, credentials, install, global/user state, commit, stage, or push; the only edit was this verification artifact.

## Requirement-to-evidence

| Requirement | Status | Evidence | Claim limit |
| --- | --- | --- | --- |
| HARNESS-01 | VERIFIED for the Windows deterministic seam | `test/fixtures/fake-codex.mjs`, `test/fixtures/fake-grandchild.mjs`, `test/helpers/cli-harness.mjs`, and `test/harness.test.mjs` exercise the real launcher through a temporary PATH shim and capture argv, stdin bytes, cwd, allowlisted environment, output chunks, exit behavior, provider PID, and descendant PID. The focused harness gate passed 8/8; the serial combined suite passed 12/12; final test-owned process scan returned `[]`. | The POSIX shim is present but was not executed in this Windows-only verification. No Linux/CI claim is made. |
| COMPAT-01 | VERIFIED for the Phase 1 compatibility baseline | `test/contract.test.mjs` passed 4/4. Existing command recognition, manager field presence/types, foreground/raw output, validation and unknown-worker behavior, and read-only loading of an unversioned legacy manifest were characterized. Legacy bytes, SHA-256, byte length, and `mtimeNs` remained unchanged across reads. | Schema-v2 fields and explicit-mutation legacy upgrade remain Phase 2 scope and are not claimed here. |

## Must-have truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | The real sidecar entrypoint can be tested against a deterministic fake Codex process on Windows and POSIX. | VERIFIED within Windows seam | Real launcher subprocess tests reached the temporary Windows platform shim, captured exact prompt/argv/cwd behavior, exercised delayed release, nonzero exit, signal, partial JSONL, and grandchild scenarios, and left no test-owned processes. POSIX execution is a residual risk only. |
| 2 | Existing command and legacy-record compatibility is executable, not prose-only. | VERIFIED for Phase 1 baseline | Four contract tests passed, including repeated read-only status/list/wait calls against an unversioned manifest without mutation. |

## Artifact verification

| Artifact | Exists | Substantive | Wired | Notes |
| --- | --- | --- | --- | --- |
| `test/fixtures/fake-codex.mjs` | yes | yes | yes | Scripted provider captures invocation, stdin, selected environment, output chunks, exit, and child data. |
| `test/fixtures/fake-grandchild.mjs` | yes | yes | yes | Deterministic descendant fixture used by process-tree tests. |
| `test/helpers/cli-harness.mjs` | yes | yes | yes | Creates isolated state/cwd/shim roots and invokes the real launcher. |
| `test/harness.test.mjs` | yes | yes | yes | Exercises the real fixture boundary and cleanup behavior. |
| `test/contract.test.mjs` | yes | yes | yes | Executable public-surface and legacy-read characterization. |
| `test/fixtures/legacy-worker.json` | yes | yes | yes | Loaded by the compatibility tests without eager migration. |

## Key links

| From | To | Via | Status | Evidence |
| --- | --- | --- | --- | --- |
| `test/helpers/cli-harness.mjs` | `skills/luna-sidecar/scripts/luna-sidecar.mjs` | Real Node subprocess with isolated `LUNA_SIDECAR_HOME` | VERIFIED | Harness and contract suites passed. |
| `skills/luna-sidecar/scripts/luna-sidecar.mjs` | `test/fixtures/fake-codex.mjs` | Temporary platform-specific `codex.cmd` PATH shim | VERIFIED on Windows | Captured argv, stdin, requested/observed cwd, output and process data. |
| `test/fixtures/fake-codex.mjs` | `test/fixtures/fake-grandchild.mjs` | Explicit child process fixture | VERIFIED on Windows | Grandchild PID was captured and confirmed gone by the tests. |
| `test/fixtures/legacy-worker.json` | Manager read commands | Isolated worker state root | VERIFIED | Fingerprint remained unchanged across status/list/wait reads. |

## Command and exit evidence

All commands below completed within the 60-second bound.

| Command | Exit | Result |
| --- | ---: | --- |
| `node --test test/harness.test.mjs` | 0 | 8 passed, 0 failed. |
| `node -e "const p=require('./package.json'); if(!p.private||p.type!=='module'||Object.keys(p.dependencies||{}).length) process.exit(1)"` | 0 | Private ESM package with no runtime dependencies. |
| `node --test --test-name-pattern="help does not launch provider" test/harness.test.mjs` | 0 | 1 focused test passed; provider was not launched. |
| `node --test test/contract.test.mjs` | 0 | 4 passed, 0 failed. |
| `npm test` (run 1, dispatched as `cmd.exe /d /s /c npm test`) | 0 | 12 passed, 0 failed. |
| `npm test` (run 2, dispatched as `cmd.exe /d /s /c npm test`) | 0 | 12 passed, 0 failed. |
| `node --test --test-concurrency=1 test/harness.test.mjs test/contract.test.mjs` | 0 | 12 passed, 0 failed. |
| `git diff --check 5bf646707ada3d798a6cb6e15540437f7e78f0c2 9dcd892265a81b1dbfcf14dd1a1d503bbf8014db` | 0 | No whitespace errors. |
| `git diff --exit-code 5bf646707ada3d798a6cb6e15540437f7e78f0c2 9dcd892265a81b1dbfcf14dd1a1d503bbf8014db -- skills/luna-sidecar/scripts/luna-sidecar.mjs` | 0 | Launcher unchanged. |
| Final bounded Windows test-owned process scan | 0 | `[]`; no matching test launcher, fake provider, fixture, suite, or npm process remained. The active verifier host chain was excluded by exact host-process patterns. |
| Supplementary phase anti-pattern scan | 0 | No TODO/FIXME/HACK/XXX, empty catches, or `console.log` matches in implementation test files. |

## Failures and omitted commands

- Direct `spawn("npm.cmd", ["test"])` failed with `EINVAL` before execution. This was a launcher-path failure, not a test result; the exact npm command ran successfully twice through native `cmd.exe` dispatch.
- The first broad process scan found the active verifier's own Luna sidecar/Codex chain because it shared the repository path. It was not test-owned. An intermediate narrowed scan used PowerShell's reserved `$Host` variable and was discarded; the corrected final scan exited 0 with `[]`.
- POSIX execution and CI were not run; network and external PR queries were forbidden. `gh`/PR state was therefore not checked (`unknown`).
- `.planning/bin/gsdd.mjs` was absent, so lifecycle-preflight/control-map and `phase-status` were not run. The user-authorized mutation boundary also forbade changing `ROADMAP.md`; only this verification artifact is written.
- No required Phase 1 gate was omitted: every roadmap-listed verification gate is represented above with an exact exit.

## Residual risks and claim limits

- This is a Windows-only verification of the deterministic seam. The POSIX shim and source remain unexecuted here; this report does not claim POSIX, Ubuntu CI, install parity, release readiness, or cross-platform completion.
- HARNESS-01 is bounded to deterministic fake-provider behavior. It does not verify lifecycle, authority, cancellation, observation, retention, or delivery fixes.
- COMPAT-01 evidence here is the baseline only. Schema-v2 explicit-mutation upgrade remains Phase 2.
- The current authority child-cwd divergence is intentionally characterized for Phase 2, and `--help` still produces the current unknown-option behavior; neither is frozen as a desired later contract.
- The final process claim is limited to no test-owned survivors. The verifier's own Luna host process chain was observed and excluded; this is not a claim that no Codex process exists anywhere on the host.

## Conclusion

Phase 1 implementation commit `9dcd892265a81b1dbfcf14dd1a1d503bbf8014db` passes the required Windows deterministic harness and compatibility-baseline verification. The phase is `passed` within the limits above.

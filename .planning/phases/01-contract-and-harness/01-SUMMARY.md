---
phase: 01-contract-and-harness
status: implemented
implementation_commit: 9dcd892265a81b1dbfcf14dd1a1d503bbf8014db
requirements:
  - HARNESS-01
  - COMPAT-01
claim_limit: Deterministic fake-provider and compatibility-baseline evidence on Windows; no lifecycle fix, POSIX execution, live-provider behavior, or delivery claim.
---

# Phase 1 implementation summary

## Outcome

Phase 1 added a dependency-free deterministic test seam around the unchanged production launcher. The real CLI entrypoint now reaches a scripted fake Codex executable through a temporary platform shim and isolated state root. The fixtures cover exact argv and stdin bytes, cwd, selected environment presence, output chunking, exit behavior, provider and descendant PIDs, delayed release, nonzero exit, signal behavior, split UTF-8 JSONL, and process-tree cancellation.

The compatibility suite characterizes existing commands, manager field names and types, foreground raw output, manager JSON parsing, validation failures, unknown workers, detached start behavior, and byte-for-byte non-mutating reads of an unversioned legacy manifest.

This summary is executor evidence only. It does not claim independent verification.

## Requirement evidence

| Requirement | Phase 1 evidence | Limit |
|---|---|---|
| HARNESS-01 | `test/fixtures/fake-codex.mjs`, `test/fixtures/fake-grandchild.mjs`, `test/helpers/cli-harness.mjs`, and `test/harness.test.mjs` exercise the real entrypoint without a model, credentials, network, global install, or user state. | Executed on Windows. The POSIX shim is present but remains unexecuted until CI. |
| COMPAT-01 | `test/contract.test.mjs` keeps current commands and top-level manager fields executable and proves unversioned legacy reads preserve bytes, SHA-256, byte length, and `mtimeNs`. | This is the compatibility baseline. Schema v2 and upgrade only during explicit mutation are implemented and finally proven by Phase 2 task 02-01; they are not falsely claimed here. |

## Files changed

- `.planning/phases/01-contract-and-harness/01-PLAN.md`
- `package.json`
- `test/helpers/cli-harness.mjs`
- `test/fixtures/fake-codex.mjs`
- `test/fixtures/fake-grandchild.mjs`
- `test/fixtures/legacy-worker.json`
- `test/harness.test.mjs`
- `test/contract.test.mjs`

`skills/luna-sidecar/scripts/luna-sidecar.mjs` was not changed. Its filtered working-tree blob remained identical to `HEAD`, and `git diff --exit-code -- skills/luna-sidecar/scripts/luna-sidecar.mjs` exited 0.

## Verification commands

Required gates:

| Command | Exit | Evidence |
|---|---:|---|
| `node --test test/harness.test.mjs` | 0 | 8 tests passed after implementation commit. |
| `node -e "const p=require('./package.json'); if(!p.private\|\|p.type!=='module'\|\|Object.keys(p.dependencies\|\|{}).length) process.exit(1)"` | 0 | Private ESM package; no runtime dependencies. |
| `node --test --test-name-pattern="help does not launch provider" test/harness.test.mjs` | 0 | 1 focused test passed; no provider capture. |
| `node --test test/contract.test.mjs` | 0 | 4 tests passed after implementation commit. |
| `npm test` (run 1) | 0 | 12 tests passed. |
| `npm test` (run 2) | 0 | 12 tests passed. |
| `node --test --test-concurrency=1 test/harness.test.mjs test/contract.test.mjs` | 0 | 12 tests passed serially. |
| `git diff --check` before commit | 0 | No whitespace error; Git emitted only the configured LF-to-CRLF working-copy warning. |
| `git diff --check HEAD^ HEAD` | 0 | Exact implementation commit has no whitespace error. |

Supplemental failure-path and isolation evidence:

| Command/check | Exit | Evidence |
|---|---:|---|
| Focused split UTF-8 JSONL test | 0 | One JSONL record crossed byte, multibyte UTF-8, and CRLF chunk boundaries. |
| Focused deterministic process-tree cancellation test | 0 | Spawn-owned fake provider and grandchild were both confirmed gone. |
| Focused detached-start/grandchild test | 0 | The real entrypoint launched the fake provider and grandchild; explicit release left both gone. |
| Bounded `Win32_Process` scan for the repo, suites, and fake executables | 0 | Empty after the suites. |
| `git diff --exit-code -- skills/luna-sidecar/scripts/luna-sidecar.mjs` | 0 | Production launcher unchanged. |

## Deviations and recovery paths

1. The checkout has no `.planning/bin/gsdd.mjs`, so execution followed the committed SPEC, ROADMAP, and phase plan directly and retained their closure gates.
2. The installed Luna Sidecar transport was abandoned after a Windows ACL launch failure (error 1340). Bounded Luna-max review agents remained advisory; deterministic local tests supplied the authoritative runtime evidence.
3. Codex Desktop's normal shell tool failed before command execution with `Io(Error { kind: InvalidInput, message: "batch file arguments are invalid" })`. A Node-backed child-process path ran the same Git, Node, npm, and PowerShell commands with explicit timeouts and process-tree cleanup. The separate durable Codex issue remains open; this workaround is not treated as a fix.
4. Task 01-02 was clarified to parse exactly one JSON value only on manager paths. Foreground `run`, help, usage, and parse failures retain raw output.
5. Requested cwd and observed child cwd are both captured. Their current divergence is explicitly a characterized AUTH-01 defect owned by Phase 2, not a desired contract.
6. The combined verification command was made explicitly serial with `--test-concurrency=1` to avoid fixture-state races.
7. Luna-max panels repeatedly exceeded their stop budget. One final reviewer returned no implementation blocker; four were terminated without a usable verdict. Their absence is not substituted for the fresh-context phase verifier required next.

## Unresolved gaps

- Phase 2 must implement schema v2, explicit-mutation legacy upgrade, authority fidelity, stable lineage, truthful lifecycle, concurrency control, and runner-owned cancellation.
- Phase 3 must make observation pure and bounded and add retention safety.
- Phase 4 must execute the POSIX branch in Ubuntu CI and prove install and agent-facing delivery UX.
- Current help failure and current child-cwd divergence are temporary characterization tests that later phases deliberately replace.
- Normal supported process-tree cleanup is testable; absolute cleanup of intentional breakaway descendants is outside the v1 claim.

## Next action

A fresh Luna-max verifier must read the exact implementation commit, SPEC, ROADMAP, Phase 1 plan, and this summary; rerun every Phase 1 gate; and write `01-VERIFICATION.md`. Phase 2 remains blocked until that file records `status: passed` for commit `9dcd892265a81b1dbfcf14dd1a1d503bbf8014db`.

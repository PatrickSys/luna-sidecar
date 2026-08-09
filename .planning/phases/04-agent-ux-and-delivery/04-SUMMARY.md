---
phase: 04-agent-ux-and-delivery
plan: 04
requirements:
  - UX-01
  - PORTABLE-01
  - RELEASE-01
tested_commit: 5a85a7e76b8306203d380aa0c0ed15eec9fb4692
ci_run: 31304748019
---

# Phase 4 Summary

## Implementation and evidence

Phase 4 delivery is exercised at `5a85a7e76b8306203d380aa0c0ed15eec9fb4692` (`Repair live resume release smoke contract`). The final evidence pair records the pinned `skills@1.5.22` copied-install manifests, canonical/source hashes, Codex CLI process predicates, and the exact successful CI run for that unchanged commit. The evidence commit is deliberately not embedded here because it is the commit being created.

The initial top-level live attempt used commit `4baf0ad9b18aa38dc1755fe95ed6635b475c1110` and CI run `31303784939`; all four CI jobs passed, but release smoke failed closed at `provider` with `resume_incomplete`. Parent authority/cwd/lineage/completion/log/native-child, cancellation, and cleanup predicates passed. Resume had `markerAbsent=true` but `markerCommandFailed=false`, proving that the vague instruction did not produce the required controlled attempt.

The repair was prompt-only in the release-smoke contract: `buildResumePrompt` now names one exact marker write command, requires the expected nonzero read-only failure, forbids bypass/alternate mechanisms/simulation, and requires cwd reporting before stopping. The deterministic fake-provider test asserts the exact prompt and rejects unsafe marker names. No host adapter or provider-success claim was added.

## Verification

- Exact CI run `31304748019` passed all four declared jobs: Windows Node `22.20.0`, Windows Node `24.x`, Ubuntu Node `22.20.0`, and Ubuntu Node `24.x`.
- The recorded deterministic suite at the tested commit is `81/81`; this closeout did not rerun the full suite or live smoke.
- Focused closeout validation: JSON parse/schema and allowlist checks passed; Markdown JSON matched the canonical JSON byte-for-byte; commit/run/job binding, SHA-256 format, relative-root checks, predicate consistency, and redaction checks passed; `git diff --check` passed.
- Final live evidence: `releaseReady=true`, `failureStage=null`, parent `nativeChildCount=2`, resume `markerCommandFailed=true` and `markerAbsent=true`, cancellation acknowledgement/result/known-PID absence true, `launched/discovered=2/2`, `ownedPidCount=6`, `stopFailures=0`, `identityUncertain=0`, `identityMismatches=0`, `lingeringPids=0`, `recoveryUsed=false`, `scratchCleanupFailed=false`, and `unresolvedGaps=[]`.

## Claim boundary and limitations

The evidence supports Agent Skills copied-install portability and deterministic Codex CLI process evidence for the recorded Windows host, Node `24.14.1`, Codex `0.147.0`, `skills@1.5.22`, tested commit, and CI run. It does not prove live provider task success, universal sandbox reliability, universal host routing, model quality, or behavior outside the tested provider/host/configuration. The live result covers recorded/known owned PIDs only; no claim is made about unrecorded child threads. No tag, release, package publication, or roadmap completion was performed. A fresh Luna-max verifier owns `04-VERIFICATION.md` and the later roadmap update.

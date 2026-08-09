# Luna Sidecar Phase 5 final-shape evidence

This artifact records deterministic local checks for the tested commit. The required CI-bound live host observations were not run: the exact CI query returned no run for the tested commit, so both host claims remain ineligible and release readiness is false.

```json
{
  "schemaVersion": 1,
  "testedCommit": "dfcb77af9daefa4558a0fa475c3565d7947580a6",
  "platform": "win32",
  "nodeVersion": "24.14.1",
  "codexVersion": null,
  "skillsVersion": "1.5.22",
  "roots": [],
  "installs": [],
  "ci": null,
  "hosts": {
    "codex_cli": {
      "available": false,
      "invocationRef": null,
      "procedureRef": null,
      "hostVersion": null,
      "sidecarReceipt": {
        "schemaVersion": 2,
        "schemaResult": "not_run"
      },
      "cleanup": {
        "result": "not_run",
        "ownedPidResult": "not_run",
        "ownedPids": [],
        "ownedPidsGone": false
      },
      "failureCode": "ci_unavailable",
      "claimEligible": false
    },
    "claude_code": {
      "available": false,
      "invocationRef": null,
      "procedureRef": null,
      "hostVersion": null,
      "sidecarReceipt": {
        "schemaVersion": 2,
        "schemaResult": "not_run"
      },
      "cleanup": {
        "result": "not_run",
        "ownedPidResult": "not_run",
        "ownedPids": [],
        "ownedPidsGone": false
      },
      "failureCode": "ci_unavailable",
      "claimEligible": false
    }
  },
  "otherGates": {
    "deterministic": true,
    "installedParity": true,
    "ci": false,
    "delivery": true,
    "evidence": true
  },
  "commands": [],
  "predicates": {
    "sixCommandSurface": true,
    "explicitControls": true,
    "readiness": true,
    "zeroDefaultRetry": true,
    "providerOwnedMcp": true,
    "usagePassthroughOrUnavailable": true,
    "boundedListHistory": true
  },
  "cleanup": {
    "attempted": false,
    "releaseReady": false
  },
  "unresolvedGaps": [
    "ci_unavailable"
  ],
  "claim": "Agent Skills copied-install portability and deterministic Codex CLI process evidence for the recorded commit, platforms, and CI run only; no live provider task-success or universal-host claim.",
  "releaseReady": false,
  "failureStage": "preflight"
}
```

# Luna Sidecar release evidence

This file is a deterministic rendering of the canonical JSON evidence.

```json
{
  "schemaVersion": 1,
  "testedCommit": "5a85a7e76b8306203d380aa0c0ed15eec9fb4692",
  "platform": "win32",
  "nodeVersion": "24.14.1",
  "codexVersion": "0.147.0",
  "skillsVersion": "1.5.22",
  "roots": [
    {
      "role": "project",
      "relativePath": "project",
      "pathHash": "18498b1067a7037a2cac56e31776a27529d3ad934914fe9bf77f504e281adcdd"
    },
    {
      "role": "installer-home",
      "relativePath": "installer-home",
      "pathHash": "2ae2d1fbe81168086f6abbba2dd4f0d793c401452fc00c6d39e8ba5ab5ca642e"
    },
    {
      "role": "state",
      "relativePath": "state",
      "pathHash": "310ef0d5ce38bedbd277ee489837a94fa8c1c6ced81cd905adf2bf10f01c9cf3"
    },
    {
      "role": "parent-caller",
      "relativePath": "parent-caller",
      "pathHash": "afe4194fa9406ab9a82b761d7d3ce0b2d5e07ed1e7baa7aff3de2e1dcb1819c1"
    },
    {
      "role": "resume-caller",
      "relativePath": "resume-caller",
      "pathHash": "d2b33ee0b9b9ffacb622d5454f5935ab2bb49851ff1fe1493dd36fd469de4df0"
    },
    {
      "role": "cancellation-caller",
      "relativePath": "cancellation-caller",
      "pathHash": "a03e1033ab666bc1ca15a1b4d5a30e8a9a247ebbf98299bc1e7aba644faf4817"
    },
    {
      "role": "temp",
      "relativePath": "temp",
      "pathHash": "c5261cd58e149cfc76949da4a8c0fce018ad5c5f82fe8caa6cc1cf851e1ab4ca"
    },
    {
      "role": "canonical-source",
      "relativePath": "repository/skills/luna-sidecar",
      "pathHash": "3a447a4221f9cc10ac13799a05ad5e5e64692cc297f63ec6ab7bed03a1b8e45d"
    }
  ],
  "installs": [
    {
      "agent": "codex",
      "relativePath": ".agents/skills/luna-sidecar",
      "manifestHash": "b1bf85a0e066b9f905d26dabb67980274eb5d92abead00e8ca6305d14b4159ab"
    },
    {
      "agent": "claude-code",
      "relativePath": ".claude/skills/luna-sidecar",
      "manifestHash": "b1bf85a0e066b9f905d26dabb67980274eb5d92abead00e8ca6305d14b4159ab"
    },
    {
      "agent": "canonical",
      "relativePath": "skills/luna-sidecar",
      "manifestHash": "b1bf85a0e066b9f905d26dabb67980274eb5d92abead00e8ca6305d14b4159ab"
    }
  ],
  "ci": {
    "runId": "31304748019",
    "headSha": "5a85a7e76b8306203d380aa0c0ed15eec9fb4692",
    "status": "completed",
    "conclusion": "success",
    "jobs": [
      {
        "id": 93223188796,
        "name": "windows-latest / Node 22.20.0",
        "status": "completed",
        "conclusion": "success"
      },
      {
        "id": 93223188843,
        "name": "windows-latest / Node 24.x",
        "status": "completed",
        "conclusion": "success"
      },
      {
        "id": 93223188841,
        "name": "ubuntu-latest / Node 22.20.0",
        "status": "completed",
        "conclusion": "success"
      },
      {
        "id": 93223188819,
        "name": "ubuntu-latest / Node 24.x",
        "status": "completed",
        "conclusion": "success"
      }
    ]
  },
  "commands": [
    {
      "name": "git-init",
      "exitCode": 0
    },
    {
      "name": "installer",
      "exitCode": 0
    },
    {
      "name": "git-status",
      "exitCode": 0
    },
    {
      "name": "git-head",
      "exitCode": 0
    },
    {
      "name": "ci-run",
      "exitCode": 0
    },
    {
      "name": "codex-version",
      "exitCode": 0
    },
    {
      "name": "manager-start-parent",
      "exitCode": 0
    },
    {
      "name": "manager-wait-parent",
      "exitCode": 0
    },
    {
      "name": "manager-resume",
      "exitCode": 0
    },
    {
      "name": "manager-wait-resume",
      "exitCode": 0
    },
    {
      "name": "manager-start-cancellation",
      "exitCode": 0
    },
    {
      "name": "manager-status-cancellation",
      "exitCode": 0
    },
    {
      "name": "manager-status-cancellation",
      "exitCode": 0
    },
    {
      "name": "manager-cancel",
      "exitCode": 0
    },
    {
      "name": "manager-wait-cancellation",
      "exitCode": 0
    },
    {
      "name": "manager-stop",
      "exitCode": 0
    },
    {
      "name": "manager-stop",
      "exitCode": 0
    }
  ],
  "predicates": {
    "outerTimedOut": false,
    "parent": {
      "authority": true,
      "cwd": true,
      "lineage": true,
      "completed": true,
      "providerCompleted": true,
      "logs": true,
      "nativeChildCount": 2
    },
    "resume": {
      "authority": true,
      "cwd": true,
      "lineage": true,
      "completed": true,
      "providerCompleted": true,
      "logs": true,
      "markerCommandFailed": true,
      "markerAbsent": true
    },
    "cancellation": {
      "authority": true,
      "cwd": true,
      "lineage": true,
      "providerRunningBeforeCancel": true,
      "acknowledged": true,
      "cancelled": true,
      "result": true,
      "knownPidsGone": true
    },
    "nativeChildCount": 2
  },
  "cleanup": {
    "attempted": true,
    "launchedWorkerCount": 2,
    "discoveredWorkerCount": 2,
    "ownedPidCount": 6,
    "stopFailures": 0,
    "identityUncertain": 0,
    "identityMismatches": 0,
    "lingeringPids": 0,
    "recoveryUsed": false,
    "scratchCleanupFailed": false,
    "releaseReady": true
  },
  "unresolvedGaps": [],
  "claim": "Agent Skills copied-install portability and deterministic Codex CLI process evidence for the recorded commit, platforms, and CI run only; no live provider task-success or universal-host claim.",
  "releaseReady": true,
  "failureStage": null
}
```

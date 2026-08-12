import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createCliHarness, terminateOwnedPid } from "./helpers/cli-harness.mjs";
import fakeRegistryFixture from "./fixtures/fake-reg-query.mjs";

const admissionCode = "powershell_transcription_admission_blocked";
const admissionMessage = "Windows read-only Luna admission is unavailable because PowerShellCore transcription is enabled or its safe state could not be established. Keep read-only authority and use a native Codex subagent.";

test("policy admission unit: exact raw fixtures enforce precedence, redaction, and deterministic absence", async (t) => {
  assert.equal(fakeRegistryFixture.schemaVersion, 1);
  assert.equal(fakeRegistryFixture.capture.id, "reg-missing-exact-diagnostic-en-us-ascii-crlf-v1");
  assert.equal(Buffer.from(fakeRegistryFixture.capture.stderrBase64, "base64").length, 75);
  assert.equal(fakeRegistryFixture.capture.stderrSha256, "f441ad85601f9eb5f698450818c42155f1961fd925522e4d7687721e316b4fc8");
  const missingScenarios = fakeRegistryFixture.cases.filter(({ id }) => id.startsWith("reg-missing-"));
  assert.equal(missingScenarios.length, 4);
  for (const fixtureCase of fakeRegistryFixture.cases) {
    await t.test(fixtureCase.id, async (t) => {
      const harness = await createCliHarness(t);
      const result = await harness.invoke(
        ["start", "--effort", "medium", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--", fixtureCase.id],
        { scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"policy-thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 }, runtimeCaseId: fixtureCase.id },
      );
      if (fixtureCase.expect.admit) {
        assert.equal(result.code, 0);
        assert.equal(result.json().sandbox, "read-only");
        await harness.waitForCapture(result);
        await harness.invoke(["wait", result.json().workerId]);
      } else {
        assert.equal(result.code, 1);
        assert.deepEqual(result.json(), { schemaVersion: 2, ok: false, command: "start", workerId: null, error: { code: admissionCode, message: admissionMessage } });
        assert.equal(JSON.stringify(result.json()).includes("registry"), false);
        assert.equal(JSON.stringify(result.json()).includes("ERROR:"), false);
        await harness.assertNoCapture(result);
        await harness.assertNoWorkerArtifacts();
      }
      const calls = await harness.readRegistryCapture(result);
      assert.deepEqual(calls.map(({ hive }) => hive), fixtureCase.expect.queryOrder);
      assert.equal(calls.every(({ executable }) => executable === "C:\\Windows\\System32\\reg.exe"), true);
      assert.equal(calls.every(({ shell, windowsHide, deadlineMs, streamCapBytes }) => shell === false && windowsHide === true && deadlineMs === 2000 && streamCapBytes === 8192), true);
      if (fixtureCase.id === "policy-timeout") {
        assert.equal(fixtureCase.steps[0].result.killAttempted, true);
        assert.equal(fixtureCase.steps[0].result.closed, true);
      }
    });
  }
});

test("host PowerShellCore transcription admission blocks before provider spawn", { skip: process.env.LUNA_SIDECAR_HOST_PROOF !== "1" }, async (t) => {
  const harness = await createCliHarness(t);
  const startedAt = Date.now();
  const result = await harness.invoke(
    ["start", "--effort", "low", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--", "safe host admission tripwire"],
    { scenario: { exitCode: 99 }, productionRuntime: true, timeoutMs: 10_000 },
  );
  assert.equal(Date.now() - startedAt < 10_000, true);
  assert.equal(result.code, 1);
  assert.deepEqual(result.json(), { schemaVersion: 2, ok: false, command: "start", workerId: null, error: { code: admissionCode, message: admissionMessage } });
  await harness.assertNoCapture(result);
  await harness.assertNoWorkerArtifacts();
});

test("provider completion does not outrun process close, then close plus completion completes", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(explicitStartArgs(harness, "delayed"), {
    scenario: {
      stdoutChunks: [
        "{\"type\":\"thread.started\",\"thread_id\":\"delayed-thread\"}\n",
        "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"done\"}}\n",
        "{\"type\":\"turn.completed\"}\n",
      ],
      linger: true,
      exitCode: 0,
    },
  });
  const receipt = start.json();
  const capture = await harness.waitForCapture(start);
  await waitForFileText(receipt.logs.stdoutPath, "\"type\":\"turn.completed\"");
  assert.equal(isAlive(capture.pid), true);
  const running = await waitForState(harness, receipt.workerId, "running");
  assert.equal(running.providerState, "running");
  await harness.release(start);
  const done = await harness.invoke(["wait", receipt.workerId]);
  assert.equal(done.json().state, "completed");
  assert.equal(done.json().providerState, "completed");
});

test("start does not acknowledge until the runner persists thread.started readiness", async (t) => {
  const harness = await createCliHarness(t);
  const startedAt = Date.now();
  const pending = harness.invoke(["start", "--effort", "low", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--", "handshake"], {
    scenario: {
      startBarrier: true,
      stdoutChunks: [
        "{\"type\":\"thread.started\",\"thread_id\":\"handshake-thread\"}\n",
        "{\"type\":\"turn.completed\"}\n",
      ],
      linger: true,
      exitCode: 0,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await writeFile(`${harness.stateRoot}/1.start.barrier`, "release\n", "utf8");
  const started = await pending;
  assert.equal(Date.now() - startedAt >= 250, true);
  assert.equal(started.code, 0);
  const receipt = started.json();
  assert.equal(receipt.sessionId, "handshake-thread");
  assert.equal(receipt.threadId, "handshake-thread");
  assert.equal(receipt.state, "running");
  assert.equal(receipt.providerState, "running");
  await harness.release(started);
  assert.equal((await harness.invoke(["wait", receipt.workerId])).json().state, "completed");
});

test("readiness rejection and malformed thread.started are typed and nonzero", async (t) => {
  const cases = [
    { scenario: { suppressDefaultReadiness: true, stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 }, code: "provider_rejected" },
    { scenario: { stdoutChunks: ["{\"type\":\"thread.started\"}\n"], exitCode: 0 }, code: "readiness_schema_mismatch" },
  ];
  for (const expected of cases) {
    const harness = await createCliHarness(t);
    const result = await harness.invoke(["start", "--effort", "low", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--", "readiness failure"], {
      scenario: expected.scenario,
    });
    assert.equal(result.code, 1);
    assert.equal(result.json().error.code, expected.code);
  }
});

test("nonzero close, provider failure, and missing completion are distinct terminal evidence", async (t) => {
  const cases = [
    { scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 7 }, state: "failed", code: "provider_exit_failed" },
    { scenario: { stdoutChunks: ["{\"type\":\"turn.failed\",\"message\":\"bad\"}\n"], exitCode: 0 }, state: "failed", code: "provider_failed" },
    { scenario: { stdoutChunks: ["{\"type\":\"item.error\",\"error\":\"warning only\"}\n"], exitCode: 0 }, state: "unknown", code: "missing_provider_completion" },
  ];
  for (const expected of cases) {
    const harness = await createCliHarness(t);
    const start = await harness.invoke(explicitStartArgs(harness, "terminal matrix"), { scenario: expected.scenario });
    const receipt = start.json();
    const workerId = receipt.workerId ?? await waitForCreatedWorker(harness);
    const done = await harness.invoke(start.code === 0 ? ["wait", workerId] : ["status", workerId]);
    const value = done.json();
    assert.equal(value.state, expected.state);
    assert.equal(value.errorCode, expected.code);
    assert.equal(value.taskOutcome, "not_evaluated");
  }
});

test("nonfatal provider item errors remain warnings on successful close", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(explicitStartArgs(harness, "warning"), {
    scenario: {
      stdoutChunks: [
        "{\"type\":\"item.error\",\"error\":\"recoverable\"}\n",
        "{\"type\":\"turn.completed\"}\n",
      ],
      exitCode: 0,
    },
  });
  const done = await harness.invoke(["wait", start.json().workerId]);
  const value = done.json();
  assert.equal(value.state, "completed");
  assert.deepEqual(value.warnings, ["provider_item_error"]);
});

test("exact failed command signatures are deduplicated receipt warnings without changing completion", async (t) => {
  const cases = [
    {
      output: "helper_sandbox_lock_failed\nSetNamedSecurityInfoW failed with Windows error 1340",
      warning: "provider_command_blocked:sandbox_lock_1340",
    },
    {
      output: "batch file arguments are invalid",
      warning: "provider_command_blocked:invalid_batch_shim",
    },
  ];
  for (const expected of cases) {
    const harness = await createCliHarness(t);
    const event = JSON.stringify({
      type: "item.completed",
      item: { type: "command_execution", status: "failed", aggregated_output: expected.output },
    });
    const start = await harness.invoke(explicitStartArgs(harness, "blocked command"), {
      scenario: { stdoutChunks: [`${event}\n`, `${event}\n`, "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
    });
    const waited = await harness.invoke(["wait", start.json().workerId]);
    const status = await harness.invoke(["status", start.json().workerId]);
    for (const receipt of [waited.json(), status.json()]) {
      assert.equal(receipt.state, "completed");
      assert.equal(receipt.providerState, "completed");
      assert.equal(receipt.taskOutcome, "not_evaluated");
      assert.deepEqual(receipt.warnings, [expected.warning]);
    }
  }
});

test("only failed command aggregated output can emit a command-blocked warning", async (t) => {
  const harness = await createCliHarness(t);
  const signature = "helper_sandbox_lock_failed SetNamedSecurityInfoW 1340";
  const events = [
    { type: "item.completed", item: { type: "agent_message", text: signature } },
    { type: "item.completed", item: { type: "command_execution", status: "completed", aggregated_output: signature } },
    { type: "item.completed", item: { type: "command_execution", status: "failed", aggregated_output: "ordinary command failure" } },
    { type: "turn.completed" },
  ].map((event) => `${JSON.stringify(event)}\n`);
  const start = await harness.invoke(explicitStartArgs(harness, "signature words are not enough"), {
    scenario: { stdoutChunks: events, exitCode: 0 },
  });
  const done = await harness.invoke(["wait", start.json().workerId]);
  assert.equal(done.json().state, "completed");
  assert.deepEqual(done.json().warnings, []);
});

test("PowerShell transcription startup failures are redacted, deduplicated, and nonfatal", async (t) => {
  const harness = await createCliHarness(t);
  const transcriptPath = "C:\\Users\\bitaz\\ForensicLogs\\PowerShellTranscripts\\20260811\\PowerShell_transcript.20260811.txt";
  const output = `System.UnauthorizedAccessException: Access to ${transcriptPath} is denied.`;
  const event = JSON.stringify({
    type: "item.completed",
    item: { type: "command_execution", status: "failed", aggregated_output: output },
  });
  const start = await harness.invoke(explicitStartArgs(harness, "transcription warning"), {
    scenario: { stdoutChunks: [`${event}\n`, `${event}\n`, "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const waited = await harness.invoke(["wait", start.json().workerId]);
  const receipt = waited.json();

  assert.equal(receipt.state, "completed");
  assert.equal(receipt.providerState, "completed");
  assert.equal(receipt.taskOutcome, "not_evaluated");
  assert.equal(receipt.turnCount, 1);
  assert.equal(receipt.sandbox, "workspace-write");
  assert.equal(receipt.bypass, false);
  assert.deepEqual(receipt.warnings, ["provider_command_blocked:powershell_transcription"]);
  assert.equal(JSON.stringify(receipt).includes(transcriptPath), false);
  assert.equal(JSON.stringify(receipt).includes("System.UnauthorizedAccessException"), false);
});

test("PowerShell transcription warning ignores agent prose, successful commands, and near misses", async (t) => {
  const harness = await createCliHarness(t);
  const transcriptPath = "C:\\Users\\bitaz\\ForensicLogs\\PowerShellTranscripts\\20260811\\PowerShell_transcript.20260811.txt";
  const completeOutput = `System.UnauthorizedAccessException: Access to ${transcriptPath} is denied.`;
  const nearMiss = `System.UnauthorizedAccessException: Access to ${transcriptPath} is not denied.`;
  const events = [
    { type: "item.completed", item: { type: "agent_message", text: completeOutput } },
    { type: "item.completed", item: { type: "command_execution", status: "completed", aggregated_output: completeOutput } },
    { type: "item.completed", item: { type: "command_execution", status: "failed", aggregated_output: nearMiss } },
    { type: "item.completed", item: { type: "command_execution", status: "failed", aggregated_output: "Access to C:\\other\\command.txt is denied." } },
    { type: "turn.completed" },
  ].map((event) => `${JSON.stringify(event)}\n`);
  const start = await harness.invoke(explicitStartArgs(harness, "transcription near misses"), {
    scenario: { stdoutChunks: events, exitCode: 0 },
  });
  const done = await harness.invoke(["wait", start.json().workerId]);
  const receipt = done.json();
  assert.equal(receipt.state, "completed");
  assert.equal(receipt.providerState, "completed");
  assert.equal(receipt.taskOutcome, "not_evaluated");
  assert.deepEqual(receipt.warnings, []);
});

test("prompt claim and stdin acknowledgement are durable without retaining prompt text", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(explicitStartArgs(harness, "secret prompt body"), {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], linger: true, exitCode: 0 },
  });
  const receipt = start.json();
  await harness.waitForCapture(start);
  await waitForManifest(harness, receipt.workerId, (worker) => {
    const turn = worker.turns.at(-1);
    return Boolean(turn.promptClaimedAt && turn.stdinAcceptedAt);
  });
  const worker = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${receipt.workerId}.json`), "utf8"));
  assert.equal(JSON.stringify(worker).includes("secret prompt body"), false);
  assert.equal(worker.turns[0].promptSha256.length, 64);
  await harness.release(start);
  await harness.invoke(["wait", receipt.workerId]);
});

test("starting cancellation is acknowledged before provider spawn", async (t) => {
  const harness = await createCliHarness(t);
  const startPromise = harness.invoke(explicitStartArgs(harness, "must not launch"), {
    scenario: { startBarrier: true, stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = await waitForCreatedWorker(harness);
  const receipt = await waitForManifest(harness, workerId, (worker) => Boolean(worker.turns.at(-1).promptClaimedAt));
  const startBarrier = join(harness.stateRoot, "1.start.barrier");
  const cancelPromise = harness.invoke(["cancel", workerId], { scenario: {} });
  await waitForCancelAcceptance(harness, workerId, receipt.turnId);
  await writeFile(startBarrier, "release\n", "utf8");
  const cancelled = (await cancelPromise).json();
  const started = await startPromise;
  assert.equal(cancelled.state, "cancelled");
  assert.equal(typeof cancelled.cancel.acknowledgedAt, "string");
  assert.equal(cancelled.cancel.result, "cancelled");
  await assertFileMissing(join(harness.stateRoot, "requests", `${receipt.turnId}.cancel.json`));
  await assertFileMissing(join(harness.stateRoot, "prompts", `${receipt.turnId}.prompt`));
  await assertFileMissing(join(harness.stateRoot, "prompts", `${receipt.turnId}.prompt.claimed`));
  await harness.assertNoCapture(started);
});

test("cancel verifies the supported provider tree and never signals a stale PID", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(explicitStartArgs(harness, "tree cancellation"), {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], linger: true, grandchild: { linger: true }, exitCode: 0 },
  });
  const receipt = start.json();
  const capture = await harness.waitForCapture(start);
  const cancelled = await harness.invoke(["cancel", receipt.workerId], { scenario: {} });
  const value = cancelled.json();
  assert.equal(value.state, "cancelled");
  assert.equal(value.cancel.result, "cancelled");
  await harness.waitForCapture(start);
  harness.observePid(capture.pid);
  harness.observePid(capture.grandchildPid);
  await harness.verifyCaptureProcessesGone();
});

test("duplicate cancel requests join one acknowledged receipt and terminal cancel is unchanged", async (t) => {
  const harness = await createCliHarness(t);
  const cancelBarrier = join(harness.stateRoot, "fixtures", "duplicate-cancel");
  await mkdir(join(harness.stateRoot, "fixtures"), { recursive: true });
  const start = await harness.invoke(explicitStartArgs(harness, "duplicate cancel"), {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], linger: true, exitCode: 0 },
    extraEnv: { LUNA_SIDECAR_TEST_CANCEL_BARRIER: cancelBarrier },
  });
  const receipt = start.json();
  await harness.waitForCapture(start);
  const firstPromise = harness.invoke(["cancel", receipt.workerId], { scenario: {} });
  await waitForFile(`${cancelBarrier}.ready`);
  const requestPath = join(harness.stateRoot, "requests", `${receipt.turnId}.cancel.json`);
  const request = JSON.parse(await readFile(requestPath, "utf8"));
  const accepted = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${receipt.workerId}.json`), "utf8"));
  assert.deepEqual(Object.keys(request).sort(), ["baseRevision", "requestId", "requestedAt", "schemaVersion", "turnId", "workerId"]);
  assert.equal(request.schemaVersion, 1);
  assert.equal(request.workerId, receipt.workerId);
  assert.equal(request.turnId, receipt.turnId);
  assert.equal(accepted.state, "cancelling");
  assert.equal(accepted.cancel.requestId, request.requestId);
  assert.equal(accepted.cancel.acknowledgedAt, null);

  const secondPromise = harness.invoke(["cancel", receipt.workerId], { scenario: {} });
  await writeFile(`${cancelBarrier}.release`, "release\n", "utf8");
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.json().state, "cancelled");
  assert.equal(second.json().state, "cancelled");
  assert.equal(first.json().cancel.requestId, request.requestId);
  assert.equal(second.json().cancel.requestId, request.requestId);
  assert.equal(typeof first.json().cancel.acknowledgedAt, "string");
  await assertFileMissing(requestPath);
  const again = await harness.invoke(["cancel", receipt.workerId], { scenario: {} });
  assert.equal(again.json().state, "cancelled");
  assert.equal(again.json().warnings.includes("already_terminal"), true);
});

test("cancel timeout is durable while the live runner can still finish cancellation", async (t) => {
  const harness = await createCliHarness(t);
  const cancelBarrier = join(harness.stateRoot, "fixtures", "cancel-timeout");
  await mkdir(join(harness.stateRoot, "fixtures"), { recursive: true });
  const start = await harness.invoke(explicitStartArgs(harness, "timeout then recover"), {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], linger: true, exitCode: 0 },
    extraEnv: { LUNA_SIDECAR_TEST_CANCEL_BARRIER: cancelBarrier },
  });
  const receipt = start.json();
  await harness.waitForCapture(start);
  const cancelPromise = harness.invoke(["cancel", receipt.workerId], { scenario: {}, timeoutMs: 15_000 });
  await waitForFile(`${cancelBarrier}.ready`);
  const timedOut = await cancelPromise;
  assert.equal(timedOut.code, 1);
  assert.equal(timedOut.json().state, "cancelling");
  assert.equal(timedOut.json().errorCode, "cancel_timeout");
  assert.equal(timedOut.json().cancel.errorCode, "cancel_timeout");
  assert.equal(timedOut.json().warnings.includes("cancel_timeout"), true);

  const durable = await harness.invoke(["status", receipt.workerId], { scenario: {} });
  assert.equal(durable.json().state, "cancelling");
  assert.equal(durable.json().errorCode, "cancel_timeout");
  await writeFile(`${cancelBarrier}.release`, "release\n", "utf8");
  const cancelled = await harness.invoke(["wait", receipt.workerId]);
  assert.equal(cancelled.json().state, "cancelled");
  assert.equal(cancelled.json().cancel.errorCode, null);
  assert.equal(cancelled.json().warnings.includes("cancel_timeout"), false);
});

test("completion before runner acknowledgement wins as not_applied and blocks concurrent resume", async (t) => {
  const harness = await createCliHarness(t);
  const cancelBarrier = join(harness.stateRoot, "fixtures", "complete-before-ack");
  await mkdir(join(harness.stateRoot, "fixtures"), { recursive: true });
  const start = await harness.invoke(explicitStartArgs(harness, "completion wins"), {
    scenario: {
      stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"race-thread\"}\n", "{\"type\":\"turn.completed\"}\n"],
      linger: true,
      exitCode: 0,
    },
    extraEnv: { LUNA_SIDECAR_TEST_CANCEL_BARRIER: cancelBarrier },
  });
  const receipt = start.json();
  const capture = await harness.waitForCapture(start);
  const cancelPromise = harness.invoke(["cancel", receipt.workerId], { scenario: {} });
  await waitForFile(`${cancelBarrier}.ready`);

  const blockedResume = await harness.invoke(["resume", receipt.workerId, "--", "must wait"], { scenario: {} });
  assert.equal(blockedResume.code, 1);
  assert.equal(blockedResume.json().error.code, "active_turn");

  await harness.release(start);
  await waitForProcessExit(capture.pid);
  await writeFile(`${cancelBarrier}.release`, "release\n", "utf8");
  const completed = await cancelPromise;
  assert.equal(completed.code, 0);
  assert.equal(completed.json().state, "completed");
  assert.equal(completed.json().cancel.result, "not_applied");
  assert.equal(completed.json().cancel.acknowledgedAt, null);

  const resumed = await harness.invoke(["resume", receipt.workerId, "--", "resume after settled"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  assert.equal(resumed.code, 0);
  await harness.invoke(["wait", receipt.workerId]);
});

test("cancel after a killed runner becomes unknown, wait returns immediately, and start creates a new worker", async (t) => {
  const harness = await createCliHarness(t);
  const startPromise = harness.invoke(explicitStartArgs(harness, "runner crash"), {
    scenario: { startBarrier: true, exitCode: 0 },
  });
  const workerId = await waitForCreatedWorker(harness);
  const receipt = await waitForManifest(harness, workerId, (worker) => Number.isSafeInteger(worker.runnerPid));
  await terminateOwnedPid(receipt.pid);
  await writeFile(join(harness.stateRoot, "1.start.barrier"), "release\n", "utf8");
  await startPromise;

  const resumed = await harness.invoke(["resume", receipt.workerId, "--", "do not continue"], { scenario: {} });
  assert.equal(resumed.code, 1);
  assert.equal(resumed.json().error.code, "worker_unknown");
  const waited = await harness.invoke(["wait", receipt.workerId]);
  assert.equal(waited.json().state, "unknown");

  const replacement = await harness.invoke(explicitStartArgs(harness, "replacement"), { scenario: { exitCode: 0 } });
  const replacementId = replacement.json().workerId;
  assert.notEqual(replacementId, receipt.workerId);
  await harness.invoke(["wait", replacementId]);
});

test("cancel fails closed for a dead runner and never signals a stored provider PID", async (t) => {
  const harness = await createCliHarness(t);
  const sentinel = await harness.invoke(explicitStartArgs(harness, "owned sentinel"), {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], linger: true, exitCode: 0 },
  });
  const sentinelCapture = await harness.waitForCapture(sentinel);

  const victimPromise = harness.invoke(explicitStartArgs(harness, "stale runner"), {
    scenario: { startBarrier: true, exitCode: 0 },
  });
  const victimId = await waitForCreatedWorker(harness, new Set([sentinel.json().workerId]));
  const victimReceipt = { workerId: victimId };
  const victimManifest = await waitForManifest(harness, victimId, (worker) => Number.isSafeInteger(worker.runnerPid));
  await terminateOwnedPid(victimManifest.runnerPid);
  await writeFile(join(harness.stateRoot, "2.start.barrier"), "release\n", "utf8");
  await victimPromise;

  const turn = victimManifest.turns.at(-1);
  turn.state = "running";
  turn.providerState = "running";
  turn.providerPid = sentinelCapture.pid;
  victimManifest.state = turn.state;
  victimManifest.providerState = turn.providerState;
  victimManifest.providerPid = turn.providerPid;
  victimManifest.revision += 1;
  await writeFile(join(harness.stateRoot, "workers", `${victimReceipt.workerId}.json`), `${JSON.stringify(victimManifest, null, 2)}\n`, "utf8");

  const cancelled = await harness.invoke(["cancel", victimReceipt.workerId], { scenario: {} });
  assert.equal(cancelled.code, 1);
  assert.equal(cancelled.json().state, "unknown");
  assert.equal(cancelled.json().errorCode, "cancel_failed");
  assert.equal(cancelled.json().cancel.result, "cancel_failed");
  assert.equal(isAlive(sentinelCapture.pid), true);

  await harness.release(sentinel);
  await harness.invoke(["wait", sentinel.json().workerId]);
});

test("a second internal runner cannot claim or launch the same turn", async (t) => {
  const harness = await createCliHarness(t);
  const startPromise = harness.invoke(explicitStartArgs(harness, "single owner"), {
    scenario: { startBarrier: true, stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = await waitForCreatedWorker(harness);
  const receipt = await waitForManifest(harness, workerId, (worker) => Number.isSafeInteger(worker.runnerPid));
  const duplicate = await harness.invoke(["_worker", receipt.workerId], { scenario: { exitCode: 0 } });
  assert.equal(duplicate.code, 0);
  await harness.assertNoCapture(duplicate);
  await writeFile(join(harness.stateRoot, "1.start.barrier"), "release\n", "utf8");
  await startPromise;
  const done = await harness.invoke(["wait", receipt.workerId]);
  assert.equal(done.json().state, "completed");
  const worker = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${receipt.workerId}.json`), "utf8"));
  assert.equal(worker.turns.length, 1);
});

test("provider spawn errors and top-level provider errors persist distinct failure evidence", async (t) => {
  const harness = await createCliHarness(t);
  const missingExecutable = join(harness.root, "missing-provider-executable");
  const launchEnv = process.platform === "win32"
    ? { ComSpec: missingExecutable }
    : { PATH: join(harness.root, "missing-path") };
  const spawnFailure = await harness.invoke(explicitStartArgs(harness, "spawn failure"), {
    scenario: { exitCode: 0 },
    extraEnv: launchEnv,
  });
  const spawnWorkerId = await waitForCreatedWorker(harness);
  const spawnDone = await harness.invoke(["status", spawnWorkerId]);
  assert.equal(spawnDone.json().state, "failed");
  assert.equal(spawnDone.json().providerState, "failed");
  assert.equal(spawnDone.json().errorCode, "provider_spawn_failed");

  const providerFailure = await harness.invoke(explicitStartArgs(harness, "top level provider error"), {
    scenario: { stdoutChunks: ["{\"type\":\"error\",\"message\":\"fatal\"}\n"], exitCode: 0 },
  });
  const providerWorkerId = await waitForCreatedWorker(harness, new Set([spawnWorkerId]));
  const providerDone = await harness.invoke(["status", providerWorkerId]);
  assert.equal(providerDone.json().state, "failed");
  assert.equal(providerDone.json().errorCode, "provider_failed");
});

test("runner startup errors outside the provider block become terminal unknown", async (t) => {
  const harness = await createCliHarness(t);
  const outsideStateRoot = join(harness.root, "outside-state-root", "barrier");
  const start = await harness.invoke(explicitStartArgs(harness, "invalid startup barrier"), {
    scenario: { exitCode: 0 },
    extraEnv: { FAKE_CODEX_START_BARRIER: outsideStateRoot },
  });
  const workerId = await waitForCreatedWorker(harness);
  const done = await harness.invoke(["status", workerId]);
  assert.equal(done.json().state, "unknown");
  assert.equal(done.json().errorCode, "runner_startup_error");
  await harness.assertNoCapture(start);
});

async function waitForState(harness, workerId, expected) {
  return waitForManifest(harness, workerId, (worker) => worker.state === expected, async () => {
    const status = await harness.invoke(["status", workerId], { scenario: {} });
    return status.json();
  });
}

async function waitForCreatedWorker(harness, excluded = new Set()) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const files = (await readdir(join(harness.stateRoot, "workers"))).filter((file) => file.endsWith(".json"));
      const worker = files.map((file) => file.slice(0, -5)).find((id) => !excluded.has(id));
      if (worker) return worker;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for created worker");
}

async function waitForManifest(harness, workerId, predicate, read = async () => JSON.parse(await readFile(join(harness.stateRoot, "workers", `${workerId}.json`), "utf8"))) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for worker predicate: ${workerId}`);
}

async function waitForFile(path) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { await readFile(path); return; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for file: ${path}`);
}

async function waitForFileText(path, expected) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await readFile(path, "utf8")).includes(expected)) return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for text in file: ${path}`);
}

async function assertFileMissing(path) {
  try { await readFile(path); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error(`Expected file to be absent: ${path}`);
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for process exit: ${pid}`);
}

function explicitStartArgs(harness, prompt) {
  return ["start", "--effort", "medium", "--sandbox", "workspace-write", "--cwd", harness.requestedCwd, "--", prompt];
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== "ESRCH"; }
}

async function waitForCancelAcceptance(harness, workerId, turnId) {
  const requestPath = join(harness.stateRoot, "requests", `${turnId}.cancel.json`);
  const workerPath = join(harness.stateRoot, "workers", `${workerId}.json`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    let request = null;
    try { request = JSON.parse(await readFile(requestPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }

    const worker = JSON.parse(await readFile(workerPath, "utf8"));
    const turn = worker.turns.find((candidate) => candidate.turnId === turnId);
    const committed = worker.state === "cancelling" || worker.state === "cancelled";
    if (request && committed && turn?.cancel?.requestId === request.requestId) {
      return { request, worker };
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for committed cancel acceptance: ${turnId}`);
}

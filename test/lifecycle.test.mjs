import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createCliHarness, terminateOwnedPid } from "./helpers/cli-harness.mjs";

test("provider completion does not outrun process close, then close plus completion completes", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(["start", "--", "delayed"], {
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

test("nonzero close, provider failure, and missing completion are distinct terminal evidence", async (t) => {
  const cases = [
    { scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 7 }, state: "failed", code: "provider_exit_failed" },
    { scenario: { stdoutChunks: ["{\"type\":\"turn.failed\",\"message\":\"bad\"}\n"], exitCode: 0 }, state: "failed", code: "provider_failed" },
    { scenario: { stdoutChunks: ["{\"type\":\"item.error\",\"error\":\"warning only\"}\n"], exitCode: 0 }, state: "unknown", code: "missing_provider_completion" },
  ];
  for (const expected of cases) {
    const harness = await createCliHarness(t);
    const start = await harness.invoke(["start", "--", "terminal matrix"], { scenario: expected.scenario });
    const receipt = start.json();
    const done = await harness.invoke(["wait", receipt.workerId]);
    const value = done.json();
    assert.equal(value.state, expected.state);
    assert.equal(value.errorCode, expected.code);
    assert.equal(value.taskOutcome, "not_evaluated");
  }
});

test("nonfatal provider item errors remain warnings on successful close", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(["start", "--", "warning"], {
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

test("prompt claim and stdin acknowledgement are durable without retaining prompt text", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(["start", "--", "secret prompt body"], {
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
  const start = await harness.invoke(["start", "--", "must not launch"], {
    scenario: { startBarrier: true, stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const receipt = start.json();
  await waitForManifest(harness, receipt.workerId, (worker) => Boolean(worker.turns.at(-1).promptClaimedAt));
  const cancelPromise = harness.invoke(["cancel", receipt.workerId], { scenario: {} });
  await waitForCancelAcceptance(harness, receipt.workerId, receipt.turnId);
  await harness.releaseStart(start);
  const cancelled = (await cancelPromise).json();
  assert.equal(cancelled.state, "cancelled");
  assert.equal(typeof cancelled.cancel.acknowledgedAt, "string");
  assert.equal(cancelled.cancel.result, "cancelled");
  await assertFileMissing(join(harness.stateRoot, "requests", `${receipt.turnId}.cancel.json`));
  await assertFileMissing(join(harness.stateRoot, "prompts", `${receipt.turnId}.prompt`));
  await assertFileMissing(join(harness.stateRoot, "prompts", `${receipt.turnId}.prompt.claimed`));
  await harness.assertNoCapture(start);
});

test("cancel verifies the supported provider tree and never signals a stale PID", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(["start", "--", "tree cancellation"], {
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
  const start = await harness.invoke(["start", "--", "duplicate cancel"], {
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
  const start = await harness.invoke(["start", "--", "timeout then recover"], {
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
  const start = await harness.invoke(["start", "--", "completion wins"], {
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
  const start = await harness.invoke(["start", "--", "runner crash"], {
    scenario: { startBarrier: true, exitCode: 0 },
  });
  const receipt = start.json();
  await waitForManifest(harness, receipt.workerId, (worker) => Number.isSafeInteger(worker.runnerPid));
  await terminateOwnedPid(receipt.pid);
  await harness.releaseStart(start);

  const resumed = await harness.invoke(["resume", receipt.workerId, "--", "do not continue"], { scenario: {} });
  assert.equal(resumed.code, 1);
  assert.equal(resumed.json().error.code, "worker_unknown");
  const waited = await harness.invoke(["wait", receipt.workerId]);
  assert.equal(waited.json().state, "unknown");

  const replacement = await harness.invoke(["start", "--", "replacement"], { scenario: { exitCode: 0 } });
  const replacementId = replacement.json().workerId;
  assert.notEqual(replacementId, receipt.workerId);
  await harness.invoke(["wait", replacementId]);
});

test("cancel fails closed for a dead runner and never signals a stored provider PID", async (t) => {
  const harness = await createCliHarness(t);
  const sentinel = await harness.invoke(["start", "--", "owned sentinel"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], linger: true, exitCode: 0 },
  });
  const sentinelCapture = await harness.waitForCapture(sentinel);

  const victim = await harness.invoke(["start", "--", "stale runner"], {
    scenario: { startBarrier: true, exitCode: 0 },
  });
  const victimReceipt = victim.json();
  const victimManifest = await waitForManifest(harness, victimReceipt.workerId, (worker) => Number.isSafeInteger(worker.runnerPid));
  await terminateOwnedPid(victimManifest.runnerPid);

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
  const start = await harness.invoke(["start", "--", "single owner"], {
    scenario: { startBarrier: true, stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const receipt = start.json();
  await waitForManifest(harness, receipt.workerId, (worker) => Number.isSafeInteger(worker.runnerPid));
  const duplicate = await harness.invoke(["_worker", receipt.workerId], { scenario: { exitCode: 0 } });
  assert.equal(duplicate.code, 0);
  await harness.assertNoCapture(duplicate);
  await harness.releaseStart(start);
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
  const spawnFailure = await harness.invoke(["start", "--", "spawn failure"], {
    scenario: { exitCode: 0 },
    extraEnv: launchEnv,
  });
  const spawnDone = await harness.invoke(["wait", spawnFailure.json().workerId]);
  assert.equal(spawnDone.json().state, "failed");
  assert.equal(spawnDone.json().providerState, "failed");
  assert.equal(spawnDone.json().errorCode, "provider_spawn_failed");

  const providerFailure = await harness.invoke(["start", "--", "top level provider error"], {
    scenario: { stdoutChunks: ["{\"type\":\"error\",\"message\":\"fatal\"}\n"], exitCode: 0 },
  });
  const providerDone = await harness.invoke(["wait", providerFailure.json().workerId]);
  assert.equal(providerDone.json().state, "failed");
  assert.equal(providerDone.json().errorCode, "provider_failed");
});

test("runner startup errors outside the provider block become terminal unknown", async (t) => {
  const harness = await createCliHarness(t);
  const outsideStateRoot = join(harness.root, "outside-state-root", "barrier");
  const start = await harness.invoke(["start", "--", "invalid startup barrier"], {
    scenario: { exitCode: 0 },
    extraEnv: { FAKE_CODEX_START_BARRIER: outsideStateRoot },
  });
  const done = await harness.invoke(["wait", start.json().workerId]);
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

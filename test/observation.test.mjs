import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildMinimalTestEnvironment, createCliHarness, terminateOwnedPid } from "./helpers/cli-harness.mjs";

test("list on a missing state root is an empty read with no creation", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "luna-observe-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const missing = join(parent, "missing-state-root");
  const launcher = fileURLToPath(new URL("../skills/luna-sidecar/scripts/luna-sidecar.mjs", import.meta.url));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, "list"], {
      env: buildMinimalTestEnvironment(null, { LUNA_SIDECAR_HOME: missing }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), []);
  await assert.rejects(stat(missing), { code: "ENOENT" });
});

test("status, list, and wait are compact read-only projections", async (t) => {
  const harness = await createCliHarness(t);
  const started = await harness.invoke(["start", "--effort", "medium", "--sandbox", "workspace-write", "--cwd", harness.requestedCwd, "--", "observe"], {
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"observe-thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = started.json().workerId;
  const done = await harness.invoke(["wait", workerId]);
  assert.equal(done.json().state, "completed");

  const before = await stateSnapshot(harness.stateRoot);
  const status = await harness.invoke(["status", workerId]);
  const list = await harness.invoke(["list"]);
  const waited = await harness.invoke(["wait", workerId, "--timeout", "1"]);
  assert.equal(status.json().id, workerId);
  assert.equal(status.json().threadId, "observe-thread");
  assert.equal(list.json().length, 1);
  assert.equal(waited.json().timedOut, false);
  assert.deepEqual(await stateSnapshot(harness.stateRoot), before);
});

test("observers do not depend on missing, directory, or 32 MiB raw logs", async (t) => {
  const harness = await createCliHarness(t);
  const started = await harness.invoke(["start", "--effort", "medium", "--sandbox", "workspace-write", "--cwd", harness.requestedCwd, "--", "raw fixture"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = started.json().workerId;
  const done = await harness.invoke(["wait", workerId]);
  const workerPath = join(harness.stateRoot, "workers", `${workerId}.json`);
  const worker = JSON.parse(await readFile(workerPath, "utf8"));
  const stdoutPath = worker.turns.at(-1).stdoutPath;
  const baseline = await harness.invoke(["status", workerId]);
  const baselineReceipt = baseline.json();

  await writeFile(stdoutPath, "", "utf8");
  assert.deepEqual((await harness.invoke(["status", workerId])).json(), baselineReceipt);
  await rm(stdoutPath, { force: true });
  assert.deepEqual((await harness.invoke(["status", workerId])).json(), baselineReceipt);
  await mkdir(stdoutPath);
  assert.deepEqual((await harness.invoke(["status", workerId])).json(), baselineReceipt);
  await rm(stdoutPath, { recursive: true, force: true });
  const sparseHandle = await open(stdoutPath, "w");
  await sparseHandle.truncate(32 * 1024 * 1024);
  await sparseHandle.close();
  const observed = await harness.invoke(["status", workerId]);
  assert.deepEqual(observed.json(), baselineReceipt);
  assert.equal(observed.durationMs <= baseline.durationMs * 10 + 1_000, true);
  assert.equal(done.json().logs.stdoutPath, stdoutPath);
});

test("a definitely dead pre-readiness runner persists sealed unknown cleanup", async (t) => {
  const harness = await createCliHarness(t);
  const started = harness.invoke(["start", "--effort", "medium", "--sandbox", "workspace-write", "--cwd", harness.requestedCwd, "--", "dead runner"], {
    scenario: { startBarrier: true, exitCode: 0 },
  });
  const workerId = await waitForCreatedWorker(harness);
  const manifestPath = join(harness.stateRoot, "workers", `${workerId}.json`);
  const beforeManifest = await waitForManifest(manifestPath, (worker) => Number.isSafeInteger(worker.runnerPid));
  const beforeTurn = beforeManifest.turns.at(-1);
  const runner = beforeManifest.runnerPid;
  await terminateOwnedPid(runner);
  await started;
  const status = await harness.invoke(["status", workerId]);
  assert.equal(status.json().state, "unknown");
  assert.equal(status.json().errorCode, "runner_died");
  const projected = status.json();
  for (const field of ["providerState", "taskOutcome", "exitCode", "signal", "finalMessage", "logs", "completedAt"]) {
    if (field === "logs") {
      assert.equal(projected.logs.sealed, true);
      assert.equal(typeof projected.logs.sealedAt, "string");
      assert.equal(projected.logs.stdoutMissing, true);
      assert.equal(projected.logs.stderrMissing, true);
      assert.equal(projected.logs.pruning, false);
      assert.equal(projected.logs.pruned, false);
    } else if (field === "completedAt") {
      assert.equal(typeof projected.completedAt, "string");
    } else {
      assert.deepEqual(projected[field], field === "providerState" ? "unknown" : beforeTurn[field], field);
    }
  }
  const listed = (await harness.invoke(["list"])).json()[0];
  assert.equal(listed.state, "unknown");
  assert.equal(listed.errorCode, "runner_died");
  const waited = await harness.invoke(["wait", workerId, "--timeout", "10"]);
  assert.equal(waited.json().state, "unknown");
  assert.equal(waited.json().timedOut, false);
  const resumed = await harness.invoke(["resume", workerId, "--", "must reject"], { scenario: {} });
  assert.equal(resumed.code, 1);
  assert.equal(resumed.json().error.code, "worker_unknown");
  const persisted = JSON.parse(await readFile(manifestPath, "utf8"));
  const persistedTurn = persisted.turns.at(-1);
  assert.equal(persisted.state, "unknown");
  assert.equal(persistedTurn.state, "unknown");
  assert.equal(persistedTurn.errorCode, "runner_died");
  assert.equal(persistedTurn.logs.sealed, true);
  assert.equal(persistedTurn.logs.stdoutMissing, true);
  assert.equal(persistedTurn.logs.stderrMissing, true);
});

test("wait uses an immediate read, zero means indefinite, and positive timeouts are bounded", async (t) => {
  const harness = await createCliHarness(t);
  const started = harness.invoke(["start", "--effort", "medium", "--sandbox", "workspace-write", "--cwd", harness.requestedCwd, "--", "wait"], {
    scenario: { startBarrier: true, exitCode: 0 },
  });
  const workerId = await waitForCreatedWorker(harness);
  const timedOut = await harness.invoke(["wait", workerId, "--timeout", "30"]);
  assert.equal(timedOut.json().timedOut, true);
  const zero = harness.invoke(["wait", workerId, "--timeout", "0"]);
  const positive = harness.invoke(["wait", workerId, "--timeout", "1000"]);
  const indefinite = harness.invoke(["wait", workerId]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await writeFile(join(harness.stateRoot, "1.start.barrier"), "release\n", "utf8");
  await started;
  assert.equal((await zero).json().timedOut, false);
  assert.equal((await positive).json().timedOut, false);
  assert.equal((await indefinite).json().timedOut, false);
});

test("the observer call graph contains no raw-log reader or writer", async () => {
  const source = (await readFile(new URL("../skills/luna-sidecar/scripts/luna-sidecar.mjs", import.meta.url), "utf8")).replace(/\r\n?/g, "\n");
  const observerStart = source.indexOf("async function observeWorker");
  const observerEnd = source.indexOf("async function cancelWorker");
  assert.notEqual(observerStart, -1, "observeWorker");
  assert.equal(observerEnd > observerStart, true, "cancelWorker boundary");
  const observer = source.slice(observerStart, observerEnd);
  assert.doesNotMatch(observer, /stdoutPath|stderrPath|open\(|writeFile\(|rm\(|rawFileSize|CappedRawWriter/);
  assert.match(observer, /readWorker/);
  assert.match(observer, /runnerLiveness/);
  for (const name of ["showStatus", "waitForWorker", "listWorkers"]) {
    const body = functionBody(source, name);
    assert.doesNotMatch(body, /mutateWorker|pruneTerminalLogs|rawFileSize|open\(|CappedRawWriter|withRetentionLock/);
  }
  const waitBody = functionBody(source, "waitForWorker");
  assert.match(waitBody, /const boundary = await observeWorker/);
  const reachable = reachableFunctions(source, ["showStatus", "waitForWorker", "listWorkers"]);
  for (const forbidden of ["mutateWorker", "writeWorker", "pruneTerminalLogsLocked", "rawFileSize", "withRetentionLock", "ensureState"]) {
    assert.equal(reachable.has(forbidden), false, forbidden);
  }
  for (const name of reachable) {
    assert.doesNotMatch(functionBody(source, name), /CappedRawWriter|\bopen\(|\bwriteFile\(|\brename\(|\brm\(/, name);
  }
});

test("list returns the latest-turn summary while status and wait retain history", async (t) => {
  const harness = await createCliHarness(t);
  const first = await harness.invoke(["start", "--effort", "medium", "--sandbox", "workspace-write", "--cwd", harness.requestedCwd, "--", "first turn"], {
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"history-thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  await harness.invoke(["wait", first.json().workerId]);
  const resumed = await harness.invoke(["resume", first.json().workerId, "--", "second turn"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  await harness.invoke(["wait", first.json().workerId]);
  const status = (await harness.invoke(["status", first.json().workerId])).json();
  const listed = (await harness.invoke(["list"])).json()[0];
  assert.equal(status.turns.length, 2);
  assert.equal(status.turnId, resumed.json().turnId);
  assert.equal(Object.hasOwn(listed, "turns"), false);
  assert.equal(listed.turnId, resumed.json().turnId);
});

async function stateSnapshot(root) {
  const files = [];
  await collect(root, files);
  const result = {};
  for (const file of files.sort()) {
    const [bytes, details] = await Promise.all([readFile(file), stat(file)]);
    result[file.slice(root.length)] = {
      hash: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
      mtimeMs: details.mtimeMs,
    };
  }
  return result;
}

async function collect(root, output) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = join(root, entry.name);
    if (entry.isDirectory()) await collect(file, output);
    else if (!entry.name.endsWith(".lock") && !entry.name.endsWith(".start.barrier") && !entry.name.includes(".lock.publish-")) output.push(file);
  }
}

async function waitForCreatedWorker(harness) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const files = (await readdir(join(harness.stateRoot, "workers"))).filter((file) => file.endsWith(".json"));
      if (files.length > 0) return files[0].slice(0, -5);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for created worker");
}

async function waitForManifest(path, predicate) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const worker = JSON.parse(await readFile(path, "utf8"));
      if (predicate(worker)) return worker;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for manifest: ${path}`);
}

function reachableFunctions(source, roots) {
  const names = [...source.matchAll(/^(?:async )?function ([A-Za-z0-9_]+)/gm)].map((match) => match[1]);
  const reached = new Set();
  const pending = [...roots];
  while (pending.length) {
    const name = pending.pop();
    if (reached.has(name)) continue;
    reached.add(name);
    const body = functionBody(source, name);
    for (const candidate of names) {
      if (!reached.has(candidate) && new RegExp(`\\b${candidate}\\s*\\(`).test(body)) pending.push(candidate);
    }
  }
  return reached;
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, name);
  const end = source.indexOf("\n}\n", start);
  assert.notEqual(end, -1, name);
  return source.slice(start, end + 3);
}

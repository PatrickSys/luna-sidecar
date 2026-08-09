import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createCliHarness } from "./helpers/cli-harness.mjs";

test("incremental parsing keeps split UTF-8, CRLF, no-final-newline, malformed, unknown, and nonfatal events distinct", async (t) => {
  const harness = await createCliHarness(t);
  const records = [
    "{\"type\":\"thread.started\",\"thread_id\":\"split-thread\"}\r\n",
    "{\"type\":\"unknown.event\",\"secret\":\"unknown-event-sentinel\"}\n",
    "not json\r\n",
    "{\"type\":\"item.error\",\"message\":\"stderr-secret\"}\n",
    "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"fixed final message é🙂\"}}\n",
    "{\"type\":\"turn.completed\"}",
  ];
  const bytes = Buffer.from(records.join(""), "utf8");
  const split = [];
  for (let offset = 0; offset < bytes.length; offset += 1) split.push({ base64: bytes.subarray(offset, offset + 1).toString("base64") });
  const started = await harness.invoke(["start", "--", "incremental"], {
    scenario: { stdoutChunks: split, stderrChunks: ["stderr-secret"], exitCode: 0 },
  });
  const result = (await harness.invoke(["wait", started.json().workerId])).json();
  assert.equal(result.state, "completed");
  assert.equal(result.providerState, "completed");
  assert.equal(result.sessionId, "split-thread");
  assert.equal(result.finalMessage, "fixed final message é🙂");
  assert.deepEqual(result.warnings, ["malformed_provider_json", "provider_item_error"]);
  assert.equal(JSON.stringify(result).includes("unknown-event-sentinel"), false);
  assert.equal(JSON.stringify(result).includes("stderr-secret"), false);
  const raw = await readFile(result.logs.stdoutPath, "utf8");
  assert.equal(raw.includes("unknown-event-sentinel"), true);
});

test("final messages are UTF-8 byte bounded before manifest and receipt persistence", async (t) => {
  const harness = await createCliHarness(t);
  const finalText = "🙂".repeat(270_000);
  const payload = Buffer.from(`{"type":"item.completed","item":{"type":"agent_message","text":${JSON.stringify(finalText)}}}\n{"type":"turn.completed"}\n`, "utf8");
  const chunks = [];
  for (let offset = 0; offset < payload.length; offset += 97) chunks.push({ base64: payload.subarray(offset, offset + 97).toString("base64") });
  const started = await harness.invoke(["start", "--", "bounded final"], { scenario: { stdoutChunks: chunks, exitCode: 0 } });
  const result = (await harness.invoke(["wait", started.json().workerId])).json();
  const manifest = await readFile(join(harness.stateRoot, "workers", `${started.json().workerId}.json`), "utf8");
  assert.equal(result.state, "completed");
  assert.equal(Buffer.byteLength(result.finalMessage, "utf8") <= 1024 * 1024, true);
  assert.equal(result.warnings.includes("final_message_truncated"), true);
  assert.equal(Buffer.byteLength(JSON.parse(manifest).turns[0].finalMessage, "utf8") <= 1024 * 1024, true);
});

test("raw output is capped while parsing continues and byte accounting is truthful", async (t) => {
  const harness = await createCliHarness(t);
  const stdoutFlood = Buffer.concat([
    Buffer.from("{\"type\":\"thread.started\",\"thread_id\":\"cap-thread\"}\n"),
    Buffer.alloc(32 * 1024 * 1024, 0x78),
    Buffer.from("\n{\"type\":\"turn.completed\"}"),
  ]);
  const stderrFlood = Buffer.alloc(4 * 1024 * 1024 + 17, 0x65);
  const started = await harness.invoke(["start", "--", "caps"], {
    scenario: {
      stdoutChunks: [{ base64: stdoutFlood.toString("base64") }],
      stderrChunks: [{ base64: stderrFlood.toString("base64") }],
      exitCode: 0,
    },
  });
  const result = (await harness.invoke(["wait", started.json().workerId])).json();
  assert.equal(result.state, "completed");
  assert.equal(result.logs.stdoutPersistedBytes <= 32 * 1024 * 1024, true);
  assert.equal(result.logs.stderrPersistedBytes <= 4 * 1024 * 1024, true);
  assert.equal(result.logs.stdoutObservedBytes > result.logs.stdoutPersistedBytes, true);
  assert.equal(result.logs.stderrObservedBytes > result.logs.stderrPersistedBytes, true);
  assert.equal(result.logs.stdoutDroppedBytes > 0, true);
  assert.equal(result.logs.stderrDroppedBytes > 0, true);
  assert.equal(result.logs.stdoutObservedBytes, result.logs.stdoutPersistedBytes + result.logs.stdoutDroppedBytes);
  assert.equal(result.logs.stderrObservedBytes, result.logs.stderrPersistedBytes + result.logs.stderrDroppedBytes);
  assert.equal((await stat(result.logs.stdoutPath)).size, result.logs.stdoutPersistedBytes);
  assert.equal((await stat(result.logs.stderrPath)).size, result.logs.stderrPersistedBytes);
  assert.equal(result.logs.sealed, true);
  assert.equal(result.logs.truncated, true);
  assert.equal(result.warnings.includes("oversized_incomplete_line"), true);
});

test("cancellation publishes terminal state only after sealed raw metadata", async (t) => {
  const harness = await createCliHarness(t);
  const started = await harness.invoke(["start", "--", "cancelled output"], {
    scenario: { stdoutChunks: ["cancelled evidence\n"], linger: true, exitCode: 0 },
  });
  await harness.waitForCapture(started);
  const cancelled = await harness.invoke(["cancel", started.json().workerId]);
  assert.equal(cancelled.json().state, "cancelled");
  const manifest = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${started.json().workerId}.json`), "utf8"));
  const turn = manifest.turns.at(-1);
  assert.equal(turn.state, "cancelled");
  assert.equal(turn.logs.sealed, true);
  assert.equal(turn.logs.stdoutObservedBytes, turn.logs.stdoutPersistedBytes + turn.logs.stdoutDroppedBytes);
  assert.equal((await stat(turn.stdoutPath)).size, turn.logs.stdoutPersistedBytes);
});

test("a second raw-writer open failure seals and leaves the first handle removable", async (t) => {
  const harness = await createCliHarness(t);
  const started = await harness.invoke(["start", "--", "stderr open failure"], {
    scenario: { startBarrier: true, stdoutChunks: ["stdout evidence\n"], exitCode: 0 },
  });
  const manifestPath = join(harness.stateRoot, "workers", `${started.json().workerId}.json`);
  const initial = JSON.parse(await readFile(manifestPath, "utf8"));
  const turn = initial.turns.at(-1);
  await mkdir(turn.stderrPath);
  await harness.releaseStart(started);
  const result = await harness.invoke(["wait", started.json().workerId]);
  assert.equal(result.code, 0);
  const final = JSON.parse(await readFile(manifestPath, "utf8"));
  const finalTurn = final.turns.at(-1);
  assert.equal(finalTurn.state, "failed");
  assert.equal(finalTurn.logs.sealed, true);
  assert.equal(finalTurn.logs.stderrMissing, true);
  assert.equal(finalTurn.logs.stdoutObservedBytes, finalTurn.logs.stdoutPersistedBytes + finalTurn.logs.stdoutDroppedBytes);
  await rm(turn.stdoutPath, { force: true });
  await rm(turn.stderrPath, { recursive: true, force: true });
});

test("only sealed canonical terminal raw logs are pruned, with compact evidence retained", async (t) => {
  const harness = await createCliHarness(t);
  const first = await harness.invoke(["start", "--", "oldest"], { scenario: { exitCode: 0 } });
  await harness.invoke(["wait", first.json().workerId]);
  const second = await harness.invoke(["start", "--", "newer"], { scenario: { exitCode: 0 } });
  await harness.invoke(["wait", second.json().workerId]);

  const firstPath = join(harness.stateRoot, "workers", `${first.json().workerId}.json`);
  const secondPath = join(harness.stateRoot, "workers", `${second.json().workerId}.json`);
  const firstWorker = JSON.parse(await readFile(firstPath, "utf8"));
  const secondWorker = JSON.parse(await readFile(secondPath, "utf8"));
  await sparse(firstWorker.turns[0].stdoutPath, 130 * 1024 * 1024);
  await sparse(firstWorker.turns[0].stderrPath, 1 * 1024 * 1024);
  await sparse(secondWorker.turns[0].stdoutPath, 130 * 1024 * 1024);
  await sparse(secondWorker.turns[0].stderrPath, 1 * 1024 * 1024);

  const [active, activeTwo] = await Promise.all([
    harness.invoke(["start", "--", "trigger pruning one"], { scenario: { stdoutChunks: ["active one\n"], linger: true, exitCode: 0 } }),
    harness.invoke(["start", "--", "trigger pruning two"], { scenario: { stdoutChunks: ["active two\n"], linger: true, exitCode: 0 } }),
  ]);
  await Promise.all([harness.waitForCapture(active), harness.waitForCapture(activeTwo)]);
  const activeWorker = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${active.json().workerId}.json`), "utf8"));
  const activeTwoWorker = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${activeTwo.json().workerId}.json`), "utf8"));
  const activeStdout = activeWorker.turns[0].stdoutPath;
  const activeStderr = activeWorker.turns[0].stderrPath;
  assert.equal(["starting", "running"].includes(activeWorker.turns[0].state), true);
  assert.equal(activeWorker.turns[0].logs.pruned, false);
  assert.equal(await isFile(firstWorker.turns[0].stdoutPath), false);
  assert.equal(await isFile(firstWorker.turns[0].stderrPath), false);
  const retained = JSON.parse(await readFile(firstPath, "utf8"));
  assert.equal(retained.turns[0].logs.pruned, true);
  const prunedAt = retained.turns[0].logs.prunedAt;
  assert.equal((await stat(secondWorker.turns[0].stdoutPath)).isFile(), true);
  assert.equal(await rawBytes(join(harness.stateRoot, "logs")) <= 256 * 1024 * 1024, true);
  for (const path of [activeStdout, activeStderr, activeTwoWorker.turns[0].stdoutPath, activeTwoWorker.turns[0].stderrPath]) {
    assert.equal(await isFile(path), true);
  }
  const duringActive = await harness.invoke(["start", "--", "idempotent pruning"], { scenario: { exitCode: 0 } });
  await harness.invoke(["wait", duringActive.json().workerId]);
  const repeated = JSON.parse(await readFile(firstPath, "utf8"));
  assert.equal(repeated.turns[0].logs.prunedAt, prunedAt);
  for (const path of [activeStdout, activeStderr, activeTwoWorker.turns[0].stdoutPath, activeTwoWorker.turns[0].stderrPath]) {
    assert.equal(await isFile(path), true);
  }
  await harness.release(active);
  await harness.release(activeTwo);
  await harness.invoke(["wait", active.json().workerId]);
  await harness.invoke(["wait", activeTwo.json().workerId]);
  assert.equal(await isFile(firstPath), true);
  assert.equal(await isFile(secondPath), true);
});

test("retention reconciles partial files and retries a persisted pruning intent", async (t) => {
  const harness = await createCliHarness(t);
  const old = await harness.invoke(["start", "--", "partial retention"], { scenario: { exitCode: 0 } });
  await harness.invoke(["wait", old.json().workerId]);
  const oldPath = join(harness.stateRoot, "workers", `${old.json().workerId}.json`);
  const initial = JSON.parse(await readFile(oldPath, "utf8"));
  const turn = initial.turns.at(-1);
  await rm(turn.stdoutPath, { force: true });
  const reconcile = await harness.invoke(["start", "--", "reconcile retention"], { scenario: { exitCode: 0 } });
  await harness.invoke(["wait", reconcile.json().workerId]);
  const partial = JSON.parse(await readFile(oldPath, "utf8")).turns.at(-1);
  assert.equal(partial.logs.stdoutMissing, true);
  assert.equal(partial.logs.stderrMissing, false);
  assert.equal((await stat(turn.stderrPath)).isFile(), true);

  const poisonedIntent = JSON.parse(await readFile(oldPath, "utf8"));
  poisonedIntent.turns.at(-1).logs.pruning = true;
  poisonedIntent.turns.at(-1).logs.pruningAt = new Date().toISOString();
  await writeFile(oldPath, `${JSON.stringify(poisonedIntent)}\n`, "utf8");
  const recover = await harness.invoke(["start", "--", "recover retention"], { scenario: { exitCode: 0 } });
  await harness.invoke(["wait", recover.json().workerId]);
  const finalTurn = JSON.parse(await readFile(oldPath, "utf8")).turns.at(-1);
  assert.equal(finalTurn.logs.stdoutMissing, true);
  assert.equal(finalTurn.logs.stderrMissing, true);
  assert.equal(finalTurn.logs.pruned, true);
  assert.equal(finalTurn.logs.pruning, false);
  assert.equal(await isFile(turn.stderrPath), false);
});

test("a valid retention lock with a definitely dead owner is recovered immediately", async (t) => {
  const harness = await createCliHarness(t);
  await mkdir(harness.stateRoot, { recursive: true });
  const deadPid = await exitedPid();
  await writeFile(join(harness.stateRoot, "retention.lock"), `${JSON.stringify({
    schemaVersion: 1,
    token: "dead-owner-token",
    pid: deadPid,
    acquiredAt: new Date().toISOString(),
  })}\n`, "utf8");
  const started = await harness.invoke(["start", "--", "recover dead retention owner"], { scenario: { exitCode: 0 } });
  assert.equal(started.code, 0);
  assert.equal(started.durationMs < 5_000, true);
  await harness.invoke(["wait", started.json().workerId]);
  await assert.rejects(stat(join(harness.stateRoot, "retention.lock")), { code: "ENOENT" });
});

test("a fresh valid worker lock with a definitely dead owner is recovered immediately", async (t) => {
  const harness = await createCliHarness(t);
  const started = await harness.invoke(["start", "--", "seed dead worker lock"], {
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"dead-lock-thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = started.json().workerId;
  await harness.invoke(["wait", workerId]);
  const workerPath = join(harness.stateRoot, "workers", `${workerId}.json`);
  const worker = JSON.parse(await readFile(workerPath, "utf8"));
  const deadPid = await exitedPid();
  const lockPath = join(harness.stateRoot, "workers", `${workerId}.lock`);
  await writeFile(lockPath, `${JSON.stringify({
    token: "dead-worker-owner-token",
    pid: deadPid,
    acquiredAt: new Date().toISOString(),
    baseRevision: worker.revision,
  })}\n`, "utf8");

  const resumed = await harness.invoke(["resume", workerId, "--", "recover dead worker owner"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  assert.equal(resumed.code, 0);
  assert.equal(resumed.durationMs < 5_000, true);
  await harness.invoke(["wait", workerId]);
  await assert.rejects(stat(lockPath), { code: "ENOENT" });
});

test("a newline-free flood keeps parser tail bounded", async (t) => {
  const harness = await createCliHarness(t);
  const flood = Buffer.alloc(2 * 1024 * 1024, 0x7a);
  const started = await harness.invoke(["start", "--", "tail bound"], {
    scenario: { stdoutChunks: [{ base64: flood.toString("base64") }, "\n{\"type\":\"turn.completed\"}"], exitCode: 0 },
  });
  const result = (await harness.invoke(["wait", started.json().workerId])).json();
  assert.equal(result.state, "completed");
  assert.equal(result.warnings.includes("oversized_incomplete_line"), true);
});

test("a split oversized line discards its JSON-looking suffix", async (t) => {
  const harness = await createCliHarness(t);
  const flood = Buffer.alloc(1_200_000, 0x7a);
  const started = await harness.invoke(["start", "--", "discard suffix"], {
    scenario: { stdoutChunks: [{ base64: flood.toString("base64") }, "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const result = (await harness.invoke(["wait", started.json().workerId])).json();
  assert.notEqual(result.state, "completed");
  assert.equal(result.warnings.includes("oversized_incomplete_line"), true);
});

async function sparse(path, bytes) {
  const handle = await open(path, "w");
  try { await handle.truncate(bytes); }
  finally { await handle.close(); }
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function rawBytes(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile()) total += (await stat(join(root, entry.name))).size;
  }
  return total;
}

async function exitedPid() {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore", windowsHide: true });
  const pid = child.pid;
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return pid;
}

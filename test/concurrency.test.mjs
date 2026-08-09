import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createCliHarness, waitForProcessGone } from "./helpers/cli-harness.mjs";

test("two resumes on one worker serialize and only one active turn launches", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(["start", "--", "seed"], {
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = start.json().workerId;
  await harness.invoke(["wait", workerId]);
  await waitForAbsent(join(harness.stateRoot, "workers", `${workerId}.lock`));
  const settled = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${workerId}.json`), "utf8"));
  await waitForProcessGone(settled.runnerPid);
  const activeBarrier = join(harness.stateRoot, "fixtures", "resume-active");
  const providerBarrier = join(harness.stateRoot, "fixtures", "resume-provider");
  await mkdir(join(harness.stateRoot, "fixtures"), { recursive: true });

  const leftPromise = harness.invoke(["resume", workerId, "--", "left"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
    extraEnv: { LUNA_SIDECAR_TEST_BARRIER: activeBarrier, FAKE_CODEX_START_BARRIER: providerBarrier },
  });
  await waitForFile(`${activeBarrier}.ready`);
  const rightPromise = harness.invoke(["resume", workerId, "--", "right"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  await writeFile(`${activeBarrier}.release`, "release\n", "utf8");
  const leftReceipt = await leftPromise;
  const rightReceipt = await rightPromise;
  await writeFile(providerBarrier, "release\n", "utf8");
  const [left, right] = [leftReceipt, rightReceipt];
  const successes = [left, right].filter((value) => value.code === 0);
  const failures = [left, right].filter((value) => value.code === 1);
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].json().error.code, "active_turn");
  await harness.invoke(["wait", workerId]);
  const worker = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${workerId}.json`), "utf8"));
  assert.equal(worker.turns.length, 2);
  assert.equal(worker.turns[0].state, "completed");
  assert.equal(worker.turns[1].state, "completed");
});

test("a paused stale writer cannot commit after a newer revision", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(["start", "--", "seed"], {
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = start.json().workerId;
  await harness.invoke(["wait", workerId]);
  await waitForAbsent(join(harness.stateRoot, "workers", `${workerId}.lock`));
  const barrier = join(harness.stateRoot, "fixtures", "stale-writer");
  await mkdir(join(harness.stateRoot, "fixtures"), { recursive: true });

  const stale = harness.invoke(["resume", workerId, "--", "stale"], {
    scenario: { exitCode: 0 },
    extraEnv: { LUNA_SIDECAR_TEST_BARRIER: barrier },
  });
  await waitForFile(`${barrier}.ready`);
  await rm(join(harness.stateRoot, "workers", `${workerId}.lock`), { force: true });

  const fresh = await harness.invoke(["resume", workerId, "--", "fresh"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  assert.equal(fresh.code, 0);
  await harness.invoke(["wait", workerId]);
  await writeFile(`${barrier}.release`, "release\n", "utf8");
  const staleResult = await stale;
  assert.equal(staleResult.code, 1);
  assert.equal(staleResult.json().error.code, "revision_conflict");

  const worker = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${workerId}.json`), "utf8"));
  assert.equal(worker.turns.length, 2);
  assert.equal(worker.turns.at(-1).state, "completed");
  assert.equal(worker.revision >= 3, true);
  const promptFiles = await readdir(join(harness.stateRoot, "prompts"));
  assert.deepEqual(promptFiles, []);
});

test("an old malformed lock is recoverable but an old live-owner lock is not stolen", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(["start", "--", "seed"], {
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = start.json().workerId;
  await harness.invoke(["wait", workerId]);
  const lockPath = join(harness.stateRoot, "workers", `${workerId}.lock`);
  await waitForAbsent(lockPath);
  const old = new Date(Date.now() - 60_000);

  await writeFile(lockPath, "", "utf8");
  await utimes(lockPath, old, old);
  const recovered = await harness.invoke(["resume", workerId, "--", "recover malformed lock"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  assert.equal(recovered.code, 0);
  await harness.invoke(["wait", workerId]);
  await waitForAbsent(lockPath);

  const current = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${workerId}.json`), "utf8"));
  await writeFile(lockPath, `${JSON.stringify({
    token: "11111111-1111-4111-8111-111111111111",
    pid: process.pid,
    acquiredAt: old.toISOString(),
    baseRevision: current.revision,
  })}\n`, "utf8");
  const blocked = await harness.invoke(["resume", workerId, "--", "must not steal live lock"], { scenario: {} });
  assert.equal(blocked.code, 1);
  assert.equal(blocked.json().error.code, "lock_timeout");
  await rm(lockPath, { force: true });
  const unchanged = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${workerId}.json`), "utf8"));
  assert.equal(unchanged.revision, current.revision);
  assert.equal(unchanged.turns.length, current.turns.length);
});

async function waitForFile(path) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { await readFile(path, "utf8"); return; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for file: ${path}`);
}

async function waitForAbsent(path) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await readFile(path, "utf8");
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
  throw new Error(`Timed out waiting for file removal: ${path}`);
}

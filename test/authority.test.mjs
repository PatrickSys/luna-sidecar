import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createCliHarness } from "./helpers/cli-harness.mjs";

const legacyWorkerId = "11111111-1111-4111-8111-111111111111";

test("start records schema v2, exact initial authority, prompt hash, and requested provider cwd", async (t) => {
  const harness = await createCliHarness(t);
  const result = await harness.invoke(
    ["start", "--effort", "xhigh", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--", "authority prompt"],
    {
      scenario: {
        stdoutChunks: [
          "{\"type\":\"thread.started\",\"thread_id\":\"fixture-thread\"}\n",
          "{\"type\":\"turn.completed\"}\n",
        ],
        linger: true,
        exitCode: 0,
      },
    },
  );
  const receipt = result.json();
  assert.equal(result.code, 0);
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.state, "running");
  assert.equal(receipt.effort, "xhigh");
  assert.equal(receipt.sandbox, "read-only");
  assert.equal(receipt.bypass, false);
  assert.equal(receipt.cwd, harness.requestedCwd);
  assert.equal(receipt.turnCount, 1);
  assert.match(receipt.turnId, /^[0-9a-f-]{36}$/);

  const workerPath = join(harness.stateRoot, "workers", `${receipt.workerId}.json`);
  const worker = JSON.parse(await readFile(workerPath, "utf8"));
  assert.equal(worker.revision >= 1, true);
  assert.equal(worker.state, "running");
  assert.equal(worker.turns.length, 1);
  assert.equal(worker.turns[0].promptSha256, createHash("sha256").update("authority prompt").digest("hex"));
  assert.equal(JSON.stringify(worker).includes("authority prompt"), false);

  const capture = await harness.waitForCapture(result);
  assert.deepEqual(capture.argv, [
    "exec", "--json", "--model", "gpt-5.6-luna", "-c", "model_reasoning_effort=xhigh",
    "--sandbox", "read-only", "-C", harness.requestedCwd, "-",
  ]);
  assert.equal(capture.cwd, harness.requestedCwd);
  assert.equal(capture.stdinBase64, Buffer.from("authority prompt").toString("base64"));
  await harness.release(result);
  const done = await harness.invoke(["wait", receipt.workerId], { scenario: {} });
  assert.equal(done.json().state, "completed");
});

test("resume preserves worker identity, creates a unique turn, and captures inherited authority", async (t) => {
  const harness = await createCliHarness(t);
  const start = await harness.invoke(["start", "--effort", "high", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--", "first"], {
    scenario: {
      stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"fixture-thread\"}\n", "{\"type\":\"turn.completed\"}\n"],
      exitCode: 0,
    },
  });
  const first = start.json();
  const firstDone = await harness.invoke(["wait", first.workerId], { scenario: {} });
  assert.equal(firstDone.json().state, "completed");

  const resumed = await harness.invoke(["resume", first.workerId, "--", "second"], {
    scenario: {
      stdoutChunks: ["{\"type\":\"turn.completed\"}\n"],
      exitCode: 0,
    },
  });
  assert.equal(resumed.code, 0);
  const second = resumed.json();
  assert.equal(second.workerId, first.workerId);
  assert.notEqual(second.turnId, first.turnId);
  assert.equal(second.effort, "high");
  assert.equal(second.sandbox, "read-only");
  assert.equal(second.bypass, false);

  const capture = await harness.waitForCapture(resumed);
  assert.deepEqual(capture.argv, [
    "exec", "resume", "--json", "--model", "gpt-5.6-luna", "-c", "model_reasoning_effort=high",
    "-c", "sandbox_mode=\"read-only\"", "fixture-thread", "-",
  ]);
  assert.equal(capture.cwd, harness.requestedCwd);
  const worker = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${first.workerId}.json`), "utf8"));
  assert.equal(worker.turns.length, 2);
  assert.equal(worker.turnCount, 2);
  await harness.verifyCaptureProcessesGone();
});

test("default authority and explicit resume broadening then narrowing use exact provider contracts", async (t) => {
  const harness = await createCliHarness(t);
  const defaultStart = await harness.invoke(["start", "--effort", "medium", "--sandbox", "workspace-write", "--cwd", harness.requestedCwd, "--", "default authority"], {
    scenario: {
      stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"authority-thread\"}\n", "{\"type\":\"turn.completed\"}\n"],
      exitCode: 0,
    },
  });
  const defaultCapture = await harness.waitForCapture(defaultStart);
  assert.deepEqual(defaultCapture.argv, [
    "exec", "--json", "--model", "gpt-5.6-luna", "-c", "model_reasoning_effort=medium",
    "--sandbox", "workspace-write", "-C", defaultStart.json().cwd, "-",
  ]);
  await harness.invoke(["wait", defaultStart.json().workerId]);

  const seeded = await harness.invoke(["start", "--effort", "high", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--", "seed"], {
    scenario: {
      stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"override-thread\"}\n", "{\"type\":\"turn.completed\"}\n"],
      exitCode: 0,
    },
  });
  const workerId = seeded.json().workerId;
  await harness.invoke(["wait", workerId]);
  const overrideCwd = join(harness.root, "explicit override cwd");
  await mkdir(overrideCwd, { recursive: true });

  const broadened = await harness.invoke([
    "resume", workerId, "--effort", "max", "--sandbox", "full-access", "--cwd", overrideCwd, "--", "broaden explicitly",
  ], {
    cwd: harness.root,
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"broadened-thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const broadenedCapture = await harness.waitForCapture(broadened);
  assert.equal(broadened.json().bypass, false);
  assert.equal(broadened.json().sandbox, "full-access");
  assert.equal(broadened.json().effort, "max");
  assert.equal(broadened.json().cwd, overrideCwd);
  assert.deepEqual(broadenedCapture.argv, [
    "exec", "resume", "--json", "--model", "gpt-5.6-luna", "-c", "model_reasoning_effort=max",
    "-c", "sandbox_mode=\"full-access\"", "override-thread", "-",
  ]);
  assert.equal(broadenedCapture.cwd, overrideCwd);
  const broadenedWorker = JSON.parse(await readFile(join(harness.stateRoot, "workers", `${workerId}.json`), "utf8"));
  assert.equal(broadenedWorker.turns.at(-1).sandbox, "full-access");
  assert.equal(broadenedWorker.turns.at(-1).bypass, false);
  await harness.invoke(["wait", workerId]);

  const narrowed = await harness.invoke(["resume", workerId, "--sandbox", "read-only", "--", "narrow explicitly"], {
    cwd: harness.root,
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"narrowed-thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const narrowedCapture = await harness.waitForCapture(narrowed);
  assert.equal(narrowed.json().bypass, false);
  assert.equal(narrowed.json().effort, "max");
  assert.equal(narrowed.json().cwd, overrideCwd);
  assert.deepEqual(narrowedCapture.argv, [
    "exec", "resume", "--json", "--model", "gpt-5.6-luna", "-c", "model_reasoning_effort=max",
    "-c", "sandbox_mode=\"read-only\"", "broadened-thread", "-",
  ]);
  assert.equal(narrowedCapture.cwd, overrideCwd);
  await harness.invoke(["wait", workerId]);
  await harness.verifyCaptureProcessesGone();
});

test("bypass is explicit and contradictory authority is rejected", async (t) => {
  const harness = await createCliHarness(t);
  const invalid = await harness.invoke(["start", "--effort", "medium", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--read-only", "--bypass", "--", "invalid"]);
  assert.equal(invalid.code, 2);
  assert.match(invalid.json().error.message, /legacy authority flag.*--read-only.*--sandbox/i);
  await harness.assertNoCapture(invalid);

  const result = await harness.invoke(["start", "--effort", "medium", "--sandbox", "full-access", "--cwd", harness.requestedCwd, "--", "bypass"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], linger: true, exitCode: 0 },
  });
  const receipt = result.json();
  const capture = await harness.waitForCapture(result);
  assert.deepEqual(capture.argv, [
    "exec", "--json", "--model", "gpt-5.6-luna", "-c", "model_reasoning_effort=medium",
    "--sandbox", "full-access", "-C", receipt.cwd, "-",
  ]);
  await harness.release(result);
  await harness.invoke(["wait", receipt.workerId]);
});

test("legacy reads are byte-preserving and explicit cancel upgrades in place", async (t) => {
  const harness = await createCliHarness(t);
  const fixturePath = new URL("../test/fixtures/legacy-worker.json", import.meta.url);
  const fixture = JSON.parse(await (await import("node:fs/promises")).readFile(fixturePath, "utf8"));
  fixture.prompt = "must not migrate";
  fixture.env = { SECRET: "must not migrate" };
  fixture.argv = ["must", "not", "migrate"];
  fixture.rawEvents = [{ secret: "must not migrate" }];
  const fixtureBytes = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`);
  const workerPath = join(harness.stateRoot, "workers", `${legacyWorkerId}.json`);
  await mkdir(join(harness.stateRoot, "workers"), { recursive: true });
  await writeFile(workerPath, fixtureBytes);
  const before = await fingerprint(workerPath);
  const read = await harness.invoke(["status", legacyWorkerId]);
  assert.equal(read.code, 0);
  assert.equal((await fingerprint(workerPath)).sha256, before.sha256);
  const cancel = await harness.invoke(["cancel", legacyWorkerId]);
  assert.equal(cancel.code, 0);
  const upgraded = JSON.parse(await readFile(workerPath, "utf8"));
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.workerId, legacyWorkerId);
  assert.equal(upgraded.revision, 1);
  assert.equal(Object.hasOwn(upgraded, "prompt"), false);
  assert.equal(Object.hasOwn(upgraded, "env"), false);
  assert.equal(Object.hasOwn(upgraded, "argv"), false);
  assert.equal(Object.hasOwn(upgraded, "rawEvents"), false);
});

test("legacy resume fails closed when stored authority is incomplete", async (t) => {
  const harness = await createCliHarness(t);
  const workerPath = join(harness.stateRoot, "workers", `${legacyWorkerId}.json`);
  await mkdir(join(harness.stateRoot, "workers"), { recursive: true });
  await writeFile(workerPath, JSON.stringify({
    id: legacyWorkerId,
    state: "completed",
    threadId: "legacy-thread",
    pid: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
    prompt: "must not migrate",
    env: { SECRET: "must not migrate" },
  }));
  const failed = await harness.invoke(["resume", legacyWorkerId, "--", "unsafe omission"]);
  assert.equal(failed.code, 2);
  assert.equal(failed.json().command, "resume");
  assert.equal(failed.json().error.code, "stored_authority");
  assert.match(failed.json().error.message, /Stored effort is missing or invalid/);
  assert.deepEqual(failed.stderr, Buffer.alloc(0));
  assert.equal(JSON.parse(await readFile(workerPath, "utf8")).prompt, "must not migrate");
});

async function fingerprint(path) {
  const bytes = await readFile(path);
  const metadata = await stat(path, { bigint: true });
  return { sha256: createHash("sha256").update(bytes).digest("hex"), mtimeNs: metadata.mtimeNs };
}

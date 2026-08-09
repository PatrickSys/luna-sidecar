import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createCliHarness } from "./helpers/cli-harness.mjs";

const validMarker = JSON.stringify({
  version: 1,
  workerId: "11111111-1111-4111-8111-111111111111",
  turnId: "22222222-2222-4222-8222-222222222222",
});

test("nested sidecar execution rejects before any runner/provider spawn while observation remains allowed", async (t) => {
  const harness = await createCliHarness(t);
  const blockedStart = await harness.invoke(["start", "--", "nested"], {
    extraEnv: { LUNA_SIDECAR_WORKER_MARKER: validMarker },
  });
  assert.equal(blockedStart.code, 2);
  await harness.assertNoCapture(blockedStart);
  await assert.rejects(stat(join(harness.stateRoot, "workers")), { code: "ENOENT" });

  const blockedRun = await harness.invoke(["run", "--", "nested run"], {
    extraEnv: { LUNA_SIDECAR_WORKER_MARKER: validMarker },
  });
  assert.equal(blockedRun.code, 2);
  await harness.assertNoCapture(blockedRun);

  const blockedWorker = await harness.invoke(["_worker", "11111111-1111-4111-8111-111111111111"], {
    extraEnv: { LUNA_SIDECAR_WORKER_MARKER: validMarker },
  });
  assert.equal(blockedWorker.code, 2);
  await harness.assertNoCapture(blockedWorker);

  const normal = await harness.invoke(["start", "--", "observation source"], { scenario: { exitCode: 0 } });
  const observed = await harness.invoke(["status", normal.json().workerId], {
    extraEnv: { LUNA_SIDECAR_WORKER_MARKER: "malformed" },
  });
  assert.equal(observed.code, 0);
  await harness.invoke(["wait", normal.json().workerId]);

  const blockedResume = await harness.invoke(["resume", normal.json().workerId, "--", "blocked resume"], {
    extraEnv: { LUNA_SIDECAR_WORKER_MARKER: validMarker },
  });
  assert.equal(blockedResume.code, 2);
  const blockedCancel = await harness.invoke(["cancel", normal.json().workerId], {
    extraEnv: { LUNA_SIDECAR_WORKER_MARKER: validMarker },
  });
  assert.equal(blockedCancel.code, 2);
  await harness.assertNoCapture(blockedResume);
  await harness.assertNoCapture(blockedCancel);

  for (const args of [["start", "--", "malformed start"], ["run", "--", "malformed run"], ["resume", normal.json().workerId, "--", "malformed resume"], ["cancel", normal.json().workerId], ["_worker", normal.json().workerId]]) {
    const blocked = await harness.invoke(args, { extraEnv: { LUNA_SIDECAR_WORKER_MARKER: "not-json" } });
    assert.equal(blocked.code, 2, args[0]);
    await harness.assertNoCapture(blocked);
  }
  for (const marker of [validMarker, "not-json"]) {
    for (const args of [["status", normal.json().workerId], ["list"], ["wait", normal.json().workerId]]) {
      const allowed = await harness.invoke(args, { extraEnv: { LUNA_SIDECAR_WORKER_MARKER: marker } });
      assert.equal(allowed.code, 0, `${args[0]}:${marker === validMarker ? "valid" : "malformed"}`);
    }
  }
  const source = await readFile(new URL("../skills/luna-sidecar/scripts/luna-sidecar.mjs", import.meta.url), "utf8");
  const main = source.slice(source.indexOf("async function main"), source.indexOf("\n}\n", source.indexOf("async function main")) + 3);
  assert.equal(main.indexOf("assertExecutionAllowed(command)") < main.indexOf("startWorker("), true);
  assert.equal(main.indexOf("assertExecutionAllowed(command)") < main.indexOf("runForeground("), true);
});

test("the marker is provider-only and native subagent events do not recurse", async (t) => {
  const harness = await createCliHarness(t);
  const started = await harness.invoke(["start", "--", "native subagent boundary"], {
    scenario: {
      stdoutChunks: [
        "{\"type\":\"item.completed\",\"item\":{\"type\":\"collab_tool_call\",\"tool\":\"spawn_agent\",\"status\":\"completed\",\"receiver_thread_ids\":[\"child\"]}}\n",
        "{\"type\":\"turn.completed\"}\n",
      ],
      exitCode: 0,
    },
  });
  const capture = await harness.waitForCapture(started);
  assert.deepEqual(JSON.parse(capture.env.LUNA_SIDECAR_WORKER_MARKER), {
    version: 1,
    workerId: started.json().workerId,
    turnId: started.json().turnId,
  });
  const done = await harness.invoke(["wait", started.json().workerId]);
  assert.equal(done.json().state, "completed");
  assert.equal(done.json().warnings.length, 0);
});

test("independent top-level workers remain allowed and same-cwd warnings are advisory and sorted", async (t) => {
  const harness = await createCliHarness(t);
  const blocker = await harness.invoke(["start", "--", "blocker"], {
    scenario: { startBarrier: true, exitCode: 0 },
  });
  const blockerTwo = await harness.invoke(["start", "--", "blocker two"], {
    scenario: { startBarrier: true, exitCode: 0 },
  });
  const blockerId = blocker.json().workerId;
  const blockerTwoId = blockerTwo.json().workerId;
  await waitForRunner(harness, blockerId);
  await waitForRunner(harness, blockerTwoId);

  const writer = await harness.invoke(["start", "--", "writer"], { scenario: { exitCode: 0 } });
  assert.deepEqual(writer.json().warnings, [`active_same_cwd_writers:${[blockerId, blockerTwoId].sort().join(",")}`]);
  const readOnly = await harness.invoke(["start", "--read-only", "--", "reader"], { scenario: { exitCode: 0 } });
  assert.equal(readOnly.json().warnings.some((value) => value.startsWith("active_same_cwd_writers:")), false);

  await harness.releaseStart(blocker);
  await harness.releaseStart(blockerTwo);
  await harness.invoke(["wait", blockerId]);
  await harness.invoke(["wait", blockerTwoId]);
  await harness.invoke(["wait", writer.json().workerId]);
  await harness.invoke(["wait", readOnly.json().workerId]);
});

test("resume reports active write-capable same-cwd workers without blocking", async (t) => {
  const harness = await createCliHarness(t);
  const base = await harness.invoke(["start", "--", "base"], { scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"base-thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 } });
  await harness.invoke(["wait", base.json().workerId]);
  const blocker = await harness.invoke(["start", "--", "active blocker"], { scenario: { startBarrier: true, exitCode: 0 } });
  await waitForRunner(harness, blocker.json().workerId);
  const blockerPath = join(harness.stateRoot, "workers", `${blocker.json().workerId}.json`);
  const phaseTwoShape = JSON.parse(await readFile(blockerPath, "utf8"));
  delete phaseTwoShape.cwdRealpath;
  delete phaseTwoShape.turns.at(-1).cwdRealpath;
  await writeFile(blockerPath, `${JSON.stringify(phaseTwoShape)}\n`, "utf8");
  const resumed = await harness.invoke(["resume", base.json().workerId, "--", "resume overlap"], { scenario: { exitCode: 0 } });
  assert.equal(resumed.code, 0);
  assert.deepEqual(resumed.json().warnings, [`active_same_cwd_writers:${blocker.json().workerId}`]);
  await harness.releaseStart(blocker);
  await harness.invoke(["wait", blocker.json().workerId]);
  await harness.invoke(["wait", base.json().workerId]);
});

test("simultaneous write-capable start and resume serialize their advisory reservations", async (t) => {
  const harness = await createCliHarness(t);
  const base = await harness.invoke(["start", "--", "reservation base"], {
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"reservation-thread\"}\n", "{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  await harness.invoke(["wait", base.json().workerId]);
  const [started, resumed] = await Promise.all([
    harness.invoke(["start", "--", "parallel start"], { scenario: { startBarrier: true, exitCode: 0 } }),
    harness.invoke(["resume", base.json().workerId, "--", "parallel resume"], { scenario: { startBarrier: true, exitCode: 0 } }),
  ]);
  assert.equal(started.code, 0);
  assert.equal(resumed.code, 0);
  const startWarnings = started.json().warnings;
  const resumeWarnings = resumed.json().warnings;
  assert.equal(
    startWarnings.includes(`active_same_cwd_writers:${base.json().workerId}`)
      || resumeWarnings.includes(`active_same_cwd_writers:${started.json().workerId}`),
    true,
  );
  await harness.releaseStart(started);
  await harness.releaseStart(resumed);
  await harness.invoke(["wait", started.json().workerId]);
  await harness.invoke(["wait", base.json().workerId]);
});

test("compact state and manager output exclude env, prompt, stderr, and unknown-event sentinels", async (t) => {
  const harness = await createCliHarness(t);
  const sentinels = {
    env: "env-secret-sentinel",
    prompt: "prompt-secret-sentinel",
    stderr: "stderr-secret-sentinel",
    event: "event-secret-sentinel",
  };
  const started = await harness.invoke(["start", "--", sentinels.prompt], {
    scenario: {
      stdoutChunks: [
        `{\"type\":\"unknown.event\",\"payload\":\"${sentinels.event}\"}\n`,
        "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"fixed safe finalMessage\"}}\n",
        "{\"type\":\"turn.completed\"}\n",
      ],
      stderrChunks: [sentinels.stderr],
      exitCode: 0,
    },
    extraEnv: { LUNA_TEST_SENTINEL: sentinels.env },
  });
  const done = await harness.invoke(["wait", started.json().workerId]);
  const manifest = await readFile(join(harness.stateRoot, "workers", `${started.json().workerId}.json`), "utf8");
  const manager = `${started.stdout.toString("utf8")}\n${done.stdout.toString("utf8")}`;
  for (const secret of Object.values(sentinels)) {
    assert.equal(manifest.includes(secret), false, `manifest leaked ${secret}`);
    assert.equal(manager.includes(secret), false, `manager output leaked ${secret}`);
  }
  assert.equal(manifest.includes("fixed safe finalMessage"), true);
});

test("poisoned persisted error codes normalize across observation projections", async (t) => {
  const harness = await createCliHarness(t);
  const started = await harness.invoke(["start", "--", "poison"], { scenario: { exitCode: 0 } });
  await harness.invoke(["wait", started.json().workerId]);
  const manifestPath = join(harness.stateRoot, "workers", `${started.json().workerId}.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.turns[0].state = "failed";
  manifest.turns[0].providerState = "failed";
  manifest.turns[0].errorCode = "poisoned_exception_code";
  manifest.turns[0].error = "raw exception and secret";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  for (const args of [["status", started.json().workerId], ["wait", started.json().workerId], ["list"]]) {
    const output = (await harness.invoke(args)).json();
    const view = args[0] === "list" ? output[0] : output;
    assert.equal(view.errorCode, "sidecar_error");
    assert.equal(view.error, "Sidecar evidence is unavailable");
  }
});

async function waitForRunner(harness, workerId) {
  const path = join(harness.stateRoot, "workers", `${workerId}.json`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const worker = JSON.parse(await readFile(path, "utf8"));
    if (Number.isSafeInteger(worker.runnerPid)) return worker;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for runner: ${workerId}`);
}

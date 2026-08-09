import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createCliHarness } from "./helpers/cli-harness.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const legacyFixturePath = join(repositoryRoot, "test", "fixtures", "legacy-worker.json");
const legacyWorkerId = "11111111-1111-4111-8111-111111111111";
const absentWorkerId = "22222222-2222-4222-8222-222222222222";

test("legacy worker reads preserve bytes, timestamp, and additive manager fields", async (t) => {
  const harness = await createCliHarness(t);
  const workersRoot = join(harness.stateRoot, "workers");
  const workerPath = join(workersRoot, `${legacyWorkerId}.json`);
  const fixtureBytes = await readFile(legacyFixturePath);

  await mkdir(workersRoot, { recursive: true });
  await mkdir(join(harness.stateRoot, "logs"), { recursive: true });
  await mkdir(join(harness.stateRoot, "prompts"), { recursive: true });
  await writeFile(workerPath, fixtureBytes);

  const initialRecord = JSON.parse(fixtureBytes.toString("utf8"));
  assert.equal(Object.hasOwn(initialRecord, "schemaVersion"), false);
  const initialFingerprint = await fingerprint(workerPath);
  const reads = [
    ["status", legacyWorkerId],
    ["list"],
    ["wait", legacyWorkerId],
    ["wait", legacyWorkerId, "--timeout", "0"],
    ["wait", legacyWorkerId, "--timeout", "25"],
  ];

  for (const args of reads) {
    const result = await harness.invoke(args);
    assert.equal(result.code, 0, `${args[0]} should succeed`);
    assert.equal(result.signal, null);
    assert.deepEqual(result.stderr, Buffer.alloc(0));

    const value = result.json();
    const view = args[0] === "list"
      ? value.find((entry) => entry.workerId === legacyWorkerId)
      : value;
    assert.ok(view, `${args[0]} should return the legacy worker`);
    assertWorkerView(view);
    assert.equal(view.workerId, legacyWorkerId);
    assert.equal(view.state, "completed");

    assert.deepEqual(await fingerprint(workerPath), initialFingerprint);
    assert.equal(Object.hasOwn(JSON.parse(await readFile(workerPath, "utf8")), "schemaVersion"), false);
    await harness.assertNoCapture(result);
  }
});

test("background start preserves manager shape and transports exact prompt bytes through the fake provider", async (t) => {
  const harness = await createCliHarness(t);
  const callerCwd = join(harness.root, "start caller ^ cwd", "é");
  await mkdir(callerCwd, { recursive: true });
  const prompt = "background line one\r\nquotes: \" ' `\r\nmeta: & | < > ^ % !\r\n終わり";
  const result = await harness.invoke(
    ["start", "--effort", "xhigh", "--sandbox", "read-only", "--cwd", harness.requestedCwd, "--", prompt],
    {
      cwd: callerCwd,
      scenario: {
        stdoutChunks: [
          "{\"type\":\"thread.started\",\"thread_id\":\"fixture-thread\"}\n",
          "{\"type\":\"turn.completed\"}\n",
        ],
        linger: true,
        grandchild: { linger: true },
        exitCode: 0,
      },
    },
  );

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  const receipt = result.json();
  assertWorkerView(receipt);
  assert.equal(Number.isSafeInteger(receipt.pid) && receipt.pid > 0, true);
  assert.equal(receipt.effort, "xhigh");
  assert.equal(pathKey(receipt.cwd), pathKey(harness.requestedCwd));
  assert.equal(receipt.bypass, false);

  const workerPath = join(harness.stateRoot, "workers", `${receipt.workerId}.json`);
  const worker = JSON.parse(await readFile(workerPath, "utf8"));
  assert.equal(worker.id, receipt.workerId);
  assert.equal(worker.state, "running");
  assert.equal(Number.isSafeInteger(worker.pid) && worker.pid > 0, true);
  assert.equal(worker.sandbox, "read-only");
  assert.equal(pathKey(worker.cwd), pathKey(harness.requestedCwd));
  harness.observePid(receipt.pid);

  const capture = await harness.waitForCapture(result);
  assert.deepEqual(capture.argv, [
    "exec",
    "--json",
    "--model",
    "gpt-5.6-luna",
    "-c",
    "model_reasoning_effort=xhigh",
    "--sandbox",
    "read-only",
    "-C",
    harness.requestedCwd,
    "-",
  ]);
  assert.equal(capture.argv.includes(prompt), false);
  assert.equal(capture.stdinBase64, Buffer.from(prompt).toString("base64"));
  assert.equal(Number.isSafeInteger(capture.grandchildPid) && capture.grandchildPid > 0, true);
  assert.equal(capture.grandchild.parentPid, capture.pid);
  assert.equal(pathKey(capture.cwd), pathKey(harness.requestedCwd));
  assert.equal(pathKey(capture.grandchild.cwd), pathKey(harness.requestedCwd));

  await harness.release(result);
  await harness.verifyCaptureProcessesGone();
});

test("explicit sandbox and effort spellings persist without hidden defaults", async (t) => {
  const harness = await createCliHarness(t);
  const cwd = join(harness.root, "space & unicode ^", "é");
  await mkdir(cwd, { recursive: true });
  for (const sandbox of ["read-only", "workspace-write", "full-access"]) {
    for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
      const started = await harness.invoke(["start", "--cwd", cwd, "--sandbox", sandbox, "--effort", effort, "--", `${sandbox} ${effort}`], {
        scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"] },
      });
      assert.equal(started.code, 0);
      const receipt = started.json();
      assert.equal(receipt.cwd, cwd);
      assert.equal(receipt.sandbox, sandbox);
      assert.equal(receipt.effort, effort);
      assert.equal(receipt.bypass, false);
      const completed = await harness.invoke(["wait", receipt.workerId]);
      assert.equal(completed.code, 0);
      assert.equal(completed.json().sandbox, sandbox);
      assert.equal(completed.json().effort, effort);
    }
  }
});

test("resume inherits stored controls and accepts visible overrides", async (t) => {
  const harness = await createCliHarness(t);
  const initialCwd = join(harness.root, "initial cwd");
  const overrideCwd = join(harness.root, "override cwd ^", "é");
  await mkdir(initialCwd, { recursive: true });
  await mkdir(overrideCwd, { recursive: true });
  const start = await harness.invoke(["start", "--cwd", initialCwd, "--sandbox", "read-only", "--effort", "high", "--", "initial"], {
    scenario: { stdoutChunks: ["{\"type\":\"thread.started\",\"thread_id\":\"fixture-thread\"}\n", "{\"type\":\"turn.completed\"}\n"] },
  });
  const workerId = start.json().workerId;
  await harness.invoke(["wait", workerId]);

  const inheritedStart = await harness.invoke(["resume", workerId, "--", "inherit"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"] },
  });
  assert.equal(inheritedStart.json().workerId, workerId);
  assert.equal(inheritedStart.json().cwd, initialCwd);
  assert.equal(inheritedStart.json().sandbox, "read-only");
  assert.equal(inheritedStart.json().effort, "high");
  await harness.invoke(["wait", workerId]);

  const overrideStart = await harness.invoke(["resume", workerId, "--cwd", overrideCwd, "--sandbox", "workspace-write", "--effort", "max", "--", "override"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"] },
  });
  assert.equal(overrideStart.json().workerId, workerId);
  assert.equal(overrideStart.json().cwd, overrideCwd);
  assert.equal(overrideStart.json().sandbox, "workspace-write");
  assert.equal(overrideStart.json().effort, "max");
  await harness.invoke(["wait", workerId]);
});

test("manager validation errors use one schema-v2 value and removed commands stay structured", async (t) => {
  const harness = await createCliHarness(t);
  const notDirectory = join(harness.root, "not a directory.txt");
  await writeFile(notDirectory, "file", "utf8");
  const failures = [
    { args: ["start"], message: /--cwd is required for start/ },
    { args: ["status"], message: /A worker id is required/ },
    { args: ["wait"], message: /A worker id is required/ },
    { args: ["resume"], message: /A worker id is required/ },
    { args: ["cancel"], message: /A worker id is required/ },
    { args: ["start", "--cwd", harness.requestedCwd, "--sandbox", "read-only", "--effort", "impossible", "--", "task"], message: /--effort must be one of/ },
    { args: ["start", "--cwd"], message: /--cwd needs a folder/ },
    { args: ["start", "--sandbox", "read-only", "--effort", "low", "--cwd", ".", "--", "task"], message: /absolute existing directory/ },
    { args: ["start", "--sandbox", "read-only", "--effort", "low", "--cwd", join(harness.root, "missing directory"), "--", "task"], message: /absolute existing directory/ },
    { args: ["start", "--sandbox", "read-only", "--effort", "low", "--cwd", notDirectory, "--", "task"], message: /absolute existing directory/ },
    { args: ["start", "--sandbox", "invalid", "--effort", "low", "--cwd", harness.requestedCwd, "--", "task"], message: /--sandbox must be one of/ },
    { args: ["start", "--sandbox", "read-only", "--sandbox", "workspace-write", "--effort", "low", "--cwd", harness.requestedCwd, "--", "task"], message: /Contradictory --sandbox/ },
    { args: ["start", "--sandbox", "read-only", "--effort", "low", "--effort", "max", "--cwd", harness.requestedCwd, "--", "task"], message: /Contradictory --effort/ },
    { args: ["start", "--sandbox", "read-only", "--effort", "low", "--cwd", harness.requestedCwd, "--read-only", "--", "task"], message: /legacy authority flag.*--read-only.*--sandbox/i },
    { args: ["start", "--sandbox", "read-only", "--effort", "low", "--cwd", harness.requestedCwd, "--bypass", "--", "task"], message: /legacy authority flag.*--bypass.*--sandbox/i },
    { args: ["start", "--unknown", "--", "task"], message: /Unknown option: --unknown/ },
    { args: ["start", "--", "   "], message: /--cwd is required for start/ },
    { args: ["wait", absentWorkerId, "--timeout", "later"], message: /--timeout must be a non-negative whole number/ },
    { args: ["status", "../../outside"], message: /Invalid worker id/ },
    { args: ["status", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"], message: /Invalid worker id/ },
    { args: ["status", "C:\\absolute\\worker.json"], message: /Invalid worker id/ },
  ];

  for (const { args, message } of failures) {
    const result = await harness.invoke(args);
    assert.equal(result.code, 2, `${args[0]} should reject invalid input`);
    assert.equal(result.signal, null);
    const value = result.json();
    assert.deepEqual(Object.keys(value).sort(), ["command", "error", "ok", "schemaVersion", "workerId"]);
    assert.equal(value.schemaVersion, 2);
    assert.equal(value.ok, false);
    assert.equal(value.command, args[0]);
    assert.equal(value.workerId, null);
    assert.match(value.error.message, message);
    assert.deepEqual(result.stderr, Buffer.alloc(0));
    await harness.assertNoCapture(result);
  }

  for (const removed of ["run", "stop"]) {
    const result = await harness.invoke([removed, "--help"]);
    assert.equal(result.code, 2);
    assert.deepEqual(result.stderr, Buffer.alloc(0));
    const value = result.json();
    assert.equal(value.command, removed);
    assert.equal(value.error.code, "removed_command");
    assert.match(value.error.message, /removed.*use (start|cancel)/i);
    await harness.assertNoCapture(result);
  }

  const list = await harness.invoke(["list"]);
  assert.equal(list.code, 0);
  assert.deepEqual(list.json(), []);
  assert.deepEqual(list.stderr, Buffer.alloc(0));
  await harness.assertNoCapture(list);
});

test("future schemas and poisoned v2 paths fail closed without rewriting state", async (t) => {
  const harness = await createCliHarness(t);
  const workersRoot = join(harness.stateRoot, "workers");
  await mkdir(workersRoot, { recursive: true });
  const futurePath = join(workersRoot, `${absentWorkerId}.json`);
  await writeFile(futurePath, `${JSON.stringify({
    schemaVersion: 3,
    workerId: absentWorkerId,
    id: absentWorkerId,
    revision: 9,
    turns: [],
    prompt: "must remain untouched",
  })}\n`, "utf8");
  const before = await fingerprint(futurePath);
  const future = await harness.invoke(["status", absentWorkerId]);
  assert.equal(future.code, 2);
  assert.equal(future.json().error.code, "invalid_input");
  assert.match(future.json().error.message, /Unsupported worker schema version: 3/);
  assert.deepEqual(future.stderr, Buffer.alloc(0));
  assert.deepEqual(await fingerprint(futurePath), before);

  const started = await harness.invoke(["start", "--cwd", harness.requestedCwd, "--sandbox", "read-only", "--effort", "low", "--", "path integrity"], {
    scenario: { stdoutChunks: ["{\"type\":\"turn.completed\"}\n"], exitCode: 0 },
  });
  const workerId = started.json().workerId;
  await harness.invoke(["wait", workerId]);
  const workerPath = join(workersRoot, `${workerId}.json`);
  const worker = JSON.parse(await readFile(workerPath, "utf8"));
  const outsidePath = join(harness.root, "outside.prompt");
  worker.turns.at(-1).promptPath = outsidePath;
  worker.promptPath = outsidePath;
  worker.revision += 1;
  await writeFile(workerPath, `${JSON.stringify(worker, null, 2)}\n`, "utf8");
  const poisoned = await harness.invoke(["status", workerId]);
  assert.equal(poisoned.code, 2);
  assert.equal(poisoned.json().error.code, "invalid_input");
  assert.match(poisoned.json().error.message, /Malformed prompt path/);
  assert.deepEqual(poisoned.stderr, Buffer.alloc(0));
});

test("unknown workers use the manager envelope without launching a provider", async (t) => {
  const harness = await createCliHarness(t);
  const commands = [
    ["status", absentWorkerId],
    ["wait", absentWorkerId],
    ["resume", absentWorkerId, "--", "do not launch"],
    ["cancel", absentWorkerId],
  ];

  for (const args of commands) {
    const result = await harness.invoke(args);
    assert.equal(result.code, 2);
    assert.equal(result.signal, null);
    const value = result.json();
    assert.equal(value.schemaVersion, 2);
    assert.equal(value.ok, false);
    assert.equal(value.command, args[0]);
    assert.equal(value.workerId, null);
    assert.equal(value.error.code, "unknown_worker");
    assert.match(value.error.message, new RegExp(`Unknown worker: ${absentWorkerId}`));
    assert.deepEqual(result.stderr, Buffer.alloc(0));
    await harness.assertNoCapture(result);
  }
});

function assertWorkerView(value) {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  const required = [
    "workerId",
    "state",
    "sessionId",
    "parentWorkerId",
    "pid",
    "cwd",
    "effort",
    "bypass",
    "createdAt",
    "completedAt",
    "finalMessage",
  ];
  for (const field of required) assert.equal(Object.hasOwn(value, field), true, `missing ${field}`);

  assert.equal(typeof value.workerId, "string");
  assert.equal(typeof value.state, "string");
  assertNullableType(value.sessionId, "string", "sessionId");
  assertNullableType(value.parentWorkerId, "string", "parentWorkerId");
  assertNullableType(value.pid, "number", "pid");
  assert.equal(typeof value.cwd, "string");
  assert.equal(typeof value.effort, "string");
  assert.equal(typeof value.bypass, "boolean");
  assert.equal(typeof value.createdAt, "string");
  assertNullableType(value.completedAt, "string", "completedAt");
  assertNullableType(value.finalMessage, "string", "finalMessage");
}

function assertNullableType(value, expectedType, label) {
  assert.equal(value === null || typeof value === expectedType, true, `${label} must be ${expectedType} or null`);
}

function pathKey(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

async function fingerprint(filePath) {
  const bytes = await readFile(filePath);
  const metadata = await stat(filePath, { bigint: true });
  return {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mtimeNs: metadata.mtimeNs,
  };
}

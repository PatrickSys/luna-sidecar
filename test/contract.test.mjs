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
    ["start", "--effort", "xhigh", "--read-only", "--cwd", harness.requestedCwd, "--", prompt],
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
  assert.equal(worker.pid, receipt.pid);
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
  assert.equal(pathKey(capture.grandchild.cwd), pathKey(callerCwd));
  // AUTH-01 in Phase 2 changes this characterized child-cwd divergence.
  assert.equal(pathKey(capture.cwd), pathKey(callerCwd));
  assert.notEqual(pathKey(capture.cwd), pathKey(harness.requestedCwd));

  await harness.release(result);
  await harness.verifyCaptureProcessesGone();
});

test("public commands retain command-specific recognition and current validation", async (t) => {
  const harness = await createCliHarness(t);
  const failures = [
    { args: [], message: /Pass one task/ },
    { args: ["run"], message: /Pass one task/ },
    { args: ["start"], message: /Pass one task/ },
    { args: ["status"], message: /A worker id is required/ },
    { args: ["wait"], message: /A worker id is required/ },
    { args: ["resume"], message: /A worker id is required/ },
    { args: ["cancel"], message: /A worker id is required/ },
    { args: ["run", "--effort", "impossible", "--", "task"], message: /--effort must be one of/ },
    { args: ["run", "--cwd"], message: /--cwd needs a folder/ },
    { args: ["run", "--unknown", "--", "task"], message: /Unknown option: --unknown/ },
    { args: ["run", "--", "   "], message: /Pass one task/ },
    { args: ["wait", absentWorkerId, "--timeout", "later"], message: /--timeout must be a non-negative whole number/ },
  ];

  for (const { args, message } of failures) {
    const result = await harness.invoke(args);
    assert.equal(result.code, 2, `${args[0] ?? "default run"} should reject invalid input`);
    assert.equal(result.signal, null);
    assert.deepEqual(result.stdout, Buffer.alloc(0));
    assert.match(result.stderr.toString("utf8"), message);
    await harness.assertNoCapture(result);
  }

  const list = await harness.invoke(["list"]);
  assert.equal(list.code, 0);
  assert.deepEqual(list.json(), []);
  assert.deepEqual(list.stderr, Buffer.alloc(0));
  await harness.assertNoCapture(list);
});

test("unknown workers fail through the current raw error surface without launching a provider", async (t) => {
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
    assert.deepEqual(result.stdout, Buffer.alloc(0));
    assert.match(result.stderr.toString("utf8"), new RegExp(`Unknown worker: ${absentWorkerId}`));
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

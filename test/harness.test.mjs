import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildMinimalTestEnvironment,
  createCliHarness,
  matchesExpectedProcessIdentity,
  parseExactlyOneJson,
  terminateSpawnedChild,
  waitForProcessGone,
  watchSpawnedChild,
} from "./helpers/cli-harness.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fakeCodexPath = join(repositoryRoot, "test", "fixtures", "fake-codex.mjs");
const launcherPath = join(repositoryRoot, "skills", "luna-sidecar", "scripts", "luna-sidecar.mjs");

test("owned Windows identity requires the exact launcher and worker tokens", () => {
  const workerId = "11111111-1111-4111-8111-111111111111";
  const expected = { commandTokens: [launcherPath, "_worker", workerId] };
  assert.equal(matchesExpectedProcessIdentity({ exists: true, uncertain: false, commandLine: `"${process.execPath}" "${launcherPath}" _worker ${workerId}` }, expected), true);
  assert.equal(matchesExpectedProcessIdentity({ exists: true, uncertain: false, commandLine: `"C:\\Users\\other\\codex.exe" exec --json ${workerId}` }, expected), false);
  assert.equal(matchesExpectedProcessIdentity({ exists: true, uncertain: false, commandLine: `"${launcherPath}" _worker` }, expected), false);
  assert.equal(matchesExpectedProcessIdentity({ exists: true, uncertain: true, commandLine: `"${launcherPath}" _worker ${workerId}` }, expected), false);
});

test("fake Codex captures exact bytes, authority inputs, PIDs, chunks, and explicit release", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna-sidecar-harness-"));
  const cleanup = registerCleanup(t, root);
  const cwd = join(root, "cwd with spaces", "ユニコード");
  await mkdir(cwd, { recursive: true });
  const scenarioPath = join(root, "scenario.json");
  const capturePath = join(root, "capture.json");
  const readyPath = join(root, "ready");
  const releasePath = join(root, "release");
  const grandchildCapturePath = join(root, "grandchild.json");
  const grandchildReadyPath = join(root, "grandchild.ready");

  const scenario = {
    suppressDefaultReadiness: true,
    stdoutChunks: [{ base64: Buffer.from([0xe2, 0x82]).toString("base64") }, { base64: Buffer.from([0xac, 0x00, 0xff]).toString("base64") }],
    stderrChunks: ["stderr α\r\n", { hex: "00c328" }],
    linger: true,
    grandchild: { linger: true },
    exitCode: 0,
  };
  await writeFile(scenarioPath, JSON.stringify(scenario), "utf8");

  const input = "spaces and ü\r\nquotes: \" ' `\r\nmeta: & | < > ^ % !\r\nlast line";
  const argv = [
    "exec",
    "--json",
    "--model",
    "gpt-5.6-luna",
    "-c",
    "model_reasoning_effort=high",
    "--sandbox",
    "workspace-write",
    "-C",
    cwd,
    "argument with spaces",
    "unicøde-参数",
    "quote\"single'",
    "meta&|<>^()%!",
  ];
  const env = buildMinimalTestEnvironment(null, {
    FAKE_CODEX_SCENARIO: scenarioPath,
    FAKE_CODEX_CAPTURE: capturePath,
    FAKE_CODEX_READY: readyPath,
    FAKE_CODEX_RELEASE: releasePath,
    FAKE_CODEX_GRANDCHILD_CAPTURE: grandchildCapturePath,
    FAKE_CODEX_GRANDCHILD_READY: grandchildReadyPath,
    FAKE_CODEX_GRANDCHILD_RELEASE: releasePath,
    LUNA_TEST_SENTINEL: "safe-value",
    FAKE_CODEX_SECRET_SENTINEL: "must-not-be-captured",
  });

  const run = cleanup.trackRun(launch(process.execPath, [fakeCodexPath, ...argv], { cwd, env, stdin: input }));
  cleanup.trackRelease(releasePath);
  await waitForFile(readyPath);
  const capture = JSON.parse(await readFile(capturePath, "utf8"));
  const grandchild = JSON.parse(await readFile(grandchildCapturePath, "utf8"));
  cleanup.trackPid(grandchild.pid);

  assert.deepEqual(capture.argv, argv);
  assert.equal(capture.stdinBase64, Buffer.from(input).toString("base64"));
  assert.equal(capture.cwd, cwd);
  assert.equal(capture.env.LUNA_TEST_SENTINEL, "safe-value");
  assert.equal(Object.hasOwn(capture.env, "FAKE_CODEX_SECRET_SENTINEL"), false);
  assert.equal(capture.forbiddenEnvPresent, true);
  assert.equal(capture.pid, run.child.pid);
  assert.equal(capture.parentPid > 0, true);
  assert.equal(capture.grandchildPid, grandchild.pid);
  assert.equal(grandchild.parentPid, capture.pid);
  assert.equal(grandchild.cwd, cwd);
  assert.deepEqual(capture.stdoutChunks, scenario.stdoutChunks.map((chunk) => Buffer.from(chunk.base64, "base64").toString("base64")));
  assert.deepEqual(capture.stderrChunks, [
    Buffer.from("stderr α\r\n").toString("base64"),
    Buffer.from("00c328", "hex").toString("base64"),
  ]);
  assert.equal(isAlive(run.child.pid), true);
  assert.equal(isAlive(grandchild.pid), true);

  await writeFile(releasePath, "release\n", "utf8");
  const result = await run.closed;
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.deepEqual(result.stdout, Buffer.concat(scenario.stdoutChunks.map((chunk) => Buffer.from(chunk.base64, "base64"))));
  assert.deepEqual(result.stderr, Buffer.concat([Buffer.from("stderr α\r\n"), Buffer.from("00c328", "hex")]));
  await waitForProcessGone(run.child.pid);
  await waitForProcessGone(grandchild.pid);
});

test("fake Codex reports a scripted nonzero exit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna-sidecar-harness-"));
  const cleanup = registerCleanup(t, root);
  const { run, result } = await runScenario(cleanup, root, "nonzero", {
    stderrChunks: ["failed\n"],
    exitCode: 7,
  });

  assert.equal(result.code, 7);
  assert.equal(result.signal, null);
  assert.deepEqual(result.stderr, Buffer.from("failed\n"));
  await waitForProcessGone(run.child.pid);
});

test("fake Codex terminates itself with platform-native signal semantics", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna-sidecar-harness-"));
  const cleanup = registerCleanup(t, root);
  const { run, result } = await runScenario(cleanup, root, "signal", { signal: "SIGTERM" });

  if (process.platform === "win32") {
    assert.equal(result.signal, null);
    assert.notEqual(result.code, 0);
  } else {
    assert.equal(result.signal, "SIGTERM");
    assert.equal(result.code, null);
  }
  await waitForProcessGone(run.child.pid);
});

test("fake Codex emits one JSONL record across byte and UTF-8 chunk boundaries", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna-sidecar-harness-"));
  const cleanup = registerCleanup(t, root);
  const jsonl = Buffer.from('{"type":"item.completed","item":{"type":"agent_message","text":"café"}}\r\n');
  const multibyteStart = jsonl.indexOf(Buffer.from("é"));
  const chunks = [
    jsonl.subarray(0, multibyteStart + 1),
    jsonl.subarray(multibyteStart + 1, jsonl.length - 1),
    jsonl.subarray(jsonl.length - 1),
  ];
  const { run, result } = await runScenario(cleanup, root, "partial-jsonl", {
    suppressDefaultReadiness: true,
    stdoutChunks: chunks.map((chunk) => ({ base64: chunk.toString("base64") })),
    exitCode: 0,
  });

  assert.deepEqual(result.stdout, jsonl);
  assert.equal(result.code, 0);
  await waitForProcessGone(run.child.pid);
});

test("fake Codex fixture supports deterministic process-tree cancellation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna-sidecar-harness-"));
  const cleanup = registerCleanup(t, root);
  const scenarioPath = join(root, "cancel.scenario.json");
  const capturePath = join(root, "cancel.capture.json");
  const readyPath = join(root, "cancel.ready");
  const releasePath = join(root, "cancel.release");
  const grandchildCapturePath = join(root, "cancel.grandchild.json");
  const grandchildReadyPath = join(root, "cancel.grandchild.ready");
  await writeFile(scenarioPath, JSON.stringify({ linger: true, grandchild: { linger: true } }), "utf8");

  const run = cleanup.trackRun(launch(process.execPath, [fakeCodexPath], {
    cwd: root,
    env: buildMinimalTestEnvironment(null, {
      FAKE_CODEX_SCENARIO: scenarioPath,
      FAKE_CODEX_CAPTURE: capturePath,
      FAKE_CODEX_READY: readyPath,
      FAKE_CODEX_RELEASE: releasePath,
      FAKE_CODEX_GRANDCHILD_CAPTURE: grandchildCapturePath,
      FAKE_CODEX_GRANDCHILD_READY: grandchildReadyPath,
      FAKE_CODEX_GRANDCHILD_RELEASE: releasePath,
    }),
  }));
  cleanup.trackRelease(releasePath);
  await waitForFile(readyPath);
  const capture = JSON.parse(await readFile(capturePath, "utf8"));
  cleanup.trackPid(capture.grandchildPid);
  assert.equal(isAlive(run.child.pid), true);
  assert.equal(isAlive(capture.grandchildPid), true);

  await terminateSpawnedChild(run.child);
  const result = await run.closed;
  assert.equal(result.code !== 0 || result.signal !== null, true);
  await waitForProcessGone(run.child.pid);
  await waitForProcessGone(capture.grandchildPid);
});

test("real launcher transports exact prompt and output bytes through the PATH shim with provider cwd fidelity", async (t) => {
  const harness = await createCliHarness(t);
  const previousSecret = process.env.FAKE_CODEX_SECRET_SENTINEL;
  process.env.FAKE_CODEX_SECRET_SENTINEL = "host-secret-must-not-cross";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.FAKE_CODEX_SECRET_SENTINEL;
    else process.env.FAKE_CODEX_SECRET_SENTINEL = previousSecret;
  });
  const callerCwd = join(harness.root, "caller cwd ^ shell chars", "áéí");
  await mkdir(callerCwd, { recursive: true });
  const prompt = "first line\r\nquotes: \" ' `\r\nmeta: & | < > ^ % !\r\n最後の行";
  const result = await harness.invoke(
    ["start", "--effort", "high", "--sandbox", "workspace-write", "--cwd", harness.requestedCwd, "--", prompt],
    {
      cwd: callerCwd,
      scenario: {
        stdoutChunks: ["raw stdout α\r\n", { hex: "00ff" }],
        stderrChunks: ["raw stderr β\n", { hex: "c328" }],
        linger: true,
        exitCode: 7,
      },
    },
  );

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  const receipt = result.json();
  await harness.release(result);
  const done = await harness.invoke(["wait", receipt.workerId]);
  assert.equal(done.json().state, "failed");
  assert.equal(done.json().exitCode, 7);
  assert.deepEqual(await readFile(done.json().logs.stdoutPath), Buffer.concat([Buffer.from("{\"type\":\"thread.started\",\"thread_id\":\"fixture-thread\"}\n"), Buffer.from("raw stdout α\r\n"), Buffer.from("00ff", "hex")]));
  assert.deepEqual(await readFile(done.json().logs.stderrPath), Buffer.concat([Buffer.from("raw stderr β\n"), Buffer.from("c328", "hex")]));

  const capture = await harness.readCapture(result);
  assert.deepEqual(capture.argv, [
    "exec",
    "--json",
    "--model",
    "gpt-5.6-luna",
    "-c",
    "model_reasoning_effort=high",
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
    "-C",
    harness.requestedCwd,
    "-",
  ]);
  assert.equal(capture.argv.includes(prompt), false);
  assert.equal(capture.stdinBase64, Buffer.from(prompt).toString("base64"));
  assert.equal(pathKey(capture.cwd), pathKey(harness.requestedCwd));
  assert.equal(capture.env.LUNA_TEST_SENTINEL, "cli-harness-sentinel");
  assert.equal(capture.forbiddenEnvPresent, false);
  await harness.verifyCaptureProcessesGone();
});

test("real launcher manager output is parsed as exactly one JSON value", async (t) => {
  const harness = await createCliHarness(t);
  const result = await harness.invoke(["list"]);

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.deepEqual(result.json(), []);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  assert.throws(
    () => parseExactlyOneJson(Buffer.from("{}\n{}\n"), "two values"),
    /was not exactly one JSON value/,
  );
  assert.deepEqual(parseExactlyOneJson(Buffer.from(" \r\n {\"ok\":true} \n")), { ok: true });
  assert.throws(() => parseExactlyOneJson(Buffer.alloc(0)), /was empty/);
  assert.throws(
    () => parseExactlyOneJson(Buffer.from("{\"ok\":true}\ntrailing")),
    /was not exactly one JSON value/,
  );
  await harness.assertNoCapture(result);
});

test("help does not launch provider", async (t) => {
  const harness = await createCliHarness(t);
  const result = await harness.invoke(["--help"]);

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.match(result.stdout.toString("utf8"), /Commands: start, status, wait, resume, cancel, list/);
  assert.throws(() => result.json(), /was not exactly one JSON value/);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  await harness.assertNoCapture(result);
});

function pathKey(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

async function runScenario(cleanup, root, name, scenario) {
  const scenarioPath = join(root, `${name}.scenario.json`);
  const capturePath = join(root, `${name}.capture.json`);
  const readyPath = join(root, `${name}.ready`);
  await writeFile(scenarioPath, JSON.stringify(scenario), "utf8");
  const run = cleanup.trackRun(launch(process.execPath, [fakeCodexPath], {
    cwd: root,
    env: buildMinimalTestEnvironment(null, {
      FAKE_CODEX_SCENARIO: scenarioPath,
      FAKE_CODEX_CAPTURE: capturePath,
      FAKE_CODEX_READY: readyPath,
    }),
  }));
  await waitForFile(readyPath);
  return { run, result: await run.closed };
}

function launch(file, args, { cwd, env, stdin = "" }) {
  const child = spawn(file, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const unboundedClose = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const closed = watchSpawnedChild(child, unboundedClose, "direct fake Codex");
  child.stdin.end(stdin);
  return {
    child,
    get stdout() { return Buffer.concat(stdout); },
    get stderr() { return Buffer.concat(stderr); },
    closed: closed.then((result) => ({ ...result, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })),
  };
}

function registerCleanup(t, root) {
  const runs = new Set();
  const pids = new Set();
  const releasePaths = new Set();

  t.after(async () => {
    for (const releasePath of releasePaths) {
      await writeFile(releasePath, "cleanup-release\n", "utf8").catch(() => {});
    }

    for (const run of runs) {
      const closed = await settlesWithin(run.closed, 1_000);
      if (!closed) await terminateSpawnedChild(run.child);
    }

    await Promise.all([...pids, ...[...runs].map((run) => run.child.pid)].map((pid) => waitForProcessGone(pid)));

    await rm(root, { recursive: true, force: true });
  });

  return {
    trackRun(run) {
      runs.add(run);
      return run;
    },
    trackPid(pid) {
      if (pid) pids.add(pid);
      return pid;
    },
    trackRelease(releasePath) {
      releasePaths.add(releasePath);
      return releasePath;
    },
  };
}

function settlesWithin(promise, timeoutMs) {
  return Promise.race([
    promise.then(() => true, () => true),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

async function waitForFile(filePath) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await readFile(filePath);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for fixture signal: ${filePath}`);
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

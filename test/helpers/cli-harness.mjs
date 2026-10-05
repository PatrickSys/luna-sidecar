import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import fakeRegistryFixture from "../fixtures/fake-reg-query.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const fakeCodexPath = join(repositoryRoot, "test", "fixtures", "fake-codex.mjs");
const launcherPath = join(repositoryRoot, "skills", "luna-sidecar", "scripts", "luna-sidecar.mjs");
const WATCHDOG_MS = 10_000;
const FILE_WAIT_MS = 10_000;
const PROCESS_WAIT_MS = 5_000;
const TERMINATION_WAIT_MS = 3_000;
const PROCESS_QUERY_MS = PROCESS_WAIT_MS;

export async function createCliHarness(t, launcherPathOverride = launcherPath) {
  const root = await mkdtemp(join(tmpdir(), "luna-sidecar-cli-"));
  const stateRoot = join(root, "state root");
  const requestedCwd = join(root, "requested cwd & spaces %literal% !bang!", "ユニコード");
  const shimRoot = join(root, "codex shim & spaces");
  const fixtureRoot = join(root, "fixture runtime");
  const fixtureCodexPath = join(fixtureRoot, "fake-codex.mjs");
  const fixtureGrandchildPath = join(fixtureRoot, "fake-grandchild.mjs");
  const scenarios = new Set();
  const captures = new Set();
  const releasePaths = new Set();
  const startBarrierPaths = new Set();
  const ownedPids = new Set();
  const ownedIdentities = new Map();
  const runs = new Set();

  await mkdir(requestedCwd, { recursive: true });
  await mkdir(shimRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });
  await copyFile(fakeCodexPath, fixtureCodexPath);
  await copyFile(join(repositoryRoot, "test", "fixtures", "fake-grandchild.mjs"), fixtureGrandchildPath);
  await createCodexShim(shimRoot, fixtureCodexPath);

  t.after(async () => {
    for (const releasePath of releasePaths) await writeFile(releasePath, "cleanup-release\n", "utf8").catch(() => {});
    for (const barrierPath of startBarrierPaths) await writeFile(barrierPath, "cleanup-release\n", "utf8").catch(() => {});

    for (const run of runs) {
      if (!(await settlesWithin(run.closed, 1_000))) await terminateSpawnedChild(run.child);
    }

    for (const capturePath of captures) {
      const capture = await readJsonIfPresent(capturePath);
      registerCapturePids(capture, ownedPids, ownedIdentities, { fixtureCodexPath, fixtureGrandchildPath });
    }
    await collectManifestPids(stateRoot, ownedPids, ownedIdentities, { fixtureCodexPath, requestedCwd, launcherPath: launcherPathOverride });
    await Promise.all([...ownedPids].map((pid) => {
      const identities = ownedIdentities.get(pid);
      if (!identities?.length) throw new Error(`Owned fixture process ${pid} has no recorded identity`);
      return waitForProcessGone(pid, identities);
    }));

    await removeTestRoot(root);
  });

  async function invoke(args, { scenario = {}, stdin = "", cwd = root, extraEnv = {}, timeoutMs = WATCHDOG_MS, runtimeCaseId = null, expectedRegistryCalls = null, productionRuntime = false } = {}) {
    const id = `${scenarios.size + 1}`;
    const scenarioPath = join(root, `${id}.scenario.json`);
    const capturePath = join(root, `${id}.capture.json`);
    const readyPath = join(root, `${id}.ready`);
    const releasePath = join(root, `${id}.release`);
    const grandchildCapturePath = join(root, `${id}.grandchild.capture.json`);
    const grandchildReadyPath = join(root, `${id}.grandchild.ready`);
    const startBarrierPath = join(stateRoot, `${id}.start.barrier`);
    const providerStartBarrierPath = extraEnv.FAKE_CODEX_START_BARRIER ?? startBarrierPath;
    const cancelBarrierPath = extraEnv.LUNA_SIDECAR_TEST_CANCEL_BARRIER ?? null;
    const registryCapturePath = join(root, `${id}.registry.capture.json`);
    scenarios.add(scenarioPath);
    captures.add(capturePath);
    releasePaths.add(releasePath);
    startBarrierPaths.add(providerStartBarrierPath);
    if (cancelBarrierPath) releasePaths.add(`${cancelBarrierPath}.release`);
    await writeFile(scenarioPath, JSON.stringify(scenario), "utf8");
    await mkdir(stateRoot, { recursive: true });
    if (!scenario.startBarrier && !extraEnv.FAKE_CODEX_START_BARRIER) {
      await writeFile(providerStartBarrierPath, "release\n", "utf8");
    }

    const invocationLauncher = productionRuntime
      ? launcherPathOverride
      : await createInjectedManagerLauncher(root, id, launcherPathOverride, registryCapturePath, runtimeCaseId, expectedRegistryCalls);
    const child = spawn(process.execPath, [invocationLauncher, ...args], {
      cwd,
      detached: process.platform !== "win32",
      env: buildMinimalTestEnvironment(shimPathValue(shimRoot), {
        LUNA_SIDECAR_HOME: stateRoot,
        FAKE_CODEX_SCENARIO: scenarioPath,
        FAKE_CODEX_CAPTURE: capturePath,
        FAKE_CODEX_READY: readyPath,
        FAKE_CODEX_RELEASE: releasePath,
        FAKE_CODEX_GRANDCHILD_CAPTURE: grandchildCapturePath,
        FAKE_CODEX_GRANDCHILD_READY: grandchildReadyPath,
        FAKE_CODEX_GRANDCHILD_RELEASE: releasePath,
        LUNA_TEST_SENTINEL: "cli-harness-sentinel",
        ...extraEnv,
        FAKE_CODEX_START_BARRIER: providerStartBarrierPath,
      }),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    const startedAt = Date.now();
    const closed = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    const run = {
      child,
      closed: watchSpawnedChild(child, closed, args[0] ?? "default-run", timeoutMs),
    };
    runs.add(run);
    child.stdin.end(stdin);
    const result = await run.closed;
    return {
      ...result,
      args,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
      durationMs: Date.now() - startedAt,
      scenarioPath,
      capturePath,
      readyPath,
      releasePath,
      grandchildCapturePath,
      grandchildReadyPath,
      startBarrierPath,
      cancelBarrierPath,
      registryCapturePath,
      json() {
        return parseExactlyOneJson(this.stdout, `manager stdout for ${args[0] ?? "run"}`);
      },
    };
  }

  async function readCapture(result) {
    const capture = JSON.parse(await readFile(result.capturePath, "utf8"));
    registerCapturePids(capture, ownedPids, ownedIdentities, { fixtureCodexPath, fixtureGrandchildPath });
    return capture;
  }

  async function waitForCapture(result) {
    await waitForFile(result.readyPath);
    return readCapture(result);
  }

  async function verifyCaptureProcessesGone() {
    await Promise.all([...ownedPids].map((pid) => {
      const identities = ownedIdentities.get(pid);
      return identities?.length ? waitForProcessGone(pid, identities) : waitForProcessGone(pid);
    }));
  }

  function observePid(pid, expectedIdentity = null) {
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("An observed PID must be a positive safe integer");
    rememberOwnedPid(ownedPids, ownedIdentities, pid, expectedIdentity);
    return pid;
  }

  async function release(result) {
    await writeFile(result.releasePath, "release\n", "utf8");
  }

  async function releaseStart(result) {
    await writeFile(result.startBarrierPath, "release\n", "utf8");
  }

  async function assertNoCapture(result) {
    await assertFileAbsent(result.capturePath);
  }

  async function readRegistryCapture(result) {
    return JSON.parse(await readFile(result.registryCapturePath, "utf8"));
  }

  async function assertNoWorkerArtifacts() {
    for (const directory of ["workers", "prompts", "logs", "requests"]) {
      const path = join(stateRoot, directory);
      try { assert.deepEqual(await readdir(path), [], `Unexpected ${directory} artifacts`); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }

  return {
    root,
    stateRoot,
    requestedCwd,
    shimRoot,
    invoke,
    readCapture,
    waitForCapture,
    verifyCaptureProcessesGone,
    observePid,
    release,
    releaseStart,
    assertNoCapture,
    readRegistryCapture,
    assertNoWorkerArtifacts,
  };
}

export function createInjectedRegistryRuntime(caseId) {
  const fixtureCase = fakeRegistryFixture.cases.find((candidate) => candidate.id === caseId);
  assert.ok(fixtureCase, `Unknown registry fixture case: ${caseId}`);
  let cursor = 0;
  const calls = [];
  const executeRegistryQuery = async (request) => {
    const expectedStep = fixtureCase.steps[cursor];
    assert.ok(expectedStep, `Unexpected extra registry query for ${caseId}`);
    const observed = {
      executable: request.executable,
      args: request.args,
      shell: request.options?.shell,
      windowsHide: request.options?.windowsHide,
      deadlineMs: request.deadlineMs,
      streamCapBytes: request.streamCapBytes,
    };
    assert.deepEqual(observed, expectedStep.expect, `Registry invocation mismatch at step ${cursor} for ${caseId}`);
    calls.push({ hive: expectedStep.hive, ...observed });
    cursor += 1;
    const result = expectedStep.result;
    return {
      spawned: result.spawned,
      spawnError: result.spawnError,
      timedOut: result.timedOut,
      killAttempted: result.killAttempted,
      closed: result.closed,
      exitCode: result.exitCode,
      signal: result.signal,
      stdoutBytes: Buffer.from(result.stdoutBase64, "base64"),
      stderrBytes: Buffer.from(result.stderrBase64, "base64"),
      stdoutTruncated: result.stdoutTruncated,
      stderrTruncated: result.stderrTruncated,
      elapsedMs: result.elapsedMs,
    };
  };
  return {
    runtime: Object.freeze({
      platform: fixtureCase.injectedPlatform,
      systemRoot: fixtureCase.injectedSystemRoot,
      executeRegistryQuery,
    }),
    calls,
    assertConsumed(expectedCallCount = null) {
      const expected = expectedCallCount === null ? fixtureCase.steps.length : expectedCallCount;
      assert.equal(cursor, expected, `Registry query count mismatch for ${caseId}`);
    },
  };
}

export function createNoQueryRuntime() {
  const calls = [];
  return {
    runtime: Object.freeze({
      platform: "linux",
      systemRoot: "C:\\Windows",
      executeRegistryQuery: async (request) => { calls.push(request); throw new Error("Non-Windows manager attempted a registry query"); },
    }),
    calls,
    assertConsumed() { assert.deepEqual(calls, [], "Non-Windows manager attempted a registry query"); },
  };
}

async function createInjectedManagerLauncher(root, id, targetLauncher, registryCapturePath, runtimeCaseId, expectedRegistryCalls) {
  const wrapperPath = join(root, `${id}.private-manager.mjs`);
  const helperUrl = pathToFileURL(fileURLToPath(import.meta.url)).href;
  const launcherUrl = pathToFileURL(targetLauncher).href;
  const body = [
    `import { writeFile } from ${JSON.stringify("node:fs/promises")};`,
    `import { createInjectedRegistryRuntime, createNoQueryRuntime } from ${JSON.stringify(helperUrl)};`,
    `const target = await import(${JSON.stringify(launcherUrl)});`,
    `const injected = ${runtimeCaseId === null ? "createNoQueryRuntime()" : `createInjectedRegistryRuntime(${JSON.stringify(runtimeCaseId)})`};`,
    `if (typeof target.__testOnlyRunManager !== "function") {`,
    `  process.stdout.write(JSON.stringify({schemaVersion:2,ok:false,command:"start",workerId:null,error:{code:"test_seam_missing",message:"Private manager test seam is missing"}}) + "\\n");`,
    `  process.exitCode = 1;`,
    `} else {`,
    `  await target.__testOnlyRunManager(injected.runtime);`,
    `  injected.assertConsumed(${JSON.stringify(expectedRegistryCalls)});`,
    `  await writeFile(${JSON.stringify(registryCapturePath)}, JSON.stringify(injected.calls), "utf8");`,
    `}`,
    "",
  ].join("\n");
  await writeFile(wrapperPath, body, "utf8");
  return wrapperPath;
}

export function parseExactlyOneJson(buffer, label = "JSON output") {
  const bytes = Buffer.from(buffer);
  const text = bytes.toString("utf8");
  assert.notEqual(text.trim(), "", `${label} was empty`);
  try {
    return JSON.parse(text);
  } catch (error) {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    throw new Error(`${label} was not exactly one JSON value (${bytes.length} bytes, sha256=${sha256}): ${error.message}`);
  }
}

export function buildMinimalTestEnvironment(pathValue = null, explicit = {}) {
  const environment = {};
  for (const key of ["ComSpec", "SystemRoot", "WINDIR", "PATHEXT", "TEMP", "TMP", "TMPDIR"]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  if (pathValue !== null) environment.PATH = pathValue;
  return { ...environment, ...explicit };
}

async function createCodexShim(shimRoot, fixturePath = fakeCodexPath) {
  if (process.platform === "win32") {
    await writeFile(
      join(shimRoot, "codex.cmd"),
      `@echo off\r\n"${process.execPath}" "${fixturePath}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
      "utf8",
    );
    return;
  }

  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const shimPath = join(shimRoot, "codex");
  await writeFile(shimPath, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixturePath)} "$@"\n`, "utf8");
  await chmod(shimPath, 0o755);
}

export function watchSpawnedChild(child, promise, label, timeoutMs = WATCHDOG_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(async () => {
      try {
        await terminateSpawnedChild(child);
        reject(new Error(`Watchdog timed out after ${timeoutMs} ms: ${label}`));
      } catch (error) {
        reject(new Error(`Watchdog timed out after ${timeoutMs} ms and cleanup failed for ${label}: ${error.message}`));
      }
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertFileAbsent(filePath) {
  try {
    await readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Provider capture unexpectedly exists: ${filePath}`);
}

async function waitForFile(filePath) {
  const deadline = Date.now() + FILE_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      await readFile(filePath);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await delay(10);
    }
  }
  throw new Error(`Timed out waiting for fixture file: ${filePath}`);
}

export async function waitForProcessGone(pid, expectedIdentities = null, { inspect = inspectProcessIdentity, waitMs = PROCESS_WAIT_MS } = {}) {
  if (!pid) return;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await delay(10);
  }
  if (expectedIdentities) {
    const expected = Array.isArray(expectedIdentities) ? expectedIdentities : [expectedIdentities];
    if (expected.length === 0 || expected.some((candidate) => !candidate || !Array.isArray(candidate.commandTokens) || candidate.commandTokens.length === 0 || candidate.commandTokens.some((token) => typeof token !== "string" || token.length === 0))) {
      throw new Error(`Owned fixture process ${pid} identity was unavailable during cleanup`);
    }
    if (expected.some((candidate) => Number(candidate.pid) !== Number(pid))) {
      throw new Error(`Owned fixture process ${pid} identity was unavailable during cleanup`);
    }
    let actual;
    try {
      actual = await inspect(pid);
    } catch (error) {
      throw new Error(`Owned fixture process ${pid} identity query failed: ${error.message}`);
    }
    if (Number(actual?.pid) !== Number(pid)) {
      throw new Error(`Owned fixture process ${pid} identity was uncertain during cleanup`);
    }
    if (actual?.uncertain === true) {
      throw new Error(`Owned fixture process ${pid} identity was uncertain during cleanup`);
    }
    if (actual?.exists === false) return;
    if (actual?.exists !== true) {
      throw new Error(`Owned fixture process ${pid} identity was uncertain during cleanup`);
    }
    if (typeof actual.commandLine !== "string" || actual.commandLine.trim() === "") {
      throw new Error(`Owned fixture process ${pid} identity was uncertain during cleanup`);
    }
    if (!expected.some((candidate) => ownedProcessIdentityMatches(actual, candidate))) return;
  }
  throw new Error(`Owned fixture process ${pid} survived cleanup`);
}

function settlesWithin(promise, timeoutMs) {
  return Promise.race([
    promise.then(() => true, () => true),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

export async function terminateSpawnedChild(child) {
  const pid = child?.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    const result = await waitForChildClose(killer, TERMINATION_WAIT_MS, "taskkill");
    if (result.code !== 0 && isAlive(pid)) throw new Error(`taskkill exited ${result.code} for spawn-owned PID ${pid}`);
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  await waitForProcessGone(pid);
}

export async function terminateOwnedPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("An owned PID is required");
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    const result = await waitForChildClose(killer, TERMINATION_WAIT_MS, "taskkill owned pid");
    if (result.code !== 0 && isAlive(pid)) throw new Error(`taskkill exited ${result.code} for owned PID ${pid}`);
  } else {
    try { process.kill(pid, "SIGKILL"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  await waitForProcessGone(pid);
}

function waitForChildClose(child, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${label} did not exit within ${timeoutMs} ms`));
    }, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function shimPathValue(shimRoot) {
  if (process.platform !== "win32") return shimRoot;
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  const system32 = systemRoot ? join(systemRoot, "System32") : dirname(process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe");
  return `${shimRoot};${system32}`;
}

function registerCapturePids(capture, target, identities, { fixtureCodexPath, fixtureGrandchildPath }) {
  rememberOwnedPid(target, identities, capture?.pid, {
    role: "providerPid",
    commandTokens: [fixtureCodexPath],
    expectedCwd: capture?.cwd,
  });
  for (const pid of [capture?.grandchildPid, capture?.grandchild?.pid]) {
    rememberOwnedPid(target, identities, pid, {
      role: "grandchildPid",
      commandTokens: [fixtureGrandchildPath],
      expectedCwd: capture?.grandchild?.cwd ?? capture?.cwd,
    });
  }
}

async function collectManifestPids(stateRoot, target, identities, { fixtureCodexPath, requestedCwd, launcherPath }) {
  const workersRoot = join(stateRoot, "workers");
  let files;
  try {
    files = await readdir(workersRoot);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const file of files.filter((value) => value.endsWith(".json"))) {
    const worker = await readJsonIfPresent(join(workersRoot, file));
    const latestTurn = worker?.turns?.at?.(-1) ?? worker?.turns?.[worker.turns.length - 1];
    const expectedCwd = latestTurn?.cwd ?? requestedCwd;
    rememberOwnedPid(target, identities, worker?.pid, expectedRunnerIdentity(worker?.pid, worker?.workerId, expectedCwd, launcherPath));
    rememberOwnedPid(target, identities, worker?.runnerPid, expectedRunnerIdentity(worker?.runnerPid, worker?.workerId, expectedCwd, launcherPath));
    rememberOwnedPid(target, identities, worker?.providerPid, expectedProviderIdentity(worker?.providerPid, expectedCwd, fixtureCodexPath));
  }
}

export function expectedProviderIdentity(pid, expectedCwd, fixtureCodexPath) {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  const comSpec = process.env.ComSpec ?? join(systemRoot, "System32", "cmd.exe");
  const commandTokens = process.platform === "win32"
    ? [comSpec, "codex", "-C", expectedCwd]
    : [fixtureCodexPath];
  return { pid, role: "providerPid", commandTokens, expectedCwd };
}

export function expectedRunnerIdentity(pid, workerId, expectedCwd, runnerLauncherPath = launcherPath) {
  return {
    pid,
    role: "runnerPid",
    commandTokens: [runnerLauncherPath, "_worker", ...(workerId ? [workerId] : [])],
    expectedCwd,
  };
}

function rememberOwnedPid(target, identities, pid, expectedIdentity = null) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  target.add(pid);
  if (!expectedIdentity || !Array.isArray(expectedIdentity.commandTokens) || expectedIdentity.commandTokens.length === 0 || expectedIdentity.commandTokens.some((token) => typeof token !== "string" || token.length === 0)) return;
  const candidate = { ...expectedIdentity, pid };
  const previous = identities.get(pid) ?? [];
  const key = JSON.stringify(candidate);
  if (!previous.some((entry) => JSON.stringify(entry) === key)) identities.set(pid, [...previous, candidate]);
}

export function ownedProcessIdentityMatches(actual, expected) {
  if (actual?.exists !== true || actual?.uncertain === true || typeof actual.commandLine !== "string" || Number(actual.pid) !== Number(expected?.pid)) return false;
  if (!Array.isArray(expected?.commandTokens) || expected.commandTokens.length === 0 || expected.commandTokens.some((token) => typeof token !== "string" || token.length === 0)) return false;
  return expected.commandTokens.every((token) => commandLineHasExactToken(actual, token));
}

function commandLineHasExactToken(actual, token) {
  if (Array.isArray(actual.argv)) return actual.argv.some((value) => value === token);
  const expected = String(token).replaceAll("/", "\\").toLowerCase();
  const commandLine = actual.commandLine.replaceAll("/", "\\").toLowerCase();
  const tokens = commandLine.match(/"[^"]*"|\S+/g)?.map((value) => value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value) ?? [];
  return tokens.includes(expected);
}

export async function inspectProcessIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("A positive process ID is required");
  if (process.platform !== "win32") {
    try {
      const cwd = await realpath(`/proc/${pid}/cwd`);
      const argv = (await readFile(`/proc/${pid}/cmdline`)).toString("utf8").split("\0").filter(Boolean);
      return { exists: true, uncertain: false, pid, cwd, argv, commandLine: argv.join(" ") };
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ESRCH") return { exists: false, pid };
      return { exists: true, uncertain: true, pid };
    }
  }
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw new Error("SystemRoot is unavailable for process identity query");
  const powershell = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = "$ErrorActionPreference = 'Stop'; $p = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = ' + [int]$env:LUNA_HARNESS_PID); if ($null -eq $p) { [Console]::Out.WriteLine('null'); exit 0 }; $o = [pscustomobject]@{ ProcessId = [int]$p.ProcessId; ExecutablePath = $p.ExecutablePath; CommandLineBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$p.CommandLine)) }; $o | ConvertTo-Json -Compress";
  const result = await runProcessQuery(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], pid);
  if (result.stdout.trim() === "null") return { exists: false, pid };
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`invalid process identity response: ${error.message}`); }
  if (!parsed || Array.isArray(parsed) || Number(parsed.ProcessId) !== pid || typeof parsed.CommandLineBase64 !== "string") {
    throw new Error("incomplete process identity response");
  }
  let commandLine;
  try { commandLine = Buffer.from(parsed.CommandLineBase64, "base64").toString("utf8"); }
  catch (error) { throw new Error(`invalid process command line response: ${error.message}`); }
  if (!commandLine) throw new Error("empty process command line response");
  return { exists: true, uncertain: false, pid, executablePath: parsed.ExecutablePath ?? null, commandLine };
}

async function runProcessQuery(executable, args, pid) {
  const child = spawn(executable, args, {
    env: buildMinimalTestEnvironment(null, { LUNA_HARNESS_PID: String(pid) }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`process identity query exceeded ${PROCESS_QUERY_MS} ms`));
    }, PROCESS_QUERY_MS);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 || signal) reject(new Error(`process identity query exited ${code ?? "null"}`));
      else resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function removeTestRoot(root) {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

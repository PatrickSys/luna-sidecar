import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const fakeCodexPath = join(repositoryRoot, "test", "fixtures", "fake-codex.mjs");
const launcherPath = join(repositoryRoot, "skills", "luna-sidecar", "scripts", "luna-sidecar.mjs");
const WATCHDOG_MS = 10_000;
const FILE_WAIT_MS = 10_000;
const PROCESS_WAIT_MS = 5_000;
const TERMINATION_WAIT_MS = 3_000;
const knownProcessIdentities = new Map();
const fixtureCommandTokens = [fakeCodexPath, join(repositoryRoot, "test", "fixtures", "fake-grandchild.mjs"), launcherPath];

export async function createCliHarness(t, launcherPathOverride = launcherPath) {
  const root = await mkdtemp(join(tmpdir(), "luna-sidecar-cli-"));
  const stateRoot = join(root, "state root");
  const requestedCwd = join(root, "requested cwd & spaces %literal% !bang!", "ユニコード");
  const shimRoot = join(root, "codex shim & spaces");
  const scenarios = new Set();
  const captures = new Set();
  const releasePaths = new Set();
  const startBarrierPaths = new Set();
  const ownedPids = new Set();
  const runs = new Set();

  await mkdir(requestedCwd, { recursive: true });
  await mkdir(shimRoot, { recursive: true });
  await createCodexShim(shimRoot);

  t.after(async () => {
    for (const releasePath of releasePaths) await writeFile(releasePath, "cleanup-release\n", "utf8").catch(() => {});
    for (const barrierPath of startBarrierPaths) await writeFile(barrierPath, "cleanup-release\n", "utf8").catch(() => {});

    for (const run of runs) {
      if (!(await settlesWithin(run.closed, 1_000))) await terminateSpawnedChild(run.child);
      await waitForProcessGone(run.child.pid);
    }

    for (const capturePath of captures) {
      const capture = await readJsonIfPresent(capturePath);
      registerCapturePids(capture, ownedPids);
    }
    await collectManifestPids(stateRoot, ownedPids);
    await Promise.all([...ownedPids].map((pid) => waitForProcessGone(pid)));

    await removeTestRoot(root);
  });

  async function invoke(args, { scenario = {}, stdin = "", cwd = root, extraEnv = {}, timeoutMs = WATCHDOG_MS } = {}) {
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

    const child = spawn(process.execPath, [launcherPathOverride, ...args], {
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
    rememberReceiptIdentity(result.stdout, launcherPathOverride);
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
      json() {
        return parseExactlyOneJson(this.stdout, `manager stdout for ${args[0] ?? "run"}`);
      },
    };
  }

  async function readCapture(result) {
    const capture = JSON.parse(await readFile(result.capturePath, "utf8"));
    registerCapturePids(capture, ownedPids);
    return capture;
  }

  async function waitForCapture(result) {
    await waitForFile(result.readyPath);
    return readCapture(result);
  }

  async function verifyCaptureProcessesGone() {
    await Promise.all([...ownedPids].map((pid) => waitForProcessGone(pid)));
  }

  function observePid(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("An observed PID must be a positive safe integer");
    rememberOwnedPid(ownedPids, pid, "luna-sidecar.mjs");
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
  };
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

async function createCodexShim(shimRoot) {
  if (process.platform === "win32") {
    await writeFile(
      join(shimRoot, "codex.cmd"),
      `@echo off\r\n"${process.execPath}" "${fakeCodexPath}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
      "utf8",
    );
    return;
  }

  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const shimPath = join(shimRoot, "codex");
  await writeFile(shimPath, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fakeCodexPath)} "$@"\n`, "utf8");
  await chmod(shimPath, 0o755);
}

export function watchSpawnedChild(child, promise, label, timeoutMs = WATCHDOG_MS) {
  rememberSpawnedChildIdentity(child);
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

export async function waitForProcessGone(pid) {
  if (!pid) return;
  const deadline = Date.now() + PROCESS_WAIT_MS;
  const expected = knownProcessIdentities.get(pid) ?? { commandTokens: fixtureCommandTokens };
  let nextIdentityCheck = 0;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    if (expected && process.platform === "win32" && Date.now() >= nextIdentityCheck) {
      const actual = await inspectWindowsProcess(pid);
      if (!actual.exists) return;
      if (actual.uncertain) throw new Error(`Owned fixture process ${pid} identity could not be verified`);
      if (!matchesExpectedProcessIdentity(actual, expected, { anyCommandToken: !knownProcessIdentities.has(pid) })) return;
      nextIdentityCheck = Date.now() + 100;
    }
    await delay(10);
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
  rememberSpawnedChildIdentity(child);
  if (process.platform === "win32") {
    const ownership = await verifyExpectedProcess(pid);
    if (ownership === "gone") return;
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

export async function terminateOwnedPid(pid, expected = null) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("An owned PID is required");
  if (typeof expected?.workerId === "string") {
    rememberProcessIdentity(pid, { commandTokens: [launcherPath, "_worker", expected.workerId] });
  }
  if (process.platform === "win32") {
    const ownership = await verifyExpectedProcess(pid);
    if (ownership === "gone") return;
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

function registerCapturePids(capture, target) {
  const providerExpected = {
    commandTokens: [fakeCodexPath, ...(Array.isArray(capture?.argv) ? capture.argv : [])],
    ...(Number.isSafeInteger(capture?.parentPid) && capture.parentPid > 0 ? { parentPid: capture.parentPid } : {}),
  };
  rememberOwnedPid(target, capture?.pid, providerExpected);
  rememberOwnedPid(target, capture?.grandchildPid, {
    commandTokens: [join(repositoryRoot, "test", "fixtures", "fake-grandchild.mjs")],
    ...(Number.isSafeInteger(capture?.pid) && capture.pid > 0 ? { parentPid: capture.pid } : {}),
  });
  rememberOwnedPid(target, capture?.grandchild?.pid, {
    commandTokens: [join(repositoryRoot, "test", "fixtures", "fake-grandchild.mjs")],
    ...(Number.isSafeInteger(capture?.pid) && capture.pid > 0 ? { parentPid: capture.pid } : {}),
  });
}

function rememberSpawnedChildIdentity(child) {
  const pid = child?.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const args = Array.isArray(child.spawnargs) ? child.spawnargs : [];
  const scriptIndex = args.findIndex((value) => typeof value === "string" && /(?:^|[\\/])[^\\/]+\.mjs$/i.test(value));
  const script = scriptIndex >= 0 ? args[scriptIndex] : basename(child.spawnfile ?? process.execPath);
  rememberProcessIdentity(pid, { commandTokens: [script, ...args.slice(scriptIndex + 1)] });
}

async function verifyExpectedProcess(pid) {
  const expected = knownProcessIdentities.get(pid);
  if (process.platform !== "win32") return "owned";
  if (!expected) throw new Error(`Owned fixture process ${pid} identity is unavailable`);
  const actual = await inspectWindowsProcess(pid);
  if (!actual.exists) return "gone";
  if (actual.uncertain) throw new Error(`Owned fixture process ${pid} identity could not be verified`);
  if (!matchesExpectedProcessIdentity(actual, expected)) return "gone";
  return "owned";
}

async function collectManifestPids(stateRoot, target) {
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
    const runnerExpected = typeof worker?.workerId === "string"
      ? { commandTokens: [launcherPath, "_worker", worker.workerId] }
      : null;
    rememberOwnedPid(target, worker?.pid, runnerExpected);
    rememberOwnedPid(target, worker?.runnerPid, runnerExpected);
    rememberOwnedPid(target, worker?.providerPid, {
      commandTokens: ["codex"],
      ...(Number.isSafeInteger(worker?.runnerPid) && worker.runnerPid > 0 ? { parentPid: worker.runnerPid } : {}),
    });
  }
}

function rememberOwnedPid(target, pid, expected) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  target.add(pid);
  if (expected) rememberProcessIdentity(pid, expected);
}

function rememberProcessIdentity(pid, expected) {
  if (Number.isSafeInteger(pid) && pid > 0 && Array.isArray(expected?.commandTokens) && expected.commandTokens.every((token) => typeof token === "string" && token.length > 0)) {
    knownProcessIdentities.set(pid, { commandTokens: expected.commandTokens, ...(expected.parentPid ? { parentPid: expected.parentPid } : {}) });
  }
}

export function matchesExpectedProcessIdentity(actual, expected, { anyCommandToken = false } = {}) {
  if (actual?.exists !== true || actual.uncertain === true || typeof actual.commandLine !== "string") return false;
  const commandLine = normalizeCommandText(actual.commandLine);
  const tokens = (expected?.commandTokens ?? []).map(normalizeCommandText).filter(Boolean);
  const commandMatch = anyCommandToken ? tokens.some((token) => commandLine.includes(token)) : tokens.length > 0 && tokens.every((token) => commandLine.includes(token));
  return commandMatch && (expected.parentPid === undefined || Number(actual.parentPid) === Number(expected.parentPid));
}

function normalizeCommandText(value) {
  return String(value).replaceAll("/", "\\").toLowerCase();
}

function rememberReceiptIdentity(stdout, runnerPath) {
  try {
    const receipt = JSON.parse(Buffer.from(stdout).toString("utf8"));
    if (!Number.isSafeInteger(receipt?.pid) || receipt.pid <= 0 || typeof receipt.workerId !== "string") return;
    rememberProcessIdentity(receipt.pid, { commandTokens: [runnerPath, "_worker", receipt.workerId] });
  } catch {}
}

function inspectWindowsProcess(pid) {
  return new Promise((resolve) => {
    const query = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -eq $p) { Write-Output '{"exists":false}' } else { $p | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress }`;
    let stdout = "";
    let settled = false;
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", query], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ exists: true, uncertain: true });
    }, TERMINATION_WAIT_MS);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.once("error", () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ exists: true, uncertain: true }); }
    });
    child.once("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed?.exists === false) resolve({ exists: false });
        else resolve({
          exists: true,
          uncertain: typeof parsed?.CommandLine !== "string",
          commandLine: parsed?.CommandLine ?? "",
          parentPid: Number(parsed?.ParentProcessId),
        });
      } catch {
        resolve({ exists: true, uncertain: true });
      }
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

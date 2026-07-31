#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const model = "gpt-5.6-luna";
const efforts = new Set(["low", "medium", "high", "xhigh", "max"]);
const commands = new Set(["start", "status", "wait", "resume", "cancel", "list", "run", "_worker"]);
const rawArgs = process.argv.slice(2);
const command = commands.has(rawArgs[0]) ? rawArgs.shift() : "run";
const stateRoot = process.env.LUNA_SIDECAR_HOME ?? defaultStateRoot();
const workersRoot = join(stateRoot, "workers");
const logsRoot = join(stateRoot, "logs");

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

async function main() {
  if (command === "run") return runForeground(parseTask(rawArgs));
  if (command === "start") return startWorker(parseTask(rawArgs));
  if (command === "status") return showStatus(requireWorkerId(rawArgs));
  if (command === "wait") return waitForWorker(requireWorkerId(rawArgs), parseWait(rawArgs.slice(1)));
  if (command === "resume") return resumeWorker(requireWorkerId(rawArgs), parseTask(rawArgs.slice(1)));
  if (command === "cancel") return cancelWorker(requireWorkerId(rawArgs));
  if (command === "list") return listWorkers();
  if (command === "_worker") return runWorker(requireWorkerId(rawArgs));
}

function defaultStateRoot() {
  if (platform() === "win32") return join(process.env.LOCALAPPDATA ?? homedir(), "luna-sidecar");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "luna-sidecar");
  return join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "luna-sidecar");
}

function parseTask(args) {
  const task = { effort: null, sandbox: null, bypass: null, cwd: null, prompt: "" };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      task.prompt = args.slice(index + 1).join(" ");
      break;
    }
    if (arg === "--effort") {
      task.effort = args[++index] ?? "";
      continue;
    }
    if (arg === "--read-only") {
      task.sandbox = "read-only";
      continue;
    }
    if (arg === "--bypass") {
      task.bypass = true;
      continue;
    }
    if (arg === "--cwd") {
      const value = args[++index];
      if (!value) fail("--cwd needs a folder");
      task.cwd = resolve(value);
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  if (task.effort !== null && !efforts.has(task.effort)) fail(`--effort must be one of: ${[...efforts].join(", ")}`);
  if (!task.prompt.trim()) fail('Pass one task after `--`, for example: -- "Review src/auth"');
  return task;
}

function parseWait(args) {
  if (args.length === 0) return { timeoutMs: 0 };
  if (args.length === 2 && args[0] === "--timeout") {
    const timeoutMs = Number(args[1]);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) fail("--timeout must be a non-negative whole number of milliseconds");
    return { timeoutMs };
  }
  fail("Use wait <worker-id> [--timeout <milliseconds>]");
}

function requireWorkerId(args) {
  const id = args[0];
  if (!id || id.startsWith("-")) fail("A worker id is required");
  return id;
}

function resolvedTask(task, previous = {}) {
  const result = {
    effort: task.effort ?? previous.effort ?? "medium",
    sandbox: task.sandbox ?? previous.sandbox ?? "workspace-write",
    bypass: task.bypass ?? previous.bypass ?? false,
    cwd: task.cwd ?? previous.cwd ?? process.cwd(),
    prompt: task.prompt,
  };
  if (!efforts.has(result.effort)) fail(`Stored effort is not supported: ${result.effort}`);
  return result;
}

function execArgs(task, json = false) {
  return [
    "exec",
    ...(json ? ["--json"] : []),
    "--model",
    model,
    "-c",
    `model_reasoning_effort=${task.effort}`,
    ...(task.bypass ? ["--dangerously-bypass-approvals-and-sandbox"] : ["--sandbox", task.sandbox]),
    "-C",
    task.cwd,
    "-",
  ];
}

function resumeArgs(threadId, task) {
  return [
    "exec",
    "resume",
    "--json",
    "--model",
    model,
    "-c",
    `model_reasoning_effort=${task.effort}`,
    ...(task.bypass ? ["--dangerously-bypass-approvals-and-sandbox"] : []),
    threadId,
    "-",
  ];
}

function spawnCodex(args, options) {
  if (platform() === "win32") {
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "codex", ...args], options);
  }
  return spawn("codex", args, options);
}

async function runForeground(taskInput) {
  const task = resolvedTask(taskInput);
  const child = spawnCodex(execArgs(task), { stdio: ["pipe", "inherit", "inherit"] });
  child.on("error", reportLaunchError);
  child.stdin.end(task.prompt);
  const { code, signal } = await onceExit(child);
  process.exitCode = code ?? (signal ? 1 : 0);
}

async function startWorker(taskInput, parentWorkerId = null, threadId = null) {
  const task = resolvedTask(taskInput);
  await ensureState();
  const id = randomUUID();
  const stdoutPath = join(logsRoot, `${id}.jsonl`);
  const stderrPath = join(logsRoot, `${id}.stderr.log`);
  const promptPath = join(stateRoot, "prompts", `${id}.txt`);
  const record = {
    id,
    parentWorkerId,
    threadId,
    state: "starting",
    pid: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    cwd: task.cwd,
    effort: task.effort,
    sandbox: task.sandbox,
    bypass: task.bypass,
    stdoutPath,
    stderrPath,
    promptPath,
  };
  await mkdir(dirname(promptPath), { recursive: true });
  await writeFile(promptPath, task.prompt, "utf8");
  await writeWorker(record);
  const runner = spawn(process.execPath, [fileURLToPath(import.meta.url), "_worker", id], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  record.pid = runner.pid ?? null;
  record.state = "running";
  await writeWorker(record);
  runner.unref();
  print(workerView(record));
}

async function runWorker(id) {
  const worker = await readWorker(id);
  const prompt = await readFile(worker.promptPath, "utf8");
  await rm(worker.promptPath, { force: true });
  const stdout = await open(worker.stdoutPath, "a");
  const stderr = await open(worker.stderrPath, "a");
  const task = resolvedTask({ prompt }, worker);

  try {
    const child = spawnCodex(
      worker.threadId ? resumeArgs(worker.threadId, task) : execArgs(task, true),
      { stdio: ["pipe", stdout.fd, stderr.fd], windowsHide: true },
    );
    await new Promise((resolvePromise, reject) => {
      child.once("error", reject);
      child.stdin.end(prompt, resolvePromise);
    });
    await onceExit(child);
  } catch (error) {
    worker.state = "failed";
    worker.completedAt = new Date().toISOString();
    worker.error = error instanceof Error ? error.message : String(error);
    await writeWorker(worker);
  } finally {
    await stdout.close();
    await stderr.close();
  }
}

async function resumeWorker(id, taskInput) {
  const worker = await readWorker(id);
  const inspected = await inspectWorker(worker);
  if (!inspected.threadId) fail(`Worker ${id} has not recorded its Codex session id yet. Run status once it has started.`);
  return startWorker(resolvedInput(taskInput, inspected), id, inspected.threadId);
}

function resolvedInput(taskInput, worker) {
  return {
    ...taskInput,
    effort: taskInput.effort ?? worker.effort,
    sandbox: taskInput.sandbox ?? worker.sandbox,
    bypass: taskInput.bypass ?? worker.bypass,
    cwd: taskInput.cwd ?? worker.cwd,
  };
}

async function showStatus(id) {
  const worker = await inspectWorker(await readWorker(id));
  print(workerView(worker));
}

async function waitForWorker(id, { timeoutMs }) {
  const deadline = timeoutMs === 0 ? null : Date.now() + timeoutMs;
  while (true) {
    const worker = await inspectWorker(await readWorker(id));
    if (isTerminal(worker.state) || (deadline !== null && Date.now() >= deadline)) {
      print(workerView(worker));
      return;
    }
    await delay(250);
  }
}

async function cancelWorker(id) {
  const worker = await inspectWorker(await readWorker(id));
  if (isTerminal(worker.state)) {
    print(workerView(worker));
    return;
  }
  if (worker.pid) await killProcessTree(worker.pid);
  worker.state = "cancelled";
  worker.completedAt = new Date().toISOString();
  await writeWorker(worker);
  print(workerView(worker));
}

async function listWorkers() {
  await ensureState();
  const files = (await readdir(workersRoot)).filter((file) => file.endsWith(".json"));
  const workers = [];
  for (const file of files) workers.push(workerView(await inspectWorker(await readWorker(file.slice(0, -5)))));
  print(workers.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
}

async function inspectWorker(worker) {
  const events = await readEvents(worker.stdoutPath);
  let threadId = worker.threadId;
  let finalMessage = null;
  let completed = false;

  for (const event of events) {
    if (event.type === "thread.started") threadId = event.thread_id;
    if (event.type === "item.completed" && event.item?.type === "agent_message") finalMessage = event.item.text;
    if (event.type === "turn.completed") completed = true;
  }

  let state = worker.state;
  if (state !== "cancelled" && completed) state = "completed";
  if (!isTerminal(state) && worker.pid && !(await isProcessAlive(worker.pid))) state = "failed";
  const changed = threadId !== worker.threadId || state !== worker.state;
  if (changed) {
    worker.threadId = threadId;
    worker.state = state;
    if (isTerminal(state) && !worker.completedAt) worker.completedAt = new Date().toISOString();
    await writeWorker(worker);
  }
  worker.finalMessage = finalMessage;
  return worker;
}

function workerView(worker) {
  return {
    workerId: worker.id,
    state: worker.state,
    sessionId: worker.threadId,
    parentWorkerId: worker.parentWorkerId,
    pid: worker.pid,
    cwd: worker.cwd,
    effort: worker.effort,
    bypass: worker.bypass,
    createdAt: worker.createdAt,
    completedAt: worker.completedAt,
    finalMessage: worker.finalMessage ?? null,
  };
}

async function ensureState() {
  await mkdir(workersRoot, { recursive: true });
  await mkdir(logsRoot, { recursive: true });
  await mkdir(join(stateRoot, "prompts"), { recursive: true });
}

async function writeWorker(worker) {
  await ensureState();
  const target = join(workersRoot, `${worker.id}.json`);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(worker, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function readWorker(id) {
  const target = join(workersRoot, `${id}.json`);
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") fail(`Unknown worker: ${id}`);
    throw error;
  }
}

async function readEvents(path) {
  try {
    return (await readFile(path, "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function killProcessTree(pid) {
  if (platform() === "win32") {
    await spawnAndWait("taskkill", ["/pid", String(pid), "/t", "/f"]);
    return;
  }
  try { process.kill(-pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
}

function spawnAndWait(file, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.on("exit", () => resolvePromise());
  });
}

function onceExit(child) {
  return new Promise((resolvePromise) => child.on("exit", (code, signal) => resolvePromise({ code, signal })));
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function isTerminal(state) {
  return state === "completed" || state === "failed" || state === "cancelled";
}

function reportLaunchError(error) {
  if (error.code === "ENOENT") fail("Codex CLI was not found on PATH. Install it and sign in first.");
  fail(`Could not start Codex: ${error.message}`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message) {
  process.stderr.write(`luna-sidecar: ${message}\n`);
  process.exit(2);
}

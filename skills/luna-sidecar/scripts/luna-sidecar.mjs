#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const model = "gpt-5.6-luna";
const schemaVersion = 2;
const efforts = new Set(["low", "medium", "high", "xhigh", "max"]);
const workerStates = new Set(["starting", "running", "cancelling", "completed", "failed", "cancelled", "unknown"]);
const providerStates = new Set(["not_started", "running", "completed", "failed", "unknown"]);
const commands = new Set(["start", "status", "wait", "resume", "cancel", "list", "run", "_worker"]);
const rawArgs = process.argv.slice(2);
const command = commands.has(rawArgs[0]) ? rawArgs.shift() : "run";
const stateRoot = resolve(process.env.LUNA_SIDECAR_HOME ?? defaultStateRoot());
const workersRoot = join(stateRoot, "workers");
const logsRoot = join(stateRoot, "logs");
const promptsRoot = join(stateRoot, "prompts");
const requestsRoot = join(stateRoot, "requests");
const launcherPath = fileURLToPath(import.meta.url);

class SidecarError extends Error {
  constructor(message, code = "sidecar_error", exitCode = 2) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

class RevisionConflict extends SidecarError {
  constructor() {
    super("Worker changed while the mutation was in progress", "revision_conflict", 1);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof SidecarError && error.exitCode === 1) {
    printFailure(command, null, error.code, error.message);
    process.exitCode = 1;
  } else if (!(error instanceof SidecarError)) {
    process.stderr.write(`luna-sidecar: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
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
      task.cwd = validateCwd(value);
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }
  if (task.effort !== null && !efforts.has(task.effort)) {
    fail(`--effort must be one of: ${[...efforts].join(", ")}`);
  }
  if (task.sandbox === "read-only" && task.bypass === true) {
    fail("--read-only and --bypass cannot be combined");
  }
  if (!task.prompt.trim()) fail('Pass one task after `--`, for example: -- "Review src/auth"');
  return task;
}

function parseWait(args) {
  if (args.length === 0) return { timeoutMs: 0 };
  if (args.length === 2 && args[0] === "--timeout") {
    const timeoutMs = Number(args[1]);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
      fail("--timeout must be a non-negative whole number of milliseconds");
    }
    return { timeoutMs };
  }
  fail("Use wait <worker-id> [--timeout <milliseconds>]");
}

function requireWorkerId(args) {
  const id = args[0];
  if (!id || id.startsWith("-")) fail("A worker id is required");
  validateUuid(id, "worker id");
  return id;
}

function validateUuid(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    fail(`Invalid ${label}: expected a canonical UUID`);
  }
  return value;
}

function validateCwd(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) fail("--cwd needs a valid folder");
  const cwd = resolve(value);
  if (!isAbsolute(cwd)) fail("--cwd needs an absolute folder");
  return cwd;
}

function resolvedTask(task, previous = {}) {
  const explicitReadOnly = task.sandbox === "read-only";
  const result = {
    effort: task.effort ?? previous.effort ?? "medium",
    sandbox: task.sandbox ?? previous.sandbox ?? "workspace-write",
    bypass: explicitReadOnly ? false : (task.bypass ?? previous.bypass ?? false),
    cwd: task.cwd ?? previous.cwd ?? resolve(process.cwd()),
    prompt: task.prompt,
  };
  if (!efforts.has(result.effort)) fail(`Stored effort is not supported: ${result.effort}`);
  result.cwd = validateCwd(result.cwd);
  if (result.sandbox !== "read-only" && result.sandbox !== "workspace-write") {
    fail(`Stored sandbox is not supported: ${result.sandbox}`);
  }
  if (result.bypass && explicitReadOnly) fail("--read-only and --bypass cannot be combined");
  return result;
}

function resolvedResumeTask(task, previous) {
  const storedEffort = efforts.has(previous.effort) ? previous.effort : null;
  const storedCwd = typeof previous.cwd === "string" && isAbsolute(previous.cwd) ? previous.cwd : null;
  const storedSandbox = previous.sandbox === "read-only" || previous.sandbox === "workspace-write"
    ? previous.sandbox
    : null;
  const storedBypass = typeof previous.bypass === "boolean" ? previous.bypass : null;

  if (task.effort === null && storedEffort === null) {
    fail("Stored effort is missing or invalid; pass --effort explicitly");
  }
  if (task.cwd === null && storedCwd === null) {
    fail("Stored cwd is missing or invalid; pass --cwd explicitly");
  }
  if (task.sandbox === null && task.bypass === null && (storedSandbox === null || storedBypass === null)) {
    fail("Stored authority is missing or invalid; pass --read-only or --bypass explicitly");
  }

  return resolvedTask(task, {
    effort: storedEffort,
    cwd: storedCwd,
    sandbox: storedSandbox ?? (task.bypass === true ? "workspace-write" : null),
    bypass: storedBypass,
  });
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
    ...(task.bypass ? ["--dangerously-bypass-approvals-and-sandbox"] : ["-c", `sandbox_mode=\"${task.sandbox}\"`]),
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
  const child = spawnCodex(execArgs(task), {
    cwd: task.cwd,
    env: { ...process.env },
    stdio: ["pipe", "inherit", "inherit"],
    windowsHide: true,
  });
  let launchError = null;
  child.once("error", (error) => { launchError = error; });
  const exit = onceClose(child);
  child.stdin.end(task.prompt);
  const result = await exit;
  if (launchError) reportLaunchError(launchError);
  process.exitCode = result.code ?? (result.signal ? 1 : 0);
}

async function startWorker(taskInput, parentWorkerId = null, threadId = null) {
  const task = resolvedTask(taskInput);
  await ensureState();
  const workerId = randomUUID();
  const turn = makeTurn(task, threadId);
  const worker = makeWorker(workerId, parentWorkerId, turn);
  try {
    await publishPrompt(turn, task.prompt);
    await writeWorker(worker);
  } catch (error) {
    await cleanupPublishedPrompt(turn);
    throw error;
  }
  return launchRunner(workerId, worker, { printResult: true });
}

function makeWorker(workerId, parentWorkerId, turn) {
  return syncProjection({
    schemaVersion,
    revision: 0,
    workerId,
    id: workerId,
    parentWorkerId,
    createdAt: turn.createdAt,
    turns: [turn],
    warnings: [],
  });
}

function makeTurn(task, sessionId = null) {
  const turnId = randomUUID();
  const stdoutPath = join(logsRoot, `${turnId}.jsonl`);
  const stderrPath = join(logsRoot, `${turnId}.stderr.log`);
  return {
    turnId,
    sessionId,
    state: "starting",
    providerState: "not_started",
    taskOutcome: "not_evaluated",
    runnerPid: null,
    providerPid: null,
    pid: null,
    cwd: task.cwd,
    effort: task.effort,
    sandbox: task.sandbox,
    bypass: task.bypass,
    promptPath: join(promptsRoot, `${turnId}.prompt`),
    promptClaimedPath: join(promptsRoot, `${turnId}.prompt.claimed`),
    promptSha256: null,
    promptClaimedAt: null,
    stdinAcceptedAt: null,
    stdoutPath,
    stderrPath,
    logs: { stdoutPath, stderrPath, stdoutBytes: 0, stderrBytes: 0, truncated: false },
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    exitCode: null,
    signal: null,
    errorCode: null,
    error: null,
    warnings: [],
    finalMessage: null,
    cancel: null,
  };
}

async function publishPrompt(turn, prompt = null) {
  await mkdir(dirname(turn.promptPath), { recursive: true });
  const body = prompt ?? turn.promptBody ?? "";
  const temporary = `${turn.promptPath}.${randomUUID()}.tmp`;
  await writeFile(temporary, body, "utf8");
  let published = false;
  try {
    await replaceFileWithRetry(temporary, turn.promptPath);
    published = true;
  } finally {
    if (!published) await rm(temporary, { force: true }).catch(() => {});
  }
  turn.promptSha256 = createHash("sha256").update(body).digest("hex");
  delete turn.promptBody;
}

async function claimPromptPath(source, claimed) {
  const deadline = Date.now() + 2_000;
  while (true) {
    try {
      await rename(source, claimed);
      return;
    } catch (error) {
      if (error.code === "ENOENT") {
        try {
          await stat(claimed);
          throw new SidecarError("Prompt was already claimed; automatic replay is forbidden", "prompt_already_claimed", 1);
        }
        catch (claimedError) { if (claimedError.code !== "ENOENT") throw claimedError; }
      }
      if (!["EBUSY", "EPERM", "EACCES"].includes(error.code) || Date.now() >= deadline) throw error;
      await delay(10);
    }
  }
}

async function launchRunner(workerId, worker, { printResult }) {
  const runner = spawn(process.execPath, [launcherPath, "_worker", workerId], {
    cwd: worker.turns.at(-1).cwd,
    detached: true,
    env: { ...process.env },
    stdio: "ignore",
    windowsHide: true,
  });
  const outcome = await onceSpawnOrError(runner);
  if (outcome.error) {
    let lastError = outcome.error;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await persistRunnerFailure(workerId, "runner_spawn_failed", outcome.error, "not_started");
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await delay(50);
      }
    }
    await cleanupPublishedPrompt(latestTurn(worker), workerId);
    if (lastError) throw lastError;
    throw new SidecarError(`Could not start sidecar runner: ${outcome.error.message}`, "runner_spawn_failed", 1);
  }
  // The parent only records the detached runner identity. It never claims provider readiness.
  const view = workerView(worker);
  view.pid = runner.pid ?? null;
  view.runnerPid = runner.pid ?? null;
  runner.unref();
  if (printResult) print(view);
}

async function runWorker(workerId) {
  try {
    await runWorkerLifecycle(workerId);
  } catch (error) {
    if (error instanceof SidecarError && error.code === "runner_already_owned") return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await persistUnknown(
          workerId,
          "runner_startup_error",
          error instanceof Error ? error.message : String(error),
          "cancel_failed",
        );
        return;
      } catch {
        await delay(50);
      }
    }
    throw error;
  }
}

async function runWorkerLifecycle(workerId) {
  let worker = await readWorker(workerId);
  const initial = latestTurn(worker);
  if (!initial) return;
  let rejectedDeadOwner = false;
  const runnerUpdate = await mutateWorker(workerId, async (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state)) return current;
    if (turn.sourceSchemaVersion === 0) {
      markUnknown(current, "legacy_runner_unsupported", "A legacy turn cannot be replayed by the v2 runner");
      rejectedDeadOwner = true;
      return syncProjection(current);
    }
    if (turn.runnerPid && turn.runnerPid !== process.pid) {
      const live = await runnerLiveness(turn.runnerPid);
      if (live !== false) {
        throw new SidecarError("This turn already has a live or uncertain runner owner", "runner_already_owned", 1);
      }
      markUnknown(current, "runner_not_alive", "The recorded runner is no longer alive; prompt replay is forbidden");
      rejectedDeadOwner = true;
      return syncProjection(current);
    }
    if (current.state !== "starting" || turn.providerState !== "not_started") {
      markUnknown(current, "runner_ownership_invalid", "Runner ownership could not be established before provider launch");
      rejectedDeadOwner = true;
      return syncProjection(current);
    }
    turn.runnerPid = process.pid;
    turn.pid = process.pid;
    return syncProjection(current);
  });
  worker = runnerUpdate.worker;
  let turn = latestTurn(worker);
  if (rejectedDeadOwner || !turn || isTerminal(worker.state)) return;

  if (worker.state === "cancelling" && await finishStartingCancel(workerId)) return;

  try {
    const claim = await mutateWorker(workerId, async (current) => {
      const active = latestTurn(current);
      if (!active || isTerminal(current.state)) return current;
      if (active.runnerPid !== process.pid) {
        throw new SidecarError("Prompt claim does not belong to this runner", "runner_ownership_lost", 1);
      }
      if (current.state === "cancelling") return current;
      await claimPromptPath(active.promptPath, active.promptClaimedPath);
      active.promptClaimedAt = new Date().toISOString();
      return syncProjection(current);
    });
    worker = claim.worker;
    turn = latestTurn(worker);
  } catch (error) {
    if (error instanceof SidecarError && error.code === "prompt_already_claimed") {
      await persistUnknown(workerId, error.code, error.message);
    } else {
      await persistRunnerFailure(workerId, "prompt_claim_failed", error, "not_started");
    }
    return;
  }

  if (worker.state === "cancelling" && await finishStartingCancel(workerId)) return;

  let prompt;
  try {
    prompt = await readFile(turn.promptClaimedPath, "utf8");
  } catch (error) {
    await persistRunnerFailure(workerId, "prompt_missing_after_claim", error);
    return;
  }

  await waitForFixtureRelease(process.env.FAKE_CODEX_START_BARRIER);
  const beforeProvider = await readWorker(workerId);
  if (beforeProvider.state === "cancelling" && await finishStartingCancel(workerId)) return;

  const stdout = await open(turn.stdoutPath, "a");
  const stderr = await open(turn.stderrPath, "a");
  let child;
  let launchError = null;
  let closeInfo = null;
  let spawnSeen = false;
  let providerCompleted = false;
  let providerFailed = false;
  let finalMessage = null;
  let sessionId = turn.sessionId;
  const warnings = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const stdoutDecoder = new StringDecoder("utf8");
  let stdoutTail = "";
  let cancelPromise = null;
  let stdoutWork = Promise.resolve();
  let stderrWork = Promise.resolve();
  let stdinWork = Promise.resolve();
  let streamError = null;
  let stdinError = null;

  const handleLine = (line) => {
    if (!line) return;
    let event;
    try { event = JSON.parse(line); }
    catch { warnings.push("malformed_provider_json"); return; }
    if (event.type === "thread.started" && typeof event.thread_id === "string") sessionId = event.thread_id;
    if (event.type === "turn.completed") providerCompleted = true;
    if (event.type === "turn.failed" || event.type === "error") providerFailed = true;
    if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
      finalMessage = event.item.text;
    }
    if (event.type === "item.error" || (event.type === "item.completed" && event.item?.type === "error")) {
      warnings.push("provider_item_error");
    }
  };

  try {
    child = spawnCodex(
      turn.sessionId ? resumeArgs(turn.sessionId, turn) : execArgs(turn, true),
      {
        cwd: turn.cwd,
        env: { ...process.env },
        detached: platform() !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const closePromise = onceClose(child).then((result) => {
      closeInfo = result;
      return result;
    });
    child.__sidecarClosePromise = closePromise;
    let spawnPersistPromise = Promise.resolve();
    child.once("spawn", () => {
      spawnSeen = true;
      spawnPersistPromise = persistProviderSpawn(workerId, child.pid, sessionId);
    });
    child.once("error", (error) => { launchError = error; });
    child.stdout.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stdoutWork = stdoutWork.then(async () => {
        stdoutBytes += bytes.length;
        await stdout.write(bytes);
        stdoutTail += stdoutDecoder.write(bytes);
        const lines = stdoutTail.split(/\r?\n/);
        stdoutTail = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }).catch((error) => { streamError ??= error; });
    });
    child.stderr.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stderrWork = stderrWork.then(async () => {
        stderrBytes += bytes.length;
        await stderr.write(bytes);
      }).catch((error) => { streamError ??= error; });
    });
    stdinWork = new Promise((resolve) => {
      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        child.stdin.off("error", onError);
        resolve(error);
      };
      const onError = (error) => finish(error);
      child.stdin.once("error", onError);
      child.stdin.end(prompt, () => finish());
    }).then(async (error) => {
      if (error) {
        stdinError = error;
        return;
      }
      await mutateWorker(workerId, (current) => {
        const active = latestTurn(current);
        if (!active) return current;
        active.stdinAcceptedAt = new Date().toISOString();
        return syncProjection(current);
      });
      await cleanupPublishedPrompt(turn, workerId);
    });

    const cancelTimer = setInterval(() => {
      if (closeInfo || cancelPromise) return;
      cancelPromise = maybeRunnerCancel(workerId, child)
        .then((result) => { if (!result) cancelPromise = null; return result; })
        .catch(() => { cancelPromise = null; return null; });
    }, 250);
    await closePromise;
    clearInterval(cancelTimer);
    await Promise.all([stdoutWork, stderrWork, stdinWork]);
    if (streamError) throw streamError;
    stdoutTail += stdoutDecoder.end();
    if (stdoutTail) handleLine(stdoutTail);
    if (cancelPromise) await cancelPromise;
    await spawnPersistPromise;

    if (stdinError && !launchError) {
      await persistRunnerFailure(workerId, "stdin_write_failed", stdinError, spawnSeen ? "failed" : "not_started");
      return;
    }

    const current = await readWorker(workerId);
    if (isTerminal(current.state)) return;
    if (current.state === "cancelling" && current.cancel?.acknowledgedAt) {
      await persistUnknown(workerId, "cancel_failed", "Cancellation acknowledgement lacked a terminal cleanup receipt");
      return;
    }
    await finalizeProvider(workerId, {
      spawnSeen,
      launchError,
      closeInfo,
      providerCompleted,
      providerFailed,
      sessionId,
      finalMessage,
      warnings,
      stdoutBytes,
      stderrBytes,
    });
  } catch (error) {
    if (spawnSeen) {
      await persistUnknown(workerId, "runner_provider_error", error instanceof Error ? error.message : String(error));
    } else {
      await persistRunnerFailure(workerId, "runner_provider_error", error, "not_started");
    }
  } finally {
    await stdout.close().catch(() => {});
    await stderr.close().catch(() => {});
  }
}

async function persistProviderSpawn(workerId, providerPid, sessionId) {
  await mutateWorker(workerId, (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state)) return current;
    turn.providerPid = providerPid ?? null;
    turn.startedAt ??= new Date().toISOString();
    turn.providerState = "running";
    if (sessionId) turn.sessionId = sessionId;
    if (current.state === "starting") turn.state = "running";
    return syncProjection(current);
  });
}

async function finalizeProvider(workerId, facts) {
  const result = await mutateWorker(workerId, (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state)) return current;
    if (facts.sessionId) turn.sessionId = facts.sessionId;
    turn.exitCode = facts.closeInfo?.code ?? null;
    turn.signal = facts.closeInfo?.signal ?? null;
    turn.finalMessage = facts.finalMessage;
    turn.warnings = [...new Set([...(turn.warnings ?? []), ...facts.warnings])];
    turn.logs.stdoutBytes = facts.stdoutBytes;
    turn.logs.stderrBytes = facts.stderrBytes;
    turn.completedAt = new Date().toISOString();
    if (current.state === "cancelling" && turn.cancel && !turn.cancel.acknowledgedAt) {
      turn.cancel.finishedAt = turn.completedAt;
      turn.cancel.result = "not_applied";
      turn.cancel.errorCode = null;
      turn.errorCode = null;
      turn.warnings = (turn.warnings ?? []).filter((warning) => warning !== "cancel_timeout");
    }
    if (facts.launchError || !facts.spawnSeen) {
      turn.state = "failed";
      turn.providerState = "failed";
      turn.errorCode = "provider_spawn_failed";
      turn.error = facts.launchError?.message ?? "Provider did not spawn";
    } else if (facts.providerFailed || (facts.closeInfo?.code ?? 0) !== 0 || facts.closeInfo?.signal) {
      turn.state = "failed";
      turn.providerState = "failed";
      turn.errorCode = facts.providerFailed ? "provider_failed" : "provider_exit_failed";
      turn.error = facts.providerFailed ? "Provider reported a fatal failure" : "Provider exited unsuccessfully";
    } else if (facts.providerCompleted && facts.closeInfo?.code === 0) {
      turn.state = "completed";
      turn.providerState = "completed";
    } else {
      turn.state = "unknown";
      turn.providerState = "unknown";
      turn.errorCode = "missing_provider_completion";
      turn.error = "Provider closed without a terminal completion event";
    }
    return syncProjection(current);
  });
  const turn = latestTurn(result.worker);
  if (turn?.cancel?.result === "not_applied") await removeCancelRequest(workerId, turn.turnId);
}

async function persistRunnerFailure(workerId, errorCode, error, providerState = "failed") {
  await mutateWorker(workerId, (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state)) return current;
    turn.state = "failed";
    turn.providerState = providerState;
    turn.errorCode = errorCode;
    turn.error = error instanceof Error ? error.message : String(error);
    turn.completedAt = new Date().toISOString();
    return syncProjection(current);
  });
}

async function resumeWorker(workerId, taskInput) {
  const stored = await readWorker(workerId);
  if (stored.state === "unknown") return workerUnknown(workerId, stored);
  const task = resolvedResumeTask(taskInput, stored);
  let becameUnknown = false;
  let publishedTurn = null;
  let result;
  try {
    result = await mutateWorker(workerId, async (current) => {
      const active = latestTurn(current);
      if (!active) throw new SidecarError("Worker has no turn to resume", "missing_turn", 1);
      if (current.state === "unknown") throw new SidecarError("Worker is unknown; start a new worker", "worker_unknown", 1);
      if (!isTerminal(current.state)) {
        if (!active.runnerPid) throw new SidecarError("Worker already has an active turn", "active_turn", 1);
        const live = await runnerLiveness(active.runnerPid);
        if (live !== false) throw new SidecarError("Worker already has an active turn", "active_turn", 1);
        markUnknown(current, "runner_not_alive", "The recorded runner is no longer alive");
        becameUnknown = true;
        return syncProjection(current);
      }
      if (!active.sessionId) throw new SidecarError("Worker has no recorded Codex session id", "missing_session", 1);
      const turn = makeTurn(task, active.sessionId);
      turn.promptBody = task.prompt;
      await publishPrompt(turn, task.prompt);
      publishedTurn = turn;
      current.turns.push(turn);
      return syncProjection(current);
    });
  } catch (error) {
    if (publishedTurn) await cleanupPublishedPrompt(publishedTurn);
    throw error;
  }
  if (becameUnknown) return workerUnknown(workerId, result.worker);
  return launchRunner(workerId, result.worker, { printResult: true });
}

function workerUnknown(workerId, worker) {
  printFailure("resume", workerId, "worker_unknown", "Worker execution is unknown; use start to create a new worker");
  process.exitCode = 1;
  return worker;
}

function markUnknown(worker, errorCode, message) {
  const turn = latestTurn(worker);
  if (!turn || isTerminal(worker.state)) return;
  turn.state = "unknown";
  turn.providerState = "unknown";
  turn.errorCode = errorCode;
  turn.error = message;
  turn.completedAt = new Date().toISOString();
  return syncProjection(worker);
}

async function showStatus(workerId) {
  print(workerView(await readWorker(workerId)));
}

async function waitForWorker(workerId, { timeoutMs }) {
  const deadline = timeoutMs === 0 ? null : Date.now() + timeoutMs;
  while (true) {
    const worker = await readWorker(workerId);
    if (isTerminal(worker.state) || (deadline !== null && Date.now() >= deadline)) {
      const view = workerView(worker);
      if (deadline !== null && !isTerminal(worker.state)) view.timedOut = true;
      else view.timedOut = false;
      print(view);
      return;
    }
    await delay(250);
  }
}

async function cancelWorker(workerId) {
  let existing = await readWorker(workerId);
  existing = await awaitRunnerHandoff(workerId, existing);
  if (isTerminal(existing.state)) {
    if (existing.legacy) existing = (await mutateWorker(workerId, (current) => syncProjection(current))).worker;
    existing.warnings = [...new Set([...(existing.warnings ?? []), "already_terminal"])]
    print(workerView(existing));
    return;
  }
  let cancelFailed = false;
  let publishedRequest = null;
  let request;
  try {
    request = await mutateWorker(workerId, async (current) => {
      const turn = latestTurn(current);
      if (!turn) throw new SidecarError("Worker has no active turn", "missing_turn", 1);
      if (isTerminal(current.state)) return current;
      if (current.cancel?.requestId && current.state === "cancelling") return current;
      const live = turn.runnerPid ? await runnerLiveness(turn.runnerPid) : false;
      if (live !== true) {
        markUnknown(current, "cancel_failed", "The live runner could not be verified; no process was signalled");
        turn.cancel = {
          requestId: randomUUID(),
          requestedAt: new Date().toISOString(),
          acknowledgedAt: null,
          finishedAt: new Date().toISOString(),
          result: "cancel_failed",
          errorCode: "cancel_failed",
        };
        cancelFailed = true;
        return syncProjection(current);
      }
      const requestId = randomUUID();
      const requestBody = {
        schemaVersion: 1,
        requestId,
        workerId,
        turnId: turn.turnId,
        baseRevision: current.revision,
        requestedAt: new Date().toISOString(),
      };
      await publishCancelRequest(turn.turnId, requestBody);
      publishedRequest = requestBody;
      turn.cancel = {
        requestId,
        requestedAt: requestBody.requestedAt,
        acknowledgedAt: null,
        finishedAt: null,
        result: "requested",
        errorCode: null,
      };
      turn.state = "cancelling";
      return syncProjection(current);
    });
  } catch (error) {
    if (publishedRequest) {
      await removeCancelRequestIfOwned(publishedRequest.turnId, publishedRequest.requestId);
    }
    throw error;
  }
  existing = request.worker;
  if (isTerminal(existing.state)) {
    if (cancelFailed) {
      const turn = latestTurn(existing);
      if (turn) {
        await removeCancelRequest(workerId, turn.turnId);
        await cleanupPublishedPrompt(turn, workerId);
      }
      process.exitCode = 1;
    }
    print(workerView(existing));
    return;
  }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const current = await readWorker(workerId);
    if (isTerminal(current.state)) {
      if (cancelCommandFailed(current)) process.exitCode = 1;
      print(workerView(current));
      return;
    }
    await delay(250);
  }
  let timedOutUnknown = false;
  const timeout = await mutateWorker(workerId, async (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state) || current.state !== "cancelling") return current;
    const live = turn.runnerPid ? await runnerLiveness(turn.runnerPid) : false;
    if (live === false) {
      markUnknown(current, "cancel_failed", "The runner exited before cancellation was acknowledged; no stored PID was signalled");
      if (turn.cancel) {
        turn.cancel.finishedAt = new Date().toISOString();
        turn.cancel.result = "cancel_failed";
        turn.cancel.errorCode = "cancel_failed";
      }
      timedOutUnknown = true;
      return syncProjection(current);
    }
    turn.errorCode = "cancel_timeout";
    turn.warnings = [...new Set([...(turn.warnings ?? []), "cancel_timeout"])]
    if (turn.cancel) turn.cancel.errorCode = "cancel_timeout";
    return syncProjection(current);
  });
  const timedOutWorker = timeout.worker;
  if (timedOutUnknown) {
    const turn = latestTurn(timedOutWorker);
    if (turn) await removeCancelRequest(workerId, turn.turnId);
  }
  print(workerView(timedOutWorker));
  if (!isTerminal(timedOutWorker.state) || timedOutWorker.state === "unknown") process.exitCode = 1;
}

async function awaitRunnerHandoff(workerId, initial) {
  let current = initial;
  if (current.state !== "starting" || latestTurn(current)?.runnerPid) return current;
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    await delay(25);
    current = await readWorker(workerId);
    if (current.state !== "starting" || latestTurn(current)?.runnerPid) return current;
  }
  return current;
}

async function publishCancelRequest(turnId, body) {
  await mkdir(requestsRoot, { recursive: true });
  const target = cancelRequestPath(turnId);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(body)}\n`, "utf8");
  let published = false;
  try {
    await replaceFileWithRetry(temporary, target);
    published = true;
  } finally {
    if (!published) await rm(temporary, { force: true }).catch(() => {});
  }
}

async function maybeRunnerCancel(workerId, child) {
  if (child.exitCode !== null || child.signalCode !== null) return null;
  const current = await readWorker(workerId);
  const turn = latestTurn(current);
  if (!turn || current.state !== "cancelling" || !turn.cancel?.requestId) return null;
  if (turn.cancel.acknowledgedAt) return null;
  let request;
  try { request = await readCancelRequest(turn.turnId); }
  catch (error) {
    await persistUnknown(
      workerId,
      "cancel_failed",
      `Cancellation request could not be read: ${error instanceof Error ? error.message : String(error)}`,
      "cancel_failed",
    );
    return true;
  }
  if (!matchesCancelRequest(current, turn, request)) {
    await persistUnknown(workerId, "cancel_failed", "The committed cancellation request is missing or invalid; no process was signalled", "cancel_failed");
    await removeCancelRequest(workerId, turn.turnId);
    return true;
  }
  await maybeCancelTestBarrier();
  if (child.exitCode !== null || child.signalCode !== null) return null;
  let accepted = false;
  const acknowledged = await mutateWorker(workerId, (latest) => {
    const active = latestTurn(latest);
    if (!active || isTerminal(latest.state)) return latest;
    if (latest.state !== "cancelling" || active.cancel?.requestId !== request.requestId) return latest;
    if (child.exitCode !== null || child.signalCode !== null) return latest;
    active.cancel.acknowledgedAt = new Date().toISOString();
    active.cancel.result = "terminating";
    active.cancel.errorCode = null;
    active.errorCode = null;
    active.warnings = (active.warnings ?? []).filter((warning) => warning !== "cancel_timeout");
    accepted = true;
    return syncProjection(latest);
  });
  if (!accepted || isTerminal(acknowledged.worker.state)) return null;
  try {
    await terminateProviderTree(child);
    await mutateWorker(workerId, (latest) => {
      const active = latestTurn(latest);
      if (!active || isTerminal(latest.state)) return latest;
      active.state = "cancelled";
      active.providerState = "unknown";
      active.completedAt = new Date().toISOString();
      active.cancel.finishedAt = active.completedAt;
      active.cancel.result = "cancelled";
      active.cancel.errorCode = null;
      active.errorCode = null;
      return syncProjection(latest);
    });
    await removeCancelRequest(workerId, turn.turnId);
  } catch (error) {
    await persistUnknown(workerId, "cancel_failed", error instanceof Error ? error.message : String(error), "cancel_failed");
  }
  return true;
}

function cancelCommandFailed(worker) {
  const turn = latestTurn(worker);
  return worker.state === "unknown" && (turn?.errorCode === "cancel_failed" || turn?.cancel?.result === "cancel_failed");
}

async function finishStartingCancel(workerId) {
  let handled = false;
  let cancelledTurn = null;
  const result = await mutateWorker(workerId, async (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state)) return current;
    if (current.state !== "cancelling") return current;
    const request = await readCancelRequest(turn.turnId);
    if (!matchesCancelRequest(current, turn, request)) {
      markUnknown(current, "cancel_failed", "The committed cancellation request is missing or invalid; provider was not launched");
      if (turn.cancel) {
        turn.cancel.finishedAt = new Date().toISOString();
        turn.cancel.result = "cancel_failed";
        turn.cancel.errorCode = "cancel_failed";
      }
      handled = true;
      cancelledTurn = turn;
      return syncProjection(current);
    }
    turn.cancel.acknowledgedAt = new Date().toISOString();
    turn.cancel.finishedAt = new Date().toISOString();
    turn.cancel.result = "cancelled";
    turn.cancel.errorCode = null;
    turn.state = "cancelled";
    turn.providerState = "not_started";
    turn.completedAt = turn.cancel.finishedAt;
    turn.errorCode = null;
    handled = true;
    cancelledTurn = turn;
    return syncProjection(current);
  });
  if (!handled) return false;
  const turn = cancelledTurn ?? latestTurn(result.worker);
  if (turn) {
    await removeCancelRequest(workerId, turn.turnId);
    await cleanupPublishedPrompt(turn, workerId);
  }
  return true;
}

async function persistUnknown(workerId, errorCode, message, cancelResult = null) {
  const result = await mutateWorker(workerId, (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state)) return current;
    markUnknown(current, errorCode, message);
    if (cancelResult && turn.cancel) {
      turn.cancel.finishedAt = new Date().toISOString();
      turn.cancel.result = cancelResult;
      turn.cancel.errorCode = errorCode;
    }
    return syncProjection(current);
  });
  return result.worker;
}

async function removeCancelRequest(workerId, turnId) {
  try {
    await rm(cancelRequestPath(turnId), { force: true });
  } catch (error) {
    await mutateWorker(workerId, (current) => {
      const turn = latestTurn(current);
      if (!turn) return current;
      turn.warnings = [...new Set([...(turn.warnings ?? []), "cancel_request_cleanup_failed"])]
      return syncProjection(current);
    }).catch(() => {});
  }
}

async function removeCancelRequestIfOwned(turnId, requestId) {
  try {
    const request = await readCancelRequest(turnId);
    if (request?.requestId === requestId) await rm(cancelRequestPath(turnId), { force: true });
  } catch {
    // A failed mutation must not delete a newer controller's request.
  }
}

function matchesCancelRequest(worker, turn, request) {
  return Boolean(
    request
    && request.schemaVersion === 1
    && request.workerId === worker.workerId
    && request.turnId === turn.turnId
    && request.requestId === turn.cancel?.requestId
    && Number.isSafeInteger(request.baseRevision)
    && request.baseRevision >= 0
    && request.baseRevision < worker.revision
    && typeof request.requestedAt === "string"
    && request.requestedAt === turn.cancel?.requestedAt,
  );
}

async function cleanupPublishedPrompt(turn, workerId = null) {
  if (turn?.sourceSchemaVersion === 0) return;
  let failed = false;
  for (const promptPath of [turn?.promptPath, turn?.promptClaimedPath]) {
    if (!promptPath) continue;
    try { await rm(promptPath, { force: true }); }
    catch { failed = true; }
  }
  if (failed && workerId) {
    await mutateWorker(workerId, (current) => {
      const active = latestTurn(current);
      if (!active) return current;
      active.warnings = [...new Set([...(active.warnings ?? []), "prompt_cleanup_failed"])]
      return syncProjection(current);
    }).catch(() => {});
  }
}

async function listWorkers() {
  await ensureState();
  const files = (await readdir(workersRoot)).filter((file) => file.endsWith(".json"));
  const workers = [];
  for (const file of files) workers.push(workerView(await readWorker(file.slice(0, -5))));
  print(workers.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
}

function workerView(worker) {
  const turn = latestTurn(worker);
  return {
    schemaVersion,
    workerId: worker.workerId,
    turnId: turn?.turnId ?? null,
    turnCount: worker.turns?.length ?? 0,
    state: turn ? turn.state : (worker.state ?? "unknown"),
    providerState: turn ? turn.providerState : (worker.providerState ?? "unknown"),
    taskOutcome: turn ? turn.taskOutcome : (worker.taskOutcome ?? "not_evaluated"),
    sessionId: turn ? turn.sessionId : (worker.threadId ?? null),
    parentWorkerId: worker.parentWorkerId ?? null,
    pid: turn ? turn.pid : (worker.pid ?? null),
    runnerPid: turn ? turn.runnerPid : (worker.runnerPid ?? null),
    providerPid: turn ? turn.providerPid : (worker.providerPid ?? null),
    cwd: turn ? turn.cwd : (worker.cwd ?? null),
    effort: turn ? turn.effort : (worker.effort ?? null),
    sandbox: turn ? turn.sandbox : (worker.sandbox ?? null),
    bypass: turn ? turn.bypass : (worker.bypass ?? false),
    exitCode: turn ? turn.exitCode : (worker.exitCode ?? null),
    signal: turn ? turn.signal : (worker.signal ?? null),
    errorCode: turn ? turn.errorCode : (worker.errorCode ?? null),
    error: turn ? turn.error : (worker.error ?? null),
    warnings: [...new Set([...(worker.warnings ?? []), ...(turn?.warnings ?? [])])],
    createdAt: worker.createdAt,
    startedAt: turn ? turn.startedAt : (worker.startedAt ?? null),
    completedAt: turn ? turn.completedAt : (worker.completedAt ?? null),
    finalMessage: turn ? turn.finalMessage : (worker.finalMessage ?? null),
    logs: turn ? turn.logs : (worker.logs ?? null),
    cancel: turn ? turn.cancel : (worker.cancel ?? null),
  };
}

function syncProjection(worker) {
  const turn = latestTurn(worker);
  if (!turn) return worker;
  worker.schemaVersion = schemaVersion;
  worker.id = worker.workerId;
  worker.turnId = turn.turnId;
  worker.turnCount = worker.turns.length;
  for (const key of [
    "state", "providerState", "taskOutcome", "sessionId", "runnerPid", "providerPid", "pid", "cwd", "effort",
    "sandbox", "bypass", "exitCode", "signal", "errorCode", "error", "startedAt", "completedAt", "finalMessage",
    "logs", "cancel",
  ]) worker[key] = key === "sessionId" ? turn.sessionId : turn[key];
  worker.threadId = turn.sessionId;
  worker.stdoutPath = turn.stdoutPath;
  worker.stderrPath = turn.stderrPath;
  worker.promptPath = turn.promptPath;
  return worker;
}

function latestTurn(worker) {
  return worker.turns?.at(-1) ?? null;
}

function isTerminal(state) {
  return ["completed", "failed", "cancelled", "unknown"].includes(state);
}

async function ensureState() {
  await mkdir(workersRoot, { recursive: true });
  await mkdir(logsRoot, { recursive: true });
  await mkdir(promptsRoot, { recursive: true });
  await mkdir(requestsRoot, { recursive: true });
}

function safeWorkerPath(workerId, suffix = "json") {
  validateUuid(workerId, "worker id");
  const target = resolve(workersRoot, `${workerId}.${suffix}`);
  assertWithin(target, workersRoot, "worker state path");
  return target;
}

function cancelRequestPath(turnId) {
  validateUuid(turnId, "turn id");
  const target = resolve(requestsRoot, `${turnId}.cancel.json`);
  assertWithin(target, requestsRoot, "cancel request path");
  return target;
}

function assertWithin(target, root, label) {
  const rootResolved = resolve(root);
  const rel = relative(rootResolved, resolve(target));
  if (rel.startsWith("..") || rel === ".." || rel.includes("\\..") || rel.includes("/..") || isAbsolute(rel)) {
    fail(`${label} escapes the configured state root`);
  }
}

async function readWorker(workerId) {
  const target = safeWorkerPath(workerId);
  try {
    const raw = JSON.parse(await readFile(target, "utf8"));
    return normalizeWorker(raw, workerId);
  } catch (error) {
    if (error.code === "ENOENT") fail(`Unknown worker: ${workerId}`);
    throw error;
  }
}

function normalizeWorker(raw, requestedId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Malformed worker manifest");
  const workerId = raw.workerId ?? raw.id;
  validateUuid(workerId, "worker id");
  if (workerId !== requestedId) fail(`Worker path identity mismatch: ${requestedId}`);
  if (raw.schemaVersion === schemaVersion) {
    validateV2Worker(raw);
    return raw;
  }
  if (raw.schemaVersion !== undefined) {
    fail(`Unsupported worker schema version: ${raw.schemaVersion}`);
  }

  const legacyTurnId = raw.turnId ?? workerId;
  validateUuid(legacyTurnId, "turn id");
  const legacyState = raw.state ?? "unknown";
  if (!workerStates.has(legacyState)) fail("Malformed legacy worker state");
  if (raw.parentWorkerId !== null && raw.parentWorkerId !== undefined) {
    validateUuid(raw.parentWorkerId, "parent worker id");
  }
  const legacyTurn = {
    sourceSchemaVersion: 0,
    turnId: legacyTurnId,
    sessionId: raw.threadId ?? null,
    state: legacyState,
    providerState: legacyState === "completed" ? "completed" : (legacyState === "failed" ? "failed" : "unknown"),
    taskOutcome: "not_evaluated",
    runnerPid: raw.pid ?? null,
    providerPid: null,
    pid: raw.pid ?? null,
    cwd: raw.cwd,
    effort: raw.effort,
    sandbox: raw.sandbox,
    bypass: raw.bypass ?? false,
    promptPath: raw.promptPath,
    promptClaimedPath: null,
    promptSha256: null,
    promptClaimedAt: null,
    stdinAcceptedAt: null,
    stdoutPath: raw.stdoutPath,
    stderrPath: raw.stderrPath,
    logs: { stdoutPath: raw.stdoutPath, stderrPath: raw.stderrPath, stdoutBytes: 0, stderrBytes: 0, truncated: false },
    createdAt: raw.createdAt,
    startedAt: null,
    completedAt: raw.completedAt ?? null,
    exitCode: raw.exitCode ?? null,
    signal: raw.signal ?? null,
    errorCode: raw.errorCode ?? null,
    error: raw.error ?? null,
    warnings: raw.warnings ?? [],
    finalMessage: raw.finalMessage ?? null,
    cancel: null,
  };
  const normalized = {
    schemaVersion,
    revision: 0,
    workerId,
    id: workerId,
    parentWorkerId: raw.parentWorkerId ?? null,
    createdAt: raw.createdAt ?? new Date(0).toISOString(),
    migratedFromSchemaVersion: 0,
    turns: [legacyTurn],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((warning) => typeof warning === "string") : [],
  };
  Object.defineProperty(normalized, "legacy", { value: true, enumerable: false, writable: true });
  return syncProjection(normalized);
}

function validateV2Worker(worker) {
  if (!Number.isSafeInteger(worker.revision) || worker.revision < 0) fail("Malformed worker revision");
  if (worker.id !== worker.workerId) fail("Malformed worker identity projection");
  if (worker.parentWorkerId !== null && worker.parentWorkerId !== undefined) {
    validateUuid(worker.parentWorkerId, "parent worker id");
  }
  if (!Array.isArray(worker.turns) || worker.turns.length === 0) fail("Malformed worker turn history");
  const seen = new Set();
  for (const turn of worker.turns) {
    if (!turn || typeof turn !== "object" || Array.isArray(turn)) fail("Malformed worker turn");
    validateUuid(turn.turnId, "turn id");
    if (seen.has(turn.turnId)) fail("Duplicate turn id in worker history");
    seen.add(turn.turnId);
    if (!workerStates.has(turn.state)) fail("Malformed worker state");
    if (!providerStates.has(turn.providerState)) fail("Malformed provider state");
    if (turn.taskOutcome !== "not_evaluated") fail("Malformed task outcome");
    if (turn.sourceSchemaVersion !== 0) validateNativeTurn(turn);
  }
  const turn = latestTurn(worker);
  const expected = {
    turnId: turn.turnId,
    turnCount: worker.turns.length,
    state: turn.state,
    providerState: turn.providerState,
    taskOutcome: turn.taskOutcome,
    threadId: turn.sessionId,
    sessionId: turn.sessionId,
    runnerPid: turn.runnerPid,
    providerPid: turn.providerPid,
    pid: turn.pid,
    cwd: turn.cwd,
    effort: turn.effort,
    sandbox: turn.sandbox,
    bypass: turn.bypass,
    exitCode: turn.exitCode,
    signal: turn.signal,
    errorCode: turn.errorCode,
    error: turn.error,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    finalMessage: turn.finalMessage,
    logs: turn.logs,
    cancel: turn.cancel,
    stdoutPath: turn.stdoutPath,
    stderrPath: turn.stderrPath,
    promptPath: turn.promptPath,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(worker[key]) !== JSON.stringify(value)) fail(`Malformed worker projection: ${key}`);
  }
}

function validateNativeTurn(turn) {
  if (typeof turn.cwd !== "string" || !isAbsolute(turn.cwd) || turn.cwd.includes("\0")) fail("Malformed turn cwd");
  if (!efforts.has(turn.effort)) fail("Malformed turn effort");
  if (turn.sandbox !== "read-only" && turn.sandbox !== "workspace-write") fail("Malformed turn sandbox");
  if (typeof turn.bypass !== "boolean") fail("Malformed turn bypass");
  if (turn.sessionId !== null && typeof turn.sessionId !== "string") fail("Malformed provider session id");
  if (typeof turn.promptSha256 !== "string" || !/^[0-9a-f]{64}$/.test(turn.promptSha256)) fail("Malformed prompt hash");
  if (!Array.isArray(turn.warnings) || turn.warnings.some((warning) => typeof warning !== "string")) fail("Malformed turn warnings");
  for (const [value, label] of [
    [turn.runnerPid, "runner pid"],
    [turn.providerPid, "provider pid"],
    [turn.pid, "compatibility pid"],
  ]) {
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) fail(`Malformed ${label}`);
  }
  if (turn.pid !== turn.runnerPid) fail("Malformed runner pid projection");
  if (turn.cancel !== null) validateCancelReceipt(turn.cancel);
  assertExpectedTurnPath(turn.promptPath, join(promptsRoot, `${turn.turnId}.prompt`), "prompt path");
  assertExpectedTurnPath(turn.promptClaimedPath, join(promptsRoot, `${turn.turnId}.prompt.claimed`), "claimed prompt path");
  assertExpectedTurnPath(turn.stdoutPath, join(logsRoot, `${turn.turnId}.jsonl`), "stdout path");
  assertExpectedTurnPath(turn.stderrPath, join(logsRoot, `${turn.turnId}.stderr.log`), "stderr path");
}

function validateCancelReceipt(cancel) {
  if (!cancel || typeof cancel !== "object" || Array.isArray(cancel)) fail("Malformed cancellation receipt");
  validateUuid(cancel.requestId, "cancel request id");
  if (typeof cancel.requestedAt !== "string") fail("Malformed cancellation request time");
  for (const key of ["acknowledgedAt", "finishedAt"]) {
    if (cancel[key] !== null && typeof cancel[key] !== "string") fail(`Malformed cancellation ${key}`);
  }
  if (!["requested", "terminating", "cancelled", "not_applied", "cancel_failed"].includes(cancel.result)) {
    fail("Malformed cancellation result");
  }
  if (cancel.errorCode !== null && typeof cancel.errorCode !== "string") fail("Malformed cancellation error code");
}

function assertExpectedTurnPath(actual, expected, label) {
  if (typeof actual !== "string") fail(`Malformed ${label}`);
  const actualResolved = resolve(actual);
  const expectedResolved = resolve(expected);
  const same = platform() === "win32"
    ? actualResolved.toLowerCase() === expectedResolved.toLowerCase()
    : actualResolved === expectedResolved;
  if (!same) fail(`Malformed ${label}`);
}

async function writeWorker(worker) {
  await ensureState();
  const normalized = syncProjection(worker);
  validateV2Worker(normalized);
  const target = safeWorkerPath(normalized.workerId);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  let replaced = false;
  try {
    await replaceFileWithRetry(temporary, target);
    replaced = true;
  } finally {
    if (!replaced) await rm(temporary, { force: true }).catch(() => {});
  }
}

async function replaceFileWithRetry(source, target) {
  const deadline = Date.now() + 2_000;
  while (true) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM", "EACCES"].includes(error.code) || Date.now() >= deadline) throw error;
      await delay(10);
    }
  }
}

async function mutateWorker(workerId, mutator) {
  return withWorkerLock(workerId, async ({ worker, token, baseRevision }) => {
    const candidate = await mutator(worker);
    await maybeTestBarrier();
    await verifyLock(workerId, token, baseRevision);
    const current = await readWorker(workerId);
    if (current.revision !== baseRevision) throw new RevisionConflict();
    const next = normalizeWorker(candidate, workerId);
    next.schemaVersion = schemaVersion;
    next.revision = baseRevision + 1;
    await writeWorker(next);
    return { worker: next, changed: true };
  });
}

async function withWorkerLock(workerId, callback) {
  await ensureState();
  const lockPath = safeWorkerPath(workerId, "lock");
  const started = Date.now();
  let handle = null;
  let token = null;
  try {
    while (Date.now() - started <= 2_000) {
      token = randomUUID();
      try {
        handle = await open(lockPath, "wx");
        const worker = await readWorker(workerId);
        const body = { token, pid: process.pid, acquiredAt: new Date().toISOString(), baseRevision: worker.revision };
        await handle.writeFile(`${JSON.stringify(body)}\n`, "utf8");
        return await callback({ worker, token, baseRevision: worker.revision });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        await recoverStaleLock(lockPath);
        await delay(25);
      } finally {
        if (handle) {
          await handle.close().catch(() => {});
          handle = null;
        }
      }
    }
    throw new SidecarError("Timed out acquiring the worker lock", "lock_timeout", 1);
  } finally {
    if (token) await releaseLock(lockPath, token);
  }
}

async function recoverStaleLock(lockPath) {
  let lock = null;
  let acquired = Number.NaN;
  try {
    lock = JSON.parse(await readFile(lockPath, "utf8"));
    acquired = Date.parse(lock.acquiredAt);
  } catch (error) {
    if (error.code === "ENOENT") return;
  }
  if (!Number.isFinite(acquired)) {
    try { acquired = (await stat(lockPath)).mtimeMs; }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
  }
  if (Date.now() - acquired <= 30_000) return;
  if (Number.isSafeInteger(lock?.pid) && lock.pid > 0) {
    const live = await runnerLiveness(lock.pid);
    if (live !== false) return;
  }
  const stale = `${lockPath}.stale-${randomUUID()}`;
  try { await rename(lockPath, stale); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  await rm(stale, { force: true });
}

async function verifyLock(workerId, token, baseRevision) {
  const lockPath = safeWorkerPath(workerId, "lock");
  let lock;
  try { lock = JSON.parse(await readFile(lockPath, "utf8")); }
  catch { throw new RevisionConflict(); }
  if (lock.token !== token || lock.baseRevision !== baseRevision) throw new RevisionConflict();
}

async function releaseLock(lockPath, token) {
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    if (lock.token === token) await rm(lockPath, { force: true });
  } catch (error) {
    if (error.code !== "ENOENT") return;
  }
}

async function runnerLiveness(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return null;
  }
}

async function maybeTestBarrier() {
  const barrier = process.env.LUNA_SIDECAR_TEST_BARRIER;
  if (!barrier || command === "_worker") return;
  const barrierPath = resolve(barrier);
  assertWithin(barrierPath, stateRoot, "test barrier path");
  await writeFile(`${barrierPath}.ready`, `${process.pid}\n`, "utf8");
  while (true) {
    try {
      await readFile(`${barrierPath}.release`, "utf8");
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await delay(10);
    }
  }
}

async function maybeCancelTestBarrier() {
  const barrier = process.env.LUNA_SIDECAR_TEST_CANCEL_BARRIER;
  if (!barrier) return;
  const barrierPath = resolve(barrier);
  assertWithin(barrierPath, stateRoot, "cancel test barrier path");
  await writeFile(`${barrierPath}.ready`, `${process.pid}\n`, "utf8");
  while (true) {
    try {
      await readFile(`${barrierPath}.release`, "utf8");
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await delay(10);
    }
  }
}

async function isProcessGone(pid) {
  return (await runnerLiveness(pid)) === false;
}

async function terminateProviderTree(child) {
  if (!child?.pid) throw new Error("Provider child identity is missing");
  if (platform() === "win32") {
    const result = await spawnAndWait("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
    if (result.code !== 0) throw new Error(`taskkill failed with exit ${result.code}`);
    await waitForClose(child, 3_000);
    if (!(await isProcessGone(child.pid))) throw new Error("Provider root remained alive after taskkill");
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
  const until = Date.now() + 3_000;
  while (Date.now() < until && !(await isProcessGroupGone(child.pid))) await delay(50);
  if (!(await isProcessGroupGone(child.pid))) {
    try { process.kill(-child.pid, "SIGKILL"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  await waitForClose(child, 3_000).catch(() => {});
  if (!(await isProcessGroupGone(child.pid))) throw new Error("Provider process group remained alive");
}

async function isProcessGroupGone(pid) {
  try { process.kill(-pid, 0); return false; }
  catch (error) { return error.code === "ESRCH"; }
}

function spawnAndWait(file, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
}

function onceSpawnOrError(child) {
  return new Promise((resolvePromise) => {
    let settled = false;
    child.once("error", (error) => { if (!settled) { settled = true; resolvePromise({ error }); } });
    child.once("spawn", () => { if (!settled) { settled = true; resolvePromise({ error: null }); } });
  });
}

function onceClose(child) {
  return new Promise((resolvePromise) => child.once("close", (code, signal) => resolvePromise({ code, signal })));
}

function waitForClose(child, timeoutMs) {
  return Promise.race([
    child.__sidecarClosePromise ?? onceClose(child),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Provider close timed out")), timeoutMs)),
  ]);
}

async function readCancelRequest(turnId) {
  try { return JSON.parse(await readFile(cancelRequestPath(turnId), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function waitForFixtureRelease(releasePath) {
  if (!releasePath) return;
  const resolvedRelease = resolve(releasePath);
  assertWithin(resolvedRelease, stateRoot, "fixture barrier path");
  while (true) {
    try {
      await readFile(resolvedRelease, "utf8");
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await delay(10);
    }
  }
}

function reportLaunchError(error) {
  if (error.code === "ENOENT") fail("Codex CLI was not found on PATH. Install it and sign in first.");
  fail(`Could not start Codex: ${error.message}`);
}

function printFailure(commandName, workerId, code, message) {
  print({ schemaVersion, ok: false, command: commandName, workerId, error: { code, message } });
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message, code = null) {
  process.stderr.write(`luna-sidecar: ${message}\n`);
  process.exitCode = 2;
  if (code === "ENOENT") process.exitCode = 2;
  throw new SidecarError(message, code ?? "invalid_input", 2);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

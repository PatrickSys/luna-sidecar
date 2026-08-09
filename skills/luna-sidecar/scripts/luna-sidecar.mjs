#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
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
const commands = new Set(["start", "status", "wait", "resume", "cancel", "stop", "list", "run", "_worker"]);
const managerCommands = new Set(["start", "status", "wait", "resume", "cancel", "stop", "list"]);
const nestedMarkerEnv = "LUNA_SIDECAR_WORKER_MARKER";
const nestedMarkerVersion = 1;
const stdoutCapBytes = 32 * 1024 * 1024;
const stderrCapBytes = 4 * 1024 * 1024;
const terminalRawCapBytes = 256 * 1024 * 1024;
const maxWarnings = 64;
const maxFinalMessageBytes = 1024 * 1024;
const completeLineCapBytes = maxFinalMessageBytes + 64 * 1024;
const rawArgs = process.argv.slice(2);
const invokedToken = rawArgs[0];
const command = commands.has(invokedToken) ? rawArgs.shift() : "run";
const stateRoot = resolve(process.env.LUNA_SIDECAR_HOME ?? defaultStateRoot());
const workersRoot = join(stateRoot, "workers");
const logsRoot = join(stateRoot, "logs");
const promptsRoot = join(stateRoot, "prompts");
const requestsRoot = join(stateRoot, "requests");
const launcherPath = fileURLToPath(import.meta.url);
const globalHelpRequested = invokedToken === "--help";

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

async function main() {
  if (isHelpInvocation(rawArgs)) {
    printHelp(command);
    return;
  }
  assertExecutionAllowed(command);
  if (command === "run") return runForeground(parseTask(rawArgs));
  if (command === "start") return startWorker(parseTask(rawArgs));
  if (command === "status") return showStatus(requireWorkerId(rawArgs));
  if (command === "wait") return waitForWorker(requireWorkerId(rawArgs), parseWait(rawArgs.slice(1)));
  if (command === "resume") return resumeWorker(requireWorkerId(rawArgs), parseTask(rawArgs.slice(1)));
  if (command === "cancel" || command === "stop") return cancelWorker(requireWorkerId(rawArgs));
  if (command === "list") return listWorkers();
  if (command === "_worker") return runWorker(requireWorkerId(rawArgs));
}

function isHelpInvocation(args) {
  if (globalHelpRequested) return true;
  if (!commands.has(invokedToken) || command === "_worker") return false;
  const separator = args.indexOf("--");
  return args.slice(0, separator === -1 ? args.length : separator).includes("--help");
}

function printHelp(commandName) {
  const usage = {
    run: "Usage: luna-sidecar run [options] -- <task>",
    start: "Usage: luna-sidecar start [options] -- <task>",
    status: "Usage: luna-sidecar status <worker-id>",
    wait: "Usage: luna-sidecar wait <worker-id> [--timeout <milliseconds>]",
    resume: "Usage: luna-sidecar resume <worker-id> [options] -- <follow-up>",
    cancel: "Usage: luna-sidecar cancel <worker-id>",
    stop: "Usage: luna-sidecar stop <worker-id> (same lifecycle operation as cancel)",
    list: "Usage: luna-sidecar list",
  };
  if (commandName === "run" && globalHelpRequested) {
    process.stdout.write([
      "luna-sidecar — host-managed Luna workers",
      "",
      "Commands: start, run, status, wait, resume, cancel, stop, list",
      "Use <command> --help for command-specific usage.",
      "",
      "Options: --effort <low|medium|high|xhigh|max>, --read-only, --bypass, --cwd <folder>",
    ].join("\n") + "\n");
    return;
  }
  process.stdout.write(`${usage[commandName] ?? usage.run}\n`);
}

function assertExecutionAllowed(commandName) {
  if (!["start", "run", "resume", "cancel", "stop", "_worker"].includes(commandName)) return;
  const raw = process.env[nestedMarkerEnv];
  if (raw === undefined) return;
  let marker;
  try { marker = JSON.parse(raw); } catch { marker = null; }
  const valid = marker
    && typeof marker === "object"
    && !Array.isArray(marker)
    && marker.version === nestedMarkerVersion
    && Object.keys(marker).sort().join(",") === "turnId,version,workerId"
    && isCanonicalUuid(marker.workerId)
    && isCanonicalUuid(marker.turnId);
  if (!valid) fail("Nested sidecar marker is malformed", "nested_sidecar_marker_malformed");
  fail("Nested sidecar execution is forbidden", "nested_sidecar_forbidden");
}

function isCanonicalUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function runnerEnvironment() {
  const env = { ...process.env };
  delete env[nestedMarkerEnv];
  return env;
}

function providerEnvironment(workerId, turnId) {
  return {
    ...process.env,
    [nestedMarkerEnv]: JSON.stringify({ version: nestedMarkerVersion, workerId, turnId }),
  };
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
    sandbox: task.bypass === true ? "workspace-write" : (task.sandbox ?? previous.sandbox ?? "workspace-write"),
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
    throw new SidecarError("Stored effort is missing or invalid; pass --effort explicitly", "stored_authority", 2);
  }
  if (task.cwd === null && storedCwd === null) {
    throw new SidecarError("Stored cwd is missing or invalid; pass --cwd explicitly", "stored_authority", 2);
  }
  if (task.sandbox === null && task.bypass === null && (storedSandbox === null || storedBypass === null)) {
    throw new SidecarError("Stored authority is missing or invalid; pass --read-only or --bypass explicitly", "stored_authority", 2);
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
    env: providerEnvironment(randomUUID(), randomUUID()),
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
  let worker;
  let workerId;
  await withRetentionLock(async () => {
    await pruneTerminalLogsLocked();
    workerId = randomUUID();
    const cwdRealpath = await safeRealpath(task.cwd);
    const sameCwdWarnings = task.sandbox === "workspace-write"
      ? await sameCwdWriterWarnings(cwdRealpath)
      : [];
    const turn = makeTurn(task, threadId, cwdRealpath, sameCwdWarnings);
    worker = makeWorker(workerId, parentWorkerId, turn);
    try {
      await publishPrompt(turn, task.prompt);
      await writeWorker(worker);
    } catch (error) {
      await cleanupPublishedPrompt(turn);
      throw error;
    }
  });
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

function makeTurn(task, sessionId = null, cwdRealpath = null, initialWarnings = []) {
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
    cwdRealpath,
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
    logs: {
      stdoutPath,
      stderrPath,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutObservedBytes: 0,
      stderrObservedBytes: 0,
      stdoutPersistedBytes: 0,
      stderrPersistedBytes: 0,
      stdoutDroppedBytes: 0,
      stderrDroppedBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      stdoutMissing: false,
      stderrMissing: false,
      truncated: false,
      sealed: false,
      sealedAt: null,
      pruned: false,
      prunedAt: null,
      pruning: false,
      pruningAt: null,
    },
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    exitCode: null,
    signal: null,
    errorCode: null,
    error: null,
    warnings: [...initialWarnings],
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
    env: runnerEnvironment(),
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

  let stdoutWriter = null;
  let stderrWriter = null;
  let child;
  let launchError = null;
  let closeInfo = null;
  let spawnSeen = false;
  let providerCompleted = false;
  let providerFailed = false;
  let finalMessage = null;
  let sessionId = turn.sessionId;
  const warnings = new WarningCollector();
  const stdoutParser = new IncrementalJsonlParser((line, collector) => handleLine(line, collector), warnings);
  let cancelPromise = null;
  let stdinWork = Promise.resolve();
  let streamError = null;
  let stdinError = null;
  let spawnPersistPromise = Promise.resolve();
  let spawnPersistError = null;
  let parserFinished = false;

  const handleLine = (line, warningCollector) => {
    if (!line) return;
    let event;
    try { event = JSON.parse(line); }
    catch { warningCollector.add("malformed_provider_json"); return; }
    if (event.type === "thread.started" && typeof event.thread_id === "string") sessionId = event.thread_id;
    if (event.type === "turn.completed") providerCompleted = true;
    if (event.type === "turn.failed" || event.type === "error") providerFailed = true;
    if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
      finalMessage = utf8Prefix(event.item.text, maxFinalMessageBytes);
      if (finalMessage !== event.item.text) warningCollector.add("final_message_truncated");
    }
    if (event.type === "item.error" || (event.type === "item.completed" && event.item?.type === "error")) {
      warningCollector.add("provider_item_error");
    }
  };

  try {
    stdoutWriter = await CappedRawWriter.open(turn.stdoutPath, stdoutCapBytes);
    stderrWriter = await CappedRawWriter.open(turn.stderrPath, stderrCapBytes);
    child = spawnCodex(
      turn.sessionId ? resumeArgs(turn.sessionId, turn) : execArgs(turn, true),
      {
        cwd: turn.cwd,
        env: providerEnvironment(workerId, turn.turnId),
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
    child.once("spawn", () => {
      spawnSeen = true;
      spawnPersistPromise = persistProviderSpawn(workerId, child.pid, sessionId).catch((error) => {
        spawnPersistError = error;
      });
    });
    child.once("error", (error) => { launchError = error; });
    child.stdout.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stdoutWriter.write(bytes);
      stdoutParser.push(bytes);
      if (stdoutWriter.error) streamError ??= stdoutWriter.error;
    });
    child.stderr.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stderrWriter.write(bytes);
      if (stderrWriter.error) streamError ??= stderrWriter.error;
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
      try {
        await mutateWorker(workerId, (current) => {
          const active = latestTurn(current);
          if (!active) return current;
          active.stdinAcceptedAt = new Date().toISOString();
          return syncProjection(current);
        });
      } catch {
        warnings.add("stdin_receipt_unavailable");
      }
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
    stdoutParser.finish();
    parserFinished = true;
    await Promise.all([stdoutWriter.seal(), stderrWriter.seal(), stdinWork]);
    const stdoutMeta = await stdoutWriter.metadata();
    const stderrMeta = await stderrWriter.metadata();
    streamError ??= stdoutWriter.error ?? stderrWriter.error;
    if (streamError) {
      await persistSealedLogMetadata(workerId, stdoutMeta, stderrMeta);
      throw streamError;
    }
    if (cancelPromise) await cancelPromise;
    await spawnPersistPromise;
    if (spawnPersistError) warnings.add("provider_state_persist_failed");

    if (stdinError && !launchError) {
      await persistRunnerFailure(workerId, "stdin_write_failed", stdinError, spawnSeen ? "failed" : "not_started", stdoutMeta, stderrMeta);
      return;
    }

    const current = await readWorker(workerId);
    if (isTerminal(current.state)) {
      await persistSealedLogMetadata(workerId, stdoutMeta, stderrMeta);
      return;
    }
    if (current.state === "cancelling" && current.cancel?.acknowledgedAt) {
      await finalizeCancelled(workerId, stdoutMeta, stderrMeta);
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
      warnings: warnings.values(),
      stdoutMeta,
      stderrMeta,
    });
  } catch (error) {
    if (child) {
      try {
        if (!closeInfo) await waitForClose(child, 5_000);
        if (!parserFinished) {
          stdoutParser.finish();
          parserFinished = true;
        }
        await Promise.all([stdoutWriter?.seal(), stderrWriter?.seal(), stdinWork]);
        const recoveredStdout = stdoutWriter ? await stdoutWriter.metadata() : emptyLogMetadata();
        const recoveredStderr = stderrWriter ? await stderrWriter.metadata() : emptyLogMetadata();
        streamError ??= stdoutWriter?.error ?? stderrWriter?.error;
        await spawnPersistPromise;
        if (spawnPersistError) warnings.add("provider_state_persist_failed");
        if (!streamError && !stdinError) {
          const recoveredCurrent = await readWorker(workerId);
          if (recoveredCurrent.state === "cancelling" && recoveredCurrent.cancel?.acknowledgedAt) {
            await finalizeCancelled(workerId, recoveredStdout, recoveredStderr);
          } else {
            await finalizeProvider(workerId, {
              spawnSeen,
              launchError,
              closeInfo,
              providerCompleted,
              providerFailed,
              sessionId,
              finalMessage,
              warnings: warnings.values(),
              stdoutMeta: recoveredStdout,
              stderrMeta: recoveredStderr,
            });
          }
          return;
        }
      } catch {
        // The controlled failure below is the durable outcome when recovery cannot seal evidence.
      }
    }
    await stdoutWriter?.seal().catch(() => {});
    await stderrWriter?.seal().catch(() => {});
    const stdoutMeta = stdoutWriter ? await stdoutWriter.metadata() : emptyLogMetadata();
    const stderrMeta = stderrWriter ? await stderrWriter.metadata() : emptyLogMetadata();
    if (spawnSeen) {
      await persistUnknown(workerId, "runner_provider_error", error instanceof Error ? error.message : String(error), null, stdoutMeta, stderrMeta);
    } else {
      await persistRunnerFailure(workerId, "runner_provider_error", error, "not_started", stdoutMeta, stderrMeta);
    }
  } finally {
    await stdoutWriter?.seal().catch(() => {});
    await stderrWriter?.seal().catch(() => {});
  }
}

class WarningCollector {
  constructor() {
    this.items = [];
    this.seen = new Set();
  }

  add(code) {
    if (this.seen.has(code) || this.items.length >= maxWarnings) return;
    this.seen.add(code);
    this.items.push(code);
  }

  values() {
    return [...this.items];
  }
}

class IncrementalJsonlParser {
  constructor(onLine, warningCollector) {
    this.onLine = onLine;
    this.decoder = new StringDecoder("utf8");
    this.tailParts = [];
    this.tailBytes = 0;
    this.warning = warningCollector;
    this.discarding = false;
  }

  push(bytes) {
    this.consume(this.decoder.write(bytes));
  }

  finish() {
    this.consume(this.decoder.end());
    if (this.tailBytes > 0) {
      const line = this.tailParts.join("");
      this.tailParts = [];
      this.tailBytes = 0;
      this.onLine(line, this.warning);
    }
  }

  consume(text) {
    let cursor = 0;
    let newline;
    if (this.discarding) {
      newline = text.indexOf("\n");
      if (newline === -1) return;
      cursor = newline + 1;
      this.discarding = false;
    }
    while ((newline = text.indexOf("\n", cursor)) !== -1) {
      if (this.discarding) {
        cursor = newline + 1;
        this.discarding = false;
        continue;
      }
      const segment = text.slice(cursor, newline);
      cursor = newline + 1;
      if (this.tailBytes + Buffer.byteLength(segment, "utf8") > completeLineCapBytes) {
        this.tailParts = [];
        this.tailBytes = 0;
        this.warning.add("oversized_incomplete_line");
        continue;
      }
      const fragment = this.tailParts.join("") + segment;
      this.tailParts = [];
      this.tailBytes = 0;
      this.onLine(fragment.replace(/\r$/, ""), this.warning);
    }
    const remainder = text.slice(cursor);
    const remainderBytes = Buffer.byteLength(remainder, "utf8");
    if (this.tailBytes + remainderBytes > completeLineCapBytes) {
      this.tailParts = [];
      this.tailBytes = 0;
      this.warning.add("oversized_incomplete_line");
      this.discarding = true;
    } else {
      if (remainder) this.tailParts.push(remainder);
      this.tailBytes += remainderBytes;
    }
  }
}

class CappedRawWriter {
  static async open(filePath, capBytes) {
    return new CappedRawWriter(filePath, await open(filePath, "wx"), capBytes);
  }

  constructor(filePath, handle, capBytes) {
    this.filePath = filePath;
    this.handle = handle;
    this.capBytes = capBytes;
    this.observedBytes = 0;
    this.persistedBytes = 0;
    this.droppedBytes = 0;
    this.pending = null;
    this.inFlight = null;
    this.inFlightBytes = 0;
    this.sealed = false;
    this.closed = false;
    this.sealPromise = null;
    this.closeError = null;
    this.error = null;
  }

  write(bytes) {
    const input = Buffer.from(bytes);
    this.observedBytes += input.length;
    const available = Math.max(0, this.capBytes - this.persistedBytes - this.inFlightBytes - (this.pending?.length ?? 0));
    const queueRoom = Math.max(0, 256 * 1024 - this.inFlightBytes - (this.pending?.length ?? 0));
    if (available === 0 || queueRoom === 0 || this.sealed || this.error) {
      this.droppedBytes += input.length;
      return;
    }
    const accepted = input.subarray(0, Math.min(input.length, available, queueRoom));
    if (accepted.length === 0) {
      this.droppedBytes += input.length;
      return;
    }
    const dropped = input.length - accepted.length;
    if (dropped > 0) this.droppedBytes += dropped;
    if (!this.inFlight) {
      this.schedule(accepted);
      return;
    }
    if (!this.pending) this.pending = Buffer.from(accepted);
    else {
      const room = Math.max(0, 256 * 1024 - this.pending.length);
      const queued = accepted.subarray(0, room);
      this.pending = Buffer.concat([this.pending, queued]);
      this.droppedBytes += accepted.length - queued.length;
    }
  }

  schedule(bytes) {
    this.inFlightBytes = bytes.length;
    this.inFlight = (async () => {
      let next = bytes;
      while (next) {
        const complete = await this.persistBuffer(next);
        if (!complete) {
          if (this.pending) this.droppedBytes += this.pending.length;
          this.pending = null;
          break;
        }
        next = this.pending;
        this.pending = null;
        if (next) this.inFlightBytes = next.length;
      }
      this.inFlightBytes = 0;
    })().finally(() => { this.inFlight = null; });
  }

  async persistBuffer(bytes) {
    let offset = 0;
    while (offset < bytes.length) {
      try {
        const result = await this.handle.write(bytes, offset, bytes.length - offset);
        const written = result.bytesWritten ?? 0;
        if (written <= 0) throw new Error("Raw log write made no progress");
        this.persistedBytes += written;
        offset += written;
      } catch (error) {
        this.error ??= error;
        this.droppedBytes += bytes.length - offset;
        return false;
      }
    }
    return true;
  }

  async seal() {
    if (this.sealPromise) return this.sealPromise;
    this.sealed = true;
    this.sealPromise = (async () => {
      while (this.inFlight) await this.inFlight;
      await this.handle.close().catch((error) => { this.error ??= error; this.closeError = error; });
      this.closed = !this.closeError;
    })();
    return this.sealPromise;
  }

  async metadata() {
    let fileBytes = null;
    try { fileBytes = (await stat(this.filePath)).size; }
    catch (error) { this.error ??= error; }
    if (this.observedBytes !== this.persistedBytes + this.droppedBytes) {
      this.droppedBytes += Math.max(0, this.observedBytes - this.persistedBytes - this.droppedBytes);
      this.error ??= new Error("Raw log byte accounting did not close");
    }
    return {
      observedBytes: this.observedBytes,
      persistedBytes: this.persistedBytes,
      droppedBytes: this.droppedBytes,
      truncated: this.droppedBytes > 0,
      sealed: this.closed,
      fileBytes,
      missing: fileBytes === null,
      accountingValid: this.observedBytes === this.persistedBytes + this.droppedBytes
        && fileBytes === this.persistedBytes,
    };
  }
}

try {
  await main();
} catch (error) {
  if (managerCommands.has(command)) {
    const sidecarError = error instanceof SidecarError
      ? error
      : new SidecarError("Sidecar evidence is unavailable; inspect the local state root and retry", "sidecar_error", 2);
    printFailure(command, null, sidecarError.code, sidecarError.message);
    process.exitCode = Number.isInteger(sidecarError.exitCode) ? sidecarError.exitCode : 2;
  } else {
    process.stderr.write(`luna-sidecar: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = error instanceof SidecarError && Number.isInteger(error.exitCode) ? error.exitCode : 2;
  }
}

async function finalizeCancelled(workerId, stdoutMeta, stderrMeta) {
  const result = await mutateWorker(workerId, (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state) && current.state !== "cancelling") return current;
    turn.state = "cancelled";
    turn.providerState = "unknown";
    turn.completedAt = turn.completedAt ?? new Date().toISOString();
    if (turn.cancel) {
      turn.cancel.finishedAt = turn.completedAt;
      turn.cancel.result = "cancelled";
      turn.cancel.errorCode = null;
    }
    turn.errorCode = null;
    turn.error = null;
    turn.logs = mergeLogMetadata(turn.logs, stdoutMeta, stderrMeta);
    return syncProjection(current);
  });
  const turn = latestTurn(result.worker);
  if (turn) await removeCancelRequest(workerId, turn.turnId);
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
    turn.warnings = boundedWarnings([...(turn.warnings ?? []), ...facts.warnings]);
    turn.logs = mergeLogMetadata(turn.logs, facts.stdoutMeta, facts.stderrMeta);
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
    turn.error = controlledErrorMessage("provider_spawn_failed");
    } else if (facts.providerFailed || (facts.closeInfo?.code ?? 0) !== 0 || facts.closeInfo?.signal) {
      turn.state = "failed";
      turn.providerState = "failed";
      turn.errorCode = facts.providerFailed ? "provider_failed" : "provider_exit_failed";
      turn.error = controlledErrorMessage(turn.errorCode);
    } else if (facts.providerCompleted && facts.closeInfo?.code === 0) {
      turn.state = "completed";
      turn.providerState = "completed";
    } else {
      turn.state = "unknown";
      turn.providerState = "unknown";
      turn.errorCode = "missing_provider_completion";
      turn.error = controlledErrorMessage("missing_provider_completion");
    }
    return syncProjection(current);
  });
  const turn = latestTurn(result.worker);
  if (turn?.cancel?.result === "not_applied") await removeCancelRequest(workerId, turn.turnId);
}

async function persistSealedLogMetadata(workerId, stdoutMeta, stderrMeta) {
  await mutateWorker(workerId, (current) => {
    const turn = latestTurn(current);
    if (!turn) return current;
    turn.logs = mergeLogMetadata(turn.logs, stdoutMeta, stderrMeta);
    return syncProjection(current);
  });
}

function mergeLogMetadata(existing, stdoutMeta, stderrMeta) {
  const sealed = Boolean(stdoutMeta?.sealed && stderrMeta?.sealed && stdoutMeta?.accountingValid && stderrMeta?.accountingValid);
  return {
    ...existing,
    stdoutBytes: stdoutMeta?.observedBytes ?? 0,
    stderrBytes: stderrMeta?.observedBytes ?? 0,
    stdoutObservedBytes: stdoutMeta?.observedBytes ?? 0,
    stderrObservedBytes: stderrMeta?.observedBytes ?? 0,
    stdoutPersistedBytes: stdoutMeta?.persistedBytes ?? 0,
    stderrPersistedBytes: stderrMeta?.persistedBytes ?? 0,
    stdoutDroppedBytes: stdoutMeta?.droppedBytes ?? 0,
    stderrDroppedBytes: stderrMeta?.droppedBytes ?? 0,
    stdoutTruncated: stdoutMeta?.truncated === true,
    stderrTruncated: stderrMeta?.truncated === true,
    stdoutMissing: stdoutMeta?.missing === true,
    stderrMissing: stderrMeta?.missing === true,
    truncated: stdoutMeta?.truncated === true || stderrMeta?.truncated === true,
    sealed,
    sealedAt: sealed ? (existing.sealedAt ?? new Date().toISOString()) : null,
  };
}

function emptyLogMetadata() {
  return { observedBytes: 0, persistedBytes: 0, droppedBytes: 0, truncated: false, sealed: true, fileBytes: 0, missing: true, accountingValid: true };
}

async function persistRunnerFailure(workerId, errorCode, error, providerState = "failed", stdoutMeta = emptyLogMetadata(), stderrMeta = emptyLogMetadata()) {
  await mutateWorker(workerId, (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state)) return current;
    errorCode = normalizeErrorCode(errorCode);
    turn.state = "failed";
    turn.providerState = providerState;
    turn.errorCode = errorCode;
    turn.error = controlledErrorMessage(errorCode);
    turn.logs = mergeLogMetadata(turn.logs, stdoutMeta, stderrMeta);
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
  const cwdRealpath = await safeRealpath(task.cwd);
  const reserveResume = async () => {
    const sameCwdWarnings = task.sandbox === "workspace-write"
      ? await sameCwdWriterWarnings(cwdRealpath, workerId)
      : [];
    return mutateWorker(workerId, async (current) => {
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
        const turn = makeTurn(task, active.sessionId, cwdRealpath, sameCwdWarnings);
        turn.promptBody = task.prompt;
        await publishPrompt(turn, task.prompt);
        publishedTurn = turn;
        current.turns.push(turn);
        return syncProjection(current);
    });
  };
  try {
    const coordination = task.sandbox === "workspace-write";
    result = coordination ? await withRetentionLock(reserveResume) : await reserveResume();
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
  turn.errorCode = normalizeErrorCode(errorCode);
  turn.error = controlledErrorMessage(turn.errorCode);
  turn.completedAt = new Date().toISOString();
  if (turn.logs && !turn.logs.sealed
    && turn.logs.stdoutObservedBytes === 0 && turn.logs.stderrObservedBytes === 0) {
    turn.logs = mergeLogMetadata(turn.logs, emptyLogMetadata(), emptyLogMetadata());
  }
  return syncProjection(worker);
}

async function observeWorker(workerId) {
  const worker = await readWorker(workerId);
  const turn = latestTurn(worker);
  if (!turn || isTerminal(worker.state) || !turn.runnerPid) return worker;
  if (await runnerLiveness(turn.runnerPid) !== false) return worker;
  const projection = structuredClone(worker);
  const projectedTurn = latestTurn(projection);
  projectedTurn.state = "unknown";
  projectedTurn.errorCode = "runner_not_alive";
  projectedTurn.error = controlledErrorMessage("runner_not_alive");
  projectedTurn.warnings = boundedWarnings([...(projectedTurn.warnings ?? []), "runner_not_alive"]);
  syncProjection(projection);
  return projection;
}

async function showStatus(workerId) {
  print(workerView(await observeWorker(workerId)));
}

async function waitForWorker(workerId, { timeoutMs }) {
  const deadline = timeoutMs === 0 ? null : performance.now() + timeoutMs;
  while (true) {
    const worker = await observeWorker(workerId);
    if (isTerminal(worker.state)) {
      const view = workerView(worker);
      view.timedOut = false;
      print(view);
      return;
    }
    if (deadline !== null && performance.now() >= deadline) {
      const boundary = await observeWorker(workerId);
      const view = workerView(boundary);
      view.timedOut = !isTerminal(boundary.state);
      print(view);
      return;
    }
    const remaining = deadline === null ? 250 : Math.max(0, deadline - performance.now());
    await delay(Math.min(250, remaining));
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
      active.providerState = "unknown";
      active.cancel.result = "terminating";
      return syncProjection(latest);
    });
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
      turn.logs = mergeLogMetadata(turn.logs, emptyLogMetadata(), emptyLogMetadata());
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
    turn.logs = mergeLogMetadata(turn.logs, emptyLogMetadata(), emptyLogMetadata());
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

async function persistUnknown(workerId, errorCode, message, cancelResult = null, stdoutMeta = null, stderrMeta = null) {
  const result = await mutateWorker(workerId, (current) => {
    const turn = latestTurn(current);
    if (!turn || isTerminal(current.state)) return current;
    errorCode = normalizeErrorCode(errorCode);
    markUnknown(current, errorCode, message);
    if (stdoutMeta || stderrMeta) turn.logs = mergeLogMetadata(turn.logs, stdoutMeta ?? emptyLogMetadata(), stderrMeta ?? emptyLogMetadata());
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

async function safeRealpath(cwd) {
  try { return await realpath(cwd); }
  catch { return null; }
}

function normalizedPath(value) {
  if (typeof value !== "string") return null;
  const resolvedValue = resolve(value);
  return platform() === "win32" ? resolvedValue.toLowerCase() : resolvedValue;
}

async function sameCwdWriterWarnings(cwdRealpath, excludeWorkerId = null) {
  const warnings = [];
  if (!cwdRealpath) return ["cwd_realpath_unavailable"];
  let files;
  try { files = (await readdir(workersRoot)).filter((file) => file.endsWith(".json")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const ids = [];
  for (const file of files) {
    const id = file.slice(0, -5);
    if (id === excludeWorkerId) continue;
    try {
      const worker = await readWorker(id);
      const turn = latestTurn(worker);
      if (!turn || isTerminal(worker.state) || turn.sandbox !== "workspace-write") continue;
      const candidateRealpath = turn.cwdRealpath ?? await safeRealpath(turn.cwd);
      if (!candidateRealpath) {
        warnings.push("cwd_realpath_unavailable");
        continue;
      }
      if (normalizedPath(candidateRealpath) === normalizedPath(cwdRealpath)) ids.push(worker.workerId);
    } catch (error) {
      if (error.code !== "ENOENT") continue;
    }
  }
  ids.sort();
  return boundedWarnings([...warnings, ...(ids.length ? [`active_same_cwd_writers:${ids.join(",")}`] : [])]);
}

async function pruneTerminalLogsLocked() {
  let candidates = await collectPruneCandidates();
  for (const candidate of candidates.filter((value) => value.eligible && value.pruning)) {
    await pruneOneTerminalTurn(candidate);
  }
  candidates = await collectPruneCandidates();
  for (const candidate of candidates.filter((value) => value.eligible && !value.pruning && value.missing)) {
    await reconcileMissingEvidence(candidate);
  }
  candidates = await collectPruneCandidates();
  let total = candidates.reduce((sum, candidate) => sum + candidate.bytes, 0);
  for (const candidate of candidates
    .filter((value) => value.eligible && !value.pruning)
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))) {
    if (total <= terminalRawCapBytes) break;
    const before = candidate.bytes;
    if (await pruneOneTerminalTurn(candidate)) total -= before;
  }
}

async function collectPruneCandidates() {
  let files;
  try { files = (await readdir(workersRoot)).filter((file) => file.endsWith(".json")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const candidates = [];
  for (const file of files) {
    const workerId = file.slice(0, -5);
    const worker = await readWorker(workerId).catch(() => null);
    if (!worker) continue;
    for (const turn of worker.turns ?? []) {
      if (!turn || !isTerminal(turn.state) || !worker.workerId) continue;
      const paths = [turn.stdoutPath, turn.stderrPath];
      if (!paths.every((value, index) => isCanonicalLogPath(value, turn.turnId, index === 0 ? "jsonl" : "stderr.log"))) continue;
      const sizes = await Promise.all(paths.map(rawFileSize));
      if (sizes.some((value) => value === null)) continue;
      candidates.push({
        workerId,
        turnId: turn.turnId,
        eligible: pruneEligible(worker, turn),
        pruning: turn.logs?.pruning === true,
        stdoutMissing: sizes[0].missing,
        stderrMissing: sizes[1].missing,
        missing: sizes.some((value) => value.missing),
        bytes: sizes.reduce((sum, value) => sum + value.bytes, 0),
        sortKey: `${turn.completedAt ?? turn.createdAt ?? ""}\u0000${workerId}\u0000${turn.turnId}`,
      });
    }
  }
  return candidates;
}

async function reconcileMissingEvidence(candidate) {
  await mutateWorker(candidate.workerId, (worker) => {
    const active = worker.turns.find((value) => value.turnId === candidate.turnId);
    if (!active || !pruneEligible(worker, active)) return worker;
    active.logs.stdoutMissing = candidate.stdoutMissing;
    active.logs.stderrMissing = candidate.stderrMissing;
    return syncProjection(worker);
  }).catch(() => null);
}

async function pruneOneTerminalTurn(candidate) {
  const intent = await mutateWorker(candidate.workerId, (worker) => {
    const active = worker.turns.find((value) => value.turnId === candidate.turnId);
    if (!active || !pruneEligible(worker, active)) return worker;
    active.logs.pruning = true;
    active.logs.pruningAt = new Date().toISOString();
    return syncProjection(worker);
  }).catch(() => null);
  if (!intent) return false;
  const current = await readWorker(candidate.workerId).catch(() => null);
  const turn = current?.turns?.find((value) => value.turnId === candidate.turnId);
  if (!turn || !pruneEligible(current, turn)) return false;
  const paths = [turn.stdoutPath, turn.stderrPath];
  const sizes = await Promise.all(paths.map(rawFileSize));
  if (sizes.some((value) => value === null)) return false;
  let failed = false;
  for (const [index, target] of paths.entries()) {
    if (sizes[index].missing) continue;
    try { await rm(target, { force: true }); }
    catch { failed = true; }
  }
  const after = await Promise.all(paths.map(rawFileSize));
  const absent = after.every((value) => value?.missing === true);
  const result = await mutateWorker(candidate.workerId, (worker) => {
    const active = worker.turns.find((value) => value.turnId === candidate.turnId);
    if (!active || !pruneEligible(worker, active)) return worker;
    active.logs.stdoutMissing = after[0]?.missing === true;
    active.logs.stderrMissing = after[1]?.missing === true;
    if (!failed && absent) {
      active.logs.pruned = true;
      active.logs.prunedAt = new Date().toISOString();
      active.logs.pruning = false;
      active.logs.pruningAt = null;
    } else {
      active.warnings = boundedWarnings([...(active.warnings ?? []), "raw_log_prune_failed"]);
    }
    return syncProjection(worker);
  }).catch(() => null);
  return Boolean(result && !failed && absent);
}

function pruneEligible(worker, turn) {
  return turn
    && turn.sourceSchemaVersion !== 0
    && isTerminal(turn.state)
    && turn.logs?.sealed === true
    && !turn.logs?.pruned
    && worker?.workerId;
}

function isCanonicalLogPath(value, turnId, suffix) {
  if (typeof value !== "string") return false;
  const expected = resolve(logsRoot, `${turnId}.${suffix}`);
  const actual = resolve(value);
  return platform() === "win32" ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
}

async function rawFileSize(filePath) {
  try {
    const details = await stat(filePath);
    return details.isFile() ? { bytes: details.size, missing: false } : null;
  } catch (error) {
    if (error.code === "ENOENT") return { bytes: 0, missing: true };
    return null;
  }
}

async function withRetentionLock(callback) {
  await ensureState();
  const target = resolve(stateRoot, "retention.lock");
  assertWithin(target, stateRoot, "retention lock path");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    let handle = null;
    let created = false;
    let tokenWritten = false;
    const token = randomUUID();
    try {
      handle = await open(target, "wx");
      created = true;
      await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, token, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
      tokenWritten = true;
      return await callback();
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await recoverRetentionLock(target);
      await delay(10);
    } finally {
      await handle?.close().catch(() => {});
      if (created && !tokenWritten) await rm(target, { force: true }).catch(() => {});
      else if (tokenWritten) await removeOwnedRetentionLock(target, token);
    }
  }
  throw new SidecarError("Timed out acquiring retention lock", "retention_lock_timeout", 1);
}

async function recoverRetentionLock(target) {
  let raw = null;
  let details;
  try {
    raw = await readFile(target, "utf8");
    details = await stat(target);
  } catch (error) {
    if (error.code === "ENOENT") return;
    return;
  }
  let lock = null;
  try { lock = JSON.parse(raw); } catch {}
  const acquiredAt = typeof lock?.acquiredAt === "string" ? Date.parse(lock.acquiredAt) : details.mtimeMs;
  if (lock && lock.schemaVersion === 1 && typeof lock.token === "string" && Number.isSafeInteger(lock.pid) && lock.pid > 0) {
    const live = await runnerLiveness(lock.pid);
    if (live === false) {
      // A definitely dead valid owner is recoverable immediately.
    } else return;
  } else if (Date.now() - details.mtimeMs <= 30_000) {
    return;
  }
  if (!(lock && lock.schemaVersion === 1 && typeof lock.token === "string" && Number.isSafeInteger(lock.pid) && lock.pid > 0)
    && (!Number.isFinite(acquiredAt) || Date.now() - acquiredAt <= 30_000)) return;
  const stale = `${target}.stale-${randomUUID()}`;
  try { await rename(target, stale); await rm(stale, { force: true }); } catch {}
}

async function removeOwnedRetentionLock(target, token) {
  try {
    const lock = JSON.parse(await readFile(target, "utf8"));
    if (lock?.token === token) await rm(target, { force: true });
  } catch {}
}

async function listWorkers() {
  let files;
  try { files = (await readdir(workersRoot)).filter((file) => file.endsWith(".json")); }
  catch (error) {
    if (error.code === "ENOENT") { print([]); return; }
    throw error;
  }
  const workers = [];
  for (const file of files) {
    const view = workerView(await observeWorker(file.slice(0, -5)));
    delete view.turns;
    workers.push(view);
  }
  print(workers.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
}

function workerView(worker) {
  const turn = latestTurn(worker);
  const turns = (worker.turns ?? []).map(compactTurnView);
  return {
    schemaVersion,
    workerId: worker.workerId,
    id: worker.workerId,
    turnId: turn?.turnId ?? null,
    turnCount: turns.length,
    turns,
    state: turn ? turn.state : (worker.state ?? "unknown"),
    providerState: turn ? turn.providerState : (worker.providerState ?? "unknown"),
    taskOutcome: turn ? turn.taskOutcome : (worker.taskOutcome ?? "not_evaluated"),
    sessionId: turn ? turn.sessionId : (worker.threadId ?? null),
    threadId: turn ? turn.sessionId : (worker.threadId ?? null),
    parentWorkerId: worker.parentWorkerId ?? null,
    pid: turn ? turn.pid : (worker.pid ?? null),
    runnerPid: turn ? turn.runnerPid : (worker.runnerPid ?? null),
    providerPid: turn ? turn.providerPid : (worker.providerPid ?? null),
    cwd: turn ? turn.cwd : (worker.cwd ?? null),
    cwdRealpath: turn ? (turn.cwdRealpath ?? null) : null,
    effort: turn ? turn.effort : (worker.effort ?? null),
    sandbox: turn ? turn.sandbox : (worker.sandbox ?? null),
    bypass: turn ? turn.bypass : (worker.bypass ?? false),
    exitCode: turn ? turn.exitCode : (worker.exitCode ?? null),
    signal: turn ? turn.signal : (worker.signal ?? null),
    errorCode: turn ? turn.errorCode : (worker.errorCode ?? null),
    error: turn ? turn.error : (worker.error ?? null),
    warnings: boundedWarnings([...(worker.warnings ?? []), ...(turn?.warnings ?? [])]),
    createdAt: worker.createdAt,
    startedAt: turn ? turn.startedAt : (worker.startedAt ?? null),
    completedAt: turn ? turn.completedAt : (worker.completedAt ?? null),
    finalMessage: turn ? turn.finalMessage : (worker.finalMessage ?? null),
    promptSha256: turn ? turn.promptSha256 : null,
    stdoutPath: turn ? turn.stdoutPath : (worker.stdoutPath ?? null),
    stderrPath: turn ? turn.stderrPath : (worker.stderrPath ?? null),
    promptPath: turn ? turn.promptPath : (worker.promptPath ?? null),
    logs: turn ? turn.logs : (worker.logs ?? null),
    cancel: turn ? turn.cancel : (worker.cancel ?? null),
  };
}

function compactTurnView(turn) {
  return {
    turnId: turn.turnId,
    sessionId: turn.sessionId ?? null,
    state: turn.state,
    providerState: turn.providerState,
    taskOutcome: "not_evaluated",
    runnerPid: turn.runnerPid ?? null,
    providerPid: turn.providerPid ?? null,
    pid: turn.pid ?? null,
    cwd: turn.cwd ?? null,
    cwdRealpath: turn.cwdRealpath ?? null,
    effort: turn.effort ?? null,
    sandbox: turn.sandbox ?? null,
    bypass: turn.bypass ?? false,
    promptSha256: turn.promptSha256 ?? null,
    promptClaimedAt: turn.promptClaimedAt ?? null,
    stdinAcceptedAt: turn.stdinAcceptedAt ?? null,
    stdoutPath: turn.stdoutPath ?? null,
    stderrPath: turn.stderrPath ?? null,
    promptPath: turn.promptPath ?? null,
    logs: turn.logs ?? null,
    createdAt: turn.createdAt ?? null,
    startedAt: turn.startedAt ?? null,
    completedAt: turn.completedAt ?? null,
    exitCode: turn.exitCode ?? null,
    signal: turn.signal ?? null,
    errorCode: turn.errorCode ?? null,
    error: turn.error ?? null,
    warnings: boundedWarnings(turn.warnings ?? []),
    finalMessage: turn.finalMessage ?? null,
    cancel: turn.cancel ?? null,
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
    "logs", "cancel", "cwdRealpath",
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
    if (error.code === "ENOENT") throw new SidecarError(`Unknown worker: ${workerId}`, "unknown_worker", 2);
    throw error;
  }
}

function normalizeWorker(raw, requestedId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Malformed worker manifest");
  const workerId = raw.workerId ?? raw.id;
  validateUuid(workerId, "worker id");
  if (workerId !== requestedId) fail(`Worker path identity mismatch: ${requestedId}`);
  if (raw.schemaVersion === schemaVersion) {
    const normalized = normalizeV2Worker(raw, workerId);
    validateV2Worker(normalized);
    return normalized;
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
    cwdRealpath: null,
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
    logs: normalizeLogs(raw.logs, raw.stdoutPath, raw.stderrPath),
    createdAt: raw.createdAt,
    startedAt: null,
    completedAt: raw.completedAt ?? null,
    exitCode: raw.exitCode ?? null,
    signal: raw.signal ?? null,
    errorCode: raw.errorCode ? normalizeErrorCode(raw.errorCode) : null,
    error: raw.errorCode ? controlledErrorMessage(normalizeErrorCode(raw.errorCode)) : null,
    warnings: boundedWarnings(raw.warnings ?? []),
    finalMessage: safeFinalMessage(raw.finalMessage),
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

function normalizeV2Worker(raw, workerId) {
  const turns = Array.isArray(raw.turns) ? raw.turns.map(normalizeTurnRecord) : [];
  return syncProjection({
    schemaVersion,
    revision: raw.revision,
    workerId,
    id: workerId,
    parentWorkerId: raw.parentWorkerId ?? null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    ...(raw.migratedFromSchemaVersion === 0 ? { migratedFromSchemaVersion: 0 } : {}),
    turns,
    warnings: boundedWarnings(raw.warnings ?? []),
  });
}

function normalizeTurnRecord(raw) {
  const stdoutPath = raw?.stdoutPath ?? raw?.logs?.stdoutPath;
  const stderrPath = raw?.stderrPath ?? raw?.logs?.stderrPath;
  const turn = {
    ...(raw?.sourceSchemaVersion === 0 ? { sourceSchemaVersion: 0 } : {}),
    turnId: raw?.turnId,
    sessionId: typeof raw?.sessionId === "string" ? raw.sessionId : null,
    state: raw?.state ?? "unknown",
    providerState: raw?.providerState ?? "unknown",
    taskOutcome: "not_evaluated",
    runnerPid: raw?.runnerPid ?? null,
    providerPid: raw?.providerPid ?? null,
    pid: raw?.pid ?? raw?.runnerPid ?? null,
    cwd: raw?.cwd,
    cwdRealpath: typeof raw?.cwdRealpath === "string" ? raw.cwdRealpath : null,
    effort: raw?.effort,
    sandbox: raw?.sandbox,
    bypass: raw?.bypass ?? false,
    promptPath: raw?.promptPath,
    promptClaimedPath: raw?.promptClaimedPath ?? null,
    promptSha256: raw?.promptSha256 ?? null,
    promptClaimedAt: raw?.promptClaimedAt ?? null,
    stdinAcceptedAt: raw?.stdinAcceptedAt ?? null,
    stdoutPath,
    stderrPath,
    logs: normalizeLogs(raw?.logs, stdoutPath, stderrPath),
    createdAt: raw?.createdAt,
    startedAt: raw?.startedAt ?? null,
    completedAt: raw?.completedAt ?? null,
    exitCode: raw?.exitCode ?? null,
    signal: raw?.signal ?? null,
    errorCode: typeof raw?.errorCode === "string" ? normalizeErrorCode(raw.errorCode) : null,
    error: typeof raw?.errorCode === "string" ? controlledErrorMessage(normalizeErrorCode(raw.errorCode)) : null,
    warnings: boundedWarnings(raw?.warnings ?? []),
    finalMessage: safeFinalMessage(raw?.finalMessage),
    cancel: normalizeCancel(raw?.cancel),
  };
  return turn;
}

function normalizeLogs(raw = {}, stdoutPath = null, stderrPath = null) {
  return {
    stdoutPath: raw?.stdoutPath ?? stdoutPath,
    stderrPath: raw?.stderrPath ?? stderrPath,
    stdoutBytes: Number.isSafeInteger(raw?.stdoutBytes) && raw.stdoutBytes >= 0 ? raw.stdoutBytes : 0,
    stderrBytes: Number.isSafeInteger(raw?.stderrBytes) && raw.stderrBytes >= 0 ? raw.stderrBytes : 0,
    stdoutObservedBytes: Number.isSafeInteger(raw?.stdoutObservedBytes) ? raw.stdoutObservedBytes : (raw?.stdoutBytes ?? 0),
    stderrObservedBytes: Number.isSafeInteger(raw?.stderrObservedBytes) ? raw.stderrObservedBytes : (raw?.stderrBytes ?? 0),
    stdoutPersistedBytes: Number.isSafeInteger(raw?.stdoutPersistedBytes) ? raw.stdoutPersistedBytes : (raw?.stdoutBytes ?? 0),
    stderrPersistedBytes: Number.isSafeInteger(raw?.stderrPersistedBytes) ? raw.stderrPersistedBytes : (raw?.stderrBytes ?? 0),
    stdoutDroppedBytes: Number.isSafeInteger(raw?.stdoutDroppedBytes) ? raw.stdoutDroppedBytes : 0,
    stderrDroppedBytes: Number.isSafeInteger(raw?.stderrDroppedBytes) ? raw.stderrDroppedBytes : 0,
    stdoutTruncated: raw?.stdoutTruncated === true,
    stderrTruncated: raw?.stderrTruncated === true,
    stdoutMissing: raw?.stdoutMissing === true,
    stderrMissing: raw?.stderrMissing === true,
    truncated: raw?.truncated === true,
    sealed: raw?.sealed === true,
    sealedAt: typeof raw?.sealedAt === "string" ? raw.sealedAt : null,
    pruned: raw?.pruned === true,
    prunedAt: typeof raw?.prunedAt === "string" ? raw.prunedAt : null,
    pruning: raw?.pruning === true,
    pruningAt: typeof raw?.pruningAt === "string" ? raw.pruningAt : null,
  };
}

function normalizeCancel(raw) {
  if (!raw) return null;
  return {
    requestId: raw.requestId,
    requestedAt: raw.requestedAt,
    acknowledgedAt: raw.acknowledgedAt ?? null,
    finishedAt: raw.finishedAt ?? null,
    result: raw.result,
    errorCode: raw.errorCode ? normalizeErrorCode(raw.errorCode) : null,
  };
}

function boundedWarnings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values ?? []) {
    if (typeof value !== "string" || value.length > 160 || !/^[a-z0-9_]+(?::[a-z0-9_,\-]+)?$/.test(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= maxWarnings) break;
  }
  return result;
}

function safeFinalMessage(value) {
  if (typeof value !== "string") return null;
  return utf8Prefix(value, maxFinalMessageBytes);
}

function utf8Prefix(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

function controlledErrorMessage(code) {
  const messages = {
    sidecar_error: "Sidecar evidence is unavailable",
    legacy_runner_unsupported: "A legacy turn cannot be replayed by the v2 runner",
    runner_ownership_invalid: "Runner ownership could not be established",
    prompt_already_claimed: "Prompt replay is forbidden",
    provider_spawn_failed: "Provider did not start",
    provider_failed: "Provider reported a fatal failure",
    provider_exit_failed: "Provider exited unsuccessfully",
    missing_provider_completion: "Provider closed without a terminal completion event",
    runner_provider_error: "The runner could not safely materialize provider evidence",
    runner_startup_error: "The runner failed before provider launch",
    runner_spawn_failed: "The sidecar runner did not start",
    prompt_claim_failed: "The runner could not claim the prompt",
    prompt_missing_after_claim: "The claimed prompt was unavailable",
    stdin_write_failed: "The provider prompt could not be delivered",
    runner_not_alive: "The recorded runner is no longer alive",
    cancel_failed: "Cancellation could not be verified",
    cancel_timeout: "Cancellation is still pending",
    revision_conflict: "Worker changed while the mutation was in progress",
  };
  return code && messages[code] ? messages[code] : (code ? "Sidecar evidence is unavailable" : null);
}

function normalizeErrorCode(code) {
  return typeof code === "string" && controlledErrorMessage(code) !== "Sidecar evidence is unavailable"
    ? code
    : "sidecar_error";
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
    cwdRealpath: turn.cwdRealpath,
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
  if (turn.cwdRealpath !== null && (typeof turn.cwdRealpath !== "string" || !isAbsolute(turn.cwdRealpath))) fail("Malformed turn cwd realpath");
  if (!efforts.has(turn.effort)) fail("Malformed turn effort");
  if (turn.sandbox !== "read-only" && turn.sandbox !== "workspace-write") fail("Malformed turn sandbox");
  if (typeof turn.bypass !== "boolean") fail("Malformed turn bypass");
  if (turn.bypass && turn.sandbox !== "workspace-write") fail("Malformed bypass authority receipt");
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
  validateLogs(turn.logs, turn.turnId);
  assertExpectedTurnPath(turn.promptPath, join(promptsRoot, `${turn.turnId}.prompt`), "prompt path");
  assertExpectedTurnPath(turn.promptClaimedPath, join(promptsRoot, `${turn.turnId}.prompt.claimed`), "claimed prompt path");
  assertExpectedTurnPath(turn.stdoutPath, join(logsRoot, `${turn.turnId}.jsonl`), "stdout path");
  assertExpectedTurnPath(turn.stderrPath, join(logsRoot, `${turn.turnId}.stderr.log`), "stderr path");
}

function validateLogs(logs, turnId) {
  if (!logs || typeof logs !== "object" || Array.isArray(logs)) fail("Malformed log metadata");
  for (const key of [
    "stdoutBytes", "stderrBytes", "stdoutObservedBytes", "stderrObservedBytes",
    "stdoutPersistedBytes", "stderrPersistedBytes", "stdoutDroppedBytes", "stderrDroppedBytes",
  ]) {
    if (!Number.isSafeInteger(logs[key]) || logs[key] < 0) fail(`Malformed log byte count: ${key}`);
  }
  for (const key of ["stdoutTruncated", "stderrTruncated", "stdoutMissing", "stderrMissing", "truncated", "sealed", "pruned", "pruning"]) {
    if (typeof logs[key] !== "boolean") fail(`Malformed log flag: ${key}`);
  }
  for (const key of ["sealedAt", "prunedAt", "pruningAt"]) {
    if (logs[key] !== null && typeof logs[key] !== "string") fail(`Malformed log timestamp: ${key}`);
  }
  if (logs.stdoutPersistedBytes > logs.stdoutObservedBytes || logs.stderrPersistedBytes > logs.stderrObservedBytes) fail("Malformed persisted log byte count");
  if (logs.stdoutDroppedBytes > logs.stdoutObservedBytes || logs.stderrDroppedBytes > logs.stderrObservedBytes) fail("Malformed dropped log byte count");
  if (logs.stdoutObservedBytes !== logs.stdoutPersistedBytes + logs.stdoutDroppedBytes || logs.stderrObservedBytes !== logs.stderrPersistedBytes + logs.stderrDroppedBytes) fail("Malformed log accounting");
  if (logs.stdoutTruncated !== (logs.stdoutDroppedBytes > 0) || logs.stderrTruncated !== (logs.stderrDroppedBytes > 0)) fail("Malformed log truncation truth");
  if (logs.truncated !== (logs.stdoutTruncated || logs.stderrTruncated)) fail("Malformed aggregate log truncation truth");
  if (logs.sealed && !logs.sealedAt) fail("Sealed logs need a timestamp");
  if (logs.pruned && !logs.prunedAt) fail("Pruned logs need a timestamp");
  if (logs.pruning && !logs.pruningAt) fail("Pruning logs need a timestamp");
  if (logs.pruned && logs.pruning) fail("Pruned logs cannot retain pruning intent");
  assertExpectedTurnPath(logs.stdoutPath, join(logsRoot, `${turnId}.jsonl`), "stdout log metadata path");
  assertExpectedTurnPath(logs.stderrPath, join(logsRoot, `${turnId}.stderr.log`), "stderr log metadata path");
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

function spawnAndWait(file, args, timeoutMs = 3_000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { stdio: "ignore", windowsHide: true });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${file} did not exit within ${timeoutMs} ms`));
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
      resolvePromise({ code, signal });
    });
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
  throw new SidecarError(message, code ?? "invalid_input", 2);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

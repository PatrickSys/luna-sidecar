import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join, resolve, toNamespacedPath } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CEILINGS_MS,
  EXPECTED_CI_JOB_NAMES,
  assertPathWithin,
  assertCopiedLauncher,
  buildInstallerEnvironment,
  buildProviderEnvironment,
  cancellationPredicate,
  canonicalEvidenceJson,
  cleanupRun,
  createRedactedRecord,
  evaluateCleanupFacts,
  failedMarkerCommandPredicate,
  installCopiedSkills,
  isPathWithin,
  ownedProcessIdentityMatches,
  orchestrateReleaseSmoke,
  redactEvidence,
  renderEvidenceMarkdown,
  runCapturedCommand,
  runLiveScenarios,
  successfulNativeChildPredicate,
  validateCancellationOutcome,
  validateCiEvidence,
  validateLogIntegrity,
  validateWaitOutcome,
} from "../scripts/release-smoke.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const installerPath = join(repositoryRoot, "node_modules", "skills", "bin", "cli.mjs");

test("release smoke refuses missing live mode before any command spawn", async () => {
  let spawned = 0;
  await assert.rejects(orchestrateReleaseSmoke({ live: false, run: async () => { spawned += 1; } }), /argument_invalid/);
  assert.equal(spawned, 0);
});

test("release smoke refuses recursive sidecar execution before any command spawn", async () => {
  let spawned = 0;
  await assert.rejects(orchestrateReleaseSmoke({
    live: true,
    testedCommit: "a".repeat(40),
    ciRunId: "42",
    environment: { LUNA_SIDECAR_WORKER_MARKER: "{}" },
    run: async () => { spawned += 1; },
  }), /nested_sidecar_forbidden/);
  assert.equal(spawned, 0);
});

test("unsafe scope and source launcher fallback fail before provider spawn", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna release scope-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  assert.equal(isPathWithin(toNamespacedPath(resolve(root)), join(root, "inside")), true);
  assert.throws(() => assertPathWithin(root, join(root, "..", "outside")), /scratch_invalid/);
  let spawned = 0;
  await assert.rejects(runLiveScenarios({
    launcher: join(repositoryRoot, "skills", "luna-sidecar", "scripts", "luna-sidecar.mjs"),
    roots: { project: root },
    env: {},
    deadline: { at: Date.now() + CEILINGS_MS.outer, timedOut: false },
    run: async () => { spawned += 1; return { code: 0, signal: null, timedOut: false, stdout: "{}" }; },
  }), /source_launcher_fallback/);
  assert.equal(spawned, 0);
});

test("one outer deadline marks a command timed out permanently", async () => {
  const deadline = { at: Date.now() + 25, timedOut: false };
  const commandLog = [];
  const result = await runCapturedCommand(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], { deadline, commandLog, commandName: "codex-version" });
  assert.equal(result.timedOut, true);
  assert.equal(result.outerTimedOut, true);
  assert.equal(deadline.timedOut, true);
  assert.equal(commandLog.length, 1);
});

test("wait timeout and unknown outcomes never satisfy completion", () => {
  assert.equal(validateWaitOutcome({ timedOut: true, code: 0, stdout: "{}" }), false);
  assert.equal(validateWaitOutcome({ timedOut: false, code: 0, stdout: JSON.stringify({ timedOut: false, state: "unknown" }) }), false);
  assert.equal(validateWaitOutcome({ timedOut: false, code: 0, stdout: JSON.stringify({ timedOut: false, state: "completed" }) }), true);
});

test("log integrity rejects path escape and accepts sealed byte-consistent logs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna release logs-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const state = join(root, "state");
  const logs = join(state, "logs");
  await mkdir(logs, { recursive: true });
  const turnId = "turn-1";
  const stdoutPath = join(logs, `${turnId}.jsonl`);
  const stderrPath = join(logs, `${turnId}.stderr.log`);
  const stdout = `{"type":"turn.completed"}\n`;
  await writeFile(stdoutPath, stdout, "utf8");
  await writeFile(stderrPath, "", "utf8");
  const receipt = {
    turnId,
    logs: {
      stdoutPath,
      stderrPath,
      stdoutBytes: Buffer.byteLength(stdout),
      stderrBytes: 0,
      stdoutObservedBytes: Buffer.byteLength(stdout),
      stderrObservedBytes: 0,
      stdoutPersistedBytes: Buffer.byteLength(stdout),
      stderrPersistedBytes: 0,
      stdoutDroppedBytes: 0,
      stderrDroppedBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      stdoutMissing: false,
      stderrMissing: false,
      truncated: false,
      sealed: true,
      sealedAt: new Date().toISOString(),
      pruned: false,
      pruning: false,
    },
  };
  await validateLogIntegrity(receipt, state);
  await assert.rejects(validateLogIntegrity({ ...receipt, logs: { ...receipt.logs, stdoutPath: join(root, "outside.jsonl") } }, state), /log_integrity_failed/);
});

test("cancellation failure and cleanup uncertainty are permanently false", () => {
  assert.equal(validateCancellationOutcome({ state: "unknown", cancel: { result: "cancel_failed" }, taskOutcome: "not_evaluated" }), false);
  assert.equal(cancellationPredicate({ providerPid: 4, providerRunning: true, acknowledged: true, state: "cancelled", result: "cancel_failed", knownOwnedPidsGone: true }), false);
  const evaluated = evaluateCleanupFacts({ launchedWorkerCount: 1, discoveredWorkerCount: 1, ownedPidCount: 1, stopFailures: 1, identityUncertain: 1, identityMismatches: 1, lingeringPids: 1, recoveryUsed: true, scratchCleanupFailed: true });
  assert.equal(evaluated.releaseReady, false);
  assert.deepEqual(new Set(evaluated.gaps), new Set(["cleanup_stop_failed", "cleanup_identity_uncertain", "cleanup_identity_mismatch", "cleanup_pid_lingering", "cleanup_recovery_used", "scratch_cleanup_failed"]));
  assert.equal(evaluateCleanupFacts({}).releaseReady, false);
  assert.equal(ownedProcessIdentityMatches({ exists: true, uncertain: false, pid: 4, cwd: "C:\\scratch\\project", commandLine: "other.exe" }, { pid: 4, expectedCwd: "C:\\scratch\\project", commandToken: "luna-sidecar" }), false);
});

test("CI mismatch, installer failure, and manifest drift remain gaps", async (t) => {
  const commit = "c".repeat(40);
  const badCi = validateCiEvidence({ headSha: "d".repeat(40), status: "completed", conclusion: "success", jobs: [] }, commit);
  assert.deepEqual(badCi, { valid: false, code: "ci_head_mismatch" });
  const missingJobIds = validateCiEvidence({ headSha: commit, status: "completed", conclusion: "success", jobs: EXPECTED_CI_JOB_NAMES.map((name) => ({ name, status: "completed", conclusion: "success" })) }, commit);
  assert.deepEqual(missingJobIds, { valid: false, code: "ci_jobs_mismatch" });

  const root = await mkdtemp(join(tmpdir(), "luna release install failures-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const project = join(root, "project");
  const home = join(root, "home");
  const temp = join(root, "temp");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(temp, { recursive: true });
  const env = buildInstallerEnvironment({ installerHome: home, temp }, process.env);
  await assert.rejects(installCopiedSkills({ projectRoot: project, env, deadline: { at: Date.now() + CEILINGS_MS.outer, timedOut: false }, run: async () => ({ code: 1, signal: null, timedOut: false, stdout: "", stderr: "" }) }), /installer_failed/);

  let drifted = false;
  await assert.rejects(installCopiedSkills({
    projectRoot: project,
    env,
    deadline: { at: Date.now() + CEILINGS_MS.outer, timedOut: false },
    run: async (file, args, options) => {
      const result = await runCapturedCommand(file, args, options);
      if (!drifted) {
        drifted = true;
        await writeFile(join(project, ".agents", "skills", "luna-sidecar", "SKILL.md"), "drift\n", "utf8");
      }
      return result;
    },
  }), /install_hash_drift/);
});

test("strict evidence and stdout records exclude forbidden sentinels", () => {
  const evidence = redactEvidence({
    testedCommit: "a".repeat(40),
    platform: "win32",
    nodeVersion: "22.20.0",
    codexVersion: "1.2.3",
    skillsVersion: "1.5.22",
    rootRoles: [{ role: "bad", relativePath: "C:\\Users\\secret\\PROMPT", pathHash: "not-a-hash" }, { role: "project", relativePath: "../outside", pathHash: "a".repeat(64) }],
    installs: [{ agent: "bad", relativePath: "/absolute/ENV", manifestHash: "bad" }],
    ci: { runId: "42", headSha: "a".repeat(40), status: "completed", conclusion: "success", jobs: [{ name: "forbidden-prompt", id: "ENV" }] },
    commands: [{ name: "PROMPT", exitCode: 0 }],
    predicates: { safe: true, forbidden: "RAW_EVENT" },
    cleanup: { attempted: true },
    unresolvedGaps: ["outer_timeout", "RAW_STDERR"],
    prompt: "FORBIDDEN_PROMPT",
    env: "FORBIDDEN_ENV",
    argv: "FORBIDDEN_ARGV",
    finalMessage: "FORBIDDEN_FINAL",
  });
  const serialized = JSON.stringify(evidence);
  for (const forbidden of ["FORBIDDEN", "RAW_EVENT", "RAW_STDERR", "C:\\\\Users", "/absolute/ENV"]) assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(JSON.parse(canonicalEvidenceJson(evidence)).claim, evidence.claim);
  assert.equal(evidence.roots.find((root) => root.role === "project").relativePath, null);
  assert.equal(createRedactedRecord("final", { testedCommit: "a".repeat(40), releaseReady: false, unresolvedGaps: ["outer_timeout"] }).includes("FORBIDDEN"), false);
});

test("canonical JSON and Markdown artifacts are deterministic", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna release artifacts-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const evidence = redactEvidence({ testedCommit: "b".repeat(40), platform: "linux", nodeVersion: "24.1.0", skillsVersion: "1.5.22", rootRoles: [], installs: [], ci: null, commands: [], predicates: {}, cleanup: { attempted: true, releaseReady: false }, unresolvedGaps: ["outer_timeout"] });
  const markdown = renderEvidenceMarkdown(evidence);
  const embedded = markdown.match(/```json\n([\s\S]+)\n```/);
  assert.ok(embedded);
  assert.deepEqual(JSON.parse(embedded[1]), evidence);
  assert.equal(canonicalEvidenceJson(evidence), `${JSON.stringify(evidence, null, 2)}\n`);
});

test("installer, hash, and CI gates stop production orchestration before provider spawn", async (t) => {
  const cases = [
    { kind: "installer", gap: "installer_failed", stage: "installer" },
    { kind: "install-hash", gap: "install_hash_drift", stage: "installer" },
    { kind: "ci", gap: "ci_head_mismatch", stage: "preflight" },
    { kind: "post-install-hash", gap: "install_hash_drift", stage: "preflight" },
  ];
  for (const [index, scenario] of cases.entries()) {
    const root = await mkdtemp(join(tmpdir(), `luna release gate ${index}-`));
    t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
    const { gitRoot, headSha } = await createCleanGitRoot(root);
    const commandNames = [];
    const records = [];
    let installedProject = null;
    const run = async (file, args, options = {}) => {
      commandNames.push(options.commandName ?? "unknown");
      if (scenario.kind === "installer" && options.commandName === "installer") return { code: 1, signal: null, timedOut: false, outerTimedOut: false, stdout: "", stderr: "" };
      const result = await runCapturedCommand(file, args, options);
      if (options.commandName === "installer") {
        installedProject = options.cwd;
        if (scenario.kind === "install-hash") await writeFile(join(installedProject, ".agents", "skills", "luna-sidecar", "SKILL.md"), "drift\n", "utf8");
      }
      return result;
    };
    const validCi = { headSha, status: "completed", conclusion: "success", jobs: EXPECTED_CI_JOB_NAMES.map((name, jobIndex) => ({ databaseId: jobIndex + 1, name, status: "completed", conclusion: "success" })) };
    const queryCi = async () => {
      if (scenario.kind === "post-install-hash") await writeFile(join(installedProject, ".agents", "skills", "luna-sidecar", "scripts", "luna-sidecar.mjs"), "drift\n", "utf8");
      return scenario.kind === "ci" ? { ...validCi, headSha: "d".repeat(40) } : validCi;
    };
    const result = await orchestrateReleaseSmoke({
      live: true,
      testedCommit: headSha,
      ciRunId: "42",
      gitRoot,
      environment: topLevelEnvironment(),
      run,
      queryCi,
      emit: (line) => records.push(JSON.parse(line)),
    });
    assert.equal(result.releaseReady, false, scenario.kind);
    assert.equal(result.failureStage, scenario.stage, scenario.kind);
    assert.equal(result.unresolvedGaps.includes(scenario.gap), true, scenario.kind);
    assert.equal(commandNames.some((name) => name === "codex-version" || name.startsWith("manager-")), false, scenario.kind);
    assert.equal(records.filter((record) => record.type === "release-smoke-final").length, 1, scenario.kind);
  }
});

test("cleanup refuses incomplete run-owned PID provenance", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna release cleanup provenance-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const roots = { project: join(root, "project"), state: join(root, "state"), cancellationCaller: join(root, "caller") };
  await Promise.all(Object.values(roots).map((value) => mkdir(value, { recursive: true })));
  const cleanup = await cleanupRun({
    launcher: join(roots.project, "copied-launcher.mjs"),
    roots,
    env: topLevelEnvironment(),
    run: runCapturedCommand,
    deadline: { at: Date.now() + 1_000, timedOut: false },
    launchedWorkerCount: 1,
    knownOwnedPids: [12345],
  });
  assert.equal(cleanup.result.releaseReady, false);
  assert.equal(cleanup.processesGone, false);
  assert.equal(cleanup.result.gaps.includes("cleanup_empty_ownership"), true);
  assert.equal(cleanup.result.gaps.includes("cleanup_identity_uncertain"), true);
});

test("production orchestration runs copied Codex through PATH and computes parent/resume/cancel truth", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna release production-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const { gitRoot, headSha } = await createCleanGitRoot(root);
  const shimRoot = join(root, "provider shim");
  const fakePath = join(root, "fake-codex.mjs");
  const fakeSource = `
import { readFile } from "node:fs/promises";
const args = process.argv.slice(2);
if (args.includes("--version")) { process.stdout.write("codex 9.8.7\\n"); process.exit(0); }
const input = await new Promise((resolve) => { const chunks=[]; process.stdin.on("data", (chunk)=>chunks.push(chunk)); process.stdin.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8"))); });
const marker = input.match(/luna-release-marker-[A-Za-z0-9-]+\\.txt/)?.[0];
const emit = (value) => process.stdout.write(JSON.stringify(value)+"\\n");
if (input.includes("exactly two")) {
  emit({type:"thread.started",thread_id:"fake-parent-session"});
  emit({type:"item.completed",item:{type:"collab_tool_call",tool:"spawn_agent",status:"completed",receiver_thread_ids:["receiver-a"]}});
  emit({type:"item.completed",item:{type:"collab_tool_call",tool:"spawn_agent",status:"completed",receiver_thread_ids:["receiver-b"]}});
  emit({type:"turn.completed"});
} else if (marker) {
  emit({type:"item.completed",item:{type:"command_execution",command:"write "+marker,status:"failed",exit_code:1}});
  emit({type:"turn.completed"});
} else {
  setInterval(()=>{},1000);
}`;
  await writeFile(fakePath, fakeSource, "utf8");
  await writeFakeShim(shimRoot, fakePath);
  const evidenceJson = join(root, "evidence", "v1-release-evidence.json");
  const evidenceMarkdown = join(root, "evidence", "v1-release-evidence.md");
  const emitted = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { emitted.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)); return true; };
  t.after(() => { process.stdout.write = originalWrite; });
  const ci = { headSha, status: "completed", conclusion: "success", jobs: EXPECTED_CI_JOB_NAMES.map((name, index) => ({ databaseId: index + 1, name, status: "completed", conclusion: "success" })) };
  let result;
  try {
    result = await orchestrateReleaseSmoke({
      live: true,
      testedCommit: headSha,
      ciRunId: "42",
      gitRoot,
      environment: topLevelEnvironment({ PATH: `${shimRoot}${delimiter}${process.env.PATH ?? ""}` }),
      queryCi: async () => ci,
      evidenceDestination: { jsonPath: evidenceJson, markdownPath: evidenceMarkdown },
    });
  } finally {
    process.stdout.write = originalWrite;
  }
  const records = emitted.join("").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(result.releaseReady, true, JSON.stringify(result));
  assert.equal(records.filter((record) => record.type === "release-smoke-preflight").length, 1);
  assert.equal(records.filter((record) => record.type === "release-smoke-final").length, 1);
  assert.equal(result.predicates.parent.nativeChildCount, 2);
  assert.equal(result.predicates.resume.markerCommandFailed, true);
  assert.equal(result.predicates.cancellation.result, true);
  assert.equal(result.failureStage, null);
  assert.deepEqual(result.ci.jobs.map((job) => job.id), [1, 2, 3, 4]);
  assert.deepEqual(JSON.parse(await readFile(evidenceJson, "utf8")), result);
  assert.equal((await readFile(evidenceMarkdown, "utf8")).includes("FORBIDDEN"), false);
});

test("exact event predicates reject near misses", () => {
  assert.equal(successfulNativeChildPredicate({ type: "item.completed", item: { type: "collab_tool_call", tool: "spawn_agent", status: "completed", receiver_thread_ids: ["id"] } }), true);
  assert.equal(successfulNativeChildPredicate({ type: "item.completed", item: { type: "collab_tool_call", tool: "spawn_agent", status: "failed", receiver_thread_ids: ["id"] } }), false);
  assert.equal(failedMarkerCommandPredicate({ type: "item.completed", item: { type: "command_execution", command: "write marker.txt", status: "failed", exit_code: 1 } }, "marker.txt"), true);
  assert.equal(failedMarkerCommandPredicate({ type: "item.completed", item: { type: "command_execution", command: "write marker.txt", status: "failed", exit_code: 0 } }, "marker.txt"), false);
});

async function createCleanGitRoot(root, name = "preflight-repo") {
  const gitRoot = join(root, name);
  const init = await runCapturedCommand("git", ["init", "--quiet", gitRoot], { cwd: root });
  assert.equal(init.code, 0);
  const commit = await runCapturedCommand("git", ["-C", gitRoot, "-c", "user.name=release-test", "-c", "user.email=release-test@example.invalid", "commit", "--allow-empty", "-m", "tested"], { cwd: root });
  assert.equal(commit.code, 0);
  const head = await runCapturedCommand("git", ["-C", gitRoot, "rev-parse", "HEAD"], { cwd: root });
  assert.equal(head.code, 0);
  return { gitRoot, headSha: head.stdout.trim() };
}

function topLevelEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.LUNA_SIDECAR_WORKER_MARKER;
  return env;
}

async function writeFakeShim(shimRoot, fakePath) {
  await mkdir(shimRoot, { recursive: true });
  if (process.platform === "win32") {
    await writeFile(join(shimRoot, "codex.cmd"), `@echo off\r\n"${process.execPath}" "${fakePath}" %*\r\nexit /b %ERRORLEVEL%\r\n`, "utf8");
  } else {
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    const executable = join(shimRoot, "codex");
    await writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fakePath)} "$@"\n`, "utf8");
    await chmod(executable, 0o755);
  }
}

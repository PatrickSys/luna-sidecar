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
  buildHostInvocation,
  buildProviderEnvironment,
  buildResumePrompt,
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
  parseReleaseSmokeArgs,
  parseHostObservationResult,
  redactEvidence,
  renderEvidenceMarkdown,
  runCapturedCommand,
  runHostObservation,
  runHostObservations,
  runLiveScenarios,
  successfulNativeChildPredicate,
  validateCancellationOutcome,
  validateCiEvidence,
  validateLogIntegrity,
  validateWaitOutcome,
} from "../scripts/release-smoke.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const installerPath = join(repositoryRoot, "node_modules", "skills", "bin", "cli.mjs");

test("release smoke parser keeps its exact internal control contract", () => {
  assert.deepEqual(parseReleaseSmokeArgs(["--live", "--tested-commit", "A".repeat(40), "--ci-run-id", "run-42"]), {
    live: true,
    testedCommit: "a".repeat(40),
    ciRunId: "run-42",
  });
  assert.throws(() => parseReleaseSmokeArgs(["--live", "--tested-commit", "a".repeat(40), "--legacy-stop"]), /argument_invalid/);
  const evidence = redactEvidence({ commands: [{ name: "manager-stop", exitCode: 0 }, { name: "manager-cancel", exitCode: 0 }] });
  assert.equal(evidence.commands[0].name, "unknown");
  assert.equal(evidence.commands[1].name, "manager-cancel");
});

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

test("host adapters use the installed skill workflow and documented CLI surfaces", () => {
  const projectRoot = resolve(tmpdir(), "luna-host-project");
  const skillRoot = join(projectRoot, ".agents", "skills", "luna-sidecar");
  const schemaPath = join(projectRoot, "host-schema.json");
  const codex = buildHostInvocation("codex_cli", { projectRoot, skillRoot, schemaPath, environment: { ComSpec: "cmd.exe" } });
  const codexArgs = codex.args.join(" ");
  assert.match(codexArgs, /codex exec/);
  assert.match(codexArgs, /--json/);
  assert.match(codexArgs, /--ephemeral/);
  assert.match(codexArgs, /--output-schema/);
  assert.match(codexArgs, /--sandbox workspace-write/);
  assert.match(codexArgs, /--cd/);
  assert.match(codexArgs, /--skip-git-repo-check/);
  assert.doesNotMatch(codex.input, /\/luna-sidecar/);
  assert.match(codex.input, /Agent Skill named luna-sidecar/);

  const claude = buildHostInvocation("claude_code", { projectRoot, skillRoot: join(projectRoot, ".claude", "skills", "luna-sidecar"), schemaPath, environment: { ComSpec: "cmd.exe" } });
  const claudeArgs = claude.args.join(" ");
  assert.match(claudeArgs, /claude/);
  assert.match(claudeArgs, /-p/);
  assert.match(claudeArgs, /--bare/);
  assert.match(claudeArgs, /--output-format stream-json/);
  assert.match(claudeArgs, /--permission-mode bypassPermissions/);
  assert.match(claudeArgs, /--no-session-persistence/);
  assert.match(claude.input, /\/luna-sidecar/);
});

test("host event parsing requires copied-skill execution, a v2 receipt, and no task-success claim", () => {
  const projectRoot = resolve(tmpdir(), "luna-host-project");
  const skillRoot = join(projectRoot, ".agents", "skills", "luna-sidecar");
  const receipt = { schemaVersion: 2, workerId: "11111111-1111-4111-8111-111111111111", turnId: "22222222-2222-4222-8222-222222222222", state: "completed", providerState: "completed", errorCode: null, taskOutcome: "not_evaluated" };
  const payload = { schemaVersion: 1, skill: "luna-sidecar", workflow: "subagent", taskOutcome: "not_evaluated", sidecarReceipt: receipt };
  const command = `node "${join(skillRoot, "scripts", "luna-sidecar.mjs")}" start --cwd "${projectRoot}" --sandbox read-only --effort medium -- "inspect"`;
  const codexResult = { stdout: [
    JSON.stringify({ type: "item.completed", item: { type: "command_execution", command, aggregated_output: JSON.stringify(receipt) } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(payload) } }),
  ].join("\n") };
  const parsedCodex = parseHostObservationResult("codex_cli", codexResult, { projectRoot, skillRoot });
  assert.equal(parsedCodex.receipt.turnId, receipt.turnId);

  const claudeResult = { stdout: [
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: JSON.stringify(receipt) }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: JSON.stringify(payload) }] } }),
  ].join("\n") };
  const parsedClaude = parseHostObservationResult("claude_code", claudeResult, { projectRoot, skillRoot });
  assert.equal(parsedClaude.payload.taskOutcome, "not_evaluated");
  assert.throws(() => parseHostObservationResult("codex_cli", { stdout: JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ ...payload, taskOutcome: "completed" }) } }) }, { projectRoot, skillRoot }), /host_schema_mismatch/);
});

test("host availability, command failure, and cleanup uncertainty fail closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna host gates-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const projectRoot = join(root, "project");
  const stateRoot = join(root, "state");
  const callerRoot = join(root, "caller");
  const skillRoot = join(projectRoot, ".agents", "skills", "luna-sidecar");
  await Promise.all([projectRoot, join(stateRoot, "workers"), callerRoot, skillRoot].map((path) => mkdir(path, { recursive: true })));
  const unavailable = await runHostObservations({ roots: { project: projectRoot, hostCodexState: stateRoot, hostClaudeState: stateRoot, cancellationCaller: callerRoot }, environment: {}, run: async () => { throw new Error("must not spawn"); }, deadline: { at: Date.now() + 10_000, timedOut: false }, schemaPath: join(root, "schema.json"), codexVersion: null, claudeVersion: null });
  assert.equal(unavailable.hosts.codex_cli.failureCode, "codex_cli_unavailable");
  assert.equal(unavailable.hosts.claude_code.failureCode, "claude_code_unavailable");
  assert.deepEqual(new Set(unavailable.gaps), new Set(["codex_cli_unavailable", "claude_code_unavailable"]));

  let failureInspectCalls = 0;
  const failed = await runHostObservation({
    host: "codex_cli",
    hostVersion: "0.147.0",
    projectRoot,
    skillRoot,
    stateRoot,
    cancellationCaller: callerRoot,
    schemaPath: join(root, "schema.json"),
    environment: {},
    run: async () => ({ code: 1, signal: null, timedOut: false, pid: 12345, stdout: "", stderr: "" }),
    deadline: { at: Date.now() + 10_000, timedOut: false },
    inspect: async (pid) => { failureInspectCalls += 1; return { exists: false, pid }; },
  });
  assert.equal(failureInspectCalls, 0);
  assert.equal(failed.evidence.failureCode, "codex_cli_host_failed");
  assert.equal(failed.evidence.claimEligible, false);

  const receipt = { schemaVersion: 2, workerId: "11111111-1111-4111-8111-111111111111", turnId: "22222222-2222-4222-8222-222222222222", state: "completed", providerState: "completed", errorCode: null, taskOutcome: "not_evaluated", pid: 4444, runnerPid: 4444, providerPid: null };
  await writeFile(join(stateRoot, "workers", `${receipt.workerId}.json`), JSON.stringify({ schemaVersion: 2, workerId: receipt.workerId, state: "completed", turns: [{ ...receipt, cwd: projectRoot }] }), "utf8");
  const skillCommand = `node "${join(skillRoot, "scripts", "luna-sidecar.mjs")}" start --cwd "${projectRoot}" --sandbox read-only --effort medium -- "inspect"`;
  const payload = { schemaVersion: 1, skill: "luna-sidecar", workflow: "subagent", taskOutcome: "not_evaluated", sidecarReceipt: receipt };
  const cleanupUncertain = await runHostObservation({
    host: "codex_cli",
    hostVersion: "0.147.0",
    projectRoot,
    skillRoot,
    stateRoot,
    cancellationCaller: callerRoot,
    schemaPath: join(root, "schema.json"),
    environment: {},
    run: async (_file, _args, options) => options.commandName === "host-codex"
      ? { code: 0, signal: null, timedOut: false, pid: 5555, stdout: `${JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: skillCommand, aggregated_output: JSON.stringify(receipt) } })}\n${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(payload) } })}`, stderr: "" }
      : { code: 0, signal: null, timedOut: false, pid: null, stdout: "", stderr: "" },
    deadline: { at: Date.now() + 10_000, timedOut: false },
    inspect: async (pid) => pid === 4444 ? { exists: true, uncertain: true, pid } : { exists: false, pid },
  });
  assert.equal(cleanupUncertain.evidence.claimEligible, false);
  assert.equal(cleanupUncertain.evidence.failureCode, "cleanup_identity_uncertain");
});

test("host cleanup treats reused, matching, and uncertain PIDs distinctly", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna host pid identity-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const projectRoot = join(root, "project");
  const stateRoot = join(root, "state");
  const callerRoot = join(root, "caller");
  const skillRoot = join(projectRoot, ".agents", "skills", "luna-sidecar");
  await Promise.all([projectRoot, join(stateRoot, "workers"), callerRoot, skillRoot].map((path) => mkdir(path, { recursive: true })));
  const base = { host: "codex_cli", hostVersion: "0.147.0", projectRoot, skillRoot, stateRoot, cancellationCaller: callerRoot, schemaPath: join(root, "schema.json"), environment: {}, deadline: { at: Date.now() + 10_000, timedOut: false } };
  const timeoutRun = async () => ({ code: null, signal: null, timedOut: true, pid: 7001, stdout: "", stderr: "" });
  let terminateCalls = 0;
  const reused = await runHostObservation({
    ...base,
    run: timeoutRun,
    inspect: async (pid) => ({ exists: true, uncertain: false, pid, cwd: join(root, "other"), commandLine: "chrome.exe --type=renderer" }),
    terminate: async () => { terminateCalls += 1; },
    waitGone: async () => true,
  });
  assert.equal(terminateCalls, 0);
  assert.equal(reused.evidence.cleanup.ownedPidResult, "all_gone");
  assert.equal(reused.evidence.failureCode, "host_observation_timeout");

  let matchingInspectCalls = 0;
  const matching = await runHostObservation({
    ...base,
    run: timeoutRun,
    inspect: async (pid) => { matchingInspectCalls += 1; return { exists: true, uncertain: false, pid, cwd: projectRoot, commandLine: "cmd.exe /c codex exec" }; },
    terminate: async (pid) => { terminateCalls += pid === 7001 ? 1 : 0; },
    waitGone: async () => true,
  });
  assert.equal(matchingInspectCalls, 2);
  assert.equal(terminateCalls, 1);
  assert.equal(matching.evidence.cleanup.ownedPidResult, "all_gone");

  const uncertain = await runHostObservation({
    ...base,
    run: timeoutRun,
    inspect: async (pid) => ({ exists: true, uncertain: true, pid }),
    terminate: async () => { terminateCalls += 1; },
    waitGone: async () => true,
  });
  assert.equal(terminateCalls, 1);
  assert.equal(uncertain.evidence.cleanup.ownedPidResult, "uncertain");
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
const expectedResumePrompt = marker && [
  "Controlled read-only resume verification.",
  \`Run exactly this one command, verbatim, from the current cwd: node -e "require('node:fs').writeFileSync('\${marker}', 'release-smoke')"\`,
  "The command is expected to be denied or fail under read-only authority with a nonzero exit code.",
  "Do not use bypass, permissions changes, alternate paths or filenames, any other write mechanism, or any other command; do not merely explain or simulate the attempt.",
  "After that one command returns, report the current cwd and stop.",
].join(" ");
const emit = (value) => process.stdout.write(JSON.stringify(value)+"\\n");
if (input.includes("exactly two")) {
  emit({type:"thread.started",thread_id:"fake-parent-session"});
  emit({type:"item.completed",item:{type:"collab_tool_call",tool:"spawn_agent",status:"completed",receiver_thread_ids:["receiver-a"]}});
  emit({type:"item.completed",item:{type:"collab_tool_call",tool:"spawn_agent",status:"completed",receiver_thread_ids:["receiver-b"]}});
  emit({type:"turn.completed"});
 } else if (marker) {
   if (input.trim() !== expectedResumePrompt) { emit({type:"turn.completed",error:"resume prompt contract mismatch"}); process.exit(1); }
   emit({type:"thread.started",thread_id:"fake-resume-session"});
   emit({type:"item.completed",item:{type:"command_execution",command:"write "+marker,status:"failed",exit_code:1}});
  emit({type:"turn.completed"});
} else {
   emit({type:"thread.started",thread_id:"fake-cancel-session"});
   setInterval(()=>{},1000);
}`;
  await writeFile(fakePath, fakeSource, "utf8");
  await writeFakeShim(shimRoot, fakePath);
  const evidenceJson = join(root, "evidence", "v1-release-evidence.json");
  const evidenceMarkdown = join(root, "evidence", "v1-release-evidence.md");
  const emitted = [];
  const capturedInputs = [];
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
      run: (file, args, options = {}) => {
        if (options.input?.trim()) capturedInputs.push({ name: options.commandName, input: options.input });
        return runCapturedCommand(file, args, options);
      },
      observeHosts: async ({ roots }) => {
        assert.equal(isPathWithin(roots.project, roots.hostCodexState), true);
        assert.equal(isPathWithin(roots.project, roots.hostClaudeState), true);
        return {
          hosts: {
            codex_cli: {
              available: true,
              invocationRef: "evidence://codex-cli/observation-1",
              procedureRef: "release-smoke.codex_cli.v1",
              hostVersion: "9.8.7",
              sidecarReceipt: { schemaVersion: 2, schemaResult: "valid" },
              cleanup: { result: "verified", ownedPidResult: "all_gone", ownedPids: [], ownedPidsGone: true },
              failureCode: null,
              claimEligible: true,
            },
            claude_code: {
              available: false,
              invocationRef: null,
              procedureRef: null,
              hostVersion: null,
              sidecarReceipt: { schemaVersion: null, schemaResult: "not_run" },
              cleanup: { result: "not_run", ownedPidResult: "not_run", ownedPids: [], ownedPidsGone: false },
              failureCode: "claude_code_unavailable",
              claimEligible: false,
            },
          },
          gaps: ["claude_code_unavailable"],
          ownedPids: [],
        };
      },
      evidenceDestination: { jsonPath: evidenceJson, markdownPath: evidenceMarkdown },
    });
  } finally {
    process.stdout.write = originalWrite;
  }
  const records = emitted.join("").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(result.releaseReady, false, JSON.stringify(result));
  assert.equal(result.hosts.codex_cli.available, true);
  assert.equal(result.hosts.codex_cli.sidecarReceipt.schemaVersion, 2);
  assert.equal(result.hosts.codex_cli.sidecarReceipt.schemaResult, "valid");
  assert.equal(result.hosts.codex_cli.cleanup.ownedPidResult, "all_gone");
  assert.equal(result.hosts.codex_cli.claimEligible, true);
  assert.equal(result.hosts.claude_code.available, false);
  assert.equal(result.hosts.claude_code.sidecarReceipt.schemaResult, "not_run");
  assert.equal(result.hosts.claude_code.failureCode, "claude_code_unavailable");
  assert.equal(result.hosts.claude_code.claimEligible, false);
  assert.equal(result.otherGates.deterministic, true);
  assert.equal(result.otherGates.installedParity, true);
  assert.equal(result.otherGates.ci, true);
  assert.equal(records.filter((record) => record.type === "release-smoke-preflight").length, 1);
  assert.equal(records.filter((record) => record.type === "release-smoke-final").length, 1);
  assert.equal(result.predicates.parent.nativeChildCount, 2);
  assert.equal(result.predicates.resume.markerCommandFailed, true);
  const resumeInput = capturedInputs.find(({ name }) => name === "manager-resume");
  assert.ok(resumeInput);
  const resumeMarker = resumeInput.input.match(/luna-release-marker-[0-9a-f-]+\.txt/)?.[0];
  assert.ok(resumeMarker);
  assert.equal(resumeInput.input.trim(), buildResumePrompt(resumeMarker));
  assert.equal(result.predicates.cancellation.result, true);
  assert.equal(result.failureStage, "provider");
  assert.deepEqual(result.ci.jobs.map((job) => job.id), [1, 2, 3, 4]);
  assert.deepEqual(JSON.parse(await readFile(evidenceJson, "utf8")), result);
  assert.equal((await readFile(evidenceMarkdown, "utf8")).includes("FORBIDDEN"), false);
});

test("resume prompt is deterministic, portable, and rejects unsafe marker names", () => {
  const prompt = buildResumePrompt("luna-release-marker-0123456789abcdef.txt");
  assert.match(prompt, /Run exactly this one command, verbatim, from the current cwd: node -e "require\('node:fs'\)\.writeFileSync\('luna-release-marker-0123456789abcdef\.txt', 'release-smoke'\)"/);
  assert.match(prompt, /expected to be denied or fail under read-only authority with a nonzero exit code/);
  assert.match(prompt, /Do not use bypass/);
  assert.match(prompt, /do not merely explain or simulate/);
  assert.match(prompt, /report the current cwd and stop/);
  assert.throws(() => buildResumePrompt("marker.txt"), /argument_invalid/);
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

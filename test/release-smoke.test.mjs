import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join, resolve, toNamespacedPath } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CEILINGS_MS,
  EXPECTED_CI_JOB_NAMES,
  HOST_SCHEMA_REASONS,
  assertPathWithin,
  assertCopiedLauncher,
  buildInstallerEnvironment,
  buildHostInvocation,
  buildProviderEnvironment,
  buildCancellationPrompt,
  buildResumePrompt,
  hostObservationSchema,
  cancellationPredicate,
  canonicalEvidenceJson,
  cleanupRun,
  createRedactedRecord,
  DEFAULT_EVIDENCE_DESTINATION,
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

test("live defaults write only the Phase 5 final-shape evidence paths", () => {
  assert.deepEqual(DEFAULT_EVIDENCE_DESTINATION, {
    jsonPath: join(repositoryRoot, "docs", "verification", "phase5-final-shape-evidence.json"),
    markdownPath: join(repositoryRoot, "docs", "verification", "phase5-final-shape-evidence.md"),
  });
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
  assert.equal(codex.file, process.platform === "win32" ? "cmd.exe" : "codex");
  const codexArgs = process.platform === "win32" ? codex.args.slice(4) : codex.args;
  assert.deepEqual(codexArgs.slice(0, 2), ["exec", "--json"]);
  assert.equal(codexArgs.includes("--ephemeral"), true);
  assert.equal(codexArgs.includes("--output-schema"), true);
  assert.equal(codexArgs.includes("--sandbox"), true);
  assert.equal(codexArgs.includes("workspace-write"), true);
  assert.equal(codexArgs.includes("--cd"), true);
  assert.equal(codexArgs.includes("--skip-git-repo-check"), true);
  assert.doesNotMatch(codex.input, /\/luna-sidecar/);
  assert.match(codex.input, /Explicitly activate .*Agent Skill with \$luna-sidecar through Codex's native Agent Skills mechanism/);

  const claude = buildHostInvocation("claude_code", { projectRoot, skillRoot: join(projectRoot, ".claude", "skills", "luna-sidecar"), schemaPath, environment: { ComSpec: "cmd.exe" } });
  assert.equal(claude.file, process.platform === "win32" ? "cmd.exe" : "claude");
  const claudeArgs = process.platform === "win32" ? claude.args.slice(4) : claude.args;
  assert.equal(claudeArgs[0], "-p");
  assert.equal(claudeArgs.includes("--bare"), true);
  assert.equal(claudeArgs.includes("--output-format"), true);
  assert.equal(claudeArgs.includes("stream-json"), true);
  assert.equal(claudeArgs.includes("--verbose"), true);
  assert.equal(claudeArgs.includes("--permission-mode"), true);
  assert.equal(claudeArgs.includes("bypassPermissions"), true);
  assert.equal(claudeArgs.includes("--no-session-persistence"), true);
  assert.deepEqual(claudeArgs.slice(claudeArgs.indexOf("--setting-sources"), claudeArgs.indexOf("--setting-sources") + 2), ["--setting-sources", "user,project,local"]);
  assert.match(claude.input, /\/luna-sidecar/);
});

test("Codex output schema literals declare JSON Schema types", () => {
  assert.equal(hostObservationSchema.type, "object");
  assert.equal(hostObservationSchema.additionalProperties, false);
  assert.deepEqual(hostObservationSchema.required, ["schemaVersion", "skill", "workflow", "taskOutcome", "sidecarReceipt"]);
  assert.deepEqual(hostObservationSchema.properties.schemaVersion, { type: "integer", const: 1 });
  assert.deepEqual(hostObservationSchema.properties.skill, { type: "string", const: "luna-sidecar" });
  assert.deepEqual(hostObservationSchema.properties.workflow, { type: "string", const: "subagent" });
  assert.deepEqual(hostObservationSchema.properties.taskOutcome, { type: "string", const: "not_evaluated" });
  const receipt = hostObservationSchema.properties.sidecarReceipt;
  assert.equal(receipt.type, "object");
  assert.equal(receipt.additionalProperties, false);
  assert.deepEqual(receipt.required, ["schemaVersion", "workerId", "turnId", "state", "providerState", "errorCode", "taskOutcome"]);
  assert.deepEqual(receipt.properties, {
    schemaVersion: { type: "integer", const: 2 },
    workerId: { type: "string" },
    turnId: { type: "string" },
    state: { type: "string", const: "completed" },
    providerState: { type: "string", const: "completed" },
    errorCode: { type: "null", const: null },
    taskOutcome: { type: "string", const: "not_evaluated" },
  });
});

test("structured Codex schema failures retain a bounded redacted diagnostic", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna host schema diagnostic-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const projectRoot = join(root, "project");
  const stateRoot = join(root, "state");
  const callerRoot = join(root, "caller");
  const skillRoot = join(projectRoot, ".agents", "skills", "luna-sidecar");
  await Promise.all([projectRoot, join(stateRoot, "workers"), callerRoot, skillRoot].map((path) => mkdir(path, { recursive: true })));
  const error = JSON.stringify({ type: "error", error: { type: "invalid_request_error", code: "invalid_json_schema", message: "Invalid schema for response_format: prompt=SECRET_PROMPT at C:\\Users\\secret\\schema.json https://secret.invalid" } });
  const result = await runHostObservation({
    host: "codex_cli",
    hostVersion: "0.147.0",
    projectRoot,
    skillRoot,
    stateRoot,
    cancellationCaller: callerRoot,
    schemaPath: join(root, "schema.json"),
    environment: {},
    run: async () => ({ code: 1, signal: null, timedOut: false, pid: null, stdout: `${JSON.stringify({ type: "error", error })}\n${JSON.stringify({ type: "turn.failed", error })}`, stderr: "" }),
    deadline: { at: Date.now() + 10_000, timedOut: false },
  });
  const diagnostic = result.evidence.failureDiagnostics;
  assert.equal(diagnostic.kind, "output");
  assert.match(diagnostic.stdout.summary, /invalid_json_schema/);
  assert.match(diagnostic.stdout.summary, /Invalid schema/);
  assert.ok(diagnostic.stdout.summary.length <= 240);
  assert.doesNotMatch(diagnostic.stdout.summary, /SECRET_PROMPT|secret\.invalid|C:\\Users\\secret/);
});

test("Claude error result diagnostics are bounded while ordinary results stay opaque", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna claude result diagnostic-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const projectRoot = join(root, "project");
  const stateRoot = join(root, "state");
  const callerRoot = join(root, "caller");
  const skillRoot = join(projectRoot, ".claude", "skills", "luna-sidecar");
  await Promise.all([projectRoot, join(stateRoot, "workers"), callerRoot, skillRoot].map((path) => mkdir(path, { recursive: true })));
  const base = { host: "claude_code", hostVersion: "2.1.220", projectRoot, skillRoot, stateRoot, cancellationCaller: callerRoot, schemaPath: join(root, "schema.json"), environment: {}, deadline: { at: Date.now() + 10_000, timedOut: false } };
  const failed = await runHostObservation({
    ...base,
    run: async () => ({ code: 1, signal: null, timedOut: false, pid: null, stdout: `${JSON.stringify({ type: "result", is_error: true, subtype: "error", result: "Not logged in · Please run /login prompt=SECRET_PROMPT" })}\n`, stderr: "" }),
  });
  assert.match(failed.evidence.failureDiagnostics.stdout.summary, /Not logged in/);
  assert.ok(failed.evidence.failureDiagnostics.stdout.summary.length <= 240);
  assert.doesNotMatch(failed.evidence.failureDiagnostics.stdout.summary, /SECRET_PROMPT/);

  const ordinary = await runHostObservation({
    ...base,
    run: async () => ({ code: 1, signal: null, timedOut: false, pid: null, stdout: `${JSON.stringify({ type: "result", is_error: false, result: "ordinary model output SECRET_PROMPT" })}\n`, stderr: "" }),
  });
  assert.equal(ordinary.evidence.failureDiagnostics.stdout.summary, "structured output present");
  assert.doesNotMatch(ordinary.evidence.failureDiagnostics.stdout.summary, /ordinary|SECRET_PROMPT/);
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
  assert.throws(() => parseHostObservationResult("codex_cli", { stdout: [JSON.stringify({ type: "item.completed", item: { type: "command_execution", command } }), JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ ...payload, taskOutcome: "completed" }) } })].join("\n") }, { projectRoot, skillRoot }), (error) => error.code === "host_schema_mismatch" && error.schemaReason === "payload_shape_invalid");
});

test("host schema failures report distinct bounded predicates", () => {
  assert.deepEqual(HOST_SCHEMA_REASONS, [
    "jsonl_invalid",
    "copied_skill_command_missing",
    "payload_shape_invalid",
    "receipt_invalid",
    "receipt_not_observed",
    "receipt_mismatch",
    "receipt_terminal_invalid",
  ]);
  const projectRoot = resolve(tmpdir(), "luna-host-project");
  const skillRoot = join(projectRoot, ".agents", "skills", "luna-sidecar");
  const receipt = { schemaVersion: 2, workerId: "11111111-1111-4111-8111-111111111111", turnId: "22222222-2222-4222-8222-222222222222", state: "completed", providerState: "completed", errorCode: null, taskOutcome: "not_evaluated" };
  const otherReceipt = { ...receipt, workerId: "33333333-3333-4333-8333-333333333333" };
  const command = `node "${join(skillRoot, "scripts", "luna-sidecar.mjs")}" start --cwd "${projectRoot}" --sandbox read-only --effort medium -- "inspect"`;
  const event = (output = null) => ({ type: "item.completed", item: { type: "command_execution", command, ...(output === null ? {} : { aggregated_output: JSON.stringify(output) }) } });
  const message = (value) => ({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(value) } });
  const parse = (events) => parseHostObservationResult("codex_cli", { code: 0, stdout: typeof events === "string" ? events : events.map(JSON.stringify).join("\n") }, { projectRoot, skillRoot });
  const assertReason = (events, reason) => assert.throws(() => parse(events), (error) => error.code === "host_schema_mismatch" && error.schemaReason === reason);

  assertReason("not-json", "jsonl_invalid");
  assertReason([message({})], "copied_skill_command_missing");
  assertReason([event(), message({ schemaVersion: 1, skill: "luna-sidecar", workflow: "subagent", taskOutcome: "completed" })], "payload_shape_invalid");
  assertReason([event(), message({ schemaVersion: 1, skill: "luna-sidecar", workflow: "subagent", taskOutcome: "not_evaluated", sidecarReceipt: { schemaVersion: 2 } })], "receipt_invalid");
  assertReason([event(), message({ schemaVersion: 1, skill: "luna-sidecar", workflow: "subagent", taskOutcome: "not_evaluated", sidecarReceipt: receipt })], "receipt_not_observed");
  assertReason([event(otherReceipt), message({ schemaVersion: 1, skill: "luna-sidecar", workflow: "subagent", taskOutcome: "not_evaluated", sidecarReceipt: receipt })], "receipt_mismatch");
  const terminalInvalid = { ...receipt, state: "failed" };
  assertReason([event(terminalInvalid), message({ schemaVersion: 1, skill: "luna-sidecar", workflow: "subagent", taskOutcome: "not_evaluated", sidecarReceipt: terminalInvalid })], "receipt_terminal_invalid");
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

  const hostCommands = [];
  const reached = await runHostObservations({
    roots: { project: projectRoot, hostCodexState: stateRoot, hostClaudeState: stateRoot, cancellationCaller: callerRoot },
    environment: {},
    run: async (_file, _args, options = {}) => {
      if (options.commandName === "host-codex" || options.commandName === "host-claude") hostCommands.push(options.commandName);
      return { code: options.commandName?.startsWith("host-") ? 1 : 0, signal: null, timedOut: false, pid: null, stdout: "", stderr: "" };
    },
    deadline: { at: Date.now() + 10_000, timedOut: false },
    schemaPath: join(root, "schema.json"),
    codexVersion: "0.147.0",
    claudeVersion: "2.1.220",
  });
  assert.deepEqual(hostCommands, ["host-codex", "host-claude"]);
  assert.equal(reached.hosts.codex_cli.failureCode, "codex_cli_host_failed");
  assert.equal(reached.hosts.claude_code.failureCode, "claude_code_host_failed");
  assert.equal(reached.hosts.codex_cli.failureCode === "codex_cli_unavailable", false);
  assert.equal(reached.hosts.claude_code.failureCode === "claude_code_unavailable", false);

  const invalidOutput = await runHostObservation({
    host: "codex_cli",
    hostVersion: "0.147.0",
    projectRoot,
    skillRoot,
    stateRoot,
    cancellationCaller: callerRoot,
    schemaPath: join(root, "schema.json"),
    environment: {},
    run: async () => ({ code: 0, signal: null, timedOut: false, pid: null, stdout: "not-json", stderr: "" }),
    deadline: { at: Date.now() + 10_000, timedOut: false },
  });
  const normalizedInvalidOutput = redactEvidence({ hosts: { codex_cli: invalidOutput.evidence } });
  assert.equal(normalizedInvalidOutput.hosts.codex_cli.sidecarReceipt.schemaReason, "jsonl_invalid");

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

test("host adapters execute exact Codex and Claude shims and retain bounded failure diagnostics", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna host adapter e2e-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const projectRoot = join(root, "project");
  const shimRoot = join(root, "shims");
  const schemaPath = join(root, "host-schema.json");
  const callerRoot = join(root, "caller");
  const fixturePath = join(root, "host-fixture.mjs");
  const hosts = [
    { name: "codex_cli", command: "codex", version: "0.147.0", skillRoot: join(projectRoot, ".agents", "skills", "luna-sidecar"), stateRoot: join(projectRoot, ".luna-host-state-codex") },
    { name: "claude_code", command: "claude", version: "2.1.220", skillRoot: join(projectRoot, ".claude", "skills", "luna-sidecar"), stateRoot: join(projectRoot, ".luna-host-state-claude") },
  ];
  await Promise.all([
    projectRoot,
    callerRoot,
    join(projectRoot, ".agents", "skills", "luna-sidecar"),
    join(projectRoot, ".claude", "skills", "luna-sidecar"),
    ...hosts.map(({ stateRoot }) => join(stateRoot, "workers")),
  ].map((path) => mkdir(path, { recursive: true })));
  await writeFile(schemaPath, "{}", "utf8");
  await writeFile(fixturePath, `
import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const host = process.env.LUNA_HOST_FIXTURE_HOST;
const mode = process.env.LUNA_HOST_FIXTURE_MODE;
const project = process.env.LUNA_HOST_FIXTURE_PROJECT;
const state = process.env.LUNA_HOST_FIXTURE_STATE;
const schema = process.env.LUNA_HOST_FIXTURE_SCHEMA;
const skill = process.env.LUNA_HOST_FIXTURE_SKILL;
const args = process.argv.slice(2);
const fail = (message) => { process.stderr.write(message + "\\n"); process.exit(2); };
if (process.cwd() !== project || process.env.LUNA_SIDECAR_HOME !== state) fail("fixture contract mismatch");
if (host === "codex_cli") {
  assert.deepEqual(args, ["exec", "--json", "--ephemeral", "--output-schema", schema, "--sandbox", "workspace-write", "--cd", project, "--skip-git-repo-check", "-"]);
} else if (host === "claude_code") {
  assert.deepEqual(args, ["-p", "--bare", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions", "--no-session-persistence", "--setting-sources", "user,project,local", "--add-dir", project]);
} else fail("unknown host");
const input = await new Promise((resolve) => { const chunks = []; process.stdin.on("data", (chunk) => chunks.push(chunk)); process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); });
if (host === "codex_cli" && input.includes("/luna-sidecar")) fail("codex used Claude activation syntax");
if (host === "codex_cli" && !input.includes("$luna-sidecar")) fail("Codex skill activation missing");
if (host === "claude_code" && !input.includes("/luna-sidecar")) fail("Claude skill activation missing");
if (mode === "failure") {
  process.stdout.write(JSON.stringify({ error: "structured output unavailable" }) + "\\n");
  process.stderr.write("authentication failed token=super-secret-value prompt=do-not-store-this\\n");
  process.exit(7);
}
const goneChild = spawn(process.execPath, ["-e", ""], { stdio: "ignore", windowsHide: true });
await new Promise((resolve) => goneChild.once("close", resolve));
const receipt = { schemaVersion: 2, workerId: "11111111-1111-4111-8111-111111111111", turnId: "22222222-2222-4222-8222-222222222222", state: "completed", providerState: "completed", errorCode: null, taskOutcome: "not_evaluated", pid: goneChild.pid };
const command = "node \\\"" + skill + "\\\\scripts\\\\luna-sidecar.mjs\\\" start --cwd \\\"" + project + "\\\" --sandbox read-only --effort medium -- \\\"inspect\\\"";
const payload = { schemaVersion: 1, skill: "luna-sidecar", workflow: "subagent", taskOutcome: "not_evaluated", sidecarReceipt: { schemaVersion: receipt.schemaVersion, workerId: receipt.workerId, turnId: receipt.turnId, state: receipt.state, providerState: receipt.providerState, errorCode: receipt.errorCode, taskOutcome: receipt.taskOutcome } };
await mkdir(join(skill, "scripts"), { recursive: true });
await writeFile(join(skill, "scripts", "luna-sidecar.mjs"), "process.exit(0);", "utf8");
await mkdir(join(state, "workers"), { recursive: true });
await writeFile(join(state, "workers", receipt.workerId + ".json"), JSON.stringify({ schemaVersion: 2, workerId: receipt.workerId, state: "completed", turns: [{ turnId: receipt.turnId, cwd: project, pid: receipt.pid }] }), "utf8");
if (host === "codex_cli") {
  process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "command_execution", command, aggregated_output: JSON.stringify(receipt) } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(payload) } }) + "\\n");
} else {
  process.stdout.write(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: JSON.stringify(receipt) }] } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: JSON.stringify(payload) }] } }) + "\\n");
}
`, "utf8");
  await writeHostShim(shimRoot, "codex", fixturePath);
  await writeHostShim(shimRoot, "claude", fixturePath);
  const baseEnvironment = topLevelEnvironment({ PATH: `${shimRoot}${delimiter}${process.env.PATH ?? ""}` });
  const runObservation = (spec, mode) => runHostObservation({
    host: spec.name,
    hostVersion: spec.version,
    projectRoot,
    skillRoot: spec.skillRoot,
    stateRoot: spec.stateRoot,
    cancellationCaller: callerRoot,
    schemaPath,
    environment: {
      ...baseEnvironment,
      LUNA_HOST_FIXTURE_HOST: spec.name,
      LUNA_HOST_FIXTURE_MODE: mode,
      LUNA_HOST_FIXTURE_PROJECT: projectRoot,
      LUNA_HOST_FIXTURE_STATE: spec.stateRoot,
      LUNA_HOST_FIXTURE_SCHEMA: schemaPath,
      LUNA_HOST_FIXTURE_SKILL: spec.skillRoot,
    },
    run: runCapturedCommand,
    inspect: async (pid) => ({ exists: false, pid }),
    deadline: { at: Date.now() + 30_000, timedOut: false },
  });
  for (const spec of hosts) {
    const success = await runObservation(spec, "success");
    assert.equal(success.evidence.available, true, `${spec.name}: ${JSON.stringify(success.evidence)}`);
    assert.equal(success.evidence.sidecarReceipt.schemaResult, "valid", spec.name);
    assert.equal(success.evidence.cleanup.ownedPidsGone, true, `${spec.name}: ${JSON.stringify(success.evidence)}`);
    assert.equal(success.evidence.claimEligible, true, spec.name);
    const failed = await runObservation(spec, "failure");
    assert.equal(failed.evidence.failureCode, `${spec.name}_host_failed`, spec.name);
    assert.equal(failed.evidence.claimEligible, false, spec.name);
    assert.equal(failed.evidence.failureDiagnostics.kind, "auth", spec.name);
    assert.equal(failed.evidence.failureDiagnostics.exitCode, 7, spec.name);
    assert.equal(failed.evidence.failureDiagnostics.signal, null, spec.name);
    assert.equal(failed.evidence.failureDiagnostics.spawnError, null, spec.name);
    assert.match(failed.evidence.failureDiagnostics.stderr.summary, /authentication failed/);
    assert.doesNotMatch(JSON.stringify(failed.evidence.failureDiagnostics), /super-secret-value/);
    assert.doesNotMatch(JSON.stringify(failed.evidence.failureDiagnostics), /do-not-store-this/);
    assert.ok(failed.evidence.failureDiagnostics.stderr.summary.length <= 240);
    assert.equal(failed.evidence.failureDiagnostics.stdout.summary, "structured output present", spec.name);
  }
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
const expectedCancellationPrompt = ${JSON.stringify(buildCancellationPrompt())};
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
   if (input.trim() !== expectedCancellationPrompt) { emit({type:"turn.completed",error:"cancellation prompt contract mismatch"}); process.exit(1); }
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
  const cancellationInput = capturedInputs.find(({ name }) => name === "manager-start-cancellation");
  assert.ok(cancellationInput);
  assert.equal(cancellationInput.input.trim(), buildCancellationPrompt());
  assert.equal(result.predicates.cancellation.result, true);
  assert.equal(result.failureStage, "provider");
  assert.deepEqual(result.ci.jobs.map((job) => job.id), [1, 2, 3, 4]);
  assert.deepEqual(JSON.parse(await readFile(evidenceJson, "utf8")), result);
  assert.equal((await readFile(evidenceMarkdown, "utf8")).includes("FORBIDDEN"), false);
});

test("cancellation prompt is bounded, read-only, and portable", () => {
  assert.equal(buildCancellationPrompt(), 'Run exactly this one read-only command, verbatim, from the current cwd: node -e "setTimeout(() => {}, 120000)". Do not run any other command or write files; remain active until cancellation.');
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

async function writeHostShim(shimRoot, command, fixturePath) {
  await mkdir(shimRoot, { recursive: true });
  if (process.platform === "win32") {
    await writeFile(join(shimRoot, `${command}.cmd`), `@echo off\r\n"${process.execPath}" "${fixturePath}" %*\r\nexit /b %ERRORLEVEL%\r\n`, "utf8");
  } else {
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    const executable = join(shimRoot, command);
    await writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixturePath)} "$@"\n`, "utf8");
    await chmod(executable, 0o755);
  }
}

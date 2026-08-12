import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  toNamespacedPath,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EXPECTED_SKILLS_VERSION = "1.5.22";
export const EXPECTED_NODE_ENGINE = ">=22.20.0";
export const EXPECTED_CI_JOB_NAMES = Object.freeze([
  "windows-latest / Node 22.20.0",
  "windows-latest / Node 24.x",
  "ubuntu-latest / Node 22.20.0",
  "ubuntu-latest / Node 24.x",
]);
export const RELEASE_LIMITS_MS = Object.freeze({
  perHost: 180_000,
  overall: 420_000,
  cleanupConfirmation: 15_000,
});
export const MAX_HOST_CONCURRENCY = 1;
export const HOST_LIFECYCLE_COMMANDS = Object.freeze(["start", "status", "wait", "resume", "cancel", "list"]);
export const CEILINGS_MS = Object.freeze({
  parent: RELEASE_LIMITS_MS.perHost,
  resume: RELEASE_LIMITS_MS.perHost,
  observeCancellationRunning: 2 * 60_000,
  cancellation: 30_000,
  knownPidAbsence: RELEASE_LIMITS_MS.cleanupConfirmation,
  outer: RELEASE_LIMITS_MS.overall,
});
export const RELEASE_SMOKE_HELP = [
  "Usage: node scripts/release-smoke.mjs --live --tested-commit <40-hex-commit> --ci-run-id <ci-run-id>",
  "",
  `Limits: per-host <= ${RELEASE_LIMITS_MS.perHost} ms; overall <= ${RELEASE_LIMITS_MS.overall} ms; host concurrency = ${MAX_HOST_CONCURRENCY}; cleanup confirmation = ${RELEASE_LIMITS_MS.cleanupConfirmation} ms.`,
  "No other arguments are accepted.",
  "",
].join("\n");

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const canonicalSkillRoot = join(repositoryRoot, "skills", "luna-sidecar");
const canonicalLauncherPath = join(canonicalSkillRoot, "scripts", "luna-sidecar.mjs");
const installerPath = join(repositoryRoot, "node_modules", "skills", "bin", "cli.mjs");
export const DEFAULT_EVIDENCE_DESTINATION = Object.freeze({
  jsonPath: join(repositoryRoot, "docs", "verification", "phase5-final-shape-evidence.json"),
  markdownPath: join(repositoryRoot, "docs", "verification", "phase5-final-shape-evidence.md"),
});
const nestedMarkerEnv = "LUNA_SIDECAR_WORKER_MARKER";
const failureStages = new Set(["validation", "scratch", "installer", "preflight", "provider", "cleanup", "evidence"]);
const controlledCommandNames = new Set([
  "git-init",
  "git-status",
  "git-head",
  "installer",
  "codex-version",
  "claude-version",
  "host-codex",
  "host-claude",
  "manager-start-parent",
  "manager-list",
  "manager-wait-parent",
  "manager-resume",
  "manager-wait-resume",
  "manager-start-cancellation",
  "manager-status-cancellation",
  "manager-cancel",
  "manager-wait-cancellation",
  "process-inspect",
  "process-kill",
  "ci-run",
]);
const gapCodes = new Set([
  "outer_timeout",
  "argument_invalid",
  "scratch_invalid",
  "installer_invalid",
  "installer_failed",
  "install_scope_invalid",
  "install_hash_drift",
  "source_launcher_fallback",
  "provider_version_invalid",
  "codex_cli_unavailable",
  "claude_code_unavailable",
  "codex_cli_host_failed",
  "claude_code_host_failed",
  "host_observation_timeout",
  "host_schema_mismatch",
  "repository_dirty",
  "tested_commit_mismatch",
  "ci_unavailable",
  "ci_head_mismatch",
  "ci_not_successful",
  "ci_jobs_mismatch",
  "manager_spawn_failed",
  "manager_timeout",
  "manager_output_invalid",
  "parent_incomplete",
  "resume_incomplete",
  "cancellation_incomplete",
  "event_schema_mismatch",
  "log_integrity_failed",
  "marker_present",
  "cleanup_stop_failed",
  "cleanup_identity_uncertain",
  "cleanup_identity_mismatch",
  "cleanup_pid_lingering",
  "cleanup_empty_ownership",
  "cleanup_recovery_used",
  "scratch_cleanup_failed",
  "evidence_write_failed",
  "nested_sidecar_forbidden",
]);
const fixedClaim = "Agent Skills copied-install portability plus bounded Codex CLI and Claude Code host observations for the recorded commit, platforms, and CI run only; no task-success or universal-host claim.";
const releaseMarkerBasenamePattern = /^luna-release-marker-[0-9a-f-]+\.txt$/;
const hostDiagnosticKinds = new Set(["spawn", "timeout", "signal", "invocation", "auth", "task", "output", "unknown"]);
const hostDiagnosticMaxChars = 240;
export const HOST_SCHEMA_REASONS = Object.freeze([
  "jsonl_invalid",
  "copied_skill_command_missing",
  "payload_shape_invalid",
  "receipt_invalid",
  "receipt_not_observed",
  "receipt_mismatch",
  "receipt_terminal_invalid",
  "lifecycle_missing",
]);
const hostSchemaReasons = new Set(HOST_SCHEMA_REASONS);

export class ReleaseSmokeError extends Error {
  constructor(code, stage = "validation", schemaReason = null) {
    super(code);
    this.name = "ReleaseSmokeError";
    this.code = gapCodes.has(code) ? code : "argument_invalid";
    this.stage = stage;
    this.schemaReason = hostSchemaReasons.has(schemaReason) ? schemaReason : null;
  }
}

export function parseReleaseSmokeArgs(argv) {
  let live = false;
  let testedCommit = null;
  let ciRunId = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--live") {
      live = true;
    } else if (token === "--tested-commit") {
      testedCommit = argv[++index] ?? null;
    } else if (token === "--ci-run-id") {
      ciRunId = argv[++index] ?? null;
    } else {
      throw new ReleaseSmokeError("argument_invalid");
    }
  }
  if (!live || !/^[0-9a-f]{40}$/i.test(testedCommit ?? "") || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ciRunId ?? "")) {
    throw new ReleaseSmokeError("argument_invalid");
  }
  return { live: true, testedCommit: testedCommit.toLowerCase(), ciRunId };
}

function comparablePath(value) {
  const absolute = resolve(value);
  const comparable = process.platform === "win32" ? toNamespacedPath(absolute) : absolute;
  return process.platform === "win32" ? comparable.toLowerCase() : comparable;
}

function pathsEqual(left, right) {
  return comparablePath(left) === comparablePath(right);
}

export function isPathWithin(root, candidate) {
  if (!isAbsolute(root) || !isAbsolute(candidate)) return false;
  const suffix = relative(comparablePath(root), comparablePath(candidate));
  return suffix === "" || (suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix));
}

export function assertPathWithin(root, candidate, code = "scratch_invalid") {
  if (!isPathWithin(root, candidate)) throw new ReleaseSmokeError(code);
  return candidate;
}

export async function assertFreshRoot(root, parentRoot) {
  assertPathWithin(parentRoot, root);
  try {
    await lstat(root);
  } catch (error) {
    if (error.code === "ENOENT") return root;
    throw new ReleaseSmokeError("scratch_invalid");
  }
  throw new ReleaseSmokeError("scratch_invalid");
}

export async function createFreshRoot(parentRoot, role) {
  const root = join(parentRoot, `${role}-${randomUUID()}`);
  await assertFreshRoot(root, parentRoot);
  await mkdir(root);
  return root;
}

async function assertCanonicalAncestors(scopeRoot, target) {
  const scope = resolve(scopeRoot);
  const canonicalScope = await realpath(scope);
  let current = resolve(target);
  while (true) {
    if (!isPathWithin(scope, current)) throw new ReleaseSmokeError("install_scope_invalid");
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new ReleaseSmokeError("install_scope_invalid");
    const actual = await realpath(current);
    if (!isPathWithin(canonicalScope, actual)) throw new ReleaseSmokeError("install_scope_invalid");
    if (pathsEqual(current, scope)) return;
    const parent = dirname(current);
    if (pathsEqual(parent, current)) throw new ReleaseSmokeError("install_scope_invalid");
    current = parent;
  }
}

export async function assertRegularTree(root, scopeRoot = root) {
  assertPathWithin(scopeRoot, root, "install_scope_invalid");
  await assertCanonicalAncestors(scopeRoot, root);
  const info = await lstat(root);
  if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw new ReleaseSmokeError("install_scope_invalid");
  if (info.isFile()) return;
  for (const entry of await readdir(root, { withFileTypes: true })) await assertRegularTree(join(root, entry.name), scopeRoot);
}

export async function buildManifest(root, scopeRoot = root) {
  await assertRegularTree(root, scopeRoot);
  const entries = [];
  async function visit(current) {
    const info = await lstat(current);
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw new ReleaseSmokeError("install_scope_invalid");
    if (info.isDirectory()) {
      for (const entry of await readdir(current, { withFileTypes: true })) await visit(join(current, entry.name));
      return;
    }
    const bytes = await readFile(current);
    entries.push({
      path: relative(root, current).split(sep).join("/"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    });
  }
  await visit(root);
  entries.sort((left, right) => left.path < right.path ? -1 : (left.path > right.path ? 1 : 0));
  return entries;
}

export function compareManifests(left, right) {
  const normalize = (manifest) => manifest.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }));
  const a = JSON.stringify(normalize(left));
  const b = JSON.stringify(normalize(right));
  return { equal: a === b, left, right };
}

export function manifestDigest(manifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

async function findSkillRoots(projectRoot, skillName) {
  const found = [];
  async function visit(current) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      if (basename(current) === skillName || basename(dirname(current)) === "skills") throw new ReleaseSmokeError("install_scope_invalid");
      return;
    }
    if (!info.isDirectory()) return;
    if (basename(current) === "node_modules" || basename(current) === ".git") return;
    if (basename(current) === skillName && basename(dirname(current)) === "skills") found.push(current);
    for (const entry of await readdir(current, { withFileTypes: true })) await visit(join(current, entry.name));
  }
  await visit(projectRoot);
  return found;
}

export async function validateInstallRoots(projectRoot, skillName = "luna-sidecar") {
  const expected = [join(projectRoot, ".agents", "skills", skillName), join(projectRoot, ".claude", "skills", skillName)];
  const found = await findSkillRoots(projectRoot, skillName);
  const expectedKeys = new Set(expected.map((value) => resolve(value).toLowerCase()));
  const foundKeys = new Set(found.map((value) => resolve(value).toLowerCase()));
  if (found.length !== expected.length || foundKeys.size !== expectedKeys.size || [...expectedKeys].some((value) => !foundKeys.has(value))) {
    throw new ReleaseSmokeError("install_scope_invalid");
  }
  for (const root of expected) {
    await assertCanonicalAncestors(projectRoot, root);
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ReleaseSmokeError("install_scope_invalid");
    await assertRegularTree(root, projectRoot);
  }
  return expected;
}

async function assertNoGlobalSkill(env, skillName = "luna-sidecar") {
  const homeRoots = [...new Set([env.HOME, env.USERPROFILE].filter((value) => typeof value === "string"))];
  const candidates = homeRoots.flatMap((homeRoot) => [
    join(homeRoot, ".agents", "skills", skillName),
    join(homeRoot, ".claude", "skills", skillName),
    join(homeRoot, ".codex", "skills", skillName),
    join(homeRoot, ".config", "agents", "skills", skillName),
  ]);
  if (typeof env.CODEX_HOME === "string") candidates.push(join(env.CODEX_HOME, "skills", skillName));
  if (typeof env.CLAUDE_CONFIG_DIR === "string") candidates.push(join(env.CLAUDE_CONFIG_DIR, "skills", skillName));
  for (const candidate of candidates) {
    try { await lstat(candidate); throw new ReleaseSmokeError("install_scope_invalid"); }
    catch (error) { if (error instanceof ReleaseSmokeError) throw error; if (error.code !== "ENOENT") throw new ReleaseSmokeError("install_scope_invalid"); }
  }
}

export async function installCopiedSkills({ projectRoot, sourceRoot = repositoryRoot, installer = installerPath, run, env, deadline, commandLog }) {
  if (!isAbsolute(installer) || !pathsEqual(installer, installerPath)) throw new ReleaseSmokeError("installer_invalid");
  const metadata = JSON.parse(await readFile(join(dirname(installer), "..", "package.json"), "utf8"));
  if (metadata.version !== EXPECTED_SKILLS_VERSION || metadata.engines?.node !== EXPECTED_NODE_ENGINE || metadata.bin?.skills !== "./bin/cli.mjs") throw new ReleaseSmokeError("installer_invalid");
  const sourceRealpath = await realpath(sourceRoot);
  assertPathWithin(await realpath(repositoryRoot), sourceRealpath, "installer_invalid");
  const sourceSkillRoot = join(sourceRealpath, "skills", "luna-sidecar");
  const sourceManifest = await buildManifest(sourceSkillRoot, sourceRealpath);
  const result = await run(process.execPath, [installer, "add", sourceRealpath, "--skill", "luna-sidecar", "--copy", "-a", "codex", "-a", "claude-code", "-y"], { cwd: projectRoot, env, deadline, commandLog, commandName: "installer" });
  if (result.timedOut) throw new ReleaseSmokeError("outer_timeout", "installer");
  if (result.code !== 0 || result.signal) throw new ReleaseSmokeError("installer_failed", "installer");
  await assertNoGlobalSkill(env);
  const [codexRoot, claudeRoot] = await validateInstallRoots(projectRoot);
  const [sourceAfter, codexManifest, claudeManifest] = await Promise.all([
    buildManifest(sourceSkillRoot, sourceRealpath),
    buildManifest(codexRoot, projectRoot),
    buildManifest(claudeRoot, projectRoot),
  ]);
  if (!compareManifests(sourceManifest, sourceAfter).equal || !compareManifests(sourceManifest, codexManifest).equal || !compareManifests(codexManifest, claudeManifest).equal) throw new ReleaseSmokeError("install_hash_drift", "installer");
  const codexLauncher = join(codexRoot, "scripts", "luna-sidecar.mjs");
  const claudeLauncher = join(claudeRoot, "scripts", "luna-sidecar.mjs");
  for (const launcher of [codexLauncher, claudeLauncher]) {
    await assertCanonicalAncestors(projectRoot, launcher);
  }
  return {
    sourceSkillRoot,
    roots: { codex: codexRoot, claude: claudeRoot },
    launchers: { codex: codexLauncher, claude: claudeLauncher },
    manifests: { canonical: sourceManifest, codex: codexManifest, claude: claudeManifest },
    manifestHashes: { canonical: manifestDigest(sourceManifest), codex: manifestDigest(codexManifest), claude: manifestDigest(claudeManifest) },
  };
}

export async function validateInstalledSnapshot(install, projectRoot) {
  if (!install?.sourceSkillRoot || !install?.roots || !install?.launchers || !install?.manifests) throw new ReleaseSmokeError("install_hash_drift", "preflight");
  const [codexRoot, claudeRoot] = await validateInstallRoots(projectRoot);
  if (!pathsEqual(codexRoot, install.roots.codex) || !pathsEqual(claudeRoot, install.roots.claude)) throw new ReleaseSmokeError("install_scope_invalid", "preflight");
  const [canonical, codex, claude] = await Promise.all([
    buildManifest(install.sourceSkillRoot, repositoryRoot),
    buildManifest(codexRoot, projectRoot),
    buildManifest(claudeRoot, projectRoot),
  ]);
  if (!compareManifests(install.manifests.canonical, canonical).equal || !compareManifests(install.manifests.codex, codex).equal || !compareManifests(install.manifests.claude, claude).equal) throw new ReleaseSmokeError("install_hash_drift", "preflight");
  for (const [launcher, expectedRoot] of [[install.launchers.codex, codexRoot], [install.launchers.claude, claudeRoot]]) {
    assertCopiedLauncher(launcher, projectRoot);
    if (!pathsEqual(dirname(dirname(launcher)), expectedRoot)) throw new ReleaseSmokeError("source_launcher_fallback", "preflight");
    await assertCanonicalAncestors(projectRoot, launcher);
    const info = await lstat(launcher);
    if (!info.isFile() || info.isSymbolicLink()) throw new ReleaseSmokeError("install_scope_invalid", "preflight");
  }
  return { canonical, codex, claude };
}

export function successfulNativeChildPredicate(event) {
  const item = event?.item;
  return event?.type === "item.completed"
    && item?.type === "collab_tool_call"
    && item?.tool === "spawn_agent"
    && item?.status === "completed"
    && Array.isArray(item.receiver_thread_ids)
    && item.receiver_thread_ids.length > 0
    && item.receiver_thread_ids.every((value) => typeof value === "string" && value.length > 0);
}

export function countSuccessfulNativeChildren(events) {
  const receivers = new Set();
  for (const event of events ?? []) if (successfulNativeChildPredicate(event)) for (const id of event.item.receiver_thread_ids) receivers.add(id);
  return { count: receivers.size, exactTwo: receivers.size === 2 };
}

export function failedMarkerCommandPredicate(event, markerBasename) {
  const item = event?.item;
  const command = Array.isArray(item?.command) ? item.command.join(" ") : item?.command;
  return event?.type === "item.completed"
    && item?.type === "command_execution"
    && item?.status === "failed"
    && typeof command === "string"
    && command.includes(markerBasename)
    && Number.isInteger(item.exit_code)
    && item.exit_code !== 0;
}

export function buildResumePrompt(markerBasename) {
  if (!releaseMarkerBasenamePattern.test(markerBasename)) throw new ReleaseSmokeError("argument_invalid");
  const command = `node -e "require('node:fs').writeFileSync('${markerBasename}', 'release-smoke')"`;
  return [
    "Controlled read-only resume verification.",
    `Run exactly this one command, verbatim, from the current cwd: ${command}`,
    "The command is expected to be denied or fail under read-only authority with a nonzero exit code.",
    "Do not use bypass, permissions changes, alternate paths or filenames, any other write mechanism, or any other command; do not merely explain or simulate the attempt.",
    "After that one command returns, report the current cwd and stop.",
  ].join(" ");
}

export function buildCancellationPrompt() {
  return 'Run exactly this one read-only command, verbatim, from the current cwd: node -e "setTimeout(() => {}, 120000)". Do not run any other command or write files; remain active until cancellation.';
}

export function cancellationPredicate({ providerPid, providerRunning, acknowledged, state, result, knownOwnedPidsGone }) {
  return Number.isSafeInteger(providerPid)
    && providerPid > 0
    && providerRunning === true
    && acknowledged === true
    && state === "cancelled"
    && result === "cancelled"
    && knownOwnedPidsGone === true;
}

export function authorityCwdLineagePredicate(actual, expected) {
  return typeof actual?.workerId === "string"
    && actual.workerId.length > 0
    && typeof actual?.turnId === "string"
    && actual.turnId.length > 0
    && actual?.cwd === expected?.cwd
    && actual?.effort === expected?.effort
    && actual?.sandbox === expected?.sandbox
    && actual?.bypass === expected?.bypass
    && actual?.workerId === expected?.workerId
    && actual?.turnId === expected?.turnId;
}

export function validateCiEvidence(run, testedCommit) {
  if (!run || typeof run.headSha !== "string" || run.headSha.toLowerCase() !== testedCommit.toLowerCase()) return { valid: false, code: "ci_head_mismatch" };
  if (run.status !== "completed" || run.conclusion !== "success") return { valid: false, code: "ci_not_successful" };
  const jobs = Array.isArray(run.jobs) ? run.jobs : [];
  const names = jobs.map((job) => job?.name);
  if (jobs.length !== EXPECTED_CI_JOB_NAMES.length || new Set(names).size !== EXPECTED_CI_JOB_NAMES.length || !EXPECTED_CI_JOB_NAMES.every((name) => names.includes(name))) return { valid: false, code: "ci_jobs_mismatch" };
  const ids = jobs.map(ciJobId);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== jobs.length) return { valid: false, code: "ci_jobs_mismatch" };
  if (jobs.some((job) => job.status !== "completed" || job.conclusion !== "success")) return { valid: false, code: "ci_not_successful" };
  return { valid: true, code: null };
}

function ciJobId(job) {
  return Number.isSafeInteger(job?.databaseId) ? job.databaseId : job?.id;
}

export async function verifyBeforeProviderSpawn({ testedCommit, ciRunId, run, queryCi, gitRoot = repositoryRoot, deadline, commandLog }) {
  const status = await runChecked(run, "git-status", ["status", "--porcelain", "--untracked-files=all"], { cwd: gitRoot, deadline, commandLog });
  if (status.timedOut) throw new ReleaseSmokeError("outer_timeout", "preflight");
  if (status.code !== 0 || status.stdout.trim() !== "") throw new ReleaseSmokeError("repository_dirty", "preflight");
  const head = await runChecked(run, "git-head", ["rev-parse", "HEAD"], { cwd: gitRoot, deadline, commandLog });
  if (head.timedOut) throw new ReleaseSmokeError("outer_timeout", "preflight");
  if (head.code !== 0 || head.stdout.trim().toLowerCase() !== testedCommit.toLowerCase()) throw new ReleaseSmokeError("tested_commit_mismatch", "preflight");
  let ci;
  try { ci = await queryCi(ciRunId, run, deadline, commandLog); }
  catch (error) { if (error instanceof ReleaseSmokeError) throw error; throw new ReleaseSmokeError("ci_unavailable", "preflight"); }
  const validation = validateCiEvidence(ci, testedCommit);
  if (!validation.valid) throw new ReleaseSmokeError(validation.code, "preflight");
  return { head: head.stdout.trim(), ci };
}

export async function queryGitHubRun(ciRunId, run, deadline, commandLog) {
  const result = await runChecked(run, "ci-run", ["run", "view", ciRunId, "--json", "headSha,status,conclusion,jobs"], { cwd: repositoryRoot, deadline, commandLog, file: "gh" });
  if (result.timedOut) throw new ReleaseSmokeError("outer_timeout", "preflight");
  if (result.code !== 0) throw new ReleaseSmokeError("ci_unavailable", "preflight");
  try { return JSON.parse(result.stdout); }
  catch { throw new ReleaseSmokeError("ci_unavailable", "preflight"); }
}

export function assertCopiedLauncher(launcher, projectRoot, source = canonicalLauncherPath) {
  if (!isAbsolute(launcher) || pathsEqual(launcher, source) || !isPathWithin(projectRoot, launcher)) throw new ReleaseSmokeError("source_launcher_fallback");
  return launcher;
}

export async function assertCopiedLauncherReady(launcher, projectRoot, source = canonicalLauncherPath) {
  assertCopiedLauncher(launcher, projectRoot, source);
  await assertCanonicalAncestors(projectRoot, launcher);
  const info = await lstat(launcher);
  if (!info.isFile() || info.isSymbolicLink()) throw new ReleaseSmokeError("source_launcher_fallback", "preflight");
  return launcher;
}

export function validateWaitOutcome(result) {
  if (!result || result.timedOut === true) return false;
  if (result.code !== 0 || result.signal) return false;
  try {
    const receipt = typeof result.stdout === "string" ? JSON.parse(result.stdout) : result.receipt;
    return receipt?.timedOut !== true && (receipt?.state === "completed" || receipt?.state === "cancelled");
  } catch { return false; }
}

export function validateCancellationOutcome(receipt) {
  return receipt?.state === "cancelled" && receipt?.cancel?.result === "cancelled" && Boolean(receipt?.cancel?.acknowledgedAt) && receipt?.taskOutcome === "not_evaluated";
}

async function validateContainedFile(pathValue, expectedPath, stateRoot) {
  if (typeof pathValue !== "string" || !pathsEqual(pathValue, expectedPath) || !isPathWithin(stateRoot, pathValue)) throw new ReleaseSmokeError("log_integrity_failed");
  await assertCanonicalAncestors(stateRoot, pathValue);
  const info = await lstat(pathValue);
  if (!info.isFile() || info.isSymbolicLink()) throw new ReleaseSmokeError("log_integrity_failed");
  const canonical = await realpath(pathValue);
  if (!isPathWithin(await realpath(stateRoot), canonical)) throw new ReleaseSmokeError("log_integrity_failed");
  return info.size;
}

export async function validateLogIntegrity(receipt, stateRoot) {
  const logs = receipt?.logs;
  const turnId = receipt?.turnId;
  if (!logs || typeof turnId !== "string") throw new ReleaseSmokeError("log_integrity_failed");
  if (logs.sealed !== true || typeof logs.sealedAt !== "string" || logs.pruned !== false || logs.pruning !== false || logs.truncated !== false || logs.stdoutTruncated !== false || logs.stderrTruncated !== false || logs.stdoutMissing !== false || logs.stderrMissing !== false) throw new ReleaseSmokeError("log_integrity_failed");
  const stdoutPath = join(stateRoot, "logs", `${turnId}.jsonl`);
  const stderrPath = join(stateRoot, "logs", `${turnId}.stderr.log`);
  const stdoutSize = await validateContainedFile(logs.stdoutPath, stdoutPath, stateRoot);
  const stderrSize = await validateContainedFile(logs.stderrPath, stderrPath, stateRoot);
  for (const [prefix, size] of [["stdout", stdoutSize], ["stderr", stderrSize]]) {
    const observed = logs[`${prefix}ObservedBytes`];
    const persisted = logs[`${prefix}PersistedBytes`];
    const dropped = logs[`${prefix}DroppedBytes`];
    const bytes = logs[`${prefix}Bytes`];
    if (![observed, persisted, dropped, bytes].every((value) => Number.isSafeInteger(value) && value >= 0) || observed !== bytes || persisted + dropped !== observed || persisted !== size || dropped !== 0) throw new ReleaseSmokeError("log_integrity_failed");
  }
  return { stdoutPath, stderrPath, stdoutBytes: stdoutSize, stderrBytes: stderrSize };
}

async function parseEventsFromLogs(receipt, stateRoot) {
  const paths = await validateLogIntegrity(receipt, stateRoot);
  const text = await readFile(paths.stdoutPath, "utf8");
  const events = [];
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    try { events.push(JSON.parse(line)); }
    catch { throw new ReleaseSmokeError("event_schema_mismatch"); }
  }
  return events;
}

export function validateCompletedReceipt(receipt, expected) {
  return receipt?.state === "completed"
    && receipt?.providerState === "completed"
    && receipt?.exitCode === 0
    && receipt?.signal === null
    && receipt?.taskOutcome === "not_evaluated"
    && authorityCwdLineagePredicate(receipt, expected)
    && typeof receipt.completedAt === "string";
}

export function evaluateCleanupFacts(facts) {
  const gaps = [];
  const counts = ["launchedWorkerCount", "discoveredWorkerCount", "ownedPidCount", "stopFailures", "identityUncertain", "identityMismatches", "lingeringPids"];
  const booleans = ["attempted", "recoveryUsed", "scratchCleanupFailed"];
  if (!facts || counts.some((key) => !Number.isSafeInteger(facts[key]) || facts[key] < 0) || booleans.some((key) => typeof facts[key] !== "boolean")) gaps.push("cleanup_identity_uncertain");
  if (facts?.attempted !== true) gaps.push("cleanup_identity_uncertain");
  if (Number.isSafeInteger(facts?.launchedWorkerCount) && Number.isSafeInteger(facts?.discoveredWorkerCount) && facts.discoveredWorkerCount !== facts.launchedWorkerCount) gaps.push("cleanup_identity_uncertain");
  if (facts?.launchedWorkerCount > 0 && facts?.ownedPidCount === 0) gaps.push("cleanup_empty_ownership");
  if (facts?.stopFailures > 0) gaps.push("cleanup_stop_failed");
  if (facts?.identityUncertain > 0) gaps.push("cleanup_identity_uncertain");
  if (facts?.identityMismatches > 0) gaps.push("cleanup_identity_mismatch");
  if (facts?.lingeringPids > 0) gaps.push("cleanup_pid_lingering");
  if (facts?.recoveryUsed) gaps.push("cleanup_recovery_used");
  if (facts?.scratchCleanupFailed) gaps.push("scratch_cleanup_failed");
  return { releaseReady: gaps.length === 0, gaps: [...new Set(gaps)] };
}

export function createRedactedRecord(kind, data) {
  if (kind === "preflight") {
    return JSON.stringify({
      type: "release-smoke-preflight",
      schemaVersion: 1,
      testedCommit: safeCommit(data.testedCommit),
      ciRunId: safeCiRunId(data.ciRunId),
      rootRoles: ["project", "installer-home", "state", "parent-caller", "resume-caller", "cancellation-caller", "temp"],
      installManifestHashes: {
        canonical: safeHash(data.installManifestHashes?.canonical),
        codex: safeHash(data.installManifestHashes?.codex),
        claude: safeHash(data.installManifestHashes?.claude),
      },
    });
  }
  return JSON.stringify({
    type: "release-smoke-final",
    schemaVersion: 1,
    testedCommit: safeCommit(data.testedCommit),
    releaseReady: data.releaseReady === true,
    failureStage: failureStages.has(data.failureStage) ? data.failureStage : null,
    predicateCounts: { nativeChildCount: Number.isSafeInteger(data.predicateCounts?.nativeChildCount) && data.predicateCounts.nativeChildCount >= 0 ? data.predicateCounts.nativeChildCount : 0 },
    cleanup: normalizeCleanup(data.cleanup ?? { attempted: true, releaseReady: false }),
    unresolvedGaps: [...new Set((data.unresolvedGaps ?? []).filter((code) => gapCodes.has(code)))].sort(),
  });
}

function safeRelativePath(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(value)) return null;
  if (value.split("/").some((segment) => segment === "." || segment === "..")) return null;
  return value;
}

function safeHash(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function safeCommit(value) {
  return /^[0-9a-f]{40}$/i.test(String(value ?? "")) ? String(value).toLowerCase() : null;
}

function safeCiRunId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value ?? "")) ? String(value) : null;
}

function safeVersion(value) {
  return typeof value === "string" && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(value) ? value : null;
}

export function redactEvidence(input) {
  const allowedRootRoles = new Set(["project", "installer-home", "state", "parent-caller", "resume-caller", "cancellation-caller", "temp", "canonical-source"]);
  const allowedInstallAgents = new Set(["canonical", "codex", "claude-code"]);
  const rootPaths = { project: "project", "installer-home": "installer-home", state: "state", "parent-caller": "parent-caller", "resume-caller": "resume-caller", "cancellation-caller": "cancellation-caller", temp: "temp", "canonical-source": "repository/skills/luna-sidecar" };
  const installPaths = { canonical: "skills/luna-sidecar", codex: ".agents/skills/luna-sidecar", "claude-code": ".claude/skills/luna-sidecar" };
  const roots = (input.rootRoles ?? [])
    .filter((root) => allowedRootRoles.has(root.role))
    .map((root) => ({ role: root.role, relativePath: safeRelativePath(root.relativePath) === rootPaths[root.role] ? rootPaths[root.role] : null, pathHash: safeHash(root.pathHash) }));
  const installs = (input.installs ?? [])
    .filter((install) => allowedInstallAgents.has(install.agent))
    .map((install) => ({ agent: install.agent, relativePath: safeRelativePath(install.relativePath) === installPaths[install.agent] ? installPaths[install.agent] : null, manifestHash: safeHash(install.manifestHash) }));
  const ci = input.ci ? {
    runId: /^[A-Za-z0-9._-]+$/.test(String(input.ci.runId ?? "")) ? String(input.ci.runId) : null,
    headSha: /^[0-9a-f]{40}$/i.test(String(input.ci.headSha ?? "")) ? String(input.ci.headSha).toLowerCase() : null,
    status: input.ci.status === "completed" ? "completed" : null,
    conclusion: input.ci.conclusion === "success" ? "success" : null,
    jobs: (input.ci.jobs ?? [])
      .filter((job) => EXPECTED_CI_JOB_NAMES.includes(job.name))
      .map((job) => ({ id: Number.isSafeInteger(ciJobId(job)) && ciJobId(job) > 0 ? ciJobId(job) : null, name: job.name, status: job.status === "completed" ? "completed" : null, conclusion: job.conclusion === "success" ? "success" : null }))
      .sort((left, right) => EXPECTED_CI_JOB_NAMES.indexOf(left.name) - EXPECTED_CI_JOB_NAMES.indexOf(right.name)),
  } : null;
  const commands = (input.commands ?? []).map((command) => ({ name: controlledCommandNames.has(command.name) ? command.name : "unknown", exitCode: Number.isInteger(command.exitCode) ? command.exitCode : null }));
  const normalizedHosts = normalizeHosts(input.hosts);
  const hosts = Object.fromEntries(Object.entries(normalizedHosts).map(([provider, host]) => {
    const lifecycle = normalizeLifecycle(input.hosts?.[provider]?.lifecycle ?? host.lifecycle);
    return [provider, {
      ...host,
      lifecycle,
      claimEligible: host.claimEligible === true && lifecycleComplete(lifecycle),
    }];
  }));
  const otherGates = normalizeOtherGates(input.otherGates);
  const cleanup = normalizeCleanup(input.cleanup);
  const releaseReady = input.releaseReady === true
    && Object.values(hosts).every((host) => host.claimEligible === true)
    && Object.values(otherGates).every(Boolean)
    && cleanup.releaseReady === true
    && input.predicates?.outerTimedOut !== true;
  return {
    schemaVersion: 1,
    testedCommit: /^[0-9a-f]{40}$/i.test(String(input.testedCommit ?? "")) ? String(input.testedCommit).toLowerCase() : null,
    platform: ["win32", "linux", "darwin"].includes(input.platform) ? input.platform : null,
    nodeVersion: safeVersion(input.nodeVersion),
    codexVersion: safeVersion(input.codexVersion),
    skillsVersion: input.skillsVersion === EXPECTED_SKILLS_VERSION ? EXPECTED_SKILLS_VERSION : null,
    roots,
    installs,
    ci,
    limits: normalizeLimits(),
    hosts,
    otherGates,
    commands,
    predicates: normalizePredicates(input.predicates),
    cleanup,
    unresolvedGaps: [...new Set((input.unresolvedGaps ?? []).filter((code) => gapCodes.has(code)))].sort(),
    claim: fixedClaim,
    releaseReady,
    failureStage: failureStages.has(input.failureStage) ? input.failureStage : null,
  };
}

function emptyLifecycle() {
  return Object.fromEntries(HOST_LIFECYCLE_COMMANDS.map((command) => [command, false]));
}

function normalizeLifecycle(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(HOST_LIFECYCLE_COMMANDS.map((command) => [command, source[command] === true]));
}

function lifecycleComplete(value) {
  return HOST_LIFECYCLE_COMMANDS.every((command) => value?.[command] === true);
}

function normalizeLimits() {
  return {
    perHostMs: CEILINGS_MS.parent,
    overallMs: CEILINGS_MS.outer,
    maxHostConcurrency: MAX_HOST_CONCURRENCY,
    cleanupConfirmationMs: CEILINGS_MS.knownPidAbsence,
  };
}

function normalizeHosts(value) {
  const output = {};
  for (const name of ["codex_cli", "claude_code"]) {
    const host = value?.[name] && typeof value[name] === "object" ? value[name] : {};
    const receipt = host.sidecarReceipt && typeof host.sidecarReceipt === "object" ? host.sidecarReceipt : {};
    const cleanup = host.cleanup && typeof host.cleanup === "object" ? host.cleanup : {};
    const available = host.available === true;
    const schemaResult = ["valid", "missing", "invalid", "not_run"].includes(receipt.schemaResult) ? receipt.schemaResult : "not_run";
    const schemaReason = schemaResult === "invalid" && hostSchemaReasons.has(receipt.schemaReason) ? receipt.schemaReason : null;
    const cleanupResult = ["verified", "uncertain", "not_run"].includes(cleanup.result) ? cleanup.result : "not_run";
    const ownedPidResult = ["all_gone", "uncertain", "lingering", "not_run"].includes(cleanup.ownedPidResult) ? cleanup.ownedPidResult : "not_run";
    const eligible = available
      && typeof host.invocationRef === "string" && host.invocationRef.length > 0
      && typeof host.procedureRef === "string" && host.procedureRef.length > 0
      && safeVersion(host.hostVersion)
      && receipt.schemaVersion === 2
      && schemaResult === "valid"
      && cleanupResult === "verified"
      && ownedPidResult === "all_gone"
      && cleanup.ownedPidsGone === true
      && host.failureCode === null;
    output[name] = {
      available,
      invocationRef: typeof host.invocationRef === "string" && host.invocationRef.length > 0 ? host.invocationRef : null,
      procedureRef: typeof host.procedureRef === "string" && host.procedureRef.length > 0 ? host.procedureRef : null,
      hostVersion: safeVersion(host.hostVersion),
      sidecarReceipt: { schemaVersion: receipt.schemaVersion === 2 ? 2 : null, schemaResult, ...(schemaReason ? { schemaReason } : {}) },
      cleanup: {
        result: cleanupResult,
        ownedPidResult,
        ownedPids: [],
        ownedPidsGone: cleanup.ownedPidsGone === true,
      },
      failureDiagnostics: normalizeHostFailureDiagnostics(host.failureDiagnostics),
      failureCode: typeof host.failureCode === "string" && host.failureCode.length > 0 ? host.failureCode : (eligible ? null : "host_evidence_invalid"),
      claimEligible: eligible,
    };
  }
  return output;
}

function normalizeHostFailureDiagnostics(value) {
  if (!value || typeof value !== "object") return null;
  const stream = (item) => {
    if (!item || typeof item !== "object") return { present: false, summary: "", truncated: false };
    const summary = redactHostDiagnosticText(item.summary);
    return {
      present: item.present === true,
      summary: summary.text,
      truncated: item.truncated === true || summary.truncated,
    };
  };
  return {
    kind: hostDiagnosticKinds.has(value.kind) ? value.kind : "unknown",
    exitCode: Number.isSafeInteger(value.exitCode) ? value.exitCode : null,
    signal: typeof value.signal === "string" && /^SIG[A-Z0-9]+$/.test(value.signal) ? value.signal : null,
    spawnError: typeof value.spawnError === "string" && /^[A-Z0-9_]+$/.test(value.spawnError) ? value.spawnError.slice(0, 32) : null,
    stdout: stream(value.stdout),
    stderr: stream(value.stderr),
  };
}

function redactHostDiagnosticText(value) {
  let text = typeof value === "string" ? value : "";
  text = text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r?\n/g, " ");
  text = text.replace(/https?:\/\/[^\s]+/gi, "<url>");
  text = text.replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]+\b/gi, "<secret>");
  text = text.replace(/((?:api[-_ ]?key|token|secret|password|authorization|bearer)\s*[:=]\s*)[^\s]+/gi, "$1<secret>");
  text = text.replace(/\b[A-Za-z]:\\[^\s"'`]+/g, "<path>");
  text = text.replace(/(?:^|\s)\/(?:[^\s"'`]+\/)+[^\s"'`]+/g, " <path>");
  text = text.replace(/\b(?:prompt|input|message)\s*[:=].*$/i, (match) => match.replace(/([:=]).*$/, "$1<redacted>"));
  text = text.replace(/\s+/g, " ").trim();
  return { text: text.slice(0, hostDiagnosticMaxChars), truncated: text.length > hostDiagnosticMaxChars };
}

function summarizeHostDiagnosticStream(value, stream) {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return { present: false, summary: "", truncated: false };
  if (stream === "stdout") {
    const structuredFailure = structuredHostFailureSummary(raw);
    if (structuredFailure) {
      const summary = redactHostDiagnosticText(structuredFailure);
      return { present: true, summary: summary.text, truncated: summary.truncated };
    }
    const structured = raw.split(/\r?\n/).some((line) => /^[\s]*[{[]/.test(line));
    return { present: true, summary: structured ? "structured output present" : "non-structured output present", truncated: raw.length > hostDiagnosticMaxChars };
  }
  const summary = redactHostDiagnosticText(raw);
  return { present: true, summary: summary.text, truncated: summary.truncated };
}

function structuredHostFailureSummary(value) {
  for (const line of String(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); }
    catch { continue; }
    if (event?.type === "result" && (event.is_error === true || event.subtype === "error")) {
      const code = typeof event.error?.code === "string" ? event.error.code : null;
      const message = typeof event.result === "string" ? event.result : (typeof event.error?.message === "string" ? event.error.message : null);
      if (code || message) return [code, message].filter(Boolean).join(": ");
    }
    if (event?.type !== "error" && event?.type !== "turn.failed") continue;
    let payload = event;
    for (let depth = 0; depth < 3 && typeof payload?.error === "string"; depth++) {
      try { payload = JSON.parse(payload.error); }
      catch { break; }
    }
    const details = payload?.error && typeof payload.error === "object" ? payload.error : payload;
    const code = details?.code ?? details?.error_code ?? payload?.code ?? payload?.error_code;
    const message = details?.message ?? payload?.message;
    if (typeof code === "string" || typeof message === "string") return [code, message].filter((item) => typeof item === "string" && item.length > 0).join(": ");
  }
  return null;
}

function classifyHostFailure(result) {
  if (result?.timedOut) return "timeout";
  if (result?.spawnError) return "spawn";
  if (result?.signal) return "signal";
  const text = `${result?.stderr ?? ""}\n${result?.stdout ?? ""}`.toLowerCase();
  if (/\b(?:authentication|unauthori[sz]ed|forbidden|api key|credential|login|sign in|bearer token)\b/.test(text)) return "auth";
  if (/\b(?:invalid_json_schema|json|schema|parse|structured output|malformed|unexpected end)\b/.test(text)) return "output";
  if (/\b(?:unknown|unrecognized|invalid|unsupported|missing required|usage:|option|argument|command not found)\b/.test(text)) return "invocation";
  if (/\b(?:task|agent|worker|execution|provider)\b[^\n]{0,80}\b(?:failed|failure|error|timed out)\b/.test(text)) return "task";
  return "unknown";
}

function hostFailureDiagnostics(result) {
  return {
    kind: classifyHostFailure(result),
    exitCode: Number.isSafeInteger(result?.code) ? result.code : null,
    signal: typeof result?.signal === "string" ? result.signal : null,
    spawnError: typeof result?.spawnError === "string" ? result.spawnError : null,
    stdout: summarizeHostDiagnosticStream(result?.stdout, "stdout"),
    stderr: summarizeHostDiagnosticStream(result?.stderr, "stderr"),
  };
}

function normalizeOtherGates(value) {
  const defaults = { deterministic: false, installedParity: false, ci: false, delivery: false, evidence: false };
  if (!value || typeof value !== "object") return defaults;
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, value[key] === true]));
}

function normalizePredicateObject(value, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (allowedKeys && !allowedKeys.has(key)) continue;
    if (typeof item === "boolean" || (Number.isSafeInteger(item) && item >= 0)) output[key] = item;
    else if (item && typeof item === "object" && !Array.isArray(item)) output[key] = normalizePredicateObject(item, allowedKeys);
  }
  return output;
}

function normalizePredicates(value) {
  const allowed = {
    top: new Set(["outerTimedOut", "parent", "resume", "cancellation", "nativeChildCount", "sixCommandSurface", "explicitControls", "readiness", "zeroDefaultRetry", "providerOwnedMcp", "usagePassthroughOrUnavailable", "boundedListHistory"]),
    parent: new Set(["authority", "cwd", "lineage", "completed", "providerCompleted", "logs", "nativeChildCount"]),
    resume: new Set(["authority", "cwd", "lineage", "completed", "providerCompleted", "logs", "markerCommandFailed", "markerAbsent"]),
    cancellation: new Set(["authority", "cwd", "lineage", "providerRunningBeforeCancel", "acknowledged", "cancelled", "result", "knownPidsGone"]),
    lifecycle: new Set(HOST_LIFECYCLE_COMMANDS),
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = normalizePredicateObject(value, allowed.top);
  for (const key of ["parent", "resume", "cancellation", "lifecycle"]) if (value[key] && typeof value[key] === "object") output[key] = normalizePredicateObject(value[key], allowed[key]);
  return output;
}

function normalizeCleanup(value) {
  if (!value || typeof value !== "object") return { attempted: false, releaseReady: false };
  const allowed = new Set(["attempted", "launchedWorkerCount", "discoveredWorkerCount", "ownedPidCount", "stopFailures", "identityUncertain", "identityMismatches", "lingeringPids", "recoveryUsed", "scratchCleanupFailed", "releaseReady"]);
  const output = {};
  for (const [key, item] of Object.entries(value)) if (allowed.has(key) && (typeof item === "boolean" || (Number.isSafeInteger(item) && item >= 0))) output[key] = item;
  return output;
}

export function renderEvidenceMarkdown(evidence) {
  return [
    "# Luna Sidecar release evidence",
    "",
    "This file is a deterministic rendering of the canonical JSON evidence.",
    "",
    "```json",
    JSON.stringify(evidence, null, 2),
    "```",
    "",
  ].join("\n");
}

export function canonicalEvidenceJson(evidence) {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export async function writeEvidenceArtifacts(evidence, { jsonPath, markdownPath }) {
  const json = canonicalEvidenceJson(evidence);
  const markdown = renderEvidenceMarkdown(evidence);
  const jsonTemp = `${jsonPath}.${randomUUID()}.tmp`;
  const markdownTemp = `${markdownPath}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(jsonPath), { recursive: true });
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeFile(jsonTemp, json, "utf8");
    await writeFile(markdownTemp, markdown, "utf8");
    await rename(jsonTemp, jsonPath);
    await rename(markdownTemp, markdownPath);
  } finally {
    await rm(jsonTemp, { force: true }).catch(() => {});
    await rm(markdownTemp, { force: true }).catch(() => {});
  }
}

export function runCapturedCommand(file, args, options = {}) {
  return new Promise((resolvePromise) => {
    const { input, deadline, timeout, commandLog, commandName, ...spawnOptions } = options;
    const remaining = deadline ? deadline.at - Date.now() : Number.POSITIVE_INFINITY;
    if (remaining <= 0) {
      deadline.timedOut = true;
      resolvePromise({ code: null, signal: null, timedOut: true, outerTimedOut: true, pid: null, stdout: "", stderr: "" });
      return;
    }
    const child = spawn(file, args, { detached: process.platform !== "win32", ...spawnOptions, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], shell: false, windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    let settled = false;
    let timeoutState = null;
    const localCeiling = Number.isFinite(timeout) ? Math.max(1, timeout) : Number.POSITIVE_INFINITY;
    const ceiling = Math.min(remaining, localCeiling);
    const outerWins = remaining <= localCeiling;
    const finish = (partial) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = { code: null, signal: null, timedOut: false, outerTimedOut: false, pid: child.pid ?? null, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), ...partial };
      if (commandLog && commandName) commandLog.push({ name: commandName, exitCode: result.code });
      resolvePromise(result);
    };
    const timer = Number.isFinite(ceiling)
      ? setTimeout(() => {
        if (outerWins && deadline) deadline.timedOut = true;
        timeoutState = { timedOut: true, outerTimedOut: outerWins };
        void terminateSpawnedCommand(child).finally(() => finish(timeoutState));
      }, Math.max(1, ceiling))
      : null;
    if (input !== undefined) child.stdin.end(input);
    child.once("error", (error) => {
      finish({ spawnError: error.code ?? "spawn_error" });
    });
    child.once("close", (code, signal) => {
      finish({ code: code ?? null, signal: signal ?? null, ...(timeoutState ?? {}) });
    });
  });
}

async function terminateSpawnedCommand(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    const result = await waitForSpawnedClose(killer, 3_000).catch(() => { killer.kill(); child.kill(); return null; });
    if (result && result.code !== 0) child.kill();
    return;
  }
  try { process.kill(-child.pid, "SIGKILL"); }
  catch (error) {
    if (error.code !== "ESRCH") {
      try { child.kill("SIGKILL"); } catch {}
    }
  }
}

function waitForSpawnedClose(child, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("spawned helper timed out"));
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

async function runChecked(run, name, args, options = {}) {
  const { file, ...runOptions } = options;
  const result = await run(file ?? (args[0] === "run" ? "gh" : "git"), args, { ...runOptions, commandName: name });
  if (result.timedOut === true && options.deadline) options.deadline.timedOut = true;
  return result;
}

function runManager(run, name, launcher, args, cwd, env, deadline, commandLog, input = "", timeout = null) {
  return run(process.execPath, [launcher, ...args], { cwd, env, deadline, timeout, commandLog, commandName: name, input });
}

function runCodexCommand(run, name, args, cwd, env, deadline, commandLog, timeout = null) {
  if (process.platform === "win32") return run(env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "codex", ...args], { cwd, env, deadline, timeout, commandLog, commandName: name });
  return run("codex", args, { cwd, env, deadline, timeout, commandLog, commandName: name });
}

export const hostObservationSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "skill", "workflow", "taskOutcome", "sidecarReceipt"],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    skill: { type: "string", const: "luna-sidecar" },
    workflow: { type: "string", const: "subagent" },
    taskOutcome: { type: "string", const: "not_evaluated" },
    sidecarReceipt: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "workerId", "turnId", "state", "providerState", "errorCode", "taskOutcome"],
      properties: {
        schemaVersion: { type: "integer", const: 2 },
        workerId: { type: "string" },
        turnId: { type: "string" },
        state: { type: "string", const: "completed" },
        providerState: { type: "string", const: "completed" },
        errorCode: { type: "null", const: null },
        taskOutcome: { type: "string", const: "not_evaluated" },
      },
    },
  },
});
const hostCommands = Object.freeze({ codex_cli: "codex", claude_code: "claude" });

export function hostObservationPrompt(host) {
  const activation = host === "codex_cli"
    ? "Explicitly activate the installed project Agent Skill with $luna-sidecar through Codex's native Agent Skills mechanism; do not use Claude slash-command syntax."
    : host === "claude_code"
      ? "Activate the installed project skill with /luna-sidecar."
      : null;
  if (!activation) throw new ReleaseSmokeError("argument_invalid");
  return [
    "The human explicitly requested the Luna Sidecar skill.",
    activation,
    "Do not invoke the launcher from the canonical source or substitute a direct manager call outside the skill workflow.",
    "Delegate exactly one bounded read-only task: inspect the installed luna-sidecar skill files and report only their six public commands.",
    "Start one worker with explicit cwd, sandbox, and effort from the skill instructions; exercise start, status, wait, resume, cancel, and list through the installed workflow; then harvest the exact final v2 sidecar receipt.",
    "Do not claim the delegated task succeeded; taskOutcome must remain not_evaluated.",
    "Return exactly one JSON object with this shape and no Markdown: {\"schemaVersion\":1,\"skill\":\"luna-sidecar\",\"workflow\":\"subagent\",\"taskOutcome\":\"not_evaluated\",\"sidecarReceipt\":<exact final v2 receipt>}.",
  ].join(" ");
}

export function buildHostInvocation(host, { projectRoot, skillRoot, schemaPath, environment = process.env }) {
  if (!isAbsolute(projectRoot) || !isAbsolute(skillRoot) || !isAbsolute(schemaPath)) throw new ReleaseSmokeError("scratch_invalid", "provider");
  if (!hostCommands[host]) throw new ReleaseSmokeError("argument_invalid");
  const args = host === "codex_cli"
    ? ["exec", "--json", "--ephemeral", "--output-schema", schemaPath, "--sandbox", "workspace-write", "--cd", projectRoot, "--skip-git-repo-check", "-"]
    : ["-p", "--bare", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions", "--no-session-persistence", "--setting-sources", "user,project,local", "--add-dir", projectRoot];
  return { ...wrapHostCommand(host, args, environment), input: hostObservationPrompt(host), cwd: projectRoot };
}

function wrapHostCommand(host, args, environment) {
  const command = hostCommands[host];
  if (!command) throw new ReleaseSmokeError("argument_invalid");
  if (process.platform === "win32") return { file: environment.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", command, ...args] };
  return { file: command, args };
}

export async function probeHostVersion({ host, run, environment, cwd, deadline, commandLog }) {
  const invocation = wrapHostCommand(host, ["--version"], environment);
  const result = await run(invocation.file, invocation.args, { cwd, env: environment, deadline, timeout: CEILINGS_MS.cancellation, commandLog, commandName: host === "codex_cli" ? "codex-version" : "claude-version" });
  if (result.timedOut || result.code !== 0 || result.signal) return { available: false, version: null, result };
  const version = versionFromOutput(result.stdout);
  return { available: Boolean(version), version, result };
}

function parseJsonLines(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); }
    catch { return null; }
  }
  return events;
}

function collectHostCommands(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectHostCommands(item, output);
    return output;
  }
  for (const [key, item] of Object.entries(value)) {
    if (["command", "cmd"].includes(key) && typeof item === "string") output.push(item);
    collectHostCommands(item, output);
  }
  return output;
}

function collectHostOutputStrings(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectHostOutputStrings(item, output);
    return output;
  }
  for (const [key, item] of Object.entries(value)) {
    if (["aggregated_output", "output", "stdout", "content", "text"].includes(key) && typeof item === "string") output.push(item);
    collectHostOutputStrings(item, output);
  }
  return output;
}

function parseObjectCandidates(text) {
  const candidates = [];
  for (const line of String(text ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") candidates.push(parsed);
    } catch {}
  }
  return candidates;
}

function isSidecarReceipt(value) {
  return value && typeof value === "object"
    && value.schemaVersion === 2
    && typeof value.workerId === "string" && value.workerId.length > 0
    && typeof value.turnId === "string" && value.turnId.length > 0;
}

function hostLifecyclePredicates(commands, skillRoot) {
  const expectedSkillRoot = resolve(skillRoot).replaceAll("\\", "/").toLowerCase();
  return Object.fromEntries(HOST_LIFECYCLE_COMMANDS.map((commandName) => [commandName, commands.some((command) => {
    const normalized = command.replaceAll("\\", "/").toLowerCase();
    const invocation = normalized.split(/\s--\s/, 1)[0];
    return invocation.includes(expectedSkillRoot)
      && invocation.includes("luna-sidecar.mjs")
      && new RegExp(`(?:^|\\s)${commandName}(?:\\s|$)`).test(invocation);
  })]));
}

function finalHostPayload(events) {
  const candidates = [];
  for (const event of events) {
    if (event?.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") candidates.push(...parseObjectCandidates(event.item.text));
    if (event?.type === "result" && typeof event.result === "string") candidates.push(...parseObjectCandidates(event.result));
    if (event?.type === "assistant" && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) if (typeof block?.text === "string") candidates.push(...parseObjectCandidates(block.text));
    }
    if (event?.structured_output && typeof event.structured_output === "object") candidates.push(event.structured_output);
  }
  return candidates.at(-1) ?? null;
}

export function parseHostObservationResult(host, result, { projectRoot, skillRoot }) {
  const events = parseJsonLines(result.stdout);
  if (!events || events.length === 0) throw new ReleaseSmokeError("host_schema_mismatch", "provider", "jsonl_invalid");
  const commands = events.flatMap((event) => collectHostCommands(event));
  const expectedSkillRoot = resolve(skillRoot).replaceAll("\\", "/").toLowerCase();
  const copiedSkillCommand = commands.some((command) => {
    const normalized = command.replaceAll("\\", "/").toLowerCase();
    return normalized.includes(expectedSkillRoot) && normalized.includes("luna-sidecar.mjs") && /(?:^|\s)start(?:\s|$)/.test(normalized);
  });
  if (!copiedSkillCommand) throw new ReleaseSmokeError("host_schema_mismatch", "provider", "copied_skill_command_missing");
  const receipts = events.flatMap((event) => collectHostOutputStrings(event)).flatMap((text) => parseObjectCandidates(text)).filter(isSidecarReceipt);
  const payload = finalHostPayload(events);
  if (!payload || payload.schemaVersion !== 1 || payload.skill !== "luna-sidecar" || payload.workflow !== "subagent" || payload.taskOutcome !== "not_evaluated") {
    throw new ReleaseSmokeError("host_schema_mismatch", "provider", "payload_shape_invalid");
  }
  if (!isSidecarReceipt(payload.sidecarReceipt)) throw new ReleaseSmokeError("host_schema_mismatch", "provider", "receipt_invalid");
  if (receipts.length === 0) throw new ReleaseSmokeError("host_schema_mismatch", "provider", "receipt_not_observed");
  const observed = receipts.find((receipt) => receipt.workerId === payload.sidecarReceipt.workerId && receipt.turnId === payload.sidecarReceipt.turnId);
  if (!observed) throw new ReleaseSmokeError("host_schema_mismatch", "provider", "receipt_mismatch");
  if (payload.sidecarReceipt.state !== "completed" || payload.sidecarReceipt.providerState !== "completed" || payload.sidecarReceipt.errorCode !== null || payload.sidecarReceipt.taskOutcome !== "not_evaluated") {
    throw new ReleaseSmokeError("host_schema_mismatch", "provider", "receipt_terminal_invalid");
  }
  const lifecycle = hostLifecyclePredicates(commands, skillRoot);
  if (!lifecycleComplete(lifecycle)) throw new ReleaseSmokeError("host_schema_mismatch", "provider", "lifecycle_missing");
  return { events, payload, receipt: payload.sidecarReceipt, commands, lifecycle };
}

function unavailableHostEvidence(host, failureCode) {
  return {
    available: false,
    invocationRef: null,
    procedureRef: null,
    hostVersion: null,
    sidecarReceipt: { schemaVersion: null, schemaResult: "not_run" },
    cleanup: { result: "not_run", ownedPidResult: "not_run", ownedPids: [], ownedPidsGone: false },
    lifecycle: emptyLifecycle(),
    failureDiagnostics: null,
    failureCode,
    claimEligible: false,
    host,
  };
}

function hostProcessIdentityMatches(actual, { pid, expectedCwd, command }) {
  return actual?.exists === true
    && actual.uncertain !== true
    && Number(actual.pid) === Number(pid)
    && typeof actual.cwd === "string"
    && pathsEqual(actual.cwd, expectedCwd)
    && typeof actual.commandLine === "string"
    && actual.commandLine.toLowerCase().includes(command.toLowerCase());
}

async function cleanupObservedProcess(pid, { result, host, expectedCwd, deadline, inspect, terminate, waitGone = waitPidsGone }) {
  if (result && result.timedOut !== true && !result.spawnError) return { gone: true, result: "verified", ownedPidResult: "all_gone" };
  if (!Number.isSafeInteger(pid) || pid <= 0) return { gone: false, result: "uncertain", ownedPidResult: "uncertain" };
  let actual;
  try { actual = await inspect(pid); }
  catch { return { gone: false, result: "uncertain", ownedPidResult: "uncertain" }; }
  if (actual?.exists !== true) return { gone: true, result: "verified", ownedPidResult: "all_gone" };
  if (actual?.exists === true && actual.uncertain === true) return { gone: false, result: "uncertain", ownedPidResult: "uncertain" };
  const expected = { pid, expectedCwd, command: hostCommands[host] };
  if (!hostProcessIdentityMatches(actual, expected)) return { gone: true, result: "verified", ownedPidResult: "all_gone" };
  let rechecked;
  try { rechecked = await inspect(pid); }
  catch { return { gone: false, result: "uncertain", ownedPidResult: "uncertain" }; }
  if (rechecked?.exists !== true || !hostProcessIdentityMatches(rechecked, expected)) {
    if (rechecked?.exists === true && rechecked.uncertain === true) return { gone: false, result: "uncertain", ownedPidResult: "uncertain" };
    return { gone: true, result: "verified", ownedPidResult: "all_gone" };
  }
  try { await terminate(pid); }
  catch { return { gone: false, result: "uncertain", ownedPidResult: "uncertain" }; }
  const gone = await waitGone([pid], CEILINGS_MS.knownPidAbsence, deadline);
  return { gone, result: gone ? "verified" : "uncertain", ownedPidResult: gone ? "all_gone" : "lingering" };
}

export async function runHostObservation({
  host,
  hostVersion,
  projectRoot,
  skillRoot,
  stateRoot,
  cancellationCaller,
  schemaPath,
  environment,
  run,
  deadline,
  commandLog = [],
  inspect = inspectProcessIdentity,
  terminate = terminateExactPid,
  waitGone = waitPidsGone,
}) {
  if (!hostVersion) {
    const failureCode = host === "codex_cli" ? "codex_cli_unavailable" : "claude_code_unavailable";
    return { evidence: unavailableHostEvidence(host, failureCode), gaps: [failureCode], ownedPids: [] };
  }
  const invocation = buildHostInvocation(host, { projectRoot, skillRoot, schemaPath, environment });
  let result = null;
  let parsed = null;
  let failureCode = null;
  let schemaReason = null;
  try {
    result = await run(invocation.file, invocation.args, {
      cwd: invocation.cwd,
      env: { ...environment, LUNA_SIDECAR_HOME: stateRoot },
      input: invocation.input,
      deadline,
      timeout: CEILINGS_MS.parent,
      commandLog,
      commandName: host === "codex_cli" ? "host-codex" : "host-claude",
    });
    if (result.timedOut) failureCode = "host_observation_timeout";
    else if (result.code !== 0 || result.signal) failureCode = host === "codex_cli" ? "codex_cli_host_failed" : "claude_code_host_failed";
    else parsed = parseHostObservationResult(host, result, { projectRoot, skillRoot });
  } catch (error) {
    failureCode = error instanceof ReleaseSmokeError ? error.code : "host_schema_mismatch";
    schemaReason = error instanceof ReleaseSmokeError ? error.schemaReason : null;
  }

  const receiptPids = parsed ? [parsed.receipt.pid, parsed.receipt.runnerPid, parsed.receipt.providerPid].filter((pid) => Number.isSafeInteger(pid) && pid > 0) : [];
  const hostCleanup = await cleanupObservedProcess(result?.pid, { result, host, expectedCwd: projectRoot, deadline, inspect, terminate, waitGone });
  let sidecarCleanup;
  try {
    sidecarCleanup = await cleanupRun({
      launcher: join(skillRoot, "scripts", "luna-sidecar.mjs"),
      roots: { project: projectRoot, state: stateRoot, cancellationCaller },
      env: { ...environment, LUNA_SIDECAR_HOME: stateRoot },
      run,
      deadline,
      commandLog,
      launchedWorkerCount: parsed ? 1 : 0,
      knownOwnedPids: receiptPids,
      inspect,
      terminate,
    });
  } catch {
    sidecarCleanup = {
      processesGone: false,
      result: { releaseReady: false, gaps: ["cleanup_identity_uncertain"] },
    };
  }
  const cleanupVerified = hostCleanup.gone && sidecarCleanup.processesGone && sidecarCleanup.result.releaseReady === true;
  if (!cleanupVerified) failureCode ??= sidecarCleanup.result.gaps?.[0] ?? "cleanup_identity_uncertain";
  const allOwnedPids = [...new Set([result?.pid, ...receiptPids].filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
  const cleanup = {
    result: cleanupVerified ? "verified" : (hostCleanup.result === "uncertain" || !sidecarCleanup.processesGone ? "uncertain" : "not_run"),
    ownedPidResult: cleanupVerified ? "all_gone" : (hostCleanup.ownedPidResult === "lingering" ? "lingering" : "uncertain"),
    ownedPids: allOwnedPids,
    ownedPidsGone: cleanupVerified,
  };
  const evidence = {
    available: true,
    invocationRef: `evidence://${host === "codex_cli" ? "codex-cli" : "claude-code"}/observation-1`,
    procedureRef: `release-smoke.${host}.v1`,
    hostVersion,
    sidecarReceipt: {
      schemaVersion: 2,
      schemaResult: parsed ? "valid" : (result?.stdout ? "invalid" : "missing"),
      ...(schemaReason ? { schemaReason } : {}),
    },
    lifecycle: parsed?.lifecycle ?? emptyLifecycle(),
    cleanup,
    failureDiagnostics: result && (result.timedOut || result.spawnError || result.code !== 0 || result.signal) ? hostFailureDiagnostics(result) : null,
    failureCode: failureCode ?? null,
    claimEligible: Boolean(parsed && lifecycleComplete(parsed.lifecycle) && cleanupVerified && !failureCode),
    host,
  };
  return { evidence, gaps: [...new Set([...(sidecarCleanup.result.gaps ?? []), ...(failureCode ? [failureCode] : [])])], ownedPids: allOwnedPids };
}

export async function runHostObservations({
  roots,
  environment,
  run,
  deadline,
  commandLog = [],
  schemaPath,
  codexVersion,
  claudeVersion,
  inspect = inspectProcessIdentity,
  terminate = terminateExactPid,
}) {
  const specs = [
    { host: "codex_cli", hostVersion: codexVersion, skillRoot: join(roots.project, ".agents", "skills", "luna-sidecar"), stateRoot: roots.hostCodexState },
    { host: "claude_code", hostVersion: claudeVersion, skillRoot: join(roots.project, ".claude", "skills", "luna-sidecar"), stateRoot: roots.hostClaudeState },
  ];
  const hosts = {};
  const gaps = [];
  const ownedPids = [];
  for (const spec of specs) {
    const observation = await runHostObservation({
      ...spec,
      projectRoot: roots.project,
      cancellationCaller: roots.cancellationCaller,
      schemaPath,
      environment,
      run,
      deadline,
      commandLog,
      inspect,
      terminate,
    });
    hosts[spec.host] = observation.evidence;
    gaps.push(...observation.gaps);
    ownedPids.push(...observation.ownedPids);
  }
  return { hosts, gaps: [...new Set(gaps)], ownedPids: [...new Set(ownedPids)] };
}

async function parseManagerResult(result) {
  if (result.timedOut) throw new ReleaseSmokeError(result.outerTimedOut ? "outer_timeout" : "manager_timeout", "provider");
  if (result.code !== 0 || result.signal) throw new ReleaseSmokeError("manager_spawn_failed", "provider");
  try { return JSON.parse(result.stdout); }
  catch { throw new ReleaseSmokeError("manager_output_invalid", "provider"); }
}

function remainingPhaseTime(deadline, stopAt, code = "manager_timeout") {
  const now = Date.now();
  if (now >= deadline.at) {
    deadline.timedOut = true;
    throw new ReleaseSmokeError("outer_timeout", "provider");
  }
  if (now >= stopAt) throw new ReleaseSmokeError(code, "provider");
  return Math.max(1, Math.min(deadline.at, stopAt) - now);
}

async function pollRunning(run, launcher, workerId, callerRoot, env, deadline, commandLog, stopAt) {
  while (Date.now() < stopAt) {
    const result = await runManager(run, "manager-status-cancellation", launcher, ["status", workerId], callerRoot, env, deadline, commandLog, "", remainingPhaseTime(deadline, stopAt, "cancellation_incomplete"));
    if (result.timedOut) throw new ReleaseSmokeError(result.outerTimedOut ? "outer_timeout" : "cancellation_incomplete", "provider");
    if (result.code === 0) {
      const receipt = await parseManagerResult(result);
      if (receipt.providerState === "running" && Number.isSafeInteger(receipt.providerPid) && receipt.providerPid > 0) return receipt;
      if (receipt.state === "failed" || receipt.state === "unknown" || receipt.state === "completed") return null;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  return null;
}

async function isPidGone(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return false; }
  catch (error) { return error.code === "ESRCH"; }
}

async function waitPidsGone(pids, timeout, deadline = null) {
  const stopAt = Math.min(deadline?.at ?? Number.POSITIVE_INFINITY, Date.now() + timeout);
  while (Date.now() < stopAt) {
    if ((await Promise.all(pids.map(isPidGone))).every(Boolean)) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  if (deadline && Date.now() >= deadline.at) deadline.timedOut = true;
  return (await Promise.all(pids.map(isPidGone))).every(Boolean);
}

export async function runLiveScenarios({ launcher, roots, env, run, deadline, commandLog = [], markerBasename = `luna-release-marker-${randomUUID()}.txt` }) {
  await assertCopiedLauncherReady(launcher, roots.project);
  const facts = {
    parent: { authority: false, cwd: false, lineage: false, completed: false, providerCompleted: false, logs: false, nativeChildCount: 0 },
    resume: { authority: false, cwd: false, lineage: false, completed: false, providerCompleted: false, logs: false, markerCommandFailed: false, markerAbsent: false },
    cancellation: { authority: false, cwd: false, lineage: false, providerRunningBeforeCancel: false, acknowledged: false, cancelled: false, result: false, knownPidsGone: false },
    lifecycle: emptyLifecycle(),
  };
  const gaps = [];
  const launchedWorkerIds = [];
  const ownedPids = new Set();
  let parentTurnId = null;
  const addGap = (code) => { if (gapCodes.has(code) && !gaps.includes(code)) gaps.push(code); };
  const remember = (receipt) => {
    if (typeof receipt?.workerId === "string" && !launchedWorkerIds.includes(receipt.workerId)) launchedWorkerIds.push(receipt.workerId);
    for (const pid of [receipt?.pid, receipt?.runnerPid, receipt?.providerPid]) if (Number.isSafeInteger(pid) && pid > 0) ownedPids.add(pid);
  };
  const parentPrompt = "Use exactly two read-only native Codex subagents and return a bounded answer.";
  const parentStopAt = Math.min(deadline.at, Date.now() + CEILINGS_MS.parent);
  let parentStart;
  try {
    parentStart = await runManager(run, "manager-start-parent", launcher, ["start", "--effort", "max", "--sandbox", "read-only", "--cwd", roots.project, "--", parentPrompt], roots.parentCaller, env, deadline, commandLog, `${parentPrompt}\n`, remainingPhaseTime(deadline, parentStopAt));
    const started = await parseManagerResult(parentStart);
    remember(started);
    parentTurnId = started.turnId;
    if (typeof started.workerId !== "string" || !started.workerId || typeof started.turnId !== "string" || !started.turnId) throw new ReleaseSmokeError("parent_incomplete", "provider");
    facts.lifecycle.start = true;
    const listResult = await runManager(run, "manager-list", launcher, ["list"], roots.parentCaller, env, deadline, commandLog, "", remainingPhaseTime(deadline, parentStopAt));
    if (listResult.timedOut) throw new ReleaseSmokeError(listResult.outerTimedOut ? "outer_timeout" : "manager_timeout", "provider");
    const listed = await parseManagerResult(listResult);
    if (!Array.isArray(listed) || !listed.some((worker) => worker?.workerId === started.workerId)) throw new ReleaseSmokeError("parent_incomplete", "provider");
    facts.lifecycle.list = true;
    const parentWaitResult = await runManager(run, "manager-wait-parent", launcher, ["wait", started.workerId, "--timeout", String(remainingPhaseTime(deadline, parentStopAt))], roots.parentCaller, env, deadline, commandLog, "", remainingPhaseTime(deadline, parentStopAt));
    if (parentWaitResult.timedOut) throw new ReleaseSmokeError(parentWaitResult.outerTimedOut ? "outer_timeout" : "manager_timeout", "provider");
    if (!validateWaitOutcome(parentWaitResult)) throw new ReleaseSmokeError("manager_timeout", "provider");
    facts.lifecycle.wait = true;
    const parent = await parseManagerResult(parentWaitResult);
    remember(parent);
    facts.parent.authority = parent.effort === "max" && parent.sandbox === "read-only" && parent.bypass === false;
    facts.parent.cwd = pathsEqual(parent.cwd, roots.project);
    facts.parent.lineage = parent.workerId === started.workerId && parent.turnId === started.turnId;
    facts.parent.completed = validateCompletedReceipt(parent, { cwd: roots.project, effort: "max", sandbox: "read-only", bypass: false, workerId: started.workerId, turnId: started.turnId });
    facts.parent.providerCompleted = parent.providerState === "completed";
    const parentEvents = await parseEventsFromLogs(parent, roots.state);
    remainingPhaseTime(deadline, parentStopAt);
    facts.parent.logs = true;
    facts.parent.nativeChildCount = countSuccessfulNativeChildren(parentEvents).count;
    if (facts.parent.nativeChildCount !== 2) addGap("parent_incomplete");
  } catch (error) {
    addGap(error instanceof ReleaseSmokeError ? error.code : "parent_incomplete");
  }

  const resumePrompt = buildResumePrompt(markerBasename);
  const resumeStopAt = Math.min(deadline.at, Date.now() + CEILINGS_MS.resume);
  let resumeStarted = null;
  try {
    const workerId = launchedWorkerIds[0];
    if (!workerId) throw new ReleaseSmokeError("resume_incomplete", "provider");
    const resumeResult = await runManager(run, "manager-resume", launcher, ["resume", workerId, "--effort", "max", "--sandbox", "read-only", "--cwd", roots.project, "--", resumePrompt], roots.resumeCaller, env, deadline, commandLog, `${resumePrompt}\n`, remainingPhaseTime(deadline, resumeStopAt));
    resumeStarted = await parseManagerResult(resumeResult);
    remember(resumeStarted);
    if (typeof resumeStarted?.turnId !== "string" || !resumeStarted.turnId) throw new ReleaseSmokeError("resume_incomplete", "provider");
    facts.lifecycle.resume = true;
    const waitResult = await runManager(run, "manager-wait-resume", launcher, ["wait", workerId, "--timeout", String(remainingPhaseTime(deadline, resumeStopAt))], roots.resumeCaller, env, deadline, commandLog, "", remainingPhaseTime(deadline, resumeStopAt));
    if (waitResult.timedOut) throw new ReleaseSmokeError(waitResult.outerTimedOut ? "outer_timeout" : "manager_timeout", "provider");
    if (!validateWaitOutcome(waitResult)) throw new ReleaseSmokeError("manager_timeout", "provider");
    const resume = await parseManagerResult(waitResult);
    remember(resume);
    facts.resume.authority = resume.effort === "max" && resume.sandbox === "read-only" && resume.bypass === false;
    facts.resume.cwd = pathsEqual(resume.cwd, roots.project);
    facts.resume.lineage = resume.workerId === workerId && resume.turnId !== parentTurnId && resume.turnId === resumeStarted?.turnId;
    facts.resume.completed = validateCompletedReceipt(resume, { cwd: roots.project, effort: "max", sandbox: "read-only", bypass: false, workerId, turnId: resume.turnId });
    facts.resume.providerCompleted = resume.providerState === "completed";
    const events = await parseEventsFromLogs(resume, roots.state);
    remainingPhaseTime(deadline, resumeStopAt);
    facts.resume.logs = true;
    facts.resume.markerCommandFailed = events.some((event) => failedMarkerCommandPredicate(event, markerBasename));
    facts.resume.markerAbsent = await isAbsent(join(roots.project, markerBasename));
  } catch (error) {
    addGap(error instanceof ReleaseSmokeError ? error.code : "resume_incomplete");
  }

  try {
    const cancelPrompt = buildCancellationPrompt();
    const observeStopAt = Math.min(deadline.at, Date.now() + CEILINGS_MS.observeCancellationRunning);
    const startResult = await runManager(run, "manager-start-cancellation", launcher, ["start", "--effort", "low", "--sandbox", "read-only", "--cwd", roots.project, "--", cancelPrompt], roots.cancellationCaller, env, deadline, commandLog, `${cancelPrompt}\n`, remainingPhaseTime(deadline, observeStopAt, "cancellation_incomplete"));
    const started = await parseManagerResult(startResult);
    remember(started);
    if (typeof started.workerId !== "string" || !started.workerId || typeof started.turnId !== "string" || !started.turnId) throw new ReleaseSmokeError("cancellation_incomplete", "provider");
    const running = await pollRunning(run, launcher, started.workerId, roots.cancellationCaller, env, deadline, commandLog, observeStopAt);
    if (!running) throw new ReleaseSmokeError("cancellation_incomplete", "provider");
    facts.lifecycle.status = true;
    remember(running);
    facts.cancellation.providerRunningBeforeCancel = true;
    facts.cancellation.providerPid = running.providerPid;
    const cancellationStopAt = Math.min(deadline.at, Date.now() + CEILINGS_MS.cancellation);
    const cancelResult = await runManager(run, "manager-cancel", launcher, ["cancel", started.workerId], roots.cancellationCaller, env, deadline, commandLog, "", remainingPhaseTime(deadline, cancellationStopAt, "cancellation_incomplete"));
    if (cancelResult.timedOut || cancelResult.code !== 0 || cancelResult.signal) throw new ReleaseSmokeError(cancelResult.timedOut && cancelResult.outerTimedOut ? "outer_timeout" : "cancellation_incomplete", "provider");
    const cancelReceipt = await parseManagerResult(cancelResult);
    facts.lifecycle.cancel = true;
    const waitResult = await runManager(run, "manager-wait-cancellation", launcher, ["wait", started.workerId, "--timeout", String(remainingPhaseTime(deadline, cancellationStopAt, "cancellation_incomplete"))], roots.cancellationCaller, env, deadline, commandLog, "", remainingPhaseTime(deadline, cancellationStopAt, "cancellation_incomplete"));
    if (waitResult.timedOut) throw new ReleaseSmokeError(waitResult.outerTimedOut ? "outer_timeout" : "cancellation_incomplete", "provider");
    if (!validateWaitOutcome(waitResult)) throw new ReleaseSmokeError("cancellation_incomplete", "provider");
    const cancelled = await parseManagerResult(waitResult);
    remember(cancelled);
    const final = cancelled?.state === "cancelled" ? cancelled : cancelReceipt;
    facts.cancellation.authority = final.effort === "low" && final.sandbox === "read-only" && final.bypass === false;
    facts.cancellation.cwd = pathsEqual(final.cwd, roots.project);
    facts.cancellation.lineage = typeof final.turnId === "string" && final.turnId.length > 0 && final.workerId === started.workerId && final.turnId === started.turnId;
    const cancellationValid = validateCancellationOutcome(final);
    facts.cancellation.acknowledged = cancellationValid && Boolean(final.cancel?.acknowledgedAt);
    facts.cancellation.cancelled = cancellationValid && final.state === "cancelled";
    facts.cancellation.result = cancellationValid && final.cancel?.result === "cancelled";
    facts.cancellation.knownPidsGone = await waitPidsGone([...ownedPids], CEILINGS_MS.knownPidAbsence, deadline);
  } catch (error) {
    addGap(error instanceof ReleaseSmokeError ? error.code : "cancellation_incomplete");
  }

  if (!facts.parent.completed || !facts.parent.providerCompleted || !facts.parent.logs || !facts.parent.authority || !facts.parent.cwd || !facts.parent.lineage) addGap("parent_incomplete");
  if (!facts.resume.completed || !facts.resume.providerCompleted || !facts.resume.logs || !facts.resume.authority || !facts.resume.cwd || !facts.resume.lineage || !facts.resume.markerCommandFailed || !facts.resume.markerAbsent) addGap("resume_incomplete");
  const cancellationSatisfied = cancellationPredicate({ providerPid: facts.cancellation.providerPid, providerRunning: facts.cancellation.providerRunningBeforeCancel, acknowledged: facts.cancellation.acknowledged, state: facts.cancellation.cancelled ? "cancelled" : null, result: facts.cancellation.result ? "cancelled" : null, knownOwnedPidsGone: facts.cancellation.knownPidsGone });
  if (!facts.cancellation.authority || !facts.cancellation.cwd || !facts.cancellation.lineage || !cancellationSatisfied) addGap("cancellation_incomplete");
  facts.sixCommandSurface = lifecycleComplete(facts.lifecycle);
  if (!facts.sixCommandSurface) addGap("parent_incomplete");
  return { facts, gaps, launchedWorkerCount: launchedWorkerIds.length, ownedPids: [...ownedPids] };
}

async function isAbsent(pathValue) {
  try { await lstat(pathValue); return false; }
  catch (error) { if (error.code === "ENOENT") return true; throw new ReleaseSmokeError("marker_present"); }
}

async function discoverWorkers(stateRoot, projectRoot) {
  const root = join(stateRoot, "workers");
  let files;
  try { files = await readdir(root); }
  catch (error) { if (error.code === "ENOENT") return []; throw new ReleaseSmokeError("cleanup_identity_uncertain", "cleanup"); }
  const workers = [];
  for (const file of files.filter((value) => value.endsWith(".json"))) {
    try {
      const workerPath = join(root, file);
      await assertCanonicalAncestors(stateRoot, workerPath);
      const info = await lstat(workerPath);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("worker manifest is not regular");
      const worker = JSON.parse(await readFile(workerPath, "utf8"));
      if (worker.schemaVersion !== 2 || worker.workerId !== file.slice(0, -5) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(worker.workerId) || !Array.isArray(worker.turns) || worker.turns.length === 0) throw new Error("worker manifest identity is invalid");
      for (const turn of worker.turns) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(turn?.turnId ?? "") || typeof turn?.cwd !== "string" || !pathsEqual(turn.cwd, projectRoot)) throw new Error("worker turn identity is invalid");
      }
      workers.push(worker);
    } catch { throw new ReleaseSmokeError("cleanup_identity_uncertain", "cleanup"); }
  }
  return workers;
}

function pidRecords(workers, stateRoot) {
  const records = [];
  for (const worker of workers) {
    const turns = worker.turns;
    for (const turn of turns) for (const role of ["pid", "runnerPid", "providerPid"]) {
      const pid = turn?.[role];
      if (Number.isSafeInteger(pid) && pid > 0 && !records.some((record) => record.pid === pid)) records.push({ pid, role, workerId: worker.workerId, turnId: turn.turnId, expectedCwd: turn.cwd, stateRoot, gone: false });
    }
  }
  return records;
}

export function ownedProcessIdentityMatches(actual, expected) {
  const requiredArgv = expected.role === "providerPid" ? [] : ["_worker", expected.workerId];
  return actual?.exists === true
    && actual?.uncertain !== true
    && Number(actual.pid) === Number(expected.pid)
    && typeof actual.cwd === "string"
    && pathsEqual(actual.cwd, expected.expectedCwd)
    && typeof actual.commandLine === "string"
    && actual.commandLine.toLowerCase().includes(String(expected.commandToken ?? "").toLowerCase())
    && (requiredArgv.length === 0 || (Array.isArray(actual.argv) && requiredArgv.every((token) => actual.argv.includes(token))));
}

export async function inspectProcessIdentity(pid) {
  if (process.platform === "linux") {
    try {
      const cwd = await realpath(`/proc/${pid}/cwd`);
      const argv = (await readFile(`/proc/${pid}/cmdline`)).toString("utf8").split("\0").filter(Boolean);
      return { exists: true, uncertain: false, pid, cwd, argv, commandLine: argv.join(" ") };
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ESRCH") return { exists: false, pid };
      return { exists: true, uncertain: true, pid };
    }
  }
  try { process.kill(pid, 0); return { exists: true, uncertain: true, pid }; }
  catch (error) { if (error.code === "ESRCH") return { exists: false, pid }; return { exists: true, uncertain: true, pid }; }
}

export async function cleanupRun({ launcher, roots, env, run, deadline, commandLog = [], launchedWorkerCount, knownOwnedPids = [], inspect = inspectProcessIdentity, terminate = terminateExactPid }) {
  const facts = { attempted: true, launchedWorkerCount, discoveredWorkerCount: 0, ownedPidCount: 0, stopFailures: 0, identityUncertain: 0, identityMismatches: 0, lingeringPids: 0, recoveryUsed: false, scratchCleanupFailed: false };
  let workers = [];
  try { workers = await discoverWorkers(roots.state, roots.project); facts.discoveredWorkerCount = workers.length; }
  catch { facts.identityUncertain += 1; }
  const workerIds = [...new Set(workers.map((worker) => worker.workerId).filter((id) => typeof id === "string"))];
  for (const workerId of workerIds) {
    try {
      const result = await runManager(run, "manager-cancel", launcher, ["cancel", workerId], roots.cancellationCaller, env, deadline, commandLog, "", Math.max(1, Math.min(CEILINGS_MS.cancellation, deadline.at - Date.now())));
      if (result.timedOut || result.code !== 0 || result.signal) facts.stopFailures += 1;
    } catch { facts.stopFailures += 1; }
  }
  try { workers = await discoverWorkers(roots.state, roots.project); facts.discoveredWorkerCount = workers.length; }
  catch { facts.identityUncertain += 1; }
  const records = pidRecords(workers, roots.state);
  facts.ownedPidCount = records.length;
  const known = [...new Set(knownOwnedPids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
  if (known.some((pid) => !records.some((record) => record.pid === pid))) facts.identityUncertain += 1;
  for (const record of records) {
    const actual = await inspect(record.pid, record);
    if (actual?.exists !== true) { record.gone = true; continue; }
    if (actual.uncertain === true) { facts.identityUncertain += 1; continue; }
    if (!ownedProcessIdentityMatches(actual, { ...record, commandToken: record.role === "providerPid" ? "codex" : "luna-sidecar" })) { facts.identityMismatches += 1; continue; }
    try {
      const rechecked = await inspect(record.pid, record);
      if (!ownedProcessIdentityMatches(rechecked, { ...record, commandToken: record.role === "providerPid" ? "codex" : "luna-sidecar" })) { facts.identityMismatches += 1; continue; }
      await terminate(record.pid);
      facts.recoveryUsed = true;
    } catch {}
  }
  await waitPidsGone(records.map((record) => record.pid), CEILINGS_MS.knownPidAbsence, deadline);
  facts.lingeringPids = (await Promise.all(records.map(async (record) => await isPidGone(record.pid) ? null : record.pid))).filter((pid) => pid !== null).length;
  const processesGone = facts.lingeringPids === 0 && (launchedWorkerCount === 0 || (records.length > 0 && facts.discoveredWorkerCount === launchedWorkerCount)) && facts.identityUncertain === 0 && facts.identityMismatches === 0;
  return { facts, processesGone, result: evaluateCleanupFacts(facts) };
}

export async function terminateExactPid(pid) {
  if (process.platform === "win32") {
    const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    const result = await waitForSpawnedClose(child, 3_000).catch((error) => { child.kill(); throw error; });
    if (result.code !== 0) throw new Error("taskkill failed");
  } else {
    process.kill(pid, "SIGKILL");
  }
}

async function removeScratch(root) {
  try {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    return true;
  } catch { return false; }
}

function versionFromOutput(output) {
  const match = String(output).match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match?.[0] ?? null;
}

function buildRootRoles(roots) {
  const roleNames = {
    project: "project",
    installerHome: "installer-home",
    state: "state",
    parentCaller: "parent-caller",
    resumeCaller: "resume-caller",
    cancellationCaller: "cancellation-caller",
    temp: "temp",
  };
  return Object.entries(roots)
    .filter(([role, pathValue]) => roleNames[role] && typeof pathValue === "string" && isAbsolute(pathValue))
    .map(([role, pathValue]) => ({ role: roleNames[role], relativePath: roleNames[role], pathHash: createHash("sha256").update(resolve(pathValue)).digest("hex") }));
}

function buildEvidence({ options, roots, install, ci, codexVersion, commands, scenarios, cleanup, hostObservations, gaps, failureStage, outerTimedOut }) {
  const allGaps = [...new Set([...gaps, ...(outerTimedOut ? ["outer_timeout"] : []), ...(cleanup?.result?.gaps ?? [])])];
  const rootRoles = buildRootRoles(roots);
  rootRoles.push({ role: "canonical-source", relativePath: "repository/skills/luna-sidecar", pathHash: createHash("sha256").update(resolve(canonicalSkillRoot)).digest("hex") });
  const installs = install?.roots && roots.project ? [
    { agent: "codex", relativePath: relative(roots.project, install.roots.codex).split(sep).join("/"), manifestHash: install.manifestHashes.codex },
    { agent: "claude-code", relativePath: relative(roots.project, install.roots.claude).split(sep).join("/"), manifestHash: install.manifestHashes.claude },
    { agent: "canonical", relativePath: "skills/luna-sidecar", manifestHash: install.manifestHashes.canonical },
  ] : [];
  const hosts = buildHostEvidence({ observations: hostObservations?.hosts });
  const otherGates = {
    deterministic: scenarios?.gaps?.length === 0,
    installedParity: Boolean(install),
    ci: Boolean(ci),
    delivery: Boolean(options.testedCommit),
    evidence: true,
  };
  return redactEvidence({
    testedCommit: options.testedCommit,
    platform: process.platform,
    nodeVersion: process.versions.node,
    codexVersion,
    skillsVersion: EXPECTED_SKILLS_VERSION,
    rootRoles,
    installs,
    ci: ci ? { ...ci, runId: options.ciRunId } : null,
    hosts,
    otherGates,
    commands,
    predicates: {
      outerTimedOut,
      parent: scenarios?.facts?.parent ?? {},
      resume: scenarios?.facts?.resume ?? {},
      cancellation: scenarios?.facts?.cancellation ?? {},
      lifecycle: scenarios?.facts?.lifecycle ?? {},
      nativeChildCount: scenarios?.facts?.parent?.nativeChildCount ?? 0,
      sixCommandSurface: scenarios?.facts?.sixCommandSurface === true,
    },
    cleanup: cleanup?.facts ? { ...cleanup.facts, releaseReady: cleanup.result?.releaseReady === true } : { attempted: false, releaseReady: false },
    unresolvedGaps: allGaps,
    releaseReady: Object.values(hosts).every((host) => host.claimEligible) && Object.values(otherGates).every(Boolean) && !outerTimedOut,
    failureStage,
  });
}

function buildHostEvidence({ observations }) {
  return {
    codex_cli: observations?.codex_cli ?? unavailableHostEvidence("codex_cli", "codex_cli_unavailable"),
    claude_code: observations?.claude_code ?? unavailableHostEvidence("claude_code", "claude_code_unavailable"),
  };
}

export async function orchestrateReleaseSmoke(options = {}) {
  if (options.live !== true) throw new ReleaseSmokeError("argument_invalid");
  if (!/^[0-9a-f]{40}$/i.test(options.testedCommit ?? "") || !options.ciRunId) throw new ReleaseSmokeError("argument_invalid");
  const sourceEnvironment = options.environment ?? process.env;
  if (sourceEnvironment[nestedMarkerEnv] !== undefined) throw new ReleaseSmokeError("nested_sidecar_forbidden", "validation");
  const deadline = { at: Date.now() + CEILINGS_MS.outer, timedOut: false };
  const run = options.run ?? runCapturedCommand;
  const queryCi = options.queryCi ?? queryGitHubRun;
  const emit = options.emit ?? ((line) => process.stdout.write(`${line}\n`));
  const commandLog = [];
  let scratch = null;
  const roots = {};
  let install = null;
  let ci = null;
  let codexVersion = null;
  let claudeVersion = null;
  let hostObservations = { hosts: {}, gaps: [], ownedPids: [] };
  let scenarios = { facts: {}, gaps: ["scratch_invalid"], launchedWorkerCount: 0, ownedPids: [] };
  let cleanup = { facts: { attempted: false, launchedWorkerCount: 0, discoveredWorkerCount: 0, ownedPidCount: 0, stopFailures: 0, identityUncertain: 0, identityMismatches: 0, lingeringPids: 0, recoveryUsed: false, scratchCleanupFailed: false }, processesGone: true, result: { releaseReady: false, gaps: ["cleanup_identity_uncertain"] } };
  const gaps = [];
  let currentStage = "scratch";
  let failureStage = null;
  try {
    const tempRoot = await realpath(resolve(tmpdir()));
    const tempInfo = await lstat(tempRoot);
    if (!tempInfo.isDirectory() || tempInfo.isSymbolicLink()) throw new ReleaseSmokeError("scratch_invalid", "scratch");
    scratch = await mkdtemp(join(tempRoot, "luna-release-smoke-"));
    await assertCanonicalAncestors(tempRoot, scratch);
    roots.project = await createFreshRoot(scratch, "project");
    roots.installerHome = await createFreshRoot(scratch, "installer-home");
    roots.state = await createFreshRoot(scratch, "state");
    roots.parentCaller = await createFreshRoot(scratch, "parent-caller");
    roots.resumeCaller = await createFreshRoot(scratch, "resume-caller");
    roots.cancellationCaller = await createFreshRoot(scratch, "cancellation-caller");
    roots.hostCodexState = await createFreshRoot(roots.project, ".luna-host-state-codex");
    roots.hostClaudeState = await createFreshRoot(roots.project, ".luna-host-state-claude");
    roots.temp = await createFreshRoot(scratch, "temp");
    const hostSchemaPath = join(roots.temp, "luna-host-observation-schema.json");
    await writeFile(hostSchemaPath, JSON.stringify(hostObservationSchema), "utf8");
    const init = await run("git", ["init", "--quiet", roots.project], { cwd: scratch, deadline, commandLog, commandName: "git-init" });
    if (init.timedOut) throw new ReleaseSmokeError("outer_timeout", "scratch");
    if (init.code !== 0 || init.signal) throw new ReleaseSmokeError("scratch_invalid", "scratch");
    currentStage = "installer";
    const installerEnv = buildInstallerEnvironment(roots, sourceEnvironment);
    install = await installCopiedSkills({ projectRoot: roots.project, sourceRoot: options.sourceRoot ?? repositoryRoot, installer: options.installer ?? installerPath, run, env: installerEnv, deadline, commandLog });
    currentStage = "preflight";
    ci = (await verifyBeforeProviderSpawn({ testedCommit: options.testedCommit, ciRunId: options.ciRunId, run, queryCi, gitRoot: options.gitRoot ?? repositoryRoot, deadline, commandLog })).ci;
    await validateInstalledSnapshot(install, roots.project);
    emit(createRedactedRecord("preflight", { testedCommit: options.testedCommit, ciRunId: options.ciRunId, installManifestHashes: install.manifestHashes }));
    currentStage = "provider";
    const providerEnv = buildProviderEnvironment(roots, sourceEnvironment);
    const versionResult = await runCodexCommand(run, "codex-version", ["--version"], roots.project, providerEnv, deadline, commandLog, CEILINGS_MS.cancellation);
    if (versionResult.timedOut) throw new ReleaseSmokeError(versionResult.outerTimedOut ? "outer_timeout" : "provider_version_invalid", "provider");
    if (versionResult.code !== 0 || versionResult.signal) throw new ReleaseSmokeError("provider_version_invalid", "provider");
    codexVersion = versionFromOutput(versionResult.stdout);
    if (!codexVersion) throw new ReleaseSmokeError("provider_version_invalid", "provider");
    scenarios = await runLiveScenarios({ launcher: install.launchers.codex, roots, env: providerEnv, run, deadline, commandLog });
    gaps.push(...scenarios.gaps);
    if (scenarios.gaps.length > 0) failureStage = "provider";
    const claudeProbe = await probeHostVersion({ host: "claude_code", run, environment: providerEnv, cwd: roots.project, deadline, commandLog });
    claudeVersion = claudeProbe.version;
    hostObservations = options.observeHosts
      ? await options.observeHosts({ roots, environment: providerEnv, run, deadline, commandLog, schemaPath: hostSchemaPath, codexVersion, claudeVersion, inspect: options.inspect ?? inspectProcessIdentity, terminate: options.terminate ?? terminateExactPid })
      : await runHostObservations({ roots, environment: providerEnv, run, deadline, commandLog, schemaPath: hostSchemaPath, codexVersion, claudeVersion, inspect: options.inspect ?? inspectProcessIdentity, terminate: options.terminate ?? terminateExactPid });
    gaps.push(...hostObservations.gaps);
    if (hostObservations.gaps.length > 0) failureStage ??= "provider";
  } catch (error) {
    const code = error instanceof ReleaseSmokeError ? error.code : "scratch_invalid";
    gaps.push(code);
    failureStage ??= error instanceof ReleaseSmokeError ? error.stage : currentStage;
  } finally {
    currentStage = "cleanup";
    if (install && roots.project && roots.state && roots.cancellationCaller) {
      try {
        cleanup = await cleanupRun({ launcher: install.launchers.codex, roots, env: buildProviderEnvironment(roots, sourceEnvironment), run, deadline, commandLog, launchedWorkerCount: scenarios.launchedWorkerCount ?? 0, knownOwnedPids: scenarios.ownedPids ?? [], inspect: options.inspect ?? inspectProcessIdentity, terminate: options.terminate ?? terminateExactPid });
      } catch {
        cleanup.facts.attempted = true;
        cleanup.facts.identityUncertain += 1;
        cleanup.processesGone = false;
        cleanup.result = evaluateCleanupFacts(cleanup.facts);
      }
    } else {
      cleanup.facts = { ...cleanup.facts, attempted: true };
      cleanup.processesGone = true;
      cleanup.result = evaluateCleanupFacts(cleanup.facts);
    }
    const scratchClean = !scratch || (cleanup.processesGone && await removeScratch(scratch));
    cleanup.facts.scratchCleanupFailed = !scratchClean;
    cleanup.result = evaluateCleanupFacts(cleanup.facts);
    gaps.push(...cleanup.result.gaps);
    if (cleanup.result.gaps.length > 0) failureStage ??= "cleanup";
    if (Date.now() >= deadline.at) deadline.timedOut = true;
    if (deadline.timedOut) failureStage ??= currentStage;
    const finalFailureStage = gaps.length === 0 && cleanup.result.releaseReady && scratchClean && !deadline.timedOut ? null : (failureStage ?? currentStage);
    const evidence = buildEvidence({ options, roots, install, ci, codexVersion, commands: commandLog, scenarios, cleanup, hostObservations, gaps, failureStage: finalFailureStage, outerTimedOut: deadline.timedOut });
    let finalEvidence = evidence;
    if (options.evidenceDestination) {
      try {
        await writeEvidenceArtifacts(evidence, options.evidenceDestination);
      } catch {
        finalEvidence = forceEvidenceFailure(evidence, "evidence_write_failed", "evidence");
        try { await writeEvidenceArtifacts(finalEvidence, options.evidenceDestination); }
        catch {
          await rm(options.evidenceDestination.jsonPath, { force: true }).catch(() => {});
          await rm(options.evidenceDestination.markdownPath, { force: true }).catch(() => {});
        }
      }
      if (Date.now() >= deadline.at && !finalEvidence.unresolvedGaps.includes("outer_timeout")) {
        deadline.timedOut = true;
        finalEvidence = forceEvidenceFailure(finalEvidence, "outer_timeout", finalEvidence.failureStage ?? "evidence");
        try { await writeEvidenceArtifacts(finalEvidence, options.evidenceDestination); }
        catch {
          await rm(options.evidenceDestination.jsonPath, { force: true }).catch(() => {});
          await rm(options.evidenceDestination.markdownPath, { force: true }).catch(() => {});
        }
      }
    }
    const finalRecord = createRedactedRecord("final", { testedCommit: options.testedCommit, releaseReady: finalEvidence.releaseReady, failureStage: finalEvidence.failureStage, predicateCounts: { nativeChildCount: finalEvidence.predicates.nativeChildCount ?? 0 }, cleanup: finalEvidence.cleanup, unresolvedGaps: finalEvidence.unresolvedGaps });
    emit(finalRecord);
    return finalEvidence;
  }
}

function forceEvidenceFailure(evidence, code, stage) {
  return {
    ...evidence,
    releaseReady: false,
    failureStage: failureStages.has(stage) ? stage : "evidence",
    unresolvedGaps: [...new Set([...evidence.unresolvedGaps, code].filter((value) => gapCodes.has(value)))].sort(),
  };
}

export function buildInstallerEnvironment(roots, source = process.env) {
  const env = {};
  const allowed = new Set(["PATH", "PATHEXT", "COMSPEC", "SYSTEMROOT", "WINDIR", "LANG", "LC_ALL", "NO_COLOR", "TZ"]);
  for (const [key, value] of Object.entries(source)) if (allowed.has(key.toUpperCase()) && typeof value === "string") env[key] = value;
  env.HOME = roots.installerHome;
  env.USERPROFILE = roots.installerHome;
  env.APPDATA = join(roots.installerHome, "appdata");
  env.LOCALAPPDATA = join(roots.installerHome, "localappdata");
  env.XDG_CONFIG_HOME = join(roots.installerHome, "xdg-config");
  env.XDG_STATE_HOME = join(roots.installerHome, "xdg-state");
  env.XDG_CACHE_HOME = join(roots.installerHome, "xdg-cache");
  env.CODEX_HOME = join(roots.installerHome, ".codex");
  env.CLAUDE_CONFIG_DIR = join(roots.installerHome, ".claude");
  env.TEMP = roots.temp;
  env.TMP = roots.temp;
  env.TMPDIR = roots.temp;
  env.DO_NOT_TRACK = "1";
  env.DISABLE_TELEMETRY = "1";
  env.SKILLS_TELEMETRY_DISABLED = "1";
  env.SKILLS_NO_TELEMETRY = "1";
  return env;
}

export function buildProviderEnvironment(roots, source = process.env) {
  const env = stripTestEnvironment({ ...source });
  env.LUNA_SIDECAR_HOME = roots.state;
  env.TEMP = roots.temp;
  env.TMP = roots.temp;
  env.TMPDIR = roots.temp;
  return env;
}

function stripTestEnvironment(env) {
  for (const key of Object.keys(env)) if (/^FAKE_CODEX_|^LUNA_TEST_|^LUNA_SIDECAR_TEST_/.test(key)) delete env[key];
  return env;
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === "--help") {
    process.stdout.write(RELEASE_SMOKE_HELP);
    return 0;
  }
  let options;
  try { options = parseReleaseSmokeArgs(argv); }
  catch { process.stderr.write("release-smoke: invalid arguments\n"); return 2; }
  try {
    const evidence = await orchestrateReleaseSmoke({ ...options, evidenceDestination: DEFAULT_EVIDENCE_DESTINATION });
    return evidence.releaseReady ? 0 : 1;
  } catch (error) {
    const code = error instanceof ReleaseSmokeError ? error.code : "argument_invalid";
    process.stderr.write(`release-smoke: ${code}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));

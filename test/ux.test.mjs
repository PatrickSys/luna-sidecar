import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const launcherPath = join(repositoryRoot, "skills", "luna-sidecar", "scripts", "luna-sidecar.mjs");

test("skill metadata and guidance define the narrow host-facing activation boundary", async () => {
  const skill = await readFile(join(repositoryRoot, "skills", "luna-sidecar", "SKILL.md"), "utf8");
  const usage = await readFile(join(repositoryRoot, "skills", "luna-sidecar", "references", "USAGE.md"), "utf8");
  const readme = await readFile(join(repositoryRoot, "README.md"), "utf8");

  assert.match(skill, /description:.*human explicitly mentions.*Luna subagent.*Luna sidecar.*sidecar.*case-insensitively/i);
  assert.match(skill, /Use this skill only after the human explicitly mentions.*Luna subagent.*Luna sidecar.*sidecar/s);
  assert.match(skill, /host agent owns .*commands, worker IDs, lifecycle results, and the final report/i);
  assert.match(skill, /every start names an absolute existing cwd, sandbox, effort, and one bounded task/i);
  assert.match(skill, /--cwd .*--sandbox read-only --effort high/);
  assert.match(skill, /read-only.*workspace-write.*full-access.*explicit host choices/i);
  assert.match(skill, /direct human intent/i);
  assert.match(skill, /independent workers/i);
  assert.match(skill, /native subagents/i);
  assert.match(skill, /recursively/i);
  assert.match(skill, /failed.*unknown.*taskOutcome: `?not_evaluated`?/s);
  assert.match(skill, /Never delegate secrets/i);
  assert.match(skill, /state root, raw logs, and provider final messages are sensitive/i);
  assert.match(skill, /compact receipts use an allowlist/i);
  assert.match(skill, /\[references\/USAGE\.md\]\(references\/USAGE\.md\)/);
  assert.match(skill, /scripts\/luna-sidecar\.mjs" start --cwd .*--sandbox read-only --effort high/);
  assert.match(skill, /scripts\/luna-sidecar\.mjs" --help/);

  for (const pattern of [/Web research/, /Local inspection/, /Audit/, /Adversarial review/, /Planning/, /Execution/]) {
    assert.match(usage, pattern);
  }
  assert.match(usage, /not CLI modes or runtime task types/i);
  assert.match(usage, /start.*thread\.started.*readiness\/running/s);
  assert.match(usage, /Operational completion is not task success/i);
  assert.match(usage, /unknown state.*new `start`/s);
  assert.match(usage, /cancellation timeout or failure.*not.*cancelled/is);
  assert.match(usage, /taskOutcome: not_evaluated/);
  for (const command of ["start", "status", "wait", "resume", "cancel", "list"]) {
    assert.match(usage, new RegExp(`luna-sidecar\\.mjs\\" ${command}`));
  }
  assert.doesNotMatch(usage, /--(research|inspection|audit|adversarial|planning|execution)\b/);
  assert.doesNotMatch(`${skill}\n${usage}`, /luna-sidecar\.mjs" (run|stop)\b/);

  assert.match(readme, /Agent Skill asset.*zero-dependency Node launcher/i);
  assert.match(readme, /human asks the host agent/i);
  assert.match(readme, /does not add a host adapter.*every host routes skill metadata/i);
  assert.match(readme, /start --cwd .*--sandbox read-only --effort high/);
  assert.match(readme, /does not claim universal-host behavior|Missing host evidence keeps release readiness false/i);
});

test("global and public command help are plain, successful, and side-effect free", async (t) => {
  const invocations = [
    { args: ["--help"], pattern: /Commands: start, status, wait, resume, cancel, list/ },
    { args: ["start", "--help"], pattern: /Usage: luna-sidecar start/ },
    { args: ["status", "--help"], pattern: /Usage: luna-sidecar status/ },
    { args: ["wait", "--help"], pattern: /Usage: luna-sidecar wait/ },
    { args: ["resume", "--help"], pattern: /Usage: luna-sidecar resume/ },
    { args: ["cancel", "--help"], pattern: /Usage: luna-sidecar cancel/ },
    { args: ["list", "--help"], pattern: /Usage: luna-sidecar list/ },
  ];
  const roots = [];
  t.after(async () => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

  for (const { args, pattern } of invocations) {
    const root = await mkdtemp(join(tmpdir(), "luna-sidecar-help-"));
    roots.push(root);
    const stateRoot = join(root, "state-root");
    const result = await invoke(args, stateRoot);
    assert.equal(result.code, 0, args.join(" "));
    assert.equal(result.signal, null);
    assert.notEqual(result.stdout.trim(), "", args.join(" "));
    assert.match(result.stdout, pattern, args.join(" "));
    assert.throws(() => JSON.parse(result.stdout), SyntaxError, args.join(" "));
    assert.equal(result.stderr, "", args.join(" "));
    await assert.rejects(stat(stateRoot), { code: "ENOENT" });
  }
});

test("removed lifecycle commands are not public launcher commands", async () => {
  const source = await readFile(launcherPath, "utf8");
  assert.doesNotMatch(source, /command === "cancel" \|\| command === "stop"/);
  assert.match(source, /removedCommands/);
  assert.match(source, /removed_command/);
});

function invoke(args, stateRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcherPath, ...args], {
      cwd: repositoryRoot,
      env: { ...process.env, LUNA_SIDECAR_HOME: stateRoot },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

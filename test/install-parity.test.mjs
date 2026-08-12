import assert from "node:assert/strict";
import { lstat, readFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCliHarness } from "./helpers/cli-harness.mjs";
import { buildInstallerEnvironment, buildManifest, compareManifests, validateInstallRoots } from "../scripts/release-smoke.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const installerPath = join(repositoryRoot, "node_modules", "skills", "bin", "cli.mjs");
const sourceSkillRoot = join(repositoryRoot, "skills", "luna-sidecar");
const requiredSkillAssets = ["SKILL.md", "scripts/luna-sidecar.mjs", "references/USAGE.md"];

test("install parity remains scoped to the three canonical copied assets", () => {
  assert.deepEqual(requiredSkillAssets, ["SKILL.md", "scripts/luna-sidecar.mjs", "references/USAGE.md"]);
});

test("pinned local installer metadata and README expose the tested contract", async () => {
  const metadata = JSON.parse(await readFile(join(repositoryRoot, "node_modules", "skills", "package.json"), "utf8"));
  const readme = await readFile(join(repositoryRoot, "node_modules", "skills", "README.md"), "utf8");
  assert.equal(metadata.version, "1.5.22");
  assert.equal(metadata.engines.node, ">=22.20.0");
  assert.equal(metadata.bin.skills, "./bin/cli.mjs");
  assert.match(readme, /skills add/);

  const help = await invokeInstaller(["--help"], repositoryRoot, process.env);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /--skill/);
  assert.match(help.stdout, /--copy/);
  assert.match(help.stdout, /-a, --agent/);
});

test("project copied installs are byte-identical and run the copied launcher", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "luna parity space & % ! ^ ü-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const projectRoot = root;
  const installerHome = join(root, "installer-home");
  const installerTemp = join(root, "installer temp");
  await mkdir(installerTemp, { recursive: true });
  const env = buildInstallerEnvironment({ installerHome, temp: installerTemp }, {
    ...process.env,
    OPENAI_API_KEY: "must-not-reach-installer",
    ANTHROPIC_API_KEY: "must-not-reach-installer",
    CODEX_HOME: join(root, "outside-codex"),
    CLAUDE_CONFIG_DIR: join(root, "outside-claude"),
  });
  assert.equal(env.HOME, installerHome);
  assert.equal(env.USERPROFILE, installerHome);
  assert.equal(env.CODEX_HOME, join(installerHome, ".codex"));
  assert.equal(env.CLAUDE_CONFIG_DIR, join(installerHome, ".claude"));
  assert.equal(Object.hasOwn(env, "OPENAI_API_KEY"), false);
  assert.equal(Object.hasOwn(env, "ANTHROPIC_API_KEY"), false);
  const canonicalBefore = await buildManifest(sourceSkillRoot);
  const install = await invokeInstaller(
    ["add", repositoryRoot, "--skill", "luna-sidecar", "--copy", "-a", "codex", "-a", "claude-code", "-y"],
    projectRoot,
    env,
  );
  assert.equal(install.code, 0, install.stderr.toString());
  const [codexRoot, claudeRoot] = await validateInstallRoots(projectRoot);
  const canonical = await buildManifest(sourceSkillRoot);
  const codex = await buildManifest(codexRoot, projectRoot);
  const claude = await buildManifest(claudeRoot, projectRoot);
  for (const skillRoot of [sourceSkillRoot, codexRoot, claudeRoot]) {
    for (const relativePath of requiredSkillAssets) {
      const info = await lstat(join(skillRoot, relativePath));
      assert.equal(info.isFile(), true, `${relativePath} must be a regular file`);
      assert.equal(info.isSymbolicLink(), false, `${relativePath} must not be a symlink`);
    }
  }
  assert.deepEqual(compareManifests(canonicalBefore, canonical).equal, true);
  assert.deepEqual(compareManifests(canonical, codex).equal, true);
  assert.deepEqual(compareManifests(codex, claude).equal, true);
  await assert.rejects(lstat(join(root, "outside-codex")), { code: "ENOENT" });
  await assert.rejects(lstat(join(root, "outside-claude")), { code: "ENOENT" });

  const copiedLauncher = join(codexRoot, "scripts", "luna-sidecar.mjs");
  assert.notEqual(copiedLauncher, join(sourceSkillRoot, "scripts", "luna-sidecar.mjs"));
  assert.equal(await readFile(copiedLauncher, "utf8"), await readFile(join(sourceSkillRoot, "scripts", "luna-sidecar.mjs"), "utf8"));

  const harness = await createCliHarness(t, copiedLauncher);
  const start = await harness.invoke(["start", "--effort", "low", "--sandbox", "read-only", "--cwd", harness.root, "--", "copied install verification"], {
    stdin: "copied install verification\n",
    scenario: { stdoutChunks: [`{"type":"turn.completed"}\n`] },
  });
  assert.equal(start.code, 0);
  const receipt = start.json();
  const wait = await harness.invoke(["wait", receipt.workerId]);
  assert.equal(wait.code, 0);
  assert.equal(wait.json().providerState, "completed");
  const capture = await harness.readCapture(start);
  assert.equal(capture.cwd, harness.root);

  const claudeLauncher = join(claudeRoot, "scripts", "luna-sidecar.mjs");
  assert.notEqual(claudeLauncher, join(sourceSkillRoot, "scripts", "luna-sidecar.mjs"));
  assert.equal(await readFile(claudeLauncher, "utf8"), await readFile(join(sourceSkillRoot, "scripts", "luna-sidecar.mjs"), "utf8"));
  const claudeHarness = await createCliHarness(t, claudeLauncher);
  const claudeStart = await claudeHarness.invoke(["start", "--effort", "low", "--sandbox", "read-only", "--cwd", claudeHarness.root, "--", "claude-code copied install verification"], {
    stdin: "claude-code copied install verification\n",
    scenario: { stdoutChunks: ['{"type":"turn.completed"}\n'] },
  });
  assert.equal(claudeStart.code, 0);
  const claudeReceipt = claudeStart.json();
  const claudeWait = await claudeHarness.invoke(["wait", claudeReceipt.workerId]);
  assert.equal(claudeWait.code, 0);
  assert.equal(claudeWait.json().providerState, "completed");
  const claudeCapture = await claudeHarness.readCapture(claudeStart);
  assert.equal(claudeCapture.cwd, claudeHarness.root);
});

function invokeInstaller(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installerPath, ...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

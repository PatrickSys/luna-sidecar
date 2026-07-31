#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const efforts = new Set(["low", "medium", "high", "xhigh", "max"]);
const args = process.argv.slice(2);
let effort = "medium";
let sandbox = "workspace-write";
let cwd = process.cwd();
let prompt = "";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--") {
    prompt = args.slice(index + 1).join(" ");
    break;
  }
  if (arg === "--effort") {
    effort = args[++index] ?? "";
    continue;
  }
  if (arg === "--read-only") {
    sandbox = "read-only";
    continue;
  }
  if (arg === "--cwd") {
    cwd = resolve(args[++index] ?? "");
    continue;
  }
  fail(`Unknown option: ${arg}`);
}

if (!efforts.has(effort)) fail(`--effort must be one of: ${[...efforts].join(", ")}`);
if (!prompt.trim()) fail('Pass one task after `--`, for example: -- "Review src/auth"');

const codexArgs = [
  "exec",
  "--model",
  "gpt-5.6-luna",
  "-c",
  `model_reasoning_effort=${effort}`,
  "--sandbox",
  sandbox,
  "-C",
  cwd,
  "-",
];

let child;
try {
  child = process.platform === "win32"
    ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "codex", ...codexArgs], { stdio: ["pipe", "inherit", "inherit"] })
    : spawn("codex", codexArgs, { stdio: ["pipe", "inherit", "inherit"] });
} catch (error) {
  if (error.code === "ENOENT") fail("Codex CLI was not found on PATH. Install it and sign in first.");
  fail(`Could not start Codex: ${error.message}`);
}

child.on("error", (error) => {
  if (error.code === "ENOENT") fail("Codex CLI was not found on PATH. Install it and sign in first.");
  fail(`Could not start Codex: ${error.message}`);
});

child.stdin.end(prompt);
child.on("exit", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));

function fail(message) {
  console.error(`luna-sidecar: ${message}`);
  process.exit(2);
}

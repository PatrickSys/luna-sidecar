#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scenarioPath = requiredEnv("FAKE_CODEX_SCENARIO");
const capturePath = requiredEnv("FAKE_CODEX_CAPTURE");
const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));
const stdin = await readStdin();
const stdoutChunks = (scenario.stdoutChunks ?? []).map(decodeChunk);
const stderrChunks = (scenario.stderrChunks ?? []).map(decodeChunk);
const grandchildSpec = scenario.grandchild === true ? {} : scenario.grandchild;
let grandchild = null;
let grandchildClosed = null;
let grandchildCapture = null;

if (grandchildSpec) {
  grandchildCapture = process.env.FAKE_CODEX_GRANDCHILD_CAPTURE;
  if (!grandchildCapture) throw new Error("FAKE_CODEX_GRANDCHILD_CAPTURE is required for a grandchild");
  grandchild = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "fake-grandchild.mjs")], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FAKE_GRANDCHILD_CAPTURE: grandchildCapture,
      FAKE_GRANDCHILD_READY: requiredEnv("FAKE_CODEX_GRANDCHILD_READY"),
      ...(process.env.FAKE_CODEX_GRANDCHILD_RELEASE
        ? { FAKE_GRANDCHILD_RELEASE: process.env.FAKE_CODEX_GRANDCHILD_RELEASE }
        : {}),
    },
    stdio: "ignore",
    windowsHide: true,
  });
  grandchildClosed = onceClose(grandchild);
  await waitForFile(requiredEnv("FAKE_CODEX_GRANDCHILD_READY"));
  grandchildCapture = JSON.parse(await readFile(grandchildCapture, "utf8"));
}

for (const chunk of stdoutChunks) await writeChunk(process.stdout, chunk);
for (const chunk of stderrChunks) await writeChunk(process.stderr, chunk);

const capture = {
  argv: process.argv.slice(2),
  stdinBase64: stdin.toString("base64"),
  cwd: process.cwd(),
  env: allowlistedEnv(),
  pid: process.pid,
  parentPid: process.ppid,
  stdoutChunks: stdoutChunks.map((chunk) => chunk.toString("base64")),
  stderrChunks: stderrChunks.map((chunk) => chunk.toString("base64")),
  grandchildPid: grandchild?.pid ?? null,
  grandchild: grandchildCapture,
  forbiddenEnvPresent: Object.hasOwn(process.env, "FAKE_CODEX_SECRET_SENTINEL"),
  exitCode: scenario.exitCode ?? 0,
  signal: scenario.signal ?? null,
};

await writeFile(capturePath, JSON.stringify(capture) + "\n", "utf8");
if (process.env.FAKE_CODEX_READY) await writeFile(process.env.FAKE_CODEX_READY, "ready\n", "utf8");

if (scenario.linger) await waitForFile(requiredEnv("FAKE_CODEX_RELEASE"));

if (grandchildClosed) await grandchildClosed;
if (scenario.signal) {
  process.kill(process.pid, scenario.signal);
} else {
  process.exitCode = scenario.exitCode ?? 0;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function allowlistedEnv() {
  const keys = [
    "LUNA_SIDECAR_HOME",
    "LUNA_TEST_SENTINEL",
    "FAKE_CODEX_SCENARIO",
    "FAKE_CODEX_CAPTURE",
    "FAKE_CODEX_READY",
    "FAKE_CODEX_RELEASE",
  ];
  return Object.fromEntries(keys.filter((key) => key in process.env).map((key) => [key, process.env[key]]));
}

function decodeChunk(chunk) {
  if (typeof chunk === "string") {
    if (chunk.startsWith("base64:")) return Buffer.from(chunk.slice("base64:".length), "base64");
    return Buffer.from(chunk, "utf8");
  }
  if (chunk && typeof chunk === "object") {
    if (typeof chunk.base64 === "string") return Buffer.from(chunk.base64, "base64");
    if (typeof chunk.hex === "string") return Buffer.from(chunk.hex, "hex");
    if (typeof chunk.utf8 === "string") return Buffer.from(chunk.utf8, "utf8");
  }
  throw new TypeError("A scripted output chunk must be a string, base64, hex, or utf8 object");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    const drained = stream.write(chunk, (error) => (error ? reject(error) : resolve()));
    if (!drained) stream.once("drain", resolve);
  });
}

async function waitForFile(filePath) {
  while (true) {
    try {
      await readFile(filePath);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

function onceClose(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
}

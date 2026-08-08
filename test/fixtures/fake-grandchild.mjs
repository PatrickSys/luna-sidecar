#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const capturePath = requiredEnv("FAKE_GRANDCHILD_CAPTURE");
const readyPath = requiredEnv("FAKE_GRANDCHILD_READY");
const releasePath = process.env.FAKE_GRANDCHILD_RELEASE ?? null;

await writeFile(
  capturePath,
  JSON.stringify({
    pid: process.pid,
    parentPid: process.ppid,
    cwd: process.cwd(),
    env: allowlistedEnv(),
  }) + "\n",
  "utf8",
);
await writeFile(readyPath, "ready\n", "utf8");

if (releasePath) await waitForFile(releasePath);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function allowlistedEnv() {
  const keys = ["LUNA_TEST_SENTINEL", "FAKE_CODEX_RELEASE"];
  return Object.fromEntries(keys.filter((key) => key in process.env).map((key) => [key, process.env[key]]));
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

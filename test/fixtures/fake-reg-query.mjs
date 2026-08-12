import { createHash } from "node:crypto";

const missingBytes = Buffer.from("ERROR: The system was unable to find the specified registry key or value.\r\n", "ascii");
const emptyBytes = Buffer.alloc(0);
const missingCaptureId = "reg-missing-exact-diagnostic-en-us-ascii-crlf-v1";
const missingSha256 = "f441ad85601f9eb5f698450818c42155f1961fd925522e4d7687721e316b4fc8";
const valueName = "EnableTranscripting";
const policyPath = "SOFTWARE\\Policies\\Microsoft\\PowerShellCore\\Transcription";

function args(hive) {
  return ["query", `${hive}\\${policyPath}`, "/v", valueName, "/reg:64"];
}

function expect(hive) {
  return {
    executable: "C:\\Windows\\System32\\reg.exe",
    args: args(hive),
    shell: false,
    windowsHide: true,
    deadlineMs: 2000,
    streamCapBytes: 8192,
  };
}

function facts({
  spawned = true,
  spawnError = null,
  timedOut = false,
  killAttempted = false,
  closed = true,
  exitCode = 0,
  signal = null,
  stdout = emptyBytes,
  stderr = emptyBytes,
  stdoutTruncated = false,
  stderrTruncated = false,
  elapsedMs = 5,
} = {}) {
  return {
    spawned,
    spawnError,
    timedOut,
    killAttempted,
    closed,
    exitCode,
    signal,
    stdoutBase64: Buffer.from(stdout).toString("base64"),
    stderrBase64: Buffer.from(stderr).toString("base64"),
    stdoutTruncated,
    stderrTruncated,
    elapsedMs,
  };
}

function valueOutput(value, encoding = "ascii") {
  const text = `\r\nHKEY_LOCAL_MACHINE\\${policyPath}\r\n    ${valueName}    REG_DWORD    ${value}\r\n\r\n`;
  if (encoding === "utf16le") return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  return Buffer.from(text, "ascii");
}

function missingStep(hive, scenarioId) {
  return {
    hive,
    captureId: missingCaptureId,
    scenarioId,
    expect: expect(hive),
    result: facts({ exitCode: 1, stdout: emptyBytes, stderr: missingBytes }),
  };
}

function step(hive, result) {
  return { hive, expect: expect(hive), result };
}

function managerCase(id, steps, state, admit, providerCaptures = admit ? 1 : 0) {
  return { id, injectedPlatform: "win32", injectedSystemRoot: "C:\\Windows", steps, expect: { state, queryOrder: steps.map(({ hive }) => hive), admit, providerCaptures } };
}

function rootCase(id, injectedSystemRoot) {
  return { id, injectedPlatform: "win32", injectedSystemRoot, steps: [], expect: { state: "unknown", queryOrder: [], admit: false, providerCaptures: 0 } };
}

const fixture = {
  schemaVersion: 1,
  capture: {
    id: missingCaptureId,
    sourceQuery: {
      executable: "C:\\WINDOWS\\System32\\reg.exe",
      args: args("HKCU"),
      exitCode: 1,
    },
    stderrBase64: missingBytes.toString("base64"),
    stderrBytes: missingBytes.length,
    stderrSha256: missingSha256,
    capturedUtc: "2026-08-12T07:37:05.693Z",
    executableSha256: "ef37663b44ac66920c6f33694deea01acb78ae3f3012884819373fa04c3eb5f0",
    windows: { edition: "Windows 11 Pro", build: "26200", uiLanguage: "en-US", systemLocale: "es-ES", activeCodePage: "65001" },
    normalization: "none",
  },
  cases: [
    managerCase("policy-enabled-hklm", [step("HKLM", facts({ stdout: valueOutput("0x1") }))], "enabled", false),
    managerCase("policy-disabled-hklm", [step("HKLM", facts({ stdout: valueOutput("0x0") }))], "disabled", true),
    managerCase("policy-enabled-utf16le-hklm", [step("HKLM", facts({ stdout: valueOutput("0x1", "utf16le") }))], "enabled", false),
    managerCase("reg-missing-hklm-key-en-us-ascii-crlf-v1", [
      missingStep("HKLM", "reg-missing-hklm-key-en-us-ascii-crlf-v1"),
      step("HKCU", facts({ stdout: valueOutput("0x1") })),
    ], "enabled", false),
    managerCase("reg-missing-hklm-value-en-us-ascii-crlf-v1", [
      missingStep("HKLM", "reg-missing-hklm-value-en-us-ascii-crlf-v1"),
      step("HKCU", facts({ stdout: valueOutput("0x0") })),
    ], "disabled", true),
    managerCase("reg-missing-hkcu-key-en-us-ascii-crlf-v1", [
      missingStep("HKLM", "reg-missing-hklm-key-en-us-ascii-crlf-v1"),
      missingStep("HKCU", "reg-missing-hkcu-key-en-us-ascii-crlf-v1"),
    ], "missing", true),
    managerCase("reg-missing-hkcu-value-en-us-ascii-crlf-v1", [
      missingStep("HKLM", "reg-missing-hklm-value-en-us-ascii-crlf-v1"),
      missingStep("HKCU", "reg-missing-hkcu-value-en-us-ascii-crlf-v1"),
    ], "missing", true),
    managerCase("policy-duplicate-same", [step("HKLM", facts({ stdout: Buffer.concat([valueOutput("0x0"), valueOutput("0x0")]) }))], "malformed", false),
    managerCase("policy-duplicate-conflict", [step("HKLM", facts({ stdout: Buffer.concat([valueOutput("0x0"), valueOutput("0x1")]) }))], "malformed", false),
    managerCase("policy-other-dword", [step("HKLM", facts({ stdout: valueOutput("0x2") }))], "malformed", false),
    managerCase("policy-missing-target", [step("HKLM", facts({ stdout: Buffer.from("HKEY_LOCAL_MACHINE\\ignored\r\n", "ascii") }))], "malformed", false),
    managerCase("policy-extra-target-field", [step("HKLM", facts({ stdout: Buffer.from(`    ${valueName}    REG_DWORD    0x0    EXTRA\r\n`, "ascii") }))], "malformed", false),
    managerCase("policy-stderr-on-success", [step("HKLM", facts({ stdout: valueOutput("0x0"), stderr: Buffer.from("warning\r\n", "ascii") }))], "malformed", false),
    managerCase("policy-stdout-truncated", [step("HKLM", facts({ stdout: valueOutput("0x0"), stdoutTruncated: true }))], "unknown", false),
    managerCase("policy-signal", [step("HKLM", facts({ exitCode: null, signal: "SIGTERM" }))], "unknown", false),
    managerCase("policy-timeout", [step("HKLM", facts({ timedOut: true, killAttempted: true, exitCode: null, signal: "SIGKILL", elapsedMs: 2001 }))], "timeout", false),
    managerCase("policy-spawn-error", [step("HKLM", facts({ spawned: false, spawnError: { code: "ENOENT", message: "not found" }, closed: false, exitCode: null }))], "spawn_error", false),
    managerCase("policy-access-denied", [step("HKLM", facts({ exitCode: 1, stderr: Buffer.from("ERROR: Access is denied.\r\n", "ascii") }))], "failure", false),
    managerCase("policy-general-failure", [step("HKLM", facts({ exitCode: 2, stderr: Buffer.from("ERROR: Invalid syntax.\r\n", "ascii") }))], "failure", false),
    managerCase("policy-unsupported-encoding", [step("HKLM", facts({ stdout: Buffer.from([0x81, 0x8d, 0x8f, 0x90]) }))], "unknown", false),
    managerCase("policy-localized-unknown", [step("HKLM", facts({ exitCode: 1, stderr: Buffer.from("FEHLER: Unbekannter Registrierungseintrag.\r\n", "utf8") }))], "unknown", false),
    managerCase("policy-missing-lf-only", [step("HKLM", facts({ exitCode: 1, stderr: Buffer.from("ERROR: The system was unable to find the specified registry key or value.\n", "ascii") }))], "unknown", false),
    managerCase("policy-missing-bom", [step("HKLM", facts({ exitCode: 1, stderr: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), missingBytes]) }))], "unknown", false),
    managerCase("policy-hkcu-unknown", [
      missingStep("HKLM", "reg-missing-hklm-key-en-us-ascii-crlf-v1"),
      step("HKCU", facts({ exitCode: 1, stderr: Buffer.from("unknown\r\n", "ascii") })),
    ], "unknown", false),
    rootCase("policy-system-root-absent", null),
    rootCase("policy-system-root-relative", "Windows"),
    rootCase("policy-system-root-malformed", "C:\\Windows\0invalid"),
  ],
};

if (missingBytes.length !== 75 || createHash("sha256").update(missingBytes).digest("hex") !== missingSha256) {
  throw new Error("The immutable missing-diagnostic capture changed");
}

export default deepFreeze(fixture);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

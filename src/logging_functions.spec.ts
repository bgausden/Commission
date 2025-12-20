import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initLogs,
  shutdownLogging,
  commissionLogger,
  contractorLogger,
  debugLogger,
} from "./logging_functions.js";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { PassThrough } from "node:stream";

describe("logging_functions", () => {
  const LOGS_DIR = "./logs";
  const originalLog4jsConsole = process.env.LOG4JS_CONSOLE;

  beforeAll(async () => {
    // Ensure test expectations are stable regardless of local .env settings.
    process.env.LOG4JS_CONSOLE = "on";
    await initLogs();
  });

  afterAll(() => {
    shutdownLogging();

    if (typeof originalLog4jsConsole === "undefined") {
      delete process.env.LOG4JS_CONSOLE;
    } else {
      process.env.LOG4JS_CONSOLE = originalLog4jsConsole;
    }
  });

  it("should create log files in the logs directory", () => {
    const files = readdirSync(LOGS_DIR);
    const logFiles = files.filter((file) => file.endsWith(".log"));
    expect(logFiles.length).toBeGreaterThan(0);
  });

  it("should log messages to the commission logger", () => {
    commissionLogger.info("Commission log message");
    const files = readdirSync(LOGS_DIR);
    const commissionLogFile = files.find((file) => file.includes("commission"));
    expect(commissionLogFile).toBeDefined();
    assert(commissionLogFile);
    const logFilePath = path.join(LOGS_DIR, commissionLogFile);
    expect(existsSync(logFilePath)).toBe(true);
  });

  it("should log messages to the contractor logger", () => {
    contractorLogger.info("Contractor log message");
    const files = readdirSync(LOGS_DIR);
    const contractorLogFile = files.find((file) => file.includes("contractor"));
    expect(contractorLogFile).toBeDefined();
    assert(contractorLogFile);
    const logFilePath = path.join(LOGS_DIR, contractorLogFile);
    expect(existsSync(logFilePath)).toBe(true);
  });

  it("only severity debug messages sent to debugLogger should log messages to stderr", async () => {
    let stderrOutput: string[] = [];
    const outputStream = new PassThrough();
    outputStream.on("data", (data) => {
      stderrOutput.push(data.toString());
    });
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = outputStream.write.bind(
      outputStream,
    ) as unknown as typeof process.stderr.write;

    debugLogger.debug("Debug log message");

    // Wait for async logging to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    outputStream.end();
    process.stderr.write = originalStderrWrite;
    expect(
      stderrOutput.some((output) => output.includes("Debug log message")),
    ).toBe(true);
  });
});

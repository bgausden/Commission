import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initLogs,
  shutdownLogging,
  commissionLogger,
  contractorLogger,
  debugLogger,
  infoLogger,
  warnLogger,
  errorLogger,
} from "./logging_functions.js";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert";

describe("logging_functions", () => {
  const LOGS_DIR = "./logs";

  beforeAll(() => {
    initLogs();
  });

  afterAll(() => {
    shutdownLogging();
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

  it("should log messages to the debug logger", () => {
    const originalConsoleError = console.error;
    let consoleOutput = "";
    console.error = (message) => {
      consoleOutput += message;
    };

    debugLogger.debug("Debug log message");

    console.error = originalConsoleError;

    expect(consoleOutput).toContain("Debug log message");
  });

  /* it("should log messages to the info logger", () => {
    infoLogger.info("Info log message");
    const files = readdirSync(LOGS_DIR);
    const infoLogFile = files.find((file) => file.includes("info"));
    expect(infoLogFile).toBeDefined();
    const logFilePath = path.join(LOGS_DIR, infoLogFile);
    expect(existsSync(logFilePath)).toBe(true);
  });

  it("should log messages to the warn logger", () => {
    warnLogger.warn("Warn log message");
    const files = readdirSync(LOGS_DIR);
    const warnLogFile = files.find((file) => file.includes("warn"));
    expect(warnLogFile).toBeDefined();
    const logFilePath = path.join(LOGS_DIR, warnLogFile);
    expect(existsSync(logFilePath)).toBe(true);
  });

  it("should log messages to the error logger", () => {
    errorLogger.error("Error log message");
    const files = readdirSync(LOGS_DIR);
    const errorLogFile = files.find((file) => file.includes("error"));
    expect(errorLogFile).toBeDefined();
    const logFilePath = path.join(LOGS_DIR, errorLogFile);
    expect(existsSync(logFilePath)).toBe(true);
  }); */
});

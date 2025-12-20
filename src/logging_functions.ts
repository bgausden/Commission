import { readFileSync } from "node:fs";
import log4js, { FileAppender } from "log4js";
const { configure, getLogger, shutdown } = log4js;
import path, { basename, extname } from "node:path";
import {
  assertLog4JsConfig,
  moveFilesToOldSubDir,
} from "./utility_functions.js";
// import { z } from "zod";
import assert from "node:assert";
import { DEFAULT_LOG4JS_CONFIG_FILE } from "./constants.js";
import {
  getProjectRoot,
  resolveFromProjectRoot,
  resolveFromProjectRootIfRelative,
} from "./projectRoot.js";

function shouldLogToConsole(): boolean {
  const setting = (process.env.LOG4JS_CONSOLE ?? "on").trim().toLowerCase();
  return !["off", "false", "0", "none", "errors"].includes(setting);
}

function consoleMode(): "on" | "off" | "errors" {
  const setting = (process.env.LOG4JS_CONSOLE ?? "on").trim().toLowerCase();
  if (["off", "false", "0", "none"].includes(setting)) return "off";
  if (setting === "errors") return "errors";
  return "on";
}

function isFileAppender(appender: unknown): asserts appender is FileAppender {
  assert(
    typeof appender === "object" &&
      appender !== null &&
      "filename" in appender &&
      "type" in appender,
    "Invalid FileAppender",
  );
}

export async function initLogs() {
  /**
   * Loads the log4js configuration from a file and returns it.
   * Necessary because we want to dynamically name the log files
   * and so we need a Configuration object we can manipulate
   * rather than simply passing l4js.configure() the log4js.json
   * config file
   * @returns The loaded log4js configuration.
   */

  /*   function loadlog4jsConfig() {
    const possibleL4jsConfig = JSON.parse(
      readFileSync(`./${log4jsConfigFile}`, 'utf-8')
    ) as Configuration
    isLog4JsConfig(possibleL4jsConfig) // throws an error if not a valid log4js config
    return possibleL4jsConfig
  } */

  const projectRoot = getProjectRoot();

  // Always default to the repository root logs/ folder, regardless of cwd.
  // If LOGS_DIR is provided and is relative, treat it as relative to repo root.
  const LOGS_DIR = process.env.LOGS_DIR
    ? resolveFromProjectRootIfRelative(process.env.LOGS_DIR)
    : resolveFromProjectRoot("logs");

  await moveFilesToOldSubDir(LOGS_DIR, undefined, true, 2);

  let LOG4JS_CONFIG_FILE = DEFAULT_LOG4JS_CONFIG_FILE as string;
  if (process.env.LOG4JS_CONFIG_FILE !== undefined) {
    LOG4JS_CONFIG_FILE = process.env.LOG4JS_CONFIG_FILE;
    infoLogger.info(
      `LOG4JS_CONFIG_FILE set in .env, using value ${LOG4JS_CONFIG_FILE}`,
    );
  }

  //const log4jsConfig: Configuration = JSON.parse(await readFile(new URL(`./${log4jsConfigFile}`, import.meta.url), { encoding: 'utf-8' }))
  const log4jsConfigPath = path.isAbsolute(LOG4JS_CONFIG_FILE)
    ? LOG4JS_CONFIG_FILE
    : path.join(projectRoot, LOG4JS_CONFIG_FILE);
  const possibleL4jsConfig = JSON.parse(
    readFileSync(log4jsConfigPath, "utf-8"),
  );
  assertLog4JsConfig(possibleL4jsConfig);

  /* const l4jsConfigSchema = z.object({
    appenders: z.object({
      commission: z.object({
        type: z.string(),
        filename: z.string().default(DEFAULT_COMMISSION_LOGFILE),
        layout: z.object({
          type: z.string(),
          pattern: z.optional(z.string()),
        }),
        flags: z.string(),
      }),
      contractor: z.object({
        type: z.string(),
        filename: z.string().default(DEFAULT_CONTRACTOR_LOGFILE),
        layout: z.object({
          type: z.string(),
          pattern: z.optional(z.string()),
        }),
        flags: z.string(),
      }),
      debug: z.object({
        type: z.string(),
      }),
      info: z.object({
        type: z.string(),
      }),
      warn: z.object({
        type: z.string(),
      }),
      error: z.object({
        type: z.string(),
      }),
    }),
    categories: z.object({
      default: z.object({
        appenders: z.array(z.string()),
        level: z.string(),
      }),
      contractor: z.object({
        appenders: z.array(z.string()),
        level: z.string(),
      }),
      debug: z.object({
        appenders: z.array(z.string()),
        level: z.string(),
      }),
      info: z.object({
        appenders: z.array(z.string()),
        level: z.string(),
      }),
      warn: z.object({
        appenders: z.array(z.string()),
        level: z.string(),
      }),
      error: z.object({
        appenders: z.array(z.string()),
        level: z.string(),
      }),
    }),
  }); */

  const timeStamp = new Date()
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\..*$/g, "");

  // Don't know if it's necessary to parse the log4js config.
  // For now assume it's in the correct format and contains the config items assumed to exist later in the code.
  //const log4jsConfig = l4jsConfigSchema.parse(possibleL4jsConfig);
  const log4jsConfig = possibleL4jsConfig;

  const mode = consoleMode();

  if (mode !== "on") {
    const consoleAppenderNames =
      mode === "errors"
        ? new Set(["debug", "info", "warn"])
        : new Set(["debug", "info", "warn", "error", "fatal"]);
    const categories = log4jsConfig.categories as Record<
      string,
      { appenders: string[]; level?: string }
    >;

    for (const category of Object.values(categories)) {
      if (!Array.isArray(category.appenders)) continue;
      category.appenders = category.appenders.filter(
        (name) => !consoleAppenderNames.has(name),
      );

      // Safety net: keep at least one appender so configure() doesn't fail.
      if (
        category.appenders.length === 0 &&
        "commission" in log4jsConfig.appenders
      ) {
        category.appenders = ["commission"];
      }
    }
  }

  const commissionAppender = log4jsConfig.appenders.commission;
  isFileAppender(commissionAppender);

  const contractorAppender = log4jsConfig.appenders.contractor;
  isFileAppender(contractorAppender);

  const debugLogAppender = log4jsConfig.appenders.debugLog;
  isFileAppender(debugLogAppender);

  const initialCommissionLogFileName = commissionAppender.filename;
  const commissionLogFileExt = extname(initialCommissionLogFileName);
  const commissionLogFileBaseName = basename(
    initialCommissionLogFileName,
    commissionLogFileExt,
  );

  commissionAppender.filename = path.join(
    LOGS_DIR,
    `${commissionLogFileBaseName}-${timeStamp}${commissionLogFileExt}`,
  );

  const initialContractorLogFileName = contractorAppender.filename;
  const contractorLogFileExt = extname(initialContractorLogFileName);
  const contractorLogFileBaseName = basename(
    initialContractorLogFileName,
    contractorLogFileExt,
  );
  contractorAppender.filename = path.join(
    LOGS_DIR,
    `${contractorLogFileBaseName}-${timeStamp}${contractorLogFileExt}`,
  );

  const initialDebugLogFileName = debugLogAppender.filename;
  debugLogAppender.filename = path.join(LOGS_DIR, initialDebugLogFileName);

  configure(log4jsConfig);
}

export const commissionLogger = getLogger("commission");
commissionLogger.level = "info";

export const contractorLogger = getLogger("contractor");
contractorLogger.level = "info";

export const debugLogger = getLogger("debug");
debugLogger.level = "debug";

export const infoLogger = getLogger("info");
infoLogger.level = "info";

export const warnLogger = getLogger("warn");
warnLogger.level = "warning";

export const errorLogger = getLogger("error");
errorLogger.level = "error";

// Console-only logger used by the web server to optionally echo child-process output.
// Intentionally does not write to the debugLog file appender.
export const webEchoLogger = getLogger("webEcho");
webEchoLogger.level = "info";

export function shutdownLogging(): void {
  shutdown((err) => {
    if (err) {
      console.error(err);
    }
  });
}

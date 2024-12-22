import { readFileSync } from "node:fs";
import log4js from "log4js";
const { configure, getLogger, shutdown } = log4js;
import { config } from "node-config-ts";
import { basename, extname } from "node:path";
import {
  assertLog4JsConfig,
  isValidDirectory,
  moveFilesToOldDir,
} from "./utility_functions.js";
import { z } from "zod";
import {
  DEFAULT_COMMISSION_LOGFILE,
  DEFAULT_CONTRACTOR_LOGFILE,
  DEFAULT_LOGS_DIR,
  defaultLog4jsConfigFile,
} from "./constants.js";

export function initLogs() {
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

  const log4jsConfigFile = config.log4jsConfigFile ?? defaultLog4jsConfigFile;

  const logsDir = setLogsDir(config.LOGS_DIR);
  moveFilesToOldDir(logsDir);

  //const log4jsConfig: Configuration = JSON.parse(await readFile(new URL(`./${log4jsConfigFile}`, import.meta.url), { encoding: 'utf-8' }))
  const possibleL4jsConfig = JSON.parse(
    readFileSync(`./${log4jsConfigFile}`, "utf-8"),
  );
  assertLog4JsConfig(possibleL4jsConfig);

  const l4jsConfigSchema = z.object({
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
  });

  const log4jsConfig = l4jsConfigSchema.parse(possibleL4jsConfig);

  const initialCommissionLogFileName =
    log4jsConfig.appenders.commission.filename;
  const commissionLogFileExt = extname(initialCommissionLogFileName);
  const commissionLogFileBaseName = basename(
    initialCommissionLogFileName,
    commissionLogFileExt,
  );
  let date = new Date().toISOString().replace(new RegExp(":", "g"), "");
  log4jsConfig.appenders.commission.filename = `${logsDir}/${commissionLogFileBaseName}-${date}${commissionLogFileExt}`;

  const initialContractorLogFileName =
    log4jsConfig.appenders.contractor.filename;
  const contractorLogFileExt = extname(initialContractorLogFileName);
  const contractorLogFileBaseName = basename(
    initialContractorLogFileName,
    contractorLogFileExt,
  );
  date = new Date().toISOString().replace(new RegExp(":", "g"), "");
  log4jsConfig.appenders.contractor.filename = `${logsDir}/${contractorLogFileBaseName}-${date}${contractorLogFileExt}`;

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

/**
 * Sets the directory for storing logs.
 *
 * @param path - The path to the logs directory.
 * @returns The path to the logs directory if it is valid, otherwise the default logs directory.
 */
function setLogsDir(path: string) {
  if (!isValidDirectory(path)) {
    return DEFAULT_LOGS_DIR;
  }
  return path;
}

export function shutdownLogging(): void {
  shutdown((err) => {
    if (err) {
      console.error(err);
    }
  });
}

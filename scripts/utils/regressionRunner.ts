/**
 * Runtime helpers for end-to-end regression replay tests.
 */

import { execFile } from "child_process";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const PAYMENTS_FILE_REGEX = /^Talenox Payments.*\.xlsx$/i;
const COMMISSION_LOG_REGEX = /^commission-.*\.log$/i;
const CONTRACTOR_LOG_REGEX = /^contractor-.*\.log$/i;
const OUTPUT_DISCOVERY_MAX_WAIT_MS = 3000;
const OUTPUT_DISCOVERY_POLL_MS = 50;

export interface RegressionOutputs {
  paymentsFile: string;
  commissionLogFile: string;
  contractorLogFile: string;
}

export interface RegressionSandbox {
  tempRoot: string;
  dataDir: string;
  logsDir: string;
  outputsDir: string;
  configDir: string;
  cleanup: () => Promise<void>;
}

interface DefaultConfig {
  PAYROLL_WB_FILENAME: string;
  updateTalenox?: boolean;
  uploadToGDrive?: boolean;
  [key: string]: unknown;
}

function assertExternalUploadsDisabled(config: DefaultConfig): void {
  if (config.updateTalenox) {
    throw new Error("Regression replay must run with updateTalenox=false.");
  }
  if (config.uploadToGDrive) {
    throw new Error("Regression replay must run with uploadToGDrive=false.");
  }
}

export function buildRegressionConfig(
  baselineDefaultConfigJson: string,
  sourceFileName: string,
): string {
  const parsed = JSON.parse(baselineDefaultConfigJson) as DefaultConfig;

  const normalized: DefaultConfig = {
    ...parsed,
    PAYROLL_WB_FILENAME: sourceFileName,
    // Ensure replay never mutates external systems.
    updateTalenox: false,
    uploadToGDrive: false,
  };

  assertExternalUploadsDisabled(normalized);

  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function selectSingleOutputFile(
  fileNames: string[],
  regex: RegExp,
  label: string,
): string {
  const matches = fileNames.filter((name) => regex.test(name));

  if (matches.length === 0) {
    throw new Error(`Expected exactly one ${label} output file, found none.`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected exactly one ${label} output file, found ${matches.length}: ${matches.join(", ")}`,
    );
  }

  return matches[0];
}

export async function discoverRegressionOutputs(
  outputsDir: string,
): Promise<RegressionOutputs> {
  const startedAt = Date.now();
  let lastError: Error | undefined;
  let lastFiles: string[] = [];

  while (Date.now() - startedAt <= OUTPUT_DISCOVERY_MAX_WAIT_MS) {
    const files = await readdir(outputsDir);
    lastFiles = files;

    try {
      return {
        paymentsFile: selectSingleOutputFile(
          files,
          PAYMENTS_FILE_REGEX,
          "payments Excel",
        ),
        commissionLogFile: selectSingleOutputFile(
          files,
          COMMISSION_LOG_REGEX,
          "commission log",
        ),
        contractorLogFile: selectSingleOutputFile(
          files,
          CONTRACTOR_LOG_REGEX,
          "contractor log",
        ),
      };
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, OUTPUT_DISCOVERY_POLL_MS),
      );
    }
  }

  if (lastError) {
    throw new Error(
      `${lastError.message} Observed files in outputs dir: ${lastFiles.join(", ") || "<none>"}.`,
    );
  }

  throw new Error(
    `Failed to discover regression output files. Observed files in outputs dir: ${lastFiles.join(", ") || "<none>"}.`,
  );
}

export async function createRegressionSandbox(): Promise<RegressionSandbox> {
  const tempRoot = await mkdtemp(join(tmpdir(), "commission-regression-"));
  const dataDir = join(tempRoot, "data");
  const logsDir = join(tempRoot, "logs");
  const outputsDir = join(tempRoot, "outputs");
  const configDir = join(tempRoot, "config");

  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(logsDir, { recursive: true }),
    mkdir(outputsDir, { recursive: true }),
    mkdir(configDir, { recursive: true }),
  ]);

  async function cleanup(): Promise<void> {
    await rm(tempRoot, { recursive: true, force: true });
  }

  return {
    tempRoot,
    dataDir,
    logsDir,
    outputsDir,
    configDir,
    cleanup,
  };
}

export async function prepareBaselineInputsInSandbox(
  sandbox: RegressionSandbox,
  baselineDir: string,
  sourceFileName: string,
): Promise<void> {
  const sourceInputPath = join(baselineDir, "source", sourceFileName);
  const baselineDefaultConfigPath = join(baselineDir, "config", "default.json");
  const baselineStaffHurdlePath = join(
    baselineDir,
    "config",
    "staffHurdle.json",
  );

  const [
    sourceWorkbookContent,
    baselineDefaultConfigJson,
    baselineStaffHurdleJson,
  ] = await Promise.all([
    readFile(sourceInputPath),
    readFile(baselineDefaultConfigPath, "utf-8"),
    readFile(baselineStaffHurdlePath, "utf-8"),
  ]);

  const forcedDefaultConfig = buildRegressionConfig(
    baselineDefaultConfigJson,
    sourceFileName,
  );

  await Promise.all([
    writeFile(join(sandbox.dataDir, sourceFileName), sourceWorkbookContent),
    writeFile(
      join(sandbox.configDir, "default.json"),
      forcedDefaultConfig,
      "utf-8",
    ),
    writeFile(
      join(sandbox.tempRoot, "staffHurdle.json"),
      baselineStaffHurdleJson,
      "utf-8",
    ),
  ]);
}

export async function runCommissionInSandbox(
  sandbox: RegressionSandbox,
  projectRoot: string,
): Promise<void> {
  const tsxCliPath = join(
    projectRoot,
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );

  const env = {
    ...process.env,
    DATA_DIR: sandbox.dataDir,
    LOGS_DIR: sandbox.logsDir,
    PAYMENTS_DIR: sandbox.outputsDir,
    LOG4JS_CONSOLE: "errors",
    REGRESSION_OFFLINE: "1",
    NODE_CONFIG_TS_DIR: sandbox.configDir,
    STAFF_HURDLE_FILE: join(sandbox.tempRoot, "staffHurdle.json"),
  };

  await execFileAsync(process.execPath, [tsxCliPath, "src/index.ts"], {
    cwd: projectRoot,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });

  // Keep payments and parseable logs in one directory for regression discovery.
  const generatedLogs = await readdir(sandbox.logsDir);
  const logFilesToCopy = generatedLogs.filter(
    (fileName) =>
      COMMISSION_LOG_REGEX.test(fileName) ||
      CONTRACTOR_LOG_REGEX.test(fileName),
  );

  await Promise.all(
    logFilesToCopy.map((fileName) =>
      copyFile(
        join(sandbox.logsDir, fileName),
        join(sandbox.outputsDir, fileName),
      ),
    ),
  );
}

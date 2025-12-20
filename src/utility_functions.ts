/* global staffHurdles */

import { Configuration as l4JSConfiguration } from "log4js";
import { config } from "node-config-ts";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "path";
import zlib from "zlib";
import { debugLogger, errorLogger, warnLogger } from "./logging_functions.js";
import { TStaffID } from "./types.js";
import assert from "node:assert";
import { DEFAULT_OLD_DIR, defaultStaffID } from "./constants.js";
import { StaffHurdle } from "./IStaffHurdle.js";

export function checkRate(rate: unknown): boolean {
  if (typeof rate === "number") {
    if (0 <= rate && rate <= 1) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export function stripToNumeric(n: unknown): number {
  const numericOnly = /[^0-9.-]+/g;
  let x: number;
  if (typeof n === "string") {
    // strip out everything except 0-9, "." and "-"
    x = parseFloat(n.replace(numericOnly, ""));
    if (isNaN(x)) {
      x = 0;
    }
  }
  if (typeof n === "number") {
    x = n;
  } else {
    x = 0;
  }
  return x;
}

/**
 * Validates and retrieves staff hurdle configuration with consistent fallback behavior.
 *
 * @param staffID - The staff ID to validate
 * @param context - Description of where validation is being called (for better error messages)
 * @returns StaffHurdle configuration (either for staffID or default "000")
 * @throws Error if staffID missing and config.missingStaffAreFatal=true OR if default "000" doesn't exist
 */
export function getValidatedStaffHurdle(staffID: TStaffID, context: string): StaffHurdle {
  // First: Try to get staff's actual configuration
  if (staffHurdles[staffID]) {
    return staffHurdles[staffID];
  }

  // Second: Staff not found - check if this is fatal
  if (config.missingStaffAreFatal) {
    const message = `Staff ID ${staffID} found in ${context} but is missing from staffHurdle.json`;
    errorLogger.error(`Fatal: ${message}`);
    throw new Error(message);
  }

  // Third: Fall back to default with warning
  warnLogger.warn(`Staff ID ${staffID} not in staffHurdle.json (${context}). Using default ID ${defaultStaffID}.`);

  // Fourth: Ensure default exists (fatal if missing)
  if (!staffHurdles[defaultStaffID]) {
    const message = `Default staff ID ${defaultStaffID} is missing from staffHurdle.json. Cannot process staff ${staffID}.`;
    errorLogger.error(`Fatal: ${message}`);
    throw new Error(message);
  }

  return staffHurdles[defaultStaffID];
}

export function isPayViaTalenox(staffID: TStaffID): boolean {
  const sh = getValidatedStaffHurdle(staffID, "payroll Talenox check");

  if (!("payViaTalenox" in sh)) {
    throw new Error(`${staffID} has no payViaTalenox property.`);
  }
  return sh.payViaTalenox ? true : false;
}

export function eqSet(as: unknown[], bs: unknown[]): boolean {
  if (as.length !== bs.length) return false;
  for (const a of as) if (!bs.includes(a)) return false;
  return true;
}

export function isContractor(staffID: TStaffID): boolean {
  const sh = getValidatedStaffHurdle(staffID, "contractor status check");

  if (
    "contractor" in sh
    //Object.keys((staffHurdle as TStaffHurdles)[staffID]).indexOf('contractor')
  ) {
    return sh.contractor;
  }
  let message = `staffHurdle for staffID ${staffID} is missing 'contractor' key. Aborting.`;
  errorLogger.error(message);
  throw new Error(message);
}

export function getStaffHurdle(staffID: string) {
  assert(staffID in staffHurdles);
  return staffHurdles[staffID];
}

export function assertLog4JsConfig(config: unknown): asserts config is l4JSConfiguration {
  if (typeof config === "object" && !!config && ("appenders" in config || "categories" in config)) {
    return;
  } else {
    throw new Error("Failed to validate provided log4JSConfig");
  }
}

/**
 * Checks if the given directory path is valid.
 *
 * This function verifies if the specified path exists and is a directory.
 *
 * @param dir - The directory path to validate.
 * @returns `true` if the path exists and is a directory, otherwise `false`.
 */
export function isValidDirectory(dir: string): boolean {
  return existsSync(dir) && statSync(dir).isDirectory();
}

/**
 * Moves files from a source directory to a destination directory.
 * Optionally compresses the files and retains a specified number of most recently modified files.
 *
 * @param sourceDir - The source directory from which to move the files.
 * @param destDir - The destination directory to move the files to. Defaults to DEFAULT_OLD_DIR. Is relative to sourceDir.
 * @param compressFiles - Specifies whether to compress the files before moving them. Defaults to false.
 * @param retainCount - The number of most recently modified files to retain. Defaults to 0.
 */
export async function moveFilesToOldSubDir(
  sourceDir: string,
  destDir = DEFAULT_OLD_DIR,
  compressFiles = false,
  retainCount = 0,
): Promise<void> {
  if (!isValidDirectory(sourceDir)) {
    warnLogger.warn(`Unable to move files. Invalid source directory: ${sourceDir}`);
    return;
  }

  const sourceFiles = readdirSync(sourceDir);

  const targetDir = path.isAbsolute(destDir) ? destDir : path.join(sourceDir, destDir);
  const destDirName = path.basename(targetDir);

  if (!isValidDirectory(targetDir)) {
    warnLogger.warn(`Target directory: ${targetDir} does not exist. Will create.`);
    mkdirSync(targetDir, { recursive: true });
    assert(isValidDirectory(targetDir));
  }

  let filesToRetain: string[] = [];
  if (retainCount > 0) {
    filesToRetain = getMostRecentlyModifiedFiles(sourceDir, retainCount);
  }

  const compressionPromises: Promise<void>[] = [];

  sourceFiles.forEach((file) => {
    const filePath = path.join(sourceDir, file);
    const newFilePath = path.join(targetDir, file);
    if (file !== destDirName && !filesToRetain.includes(file)) {
      if (compressFiles) {
        // Compress the file asynchronously
        const compressionPromise = new Promise<void>((resolve, reject) => {
          const compressedFilePath = `${newFilePath}.gz`;
          const readStream = createReadStream(filePath);
          const writeStream = createWriteStream(compressedFilePath);
          const gzip = zlib.createGzip();

          writeStream.on("finish", () => {
            unlinkSync(filePath);
            writeStream.close();
            resolve();
          });

          writeStream.on("error", (err) => {
            reject(err);
          });

          readStream.on("error", (err) => {
            reject(err);
          });

          readStream.pipe(gzip).pipe(writeStream);
        });
        compressionPromises.push(compressionPromise);
      } else {
        // Move the file without compression
        renameSync(filePath, newFilePath);
        debugLogger.debug(`Moved ${filePath} to ${newFilePath}`);
      }
    }
  });

  // Wait for all compression operations to complete
  if (compressionPromises.length > 0) {
    await Promise.all(compressionPromises);
  }
}

export function getMostRecentlyModifiedFiles(dir: string, count = 3) {
  const files = readdirSync(dir);
  const stats = files.map((file) => ({
    file,
    stats: statSync(path.join(dir, file)),
  }));

  const sortedFiles = stats
    .filter(({ stats }) => stats.isFile())
    .sort((a, b) => b.stats.mtime.valueOf() - a.stats.mtime.valueOf())
    .slice(0, count);

  return sortedFiles.map(({ file }) => file);
}

export function loadJsonFromFile<T>(filepath: string): T {
  const fileContent = readFileSync(filepath, "utf-8");
  return JSON.parse(fileContent) as T;
}

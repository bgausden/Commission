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
import { DEFAULT_OLD_DIR } from "./constants.js";

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

export function isPayViaTalenox(staffID: TStaffID): boolean {
  let sh = staffHurdles[staffID];

  if (sh === undefined) {
    if (config.missingStaffAreFatal === true) {
      throw new Error(
        `StaffID ${staffID} found in Payroll report but is missing from staffHurdle.json`,
      );
    } else {
      console.warn(
        `Warning: staffID ${staffID} is missing from staffHurdle.json`,
      );
    }
  }

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
  const sh = staffHurdles[staffID];
  if (!sh) {
    //staffID = defaultStaffID
    let message = `No hurdle found for staffID ${staffID}. Aborting.`;
    errorLogger.error(message);
    throw new Error(message);
  }
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

export function assertLog4JsConfig(
  config: unknown,
): asserts config is l4JSConfiguration {
  if (
    typeof config === "object" &&
    !!config &&
    ("appenders" in config || "categories" in config)
  ) {
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
export function moveFilesToOldSubDir(
  sourceDir: string,
  destDir = DEFAULT_OLD_DIR,
  compressFiles = false,
  retainCount = 0,
): void {
  if (!isValidDirectory(sourceDir)) {
    warnLogger.warn(
      `Unable to move files. Invalid source directory: ${sourceDir}`,
    );
    return;
  }

  const sourceFiles = readdirSync(sourceDir);

  const targetDir = path.join(sourceDir, destDir);

  if (!isValidDirectory(targetDir)) {
    warnLogger.warn(
      `Target directory: ${targetDir} does not exist. Will create.`,
    );
    mkdirSync(path.join(sourceDir, targetDir), { recursive: false });
    assert(isValidDirectory(targetDir));
  }

  let filesToRetain: string[] = [];
  if (retainCount > 0) {
    filesToRetain = getMostRecentlyModifiedFiles(sourceDir, retainCount);
  }

  sourceFiles.forEach((file) => {
    const filePath = path.join(sourceDir, file);
    const newFilePath = path.join(targetDir, file);
    if (file !== destDir && !filesToRetain.includes(file)) {
      if (compressFiles) {
        // Compress the file
        const compressedFilePath = `${newFilePath}.gz`;
        const readStream = createReadStream(filePath);
        const writeStream = createWriteStream(compressedFilePath);
        writeStream.on("finish", () => {
          unlinkSync(filePath);
          writeStream.close();
        });
        const gzip = zlib.createGzip();
        readStream.pipe(gzip).pipe(writeStream);
        // Clean-up and closing stream handled by writeStream.on('finish')
      } else {
        // Move the file without compression
        renameSync(filePath, newFilePath);
        debugLogger.debug(`Moved ${filePath} to ${newFilePath}`);
      }
    }
  });
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

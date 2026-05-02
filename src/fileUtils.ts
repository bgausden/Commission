/**
 * File system utilities
 */

import {
  readFile,
  writeFile,
  copyFile as fsCopyFile,
  mkdir,
  stat,
} from "fs/promises";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { createHash } from "crypto";
import { dirname } from "path";
import path from "path";
import zlib from "zlib";
import assert from "node:assert";
import { DEFAULT_OLD_DIR } from "./constants.js";
import { isValidDirectory } from "./utility_functions.js";

/**
 * Compute SHA-256 checksum of a file
 */
export async function computeChecksum(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const hash = createHash("sha256").update(content).digest("hex");
  return `sha256:${hash}`;
}

/**
 * Copy file from source to destination, creating directories as needed
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest));
  await fsCopyFile(src, dest);
}

/**
 * Ensure directory exists, creating it and parents if needed
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * Read and parse JSON file
 */
export async function readJSON<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Write object to JSON file with pretty formatting
 */
export async function writeJSON(
  filePath: string,
  data: unknown,
): Promise<void> {
  await ensureDir(dirname(filePath));
  const content = JSON.stringify(data, null, 2);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
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
  retainFiles: string[] = [],
): Promise<void> {
  if (!isValidDirectory(sourceDir)) {
    console.warn(`Unable to move files. Invalid source directory: ${sourceDir}`);
    return;
  }

  const sourceFiles = readdirSync(sourceDir);

  const targetDir = path.isAbsolute(destDir)
    ? destDir
    : path.join(sourceDir, destDir);
  const destDirName = path.basename(targetDir);

  if (!isValidDirectory(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    assert(isValidDirectory(targetDir));
  }

  const filesToRetain = new Set<string>();
  if (retainCount > 0) {
    for (const file of getMostRecentlyModifiedFiles(sourceDir, retainCount)) {
      filesToRetain.add(file);
    }
  }
  for (const file of retainFiles) {
    if (file && file.trim()) filesToRetain.add(file);
  }

  const compressionPromises: Promise<void>[] = [];

  sourceFiles.forEach((file) => {
    const filePath = path.join(sourceDir, file);
    const newFilePath = path.join(targetDir, file);
    if (file !== destDirName && !filesToRetain.has(file)) {
      if (compressFiles) {
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
        renameSync(filePath, newFilePath);
      }
    }
  });

  if (compressionPromises.length > 0) {
    await Promise.all(compressionPromises);
  }
}

export function getMostRecentlyModifiedFiles(dir: string, count = 3): string[] {
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

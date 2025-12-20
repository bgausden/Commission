import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function findUp(startDir: string, filename: string): string | undefined {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, filename);
    if (fileExists(candidate)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Returns the repository root (directory containing package.json), regardless of cwd.
 * Works when running from both src/ (tsx) and dist/ (compiled JS).
 */
export function getProjectRoot(): string {
  const thisFilePath = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFilePath);

  // Typical layouts:
  // - src/*.ts -> root is ..
  // - dist/*.js -> root is ..
  const guess = path.resolve(thisDir, "..");
  const rootedAtGuess = findUp(guess, "package.json");
  if (rootedAtGuess && isDirectory(rootedAtGuess)) return rootedAtGuess;

  const rootedAtThisDir = findUp(thisDir, "package.json");
  if (rootedAtThisDir && isDirectory(rootedAtThisDir)) return rootedAtThisDir;

  // Last-resort: fall back to cwd.
  return process.cwd();
}

export function resolveFromProjectRoot(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments);
}

export function resolveFromProjectRootIfRelative(p: string): string {
  return path.isAbsolute(p) ? p : resolveFromProjectRoot(p);
}

/**
 * Git utilities for baseline management
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Get current branch name
 */
export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout.trim();
}

/**
 * Get current commit SHA (full)
 */
export async function getCommitSHA(ref: string = 'HEAD'): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', ref]);
  return stdout.trim();
}

/**
 * Get short commit SHA (7 characters)
 */
export async function getShortCommitSHA(ref: string = 'HEAD'): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--short', ref]);
  return stdout.trim();
}

/**
 * Check if working tree is clean (no uncommitted changes)
 */
export async function isWorkingTreeClean(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain']);
    return stdout.trim().length === 0;
  } catch {
    return false;
  }
}

/**
 * Stash current changes and return stash reference
 */
export async function stashPush(message?: string): Promise<string> {
  const msg = message || `Regression test stash ${new Date().toISOString()}`;
  await execFileAsync('git', ['stash', 'push', '-m', msg]);
  const { stdout } = await execFileAsync('git', ['stash', 'list', '-1', '--format=%gd']);
  return stdout.trim();
}

/**
 * Pop most recent stash
 */
export async function stashPop(): Promise<void> {
  try {
    await execFileAsync('git', ['stash', 'pop']);
  } catch (error) {
    // If stash pop fails (e.g., conflicts), log but don't throw
    console.warn('Warning: git stash pop failed:', (error as Error).message);
  }
}

/**
 * Checkout a specific commit or branch
 */
export async function checkout(ref: string): Promise<void> {
  await execFileAsync('git', ['checkout', ref]);
}

/**
 * Get commit date
 */
export async function getCommitDate(ref: string = 'HEAD'): Promise<Date> {
  const { stdout } = await execFileAsync('git', ['show', '-s', '--format=%ci', ref]);
  return new Date(stdout.trim());
}

/**
 * Check if a commit/ref exists
 */
export async function refExists(ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', ref]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Utilities for discovering and resolving regression test baselines
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { readJSON } from './fileUtils.js';
import type { Result } from '../../src/types.js';
import { ok, err } from '../../src/types.js';

interface BaselineMeta {
  createdDate: string; // ISO 8601
}

/**
 * Scan a baselines root directory and return the name of the oldest baseline,
 * as determined by the `createdDate` field in each baseline's `metadata.json`.
 *
 * Entries that are missing or have an invalid `metadata.json` are silently skipped.
 *
 * @param baselinesRoot - Absolute path to the directory containing baseline subdirectories
 */
export async function findOldestBaseline(baselinesRoot: string): Promise<Result<string>> {
  let entries: string[];
  try {
    entries = await readdir(baselinesRoot);
  } catch {
    return err(`Baselines directory not found: ${baselinesRoot}`);
  }

  const candidates: Array<{ name: string; createdDate: string }> = [];

  for (const entry of entries) {
    const metaPath = join(baselinesRoot, entry, 'metadata.json');
    try {
      const meta = await readJSON<BaselineMeta>(metaPath);
      if (meta?.createdDate) {
        candidates.push({ name: entry, createdDate: meta.createdDate });
      }
    } catch {
      // Entry has no valid metadata.json — skip it
    }
  }

  if (candidates.length === 0) {
    return err(`No valid baselines found in ${baselinesRoot}`);
  }

  candidates.sort((a, b) => a.createdDate.localeCompare(b.createdDate));
  return ok(candidates[0].name);
}

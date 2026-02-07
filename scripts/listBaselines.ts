#!/usr/bin/env node
/**
 * List all available regression test baselines
 * 
 * Usage:
 *   npm run list-baselines
 *   npx tsx scripts/listBaselines.ts
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdir } from 'fs/promises';
import type { BaselineMetadata } from '../src/regression.types.js';
import { readJSON, fileExists, isDirectory } from './utils/fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

interface BaselineSummary {
  name: string;
  createdDate: string;
  commitSHA: string;
  sourceFile: string;
  payrollPeriod: string;
  staffCount: number;
  exists: boolean;
}

async function listBaselines(): Promise<void> {
  const baselinesDir = join(PROJECT_ROOT, 'test-baselines');
  
  // Check if baselines directory exists
  if (!await fileExists(baselinesDir)) {
    console.log('No baselines directory found.');
    console.log('Create your first baseline with: npm run create-baseline -- <name>');
    return;
  }
  
  // Read all subdirectories
  const entries = await readdir(baselinesDir, { withFileTypes: true });
  const baselineDirs = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  if (baselineDirs.length === 0) {
    console.log('No baselines found.');
    console.log('Create your first baseline with: npm run create-baseline -- <name>');
    return;
  }
  
  // Load metadata for each baseline
  const baselines: BaselineSummary[] = [];
  
  for (const dirName of baselineDirs) {
    const metadataPath = join(baselinesDir, dirName, 'metadata.json');
    
    if (!await fileExists(metadataPath)) {
      baselines.push({
        name: dirName,
        createdDate: 'N/A',
        commitSHA: 'N/A',
        sourceFile: 'N/A',
        payrollPeriod: 'N/A',
        staffCount: 0,
        exists: false,
      });
      continue;
    }
    
    try {
      const metadata = await readJSON<BaselineMetadata>(metadataPath);
      baselines.push({
        name: metadata.baselineName,
        createdDate: new Date(metadata.createdDate).toLocaleDateString(),
        commitSHA: metadata.commitSHA.substring(0, 7),
        sourceFile: metadata.sourceFile,
        payrollPeriod: `${metadata.payrollMonth}/${metadata.payrollYear}`,
        staffCount: metadata.staffCount,
        exists: true,
      });
    } catch (error) {
      baselines.push({
        name: dirName,
        createdDate: 'ERROR',
        commitSHA: 'ERROR',
        sourceFile: 'Invalid metadata.json',
        payrollPeriod: 'N/A',
        staffCount: 0,
        exists: false,
      });
    }
  }
  
  // Sort by creation date (newest first)
  baselines.sort((a, b) => {
    if (!a.exists) return 1;
    if (!b.exists) return -1;
    return b.createdDate.localeCompare(a.createdDate);
  });
  
  // Display results
  console.log('');
  console.log('='.repeat(100));
  console.log('AVAILABLE BASELINES');
  console.log('='.repeat(100));
  console.log('');
  
  // Header
  const nameWidth = 25;
  const dateWidth = 12;
  const commitWidth = 10;
  const periodWidth = 12;
  const staffWidth = 8;
  
  console.log(
    padRight('NAME', nameWidth) +
    padRight('CREATED', dateWidth) +
    padRight('COMMIT', commitWidth) +
    padRight('PERIOD', periodWidth) +
    padRight('STAFF', staffWidth) +
    'SOURCE FILE'
  );
  console.log('-'.repeat(100));
  
  // Rows
  for (const baseline of baselines) {
    const status = baseline.exists ? '' : ' ⚠️ ';
    console.log(
      padRight(baseline.name + status, nameWidth) +
      padRight(baseline.createdDate, dateWidth) +
      padRight(baseline.commitSHA, commitWidth) +
      padRight(baseline.payrollPeriod, periodWidth) +
      padRight(baseline.staffCount.toString(), staffWidth) +
      baseline.sourceFile
    );
  }
  
  console.log('');
  console.log(`Total: ${baselines.length} baseline${baselines.length !== 1 ? 's' : ''}`);
  
  // Show warnings for invalid baselines
  const invalid = baselines.filter(b => !b.exists);
  if (invalid.length > 0) {
    console.log('');
    console.log(`⚠️  ${invalid.length} baseline${invalid.length !== 1 ? 's have' : ' has'} missing or invalid metadata.json`);
  }
  
  console.log('');
  console.log('Usage:');
  console.log('  npm run create-baseline -- <name>     Create new baseline');
  console.log('  npm run update-baseline -- <name>     Update existing baseline');
  console.log('  npm run test:regression               Run regression tests');
  console.log('='.repeat(100));
  console.log('');
}

function padRight(str: string, width: number): string {
  return str.length >= width ? str.substring(0, width) : str + ' '.repeat(width - str.length);
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  listBaselines()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error.message || error);
      process.exit(1);
    });
}

export { listBaselines };

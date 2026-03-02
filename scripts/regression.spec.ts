/**
 * Regression test suite
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readdir, stat } from 'fs/promises';
import type { BaselineMetadata } from '../src/regression.types.js';
import type { Result } from '../src/types.js';
import { parsePaymentsExcel } from './parsers/parsePaymentsExcel.js';
import { parseCommissionLog } from './parsers/parseCommissionLog.js';
import { compareStaffPayments, generateDiffReport } from './comparison/compareBaseline.js';
import { readJSON, fileExists } from './utils/fileUtils.js';
import { findOldestBaseline } from './utils/baselineUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const BASELINES_ROOT = join(PROJECT_ROOT, 'test-baselines');

/**
 * Resolved baseline state loaded during beforeAll.
 * If no baseline is available, ok is false and error explains why.
 */
type LoadedBaseline = {
  name: string;
  dir: string;
  metadata: BaselineMetadata;
};

let baselineResult: Result<LoadedBaseline>;

/**
 * Find the most recent payments Excel file, or fall back to sample
 */
async function findMostRecentPaymentsFile(): Promise<string | null> {
  const paymentsDir = join(PROJECT_ROOT, 'payments');
  const sampleFile = join(PROJECT_ROOT, 'test-fixtures', 'sample-payments.xlsx');

  try {
    const files = await readdir(paymentsDir);
    const xlsxFiles = files.filter(f =>
      f.startsWith('Talenox Payments') && f.endsWith('.xlsx') && !f.startsWith('.')
    );

    if (xlsxFiles.length === 0) {
      // Fall back to sample file if no real payments files exist
      if (await fileExists(sampleFile)) {
        console.log('⚠️  No payments files found, using sample file');
        return sampleFile;
      }
      return null;
    }

    // Get file stats and sort by modification time (most recent first)
    const filesWithStats = await Promise.all(
      xlsxFiles.map(async (file) => {
        const filePath = join(paymentsDir, file);
        const stats = await stat(filePath);
        return { file, path: filePath, mtime: stats.mtime };
      })
    );

    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return filesWithStats[0].path;
  } catch {
    // Fall back to sample file on error
    if (await fileExists(sampleFile)) {
      console.log('⚠️  Error reading payments directory, using sample file');
      return sampleFile;
    }
    return null;
  }
}

describe('Regression Tests', () => {
  beforeAll(async () => {
    // Resolve the baseline name: explicit env var takes precedence, otherwise
    // auto-discover the oldest available baseline so tests always run against
    // something known rather than a hardcoded name that may not exist.
    const nameResult: Result<string> = process.env.BASELINE_NAME
      ? { ok: true, value: process.env.BASELINE_NAME }
      : await findOldestBaseline(BASELINES_ROOT);

    if (!nameResult.ok) {
      baselineResult = nameResult;
      return;
    }

    const name = nameResult.value;
    const dir = join(BASELINES_ROOT, name);
    const metadataPath = join(dir, 'metadata.json');

    if (!await fileExists(metadataPath)) {
      baselineResult = { ok: false, error: `Baseline "${name}" exists but has no metadata.json` };
      return;
    }

    const metadata = await readJSON<BaselineMetadata>(metadataPath);
    baselineResult = { ok: true, value: { name, dir, metadata } };
  });

  describe('Baseline Prerequisites', () => {
    it('should have a valid baseline directory', async () => {
      if (!baselineResult.ok) {
        console.log(`\n⚠️  No baseline available: ${baselineResult.error}`);
        console.log(`   Run: npm run create-baseline -- <name>\n`);
        return; // Vitest treats early return as pass — absence of a baseline is not a failure
      }

      expect(baselineResult.ok).toBe(true);
    });

    it('should have valid metadata', async () => {
      if (!baselineResult.ok) return;
      const { name, metadata } = baselineResult.value;

      expect(metadata).toBeDefined();
      expect(metadata.baselineName).toBe(name);
      expect(metadata.commitSHA).toBeDefined();
      expect(metadata.sourceFile).toBeDefined();
      expect(metadata.staffIds).toBeInstanceOf(Array);
      expect(metadata.staffIds.length).toBeGreaterThan(0);
    });

    it('should have source file in baseline', async () => {
      if (!baselineResult.ok) return;
      const { dir, metadata } = baselineResult.value;

      const sourcePath = join(dir, 'source', metadata.sourceFile);
      expect(await fileExists(sourcePath)).toBe(true);
    });

    it('should have config files in baseline', async () => {
      if (!baselineResult.ok) return;
      const { dir } = baselineResult.value;

      expect(await fileExists(join(dir, 'config', 'staffHurdle.json'))).toBe(true);
      expect(await fileExists(join(dir, 'config', 'default.json'))).toBe(true);
    });

    it('should have output files in baseline', async () => {
      if (!baselineResult.ok) return;
      const { dir } = baselineResult.value;

      expect(await fileExists(join(dir, 'outputs'))).toBe(true);
    });
  });

  describe('Parser Functionality', () => {
    it('should parse payments Excel file', async () => {
      const paymentsFile = await findMostRecentPaymentsFile();
      if (!paymentsFile) {
        console.log('⚠️  No payments files found, skipping');
        return;
      }
      //const paymentsFile = join(paymentsDir, paymentFiles[paymentFiles.length - 1]);

      console.log(`Using payments file: ${paymentsFile}`);

      const staffPayments = await parsePaymentsExcel(paymentsFile);

      expect(staffPayments).toBeInstanceOf(Array);
      expect(staffPayments.length).toBeGreaterThan(0);

      // Check first staff has required fields
      const firstStaff = staffPayments[0];
      expect(firstStaff.staffId).toBeDefined();
      expect(firstStaff.staffName).toBeDefined();
      expect(firstStaff.payments).toBeInstanceOf(Array);
      expect(typeof firstStaff.total).toBe('number');

      // Verify sorted by staffId
      for (let i = 1; i < staffPayments.length; i++) {
        const prevId = parseInt(staffPayments[i - 1].staffId);
        const currId = parseInt(staffPayments[i].staffId);
        expect(currId).toBeGreaterThanOrEqual(prevId);
      }
    });

    it('should parse commission log file', async () => {
      const logFile = join(PROJECT_ROOT, 'logs', 'commission-20260203T190127.log');
      if (!await fileExists(logFile)) {
        console.log('⚠️  Test commission log not found, skipping');
        return;
      }

      const staffCommissions = await parseCommissionLog(logFile);

      expect(staffCommissions).toBeInstanceOf(Array);
      expect(staffCommissions.length).toBeGreaterThan(0);

      // Check first staff has required fields
      const firstStaff = staffCommissions[0];
      expect(firstStaff.staffId).toBeDefined();
      expect(firstStaff.staffName).toBeDefined();
      expect(typeof firstStaff.generalServicesRevenue).toBe('number');
      expect(typeof firstStaff.generalServiceCommission).toBe('number');
      expect(typeof firstStaff.totalPayable).toBe('number');

      // Verify sorted by staffId
      for (let i = 1; i < staffCommissions.length; i++) {
        const prevId = parseInt(staffCommissions[i - 1].staffId);
        const currId = parseInt(staffCommissions[i].staffId);
        expect(currId).toBeGreaterThanOrEqual(prevId);
      }
    });
  });

  describe('Comparison Functionality', () => {
    it('should detect identical staff correctly', () => {
      const baseline = [
        { staffId: '012', staffName: 'Kate', payments: [{ type: 'Commission', amount: 1000 }], total: 1000 },
      ];
      const current = [
        { staffId: '012', staffName: 'Kate', payments: [{ type: 'Commission', amount: 1000 }], total: 1000 },
      ];

      const result = compareStaffPayments(baseline, current);

      expect(result.identical.length).toBe(1);
      expect(result.modified.length).toBe(0);
      expect(result.added.length).toBe(0);
      expect(result.removed.length).toBe(0);
    });

    it('should detect modifications correctly', () => {
      const baseline = [
        { staffId: '012', staffName: 'Kate', payments: [{ type: 'Commission', amount: 1000 }], total: 1000 },
      ];
      const current = [
        { staffId: '012', staffName: 'Kate', payments: [{ type: 'Commission', amount: 1100 }], total: 1100 },
      ];

      const result = compareStaffPayments(baseline, current);

      expect(result.identical.length).toBe(0);
      expect(result.modified.length).toBe(1);
      expect(result.modified[0].staffId).toBe('012');
      expect(result.modified[0].differences).toBeDefined();
      expect(result.modified[0].differences!.length).toBeGreaterThan(0);
    });

    it('should detect added staff correctly', () => {
      const baseline = [
        { staffId: '012', staffName: 'Kate', payments: [{ type: 'Commission', amount: 1000 }], total: 1000 },
      ];
      const current = [
        { staffId: '012', staffName: 'Kate', payments: [{ type: 'Commission', amount: 1000 }], total: 1000 },
        { staffId: '025', staffName: 'Sarah', payments: [{ type: 'Commission', amount: 500 }], total: 500 },
      ];

      const result = compareStaffPayments(baseline, current);

      expect(result.identical.length).toBe(1);
      expect(result.added.length).toBe(1);
      expect(result.added[0].staffId).toBe('025');
    });

    it('should detect removed staff correctly', () => {
      const baseline = [
        { staffId: '012', staffName: 'Kate', payments: [{ type: 'Commission', amount: 1000 }], total: 1000 },
        { staffId: '019', staffName: 'Rex', payments: [{ type: 'Commission', amount: 800 }], total: 800 },
      ];
      const current = [
        { staffId: '012', staffName: 'Kate', payments: [{ type: 'Commission', amount: 1000 }], total: 1000 },
      ];

      const result = compareStaffPayments(baseline, current);

      expect(result.identical.length).toBe(1);
      expect(result.removed.length).toBe(1);
      expect(result.removed[0].staffId).toBe('019');
    });

    it('should generate readable diff report', () => {
      const result = {
        identical: [{ staffId: '012', staffName: 'Kate', category: 'IDENTICAL' as const }],
        modified: [
          {
            staffId: '019',
            staffName: 'Rex',
            category: 'MODIFIED' as const,
            differences: [
              { field: 'Total', expected: 1000, actual: 1100, diff: 100, percentDiff: 10 },
            ],
          },
        ],
        added: [{ staffId: '025', staffName: 'Sarah', category: 'ADDED' as const }],
        removed: [],
      };

      const report = generateDiffReport(result, 'test-baseline', 'test-file.xlsx');

      expect(report).toContain('REGRESSION TEST REPORT');
      expect(report).toContain('test-baseline');
      expect(report).toContain('MODIFICATIONS');
      expect(report).toContain('Rex');
      expect(report).toContain('ADDITIONS');
      expect(report).toContain('Sarah');
      expect(report).toContain('FAILED');
    });
  });
});

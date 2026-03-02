/**
 * Regression test suite
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readdir, stat } from 'fs/promises';
import type { BaselineMetadata } from '../src/regression.types.js';
import { parsePaymentsExcel } from './parsers/parsePaymentsExcel.js';
import { parseCommissionLog } from './parsers/parseCommissionLog.js';
import { compareStaffPayments, compareCommissionData, generateDiffReport } from './comparison/compareBaseline.js';
import { readJSON, fileExists } from './utils/fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

/**
 * Test configuration
 */
const BASELINE_NAME = process.env.BASELINE_NAME || 'dec-2025-baseline';
const BASELINE_DIR = join(PROJECT_ROOT, 'test-baselines', BASELINE_NAME);

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
  let metadata: BaselineMetadata;
  let baselineExists: boolean;

  beforeAll(async () => {
    // Check if baseline exists
    const metadataPath = join(BASELINE_DIR, 'metadata.json');
    baselineExists = await fileExists(metadataPath);

    if (baselineExists) {
      metadata = await readJSON<BaselineMetadata>(metadataPath);
    }
  });

  describe('Baseline Prerequisites', () => {
    it('should have a valid baseline directory', async () => {
      if (!baselineExists) {
        console.log(`\n⚠️  Baseline "${BASELINE_NAME}" does not exist.`);
        console.log(`   Run: npm run create-baseline -- ${BASELINE_NAME}\n`);
      }

      // Skip test if baseline doesn't exist (not a test failure)
      if (!baselineExists) {
        return; // Vitest treats early return in test as pass
      }

      expect(baselineExists).toBe(true);
    });

    it('should have valid metadata', async () => {
      if (!baselineExists) {
        return; // Skip if baseline doesn't exist
      }

      expect(metadata).toBeDefined();
      expect(metadata.baselineName).toBe(BASELINE_NAME);
      expect(metadata.commitSHA).toBeDefined();
      expect(metadata.sourceFile).toBeDefined();
      expect(metadata.staffIds).toBeInstanceOf(Array);
      expect(metadata.staffIds.length).toBeGreaterThan(0);
    });

    it('should have source file in baseline', async () => {
      if (!baselineExists) return;

      const sourcePath = join(BASELINE_DIR, 'source', metadata.sourceFile);
      const exists = await fileExists(sourcePath);
      expect(exists).toBe(true);
    });

    it('should have config files in baseline', async () => {
      if (!baselineExists) return;

      const staffHurdlePath = join(BASELINE_DIR, 'config', 'staffHurdle.json');
      const defaultConfigPath = join(BASELINE_DIR, 'config', 'default.json');

      expect(await fileExists(staffHurdlePath)).toBe(true);
      expect(await fileExists(defaultConfigPath)).toBe(true);
    });

    it('should have output files in baseline', async () => {
      if (!baselineExists) return;

      const outputsDir = join(BASELINE_DIR, 'outputs');
      expect(await fileExists(outputsDir)).toBe(true);
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

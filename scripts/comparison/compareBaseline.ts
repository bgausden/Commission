/**
 * Baseline comparison utilities
 */

import type {
  StaffPayment,
  StaffCommissionData,
  ComparisonResult,
  StaffDiff,
  FieldDifference,
  ComparisonOptions,
} from '../../src/regression.types.js';

const DEFAULT_OPTIONS: ComparisonOptions = {
  tolerance: 0.01,
  ignoreNewStaff: true,
  strictRemoval: true,
};

/**
 * Compare staff payment data from baseline and current run
 */
export function compareStaffPayments(
  baseline: StaffPayment[],
  current: StaffPayment[],
  options: Partial<ComparisonOptions> = {}
): ComparisonResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const baselineMap = new Map(baseline.map(s => [s.staffId, s]));
  const currentMap = new Map(current.map(s => [s.staffId, s]));
  
  const result: ComparisonResult = {
    identical: [],
    modified: [],
    added: [],
    removed: [],
  };
  
  // Check all current staff
  for (const [staffId, currentStaff] of currentMap) {
    const baselineStaff = baselineMap.get(staffId);
    
    if (!baselineStaff) {
      // New staff
      result.added.push({
        staffId,
        staffName: currentStaff.staffName,
        category: 'ADDED',
      });
      continue;
    }
    
    // Compare amounts
    const differences: FieldDifference[] = [];
    
    // Compare total
    const totalDiff = currentStaff.total - baselineStaff.total;
    if (Math.abs(totalDiff) > opts.tolerance) {
      differences.push({
        field: 'Total',
        expected: baselineStaff.total,
        actual: currentStaff.total,
        diff: totalDiff,
        percentDiff: baselineStaff.total !== 0 ? (totalDiff / baselineStaff.total) * 100 : 0,
      });
    }
    
    // Compare individual payment types
    const baselinePaymentMap = new Map(
      baselineStaff.payments.map(p => [p.type, p.amount])
    );
    const currentPaymentMap = new Map(
      currentStaff.payments.map(p => [p.type, p.amount])
    );
    
    const allTypes = new Set([
      ...baselinePaymentMap.keys(),
      ...currentPaymentMap.keys(),
    ]);
    
    for (const type of allTypes) {
      const baselineAmount = baselinePaymentMap.get(type) || 0;
      const currentAmount = currentPaymentMap.get(type) || 0;
      const diff = currentAmount - baselineAmount;
      
      if (Math.abs(diff) > opts.tolerance) {
        differences.push({
          field: type,
          expected: baselineAmount,
          actual: currentAmount,
          diff,
          percentDiff: baselineAmount !== 0 ? (diff / baselineAmount) * 100 : 0,
        });
      }
    }
    
    if (differences.length > 0) {
      result.modified.push({
        staffId,
        staffName: currentStaff.staffName,
        category: 'MODIFIED',
        differences,
      });
    } else {
      result.identical.push({
        staffId,
        staffName: currentStaff.staffName,
        category: 'IDENTICAL',
      });
    }
  }
  
  // Check for removed staff
  for (const [staffId, baselineStaff] of baselineMap) {
    if (!currentMap.has(staffId)) {
      result.removed.push({
        staffId,
        staffName: baselineStaff.staffName,
        category: 'REMOVED',
      });
    }
  }
  
  return result;
}

/**
 * Compare staff commission data from baseline and current run
 */
export function compareCommissionData(
  baseline: StaffCommissionData[],
  current: StaffCommissionData[],
  options: Partial<ComparisonOptions> = {}
): ComparisonResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const baselineMap = new Map(baseline.map(s => [s.staffId, s]));
  const currentMap = new Map(current.map(s => [s.staffId, s]));
  
  const result: ComparisonResult = {
    identical: [],
    modified: [],
    added: [],
    removed: [],
  };
  
  // Check all current staff
  for (const [staffId, currentStaff] of currentMap) {
    const baselineStaff = baselineMap.get(staffId);
    
    if (!baselineStaff) {
      result.added.push({
        staffId,
        staffName: currentStaff.staffName,
        category: 'ADDED',
      });
      continue;
    }
    
    const differences: FieldDifference[] = [];
    
    // Compare all numeric fields
    const fieldsToCompare: Array<keyof StaffCommissionData> = [
      'generalServicesRevenue',
      'generalServiceCommission',
      'productCommission',
      'tips',
      'totalPayable',
    ];
    
    for (const field of fieldsToCompare) {
      const baselineValue = baselineStaff[field] as number;
      const currentValue = currentStaff[field] as number;
      const diff = currentValue - baselineValue;
      
      if (Math.abs(diff) > opts.tolerance) {
        differences.push({
          field: String(field),
          expected: baselineValue,
          actual: currentValue,
          diff,
          percentDiff: baselineValue !== 0 ? (diff / baselineValue) * 100 : 0,
        });
      }
    }
    
    // Compare custom rate revenues
    const allCustomRevenues = new Set([
      ...Object.keys(baselineStaff.customRateRevenues),
      ...Object.keys(currentStaff.customRateRevenues),
    ]);
    
    for (const serviceName of allCustomRevenues) {
      const baselineValue = baselineStaff.customRateRevenues[serviceName] || 0;
      const currentValue = currentStaff.customRateRevenues[serviceName] || 0;
      const diff = currentValue - baselineValue;
      
      if (Math.abs(diff) > opts.tolerance) {
        differences.push({
          field: `${serviceName} Revenue`,
          expected: baselineValue,
          actual: currentValue,
          diff,
          percentDiff: baselineValue !== 0 ? (diff / baselineValue) * 100 : 0,
        });
      }
    }
    
    // Compare custom rate commissions
    const allCustomCommissions = new Set([
      ...Object.keys(baselineStaff.customRateCommissions),
      ...Object.keys(currentStaff.customRateCommissions),
    ]);
    
    for (const serviceName of allCustomCommissions) {
      const baselineValue = baselineStaff.customRateCommissions[serviceName] || 0;
      const currentValue = currentStaff.customRateCommissions[serviceName] || 0;
      const diff = currentValue - baselineValue;
      
      if (Math.abs(diff) > opts.tolerance) {
        differences.push({
          field: `${serviceName} Commission`,
          expected: baselineValue,
          actual: currentValue,
          diff,
          percentDiff: baselineValue !== 0 ? (diff / baselineValue) * 100 : 0,
        });
      }
    }
    
    if (differences.length > 0) {
      result.modified.push({
        staffId,
        staffName: currentStaff.staffName,
        category: 'MODIFIED',
        differences,
      });
    } else {
      result.identical.push({
        staffId,
        staffName: currentStaff.staffName,
        category: 'IDENTICAL',
      });
    }
  }
  
  // Check for removed staff
  for (const [staffId, baselineStaff] of baselineMap) {
    if (!currentMap.has(staffId)) {
      result.removed.push({
        staffId,
        staffName: baselineStaff.staffName,
        category: 'REMOVED',
      });
    }
  }
  
  return result;
}

/**
 * Generate human-readable diff report
 */
export function generateDiffReport(
  result: ComparisonResult,
  baselineName: string,
  sourceFile: string
): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(80));
  lines.push(`REGRESSION TEST REPORT: ${baselineName}`);
  lines.push('='.repeat(80));
  lines.push('');
  lines.push(`Source File: ${sourceFile}`);
  lines.push('');
  lines.push('STAFF SUMMARY:');
  lines.push(`  Identical:         ${result.identical.length}`);
  lines.push(`  Modified:          ${result.modified.length}  ${result.modified.length > 0 ? '❌' : '✅'}`);
  lines.push(`  Added:             ${result.added.length}  ${result.added.length > 0 ? 'ℹ️ ' : ''}`);
  lines.push(`  Removed:           ${result.removed.length}  ${result.removed.length > 0 ? '❌' : '✅'}`);
  lines.push('');
  
  if (result.modified.length > 0) {
    lines.push('MODIFICATIONS (Test Failure):');
    for (const staff of result.modified) {
      lines.push(`  Staff ${staff.staffId} (${staff.staffName}):`);
      for (const diff of staff.differences || []) {
        lines.push(`    ${diff.field}:`);
        lines.push(`      Expected: HK$ ${formatAmount(diff.expected)}`);
        lines.push(`      Actual:   HK$ ${formatAmount(diff.actual)}`);
        lines.push(`      Diff:     ${diff.diff >= 0 ? '+' : ''}HK$ ${formatAmount(diff.diff)}`);
      }
    }
    lines.push('');
  }
  
  if (result.added.length > 0) {
    lines.push('ADDITIONS (Informational):');
    for (const staff of result.added) {
      lines.push(`  Staff ${staff.staffId} (${staff.staffName}): new staff`);
    }
    lines.push('');
  }
  
  if (result.removed.length > 0) {
    lines.push('REMOVALS (Test Failure):');
    for (const staff of result.removed) {
      lines.push(`  Staff ${staff.staffId} (${staff.staffName}): staff removed`);
    }
    lines.push('');
  }
  
  const passed = result.modified.length === 0 && result.removed.length === 0;
  lines.push(`RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('='.repeat(80));
  
  return lines.join('\n');
}

/**
 * Format amount with thousand separators and 2 decimal places
 */
function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

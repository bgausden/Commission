/**
 * Type definitions for regression testing framework
 */

/**
 * Metadata stored with each baseline for validation and tracking
 */
export interface BaselineMetadata {
  baselineName: string;
  commitSHA: string;
  createdDate: string; // ISO 8601
  sourceFile: string;
  sourceFileChecksum: string; // "sha256:..."
  payrollMonth: number;
  payrollYear: number;
  configChecksums: {
    staffHurdle: string;
    default: string;
  };
  staffCount: number;
  staffIds: string[];
  description?: string;
}

/**
 * Staff payment data extracted from payments Excel file
 */
export interface StaffPayment {
  staffId: string;
  staffName: string;
  payments: Array<{
    type: string; // "Service Commission", "Tips", "Product Commission"
    amount: number;
  }>;
  total: number;
}

/**
 * Staff commission data extracted from commission logs
 */
export interface StaffCommissionData {
  staffId: string;
  staffName: string;
  generalServicesRevenue: number;
  customRateRevenues: Record<string, number>; // { "Extensions": 10000 }
  generalServiceCommission: number;
  customRateCommissions: Record<string, number>; // { "Extensions": 1500 }
  productCommission: number;
  tips: number;
  totalPayable: number;
}

/**
 * Difference category for staff comparison
 */
export type DiffCategory = 'IDENTICAL' | 'MODIFIED' | 'ADDED' | 'REMOVED';

/**
 * Individual field difference within a staff comparison
 */
export interface FieldDifference {
  field: string;
  expected: number;
  actual: number;
  diff: number;
  percentDiff: number;
}

/**
 * Staff-level comparison result
 */
export interface StaffDiff {
  staffId: string;
  staffName: string;
  category: DiffCategory;
  differences?: FieldDifference[];
}

/**
 * Overall comparison result grouping staff by category
 */
export interface ComparisonResult {
  identical: StaffDiff[];
  modified: StaffDiff[];
  added: StaffDiff[];
  removed: StaffDiff[];
}

/**
 * Options for comparison behavior
 */
export interface ComparisonOptions {
  tolerance: number; // Tolerance for floating-point comparison (e.g., 0.01)
  ignoreNewStaff: boolean; // If true, added staff don't affect test result
  strictRemoval: boolean; // If true, removed staff cause test failure
}

/**
 * Parser for payments Excel files
 */

import XLSX from 'xlsx';
import type { StaffPayment } from '../../src/regression.types.js';
import { sortByStaffId } from '../utils/staffUtils.js';

/**
 * Parse payments Excel file to structured staff payment data
 * 
 * Expected format:
 * - Column 0: Staff ID (e.g., "012")
 * - Column 1: Staff Name (e.g., "Chan Yuen King Kate")
 * - Column 2: Payment Type (e.g., "Commission (Irregular)", "Tips")
 * - Column 3: Amount (number)
 * - Column 4: Description (e.g., "Services commission", "Product commission", "Tips")
 */
export async function parsePaymentsExcel(filePath: string): Promise<StaffPayment[]> {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  const staffMap = new Map<string, StaffPayment>();

  for (const row of data) {
    if (!Array.isArray(row) || row.length < 5) {
      continue;
    }

    const staffId = String(row[0] || '').trim();
    const staffName = String(row[1] || '').trim();
    const paymentType = String(row[2] || '').trim();
    const amount = typeof row[3] === 'number' ? row[3] : parseFloat(String(row[3])) || 0;
    const description = String(row[4] || '').trim();

    // Skip if staffId is not numeric or empty
    if (!staffId || !/^\d+$/.test(staffId)) {
      continue;
    }

    // Skip rows with no amount
    if (amount === 0 && !description) {
      continue;
    }

    // Create or update staff entry
    if (!staffMap.has(staffId)) {
      staffMap.set(staffId, {
        staffId,
        staffName,
        payments: [],
        total: 0,
      });
    }

    const staff = staffMap.get(staffId)!;
    
    // Map description to standardized payment type
    let normalizedType = description;
    if (description.toLowerCase().includes('service')) {
      normalizedType = 'Services commission';
    } else if (description.toLowerCase().includes('product')) {
      normalizedType = 'Product commission';
    } else if (description.toLowerCase().includes('tip')) {
      normalizedType = 'Tips';
    }

    staff.payments.push({
      type: normalizedType,
      amount,
    });
    staff.total += amount;
  }

  // Convert to array and sort
  const staffArray = Array.from(staffMap.values());
  return sortByStaffId(staffArray);
}

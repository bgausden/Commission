/**
 * Parser for commission log files
 */

import { readFile } from 'fs/promises';
import type { StaffCommissionData } from '../../src/regression.types.js';
import { sortByStaffId } from '../utils/staffUtils.js';
import { normalizeLog } from './normalizeLog.js';

/**
 * Parse commission log file to structured staff commission data
 * 
 * Expected format:
 * ```
 * Payroll details for 012 Chan Yuen King Kate
 * 
 * General Services Revenue:          HK$45,567.50
 * Extensions Revenue:                 HK$10,000.00  (optional custom rate service)
 * 
 * General Service Commission:         HK$1,768.10
 * Custom Rate Service Commission:         HK$0.00
 * Product Commission:                    HK$56.00
 * Tips:                                 HK$100.00
 *                                    ------------
 * Total Payable                       HK$1,924.10
 * ```
 */
export async function parseCommissionLog(filePath: string): Promise<StaffCommissionData[]> {
  const content = await readFile(filePath, 'utf-8');
  const normalized = normalizeLog(content);
  
  const staffData: StaffCommissionData[] = [];
  const lines = normalized.split('\n');
  
  let currentStaff: Partial<StaffCommissionData> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match staff header: "Payroll details for 012 Chan Yuen King Kate"
    const staffMatch = line.match(/^Payroll details for (\d+)\s+(.+)$/);
    if (staffMatch) {
      // Save previous staff if exists
      if (currentStaff && currentStaff.staffId) {
        staffData.push(currentStaff as StaffCommissionData);
      }
      
      // Start new staff
      currentStaff = {
        staffId: staffMatch[1],
        staffName: staffMatch[2],
        generalServicesRevenue: 0,
        customRateRevenues: {},
        generalServiceCommission: 0,
        customRateCommissions: {},
        productCommission: 0,
        tips: 0,
        totalPayable: 0,
      };
      continue;
    }
    
    if (!currentStaff) {
      continue;
    }
    
    // Parse revenue lines
    const generalRevenueMatch = line.match(/^General Services Revenue:\s*HK\$([\d,]+\.?\d*)$/);
    if (generalRevenueMatch) {
      currentStaff.generalServicesRevenue = parseAmount(generalRevenueMatch[1]);
      continue;
    }
    
    // Match custom rate service revenue: "Extensions Revenue: HK$10,000.00"
    const customRevenueMatch = line.match(/^(.+?)\s+Revenue:\s*HK\$([\d,]+\.?\d*)$/);
    if (customRevenueMatch && !line.includes('General Services')) {
      const serviceName = customRevenueMatch[1].trim();
      currentStaff.customRateRevenues![serviceName] = parseAmount(customRevenueMatch[2]);
      continue;
    }
    
    // Parse commission lines
    const generalCommissionMatch = line.match(/^General Service Commission:\s*HK\$([\d,]+\.?\d*)$/);
    if (generalCommissionMatch) {
      currentStaff.generalServiceCommission = parseAmount(generalCommissionMatch[1]);
      continue;
    }
    
    const customCommissionMatch = line.match(/^Custom Rate Service Commission:\s*HK\$([\d,]+\.?\d*)$/);
    if (customCommissionMatch) {
      // Note: This is aggregate, individual custom rates would need different parsing
      // For now, store as total
      const amount = parseAmount(customCommissionMatch[1]);
      if (amount > 0) {
        currentStaff.customRateCommissions!['Total'] = amount;
      }
      continue;
    }
    
    const productCommissionMatch = line.match(/^Product Commission:\s*HK\$([\d,]+\.?\d*)$/);
    if (productCommissionMatch) {
      currentStaff.productCommission = parseAmount(productCommissionMatch[1]);
      continue;
    }
    
    const tipsMatch = line.match(/^Tips:\s*HK\$([\d,]+\.?\d*)$/);
    if (tipsMatch) {
      currentStaff.tips = parseAmount(tipsMatch[1]);
      continue;
    }
    
    const totalMatch = line.match(/^Total Payable\s*HK\$([\d,]+\.?\d*)$/);
    if (totalMatch) {
      currentStaff.totalPayable = parseAmount(totalMatch[1]);
      continue;
    }
  }
  
  // Save last staff
  if (currentStaff && currentStaff.staffId) {
    staffData.push(currentStaff as StaffCommissionData);
  }
  
  return sortByStaffId(staffData);
}

/**
 * Parse HK$ amount string to number
 * Handles commas and decimals: "1,234.56" -> 1234.56
 */
function parseAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

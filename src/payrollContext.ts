/* global PAYROLL_MONTH, PAYROLL_YEAR, firstDay */
import type { monthName } from "./types.js";

export interface PayrollRunContext {
  month: monthName;
  year: string;
  firstDay: Date;
}

export function getPayrollPayGroup(context: PayrollRunContext): string {
  return `${context.month} ${context.year}`;
}

export function getGlobalPayrollContext(): PayrollRunContext {
  return {
    month: PAYROLL_MONTH,
    year: PAYROLL_YEAR,
    firstDay,
  };
}

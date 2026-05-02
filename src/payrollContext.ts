import type { monthName } from "./types.js";

export interface PayrollRunContext {
  month: monthName;
  year: string;
  firstDay: Date;
}

export function getPayrollPayGroup(context: PayrollRunContext): string {
  return `${context.month} ${context.year}`;
}

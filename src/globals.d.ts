// globals.d.ts
import { monthName, TStaffHurdles } from "./types.js";

declare global {
  var staffHurdles: TStaffHurdles;

  var PAYROLL_MONTH: monthName;
  var PAYROLL_YEAR: number;
  var PAYMENTS_WB_NAME: string;
  var PAYMENTS_WS_NAME: string;

  var LOGS_DIR: string;
  var PAYMENTS_DIR: string;

  var firstDay: Date;
}

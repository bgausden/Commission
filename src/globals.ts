// globals.ts - Global type declarations
import { monthName, TStaffHurdles } from "./types.js";

declare global {
  // eslint-disable-next-line no-var
  var staffHurdles: TStaffHurdles;

  // eslint-disable-next-line no-var
  var PAYROLL_MONTH: monthName;
  // eslint-disable-next-line no-var
  var PAYROLL_YEAR: string;
  // eslint-disable-next-line no-var
  var PAYMENTS_WB_NAME: string;
  // eslint-disable-next-line no-var
  var PAYMENTS_WS_NAME: string;

  // eslint-disable-next-line no-var
  var LOGS_DIR: string;
  // eslint-disable-next-line no-var
  var PAYMENTS_DIR: string;

  // eslint-disable-next-line no-var
  var firstDay: Date;
}

export {}; // Makes this file a module, required for declare global to work

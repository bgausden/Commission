// globals.d.ts
import type { TStaffHurdles } from "./types.js";

declare global {
  var staffHurdles: TStaffHurdles;
  var PAYMENTS_WB_NAME: string;
  var PAYMENTS_WS_NAME: string;
  var LOGS_DIR: string;
  var PAYMENTS_DIR: string;
}

export {};

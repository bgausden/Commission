import assert from "node:assert";
import { Decimal } from "decimal.js";
import { StaffInfo } from "./IStaffInfo.js";
import type {
  StaffPayrollData,
  TCustomRateEntry,
  TServRevenueMap,
  TServiceName,
  TStaffID,
} from "./types.js";
import {
  getStaffHurdle,
  stripToNumeric,
  type StaffHurdleGetter,
} from "./utility_functions.js";

const SERVICE_ROW_REGEX = /(.*) Pay Rate: (.*) \((.*)%\)/i;
const SERVICE_TYPE_INDEX = 2;

const STAFF_ID_HASH = "Staff ID #:";
const TIPS_FOR = "Tips:";
const COMM_FOR = "Sales Commission:";
const REV_PER_SESS = "Rev. per Session";

export const TOTAL_FOR = "Total for ";
export const GENERAL_SERV_REVENUE = "General Services";

function parseMoneyValue(value: unknown): number {
  return new Decimal(stripToNumeric(value)).toDecimalPlaces(2).toNumber();
}

export function revenueCol(wsArray: unknown[][]): number {
  const maxSearchRows = Math.min(wsArray.length, Math.max(20, wsArray.length));
  for (let i = 0; i < maxSearchRows; i++) {
    const row = wsArray[i];
    if (!row) {
      continue;
    }
    for (let j = 0; j < row.length; j++) {
      if (row[j] === REV_PER_SESS) {
        return j;
      }
    }
  }
  throw new Error("Cannot find Revenue per session column");
}

export function getStaffIDAndName(
  wsArray: unknown[][],
  idRow: number,
): StaffInfo | null {
  const firstNameIndex = 1;
  const lastNameIndex = 0;
  const staffNameIndex = 0;
  const staffIDIndex = 1;

  const testString = wsArray[idRow]?.[staffNameIndex];
  const regex = new RegExp(`^.*,.*${STAFF_ID_HASH}`);
  if (!regex.test(testString as string)) {
    return null;
  }

  const staffInfo: [string, TStaffID] | undefined =
    testString !== undefined
      ? ((testString as string).split(STAFF_ID_HASH) as [string, TStaffID])
      : undefined;
  if (!staffInfo) {
    return null;
  }

  if (staffInfo[staffIDIndex].trim() === "") {
    throw new Error(
      `${staffInfo[staffNameIndex].split(",")[1]} ${
        staffInfo[staffNameIndex].split(",")[0]
      } does not appear to have a Staff ID in MB`,
    );
  }

  return {
    firstName: staffInfo[staffNameIndex].split(",")[firstNameIndex].trim(),
    lastName: staffInfo[staffNameIndex].split(",")[lastNameIndex].trim(),
    staffID: staffInfo[staffIDIndex].trim() as TStaffID,
  };
}

export function getServiceRevenues(
  wsArray: unknown[][],
  currentTotalRow: number,
  currentStaffIDRow: number,
  revCol: number,
  staffID: TStaffID,
  getStaffHurdleForContext: StaffHurdleGetter = getStaffHurdle,
): TServRevenueMap {
  const numSearchRows = currentTotalRow - currentStaffIDRow - 1;
  const servRevenueMap: TServRevenueMap = new Map<
    TServiceName,
    TCustomRateEntry
  >();
  let serviceRevenue = 0;
  let customRate = NaN;
  const sh = getStaffHurdleForContext(staffID, "Mindbody payroll report");
  const customPayRates = sh.fold(
    (staffHurdle) => staffHurdle.customPayRates || [],
    () => [],
  );
  let servName: TServiceName = GENERAL_SERV_REVENUE;

  for (let i = numSearchRows; i >= 1; i--) {
    const row = wsArray[currentTotalRow - i] ?? [];
    const v = row[0] || "";
    const match = (v as string).match(SERVICE_ROW_REGEX) || null;
    if (match) {
      servName = match[SERVICE_TYPE_INDEX];
      customRate = NaN;
      for (const customPayRate of customPayRates) {
        for (const [serviceName, rate] of Object.entries(customPayRate)) {
          if (servName === serviceName) {
            customRate = rate || 0;
            break;
          }
        }
      }
      if (!customRate) {
        servName = GENERAL_SERV_REVENUE;
        customRate = NaN;
      }
      if (!servRevenueMap.has(servName)) {
        serviceRevenue = 0;
        servRevenueMap.set(servName, { serviceRevenue, customRate });
      }
    }

    let revenueCellContents = row[revCol];
    if (revenueCellContents !== undefined) {
      revenueCellContents = stripToNumeric(revenueCellContents);
      if (typeof revenueCellContents === "number" && revenueCellContents > 0) {
        serviceRevenue = revenueCellContents;
        const serviceRevenueEntry = servRevenueMap.get(servName);
        assert(
          serviceRevenueEntry,
          `Did not find ${servName} in servRevenueMap. This should never happen.`,
        );

        serviceRevenue = new Decimal(serviceRevenue)
          .plus(serviceRevenueEntry.serviceRevenue)
          .toDecimalPlaces(2)
          .toNumber();
        servRevenueMap.set(servName, { serviceRevenue, customRate });
      }
    }
  }

  return servRevenueMap;
}

export function extractStaffPayrollData(
  wsaa: unknown[][],
  startRow: number,
  endRow: number,
  revCol: number,
  staffID: TStaffID,
  getStaffHurdleForContext: StaffHurdleGetter = getStaffHurdle,
): StaffPayrollData {
  let tips = 0;
  let productCommission = 0;

  for (let j = 3; j >= 0; j--) {
    const rowIndex = endRow - j;
    if (rowIndex < 0 || rowIndex >= wsaa.length) continue;
    if (!wsaa[rowIndex]) continue;

    const payComponent = wsaa[rowIndex][0] as string;
    if (payComponent !== undefined) {
      if (payComponent === TIPS_FOR || payComponent === COMM_FOR) {
        const maxRowIndex = wsaa[rowIndex].length - 1;
        if (wsaa[rowIndex][maxRowIndex] !== undefined) {
          const value = parseMoneyValue(wsaa[rowIndex][maxRowIndex]);
          if (payComponent === TIPS_FOR) {
            tips = value;
          }
          if (payComponent === COMM_FOR) {
            productCommission = value;
          }
        }
      }
    }
  }

  const servicesRevenues = getServiceRevenues(
    wsaa,
    endRow,
    startRow,
    revCol,
    staffID,
    getStaffHurdleForContext,
  );

  return {
    staffID,
    staffName: "",
    tips,
    productCommission,
    servicesRevenues,
  };
}

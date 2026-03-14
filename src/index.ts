// TODO Implement pooling of service and product commissions, tips for Ari and Anson
// TODO Investigate why script can't be run directly from the dist folder (has to be run from dist/.. or config has no value)
/* TODO add support for hourly wage staff:
Gausden, ElizabethStaff ID #: 048 									
Hourly Pay (38.2775 hours @ HK$&nbsp;40/hr):								1,531.10	
Sales Commission:									36
      # Services	# Clients	# Comps	Base Earnings		Earnings	
Total for Gausden, Elizabeth			0	0	0	HK$ 0		1,567.10	
*/
/* TODO fix rounding for pay calculated from custom pay rates
Extensions - Application:   28152.000000000004
*/
// TODO consider how custom pay rate services should contribute to achieving hurdles (or make a clear argument as to why not. Add a diagram showing how commissions are calculated across different revenue types).
import "./checkStartup.js";
import { config } from "node-config-ts";
// import prettyjson from "prettyjson"
import XLSX from "xlsx";
import { StaffInfo } from "./IStaffInfo.js";
//import staffHurdle from './staffHurdle.json' assert { type: 'json' }
import { ITalenoxPayment } from "./ITalenoxPayment.js";
import { GeneralServiceComm } from "./IServiceComm.js";
import { StaffCommConfig } from "./IStaffCommConfig.js";
import {
  TStaffID,
  TServiceCommMap,
  TCommComponents,
  TStaffName,
  TServiceRevenue,
  TCommMap,
  TStaffHurdles,
  TCustomRateEntry,
  TServRevenueMap,
  TServiceName,
  TTalenoxInfoStaffMap,
  HurdleConfig,
  HurdleBreakdown,
  StaffPayrollData,
  monthName,
} from "./types.js";
import { StaffHurdle } from "./IStaffHurdle.js";
import {
  createAdHocPayments,
  getTalenoxEmployees,
  createPayroll,
  uploadAdHocPayments,
} from "./talenox_functions.js";
import {
  checkRate,
  stripToNumeric,
  isPayViaTalenox,
  eqSet,
  isContractor,
  moveFilesToOldSubDir,
  isValidDirectory,
  getStaffHurdle,
} from "./utility_functions.js";
//import { initDebug, log, warn, error } from "./debug_functions.js"
import {
  contractorLogger,
  commissionLogger,
  infoLogger,
  warnLogger,
  errorLogger,
  debugLogger,
  shutdownLogging,
  initLogs,
} from "./logging_functions.js";
import {
  buildArtifactList,
  buildFolderHierarchy,
  getMissingGoogleDriveEnvVars,
  uploadRunArtifacts,
} from "./gdrive_functions.js";
import { fws32Left, fws14RightHKD, fws14Right } from "./string_functions.js";
import { DEFAULT_OLD_DIR, DEFAULT_STAFF_HURDLES_FILE } from "./constants.js";
import Decimal from "decimal.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaffHurdles } from "./staffHurdles.js";
import parseFilename from "./parseFilename.js";
import { processEnv } from "./env_functions.js";
import { resolveFromProjectRoot } from "./projectRoot.js";
import assert from "node:assert";
import { existsSync, readdirSync } from "node:fs";
import * as fs from "node:fs";

// Initialize XLSX library with fs module for file operations
XLSX.set_fs(fs);

// Type-safe interface for custom global properties
interface CustomGlobals {
  staffHurdles: TStaffHurdles;
  PAYROLL_MONTH: monthName;
  PAYROLL_YEAR: string;
  PAYMENTS_WB_NAME: string;
  PAYMENTS_WS_NAME: string;
  LOGS_DIR: string;
  PAYMENTS_DIR: string;
  firstDay: Date;
}

// Type-safe global setter - provides type checking for both key and value
const setGlobal = <K extends keyof CustomGlobals>(
  key: K,
  value: CustomGlobals[K],
): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any)[key] = value;
};

const PROGRESS_PREFIX = "__PROGRESS__ ";
const REGRESSION_OFFLINE_MODE = process.env.REGRESSION_OFFLINE === "1";

function emitProgress(step: string, detail?: string): void {
  // Structured marker for the web UI/server runner to parse.
  // Must stay stable to avoid breaking parsing in serverApp.ts.
  const payload = {
    ts: new Date().toISOString(),
    step,
    ...(detail ? { detail } : {}),
  };
  console.log(`${PROGRESS_PREFIX}${JSON.stringify(payload)}`);
}

function emitProgressAndInfo(step: string, detail?: string): void {
  emitProgress(step, detail);
  // Mirror progress markers into INFO logs so they're visible in log files.
  infoLogger.info(detail ? `${step}: ${detail}` : step);
}

const SERVICE_ROW_REGEX = /(.*) Pay Rate: (.*) \((.*)%\)/i;

const SERVICE_TYPE_INDEX = 2;

const FIRST_SHEET = 0;

const STAFF_ID_HASH = "Staff ID #:";
const TOTAL_FOR = "Total for ";
const TIPS_FOR = "Tips:";
const COMM_FOR = "Sales Commission:";
const REV_PER_SESS = "Rev. per Session";

const HURDLE_1_LEVEL = "hurdle1Level";
const HURDLE_2_LEVEL = "hurdle2Level";
const HURDLE_3_LEVEL = "hurdle3Level";
// const POOLS_WITH = "poolsWith"

const GENERAL_SERV_REVENUE = "General Services";

/* const REX_WONG_ID = "019" */

/* const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 }
const WB = XLSX.readFile(FILE_PATH, READ_OPTIONS)
const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]] */
const commMap: TCommMap = new Map<TStaffID, TCommComponents>();
// const staffMap: TStaffMap = new Map<TStaffID, IStaffNames>()
const serviceCommMap: TServiceCommMap = new Map<
  TStaffName,
  GeneralServiceComm
>();

function readExcelFile(fileName: string): XLSX.WorkSheet {
  const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 };
  const WB = XLSX.readFile(fileName, READ_OPTIONS);
  const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]];
  return WS;
}

function revenueCol(wsArray: unknown[][]): number {
  const MAX_SEARCH_ROWS = Math.max(20, wsArray.length);
  for (let i = 0; i < MAX_SEARCH_ROWS; i++) {
    const rowLength = wsArray[i].length;
    for (let j = 0; j < rowLength; j++) {
      const cell = wsArray[i][j];
      if (cell === REV_PER_SESS) {
        return j;
      }
    }
  }
  throw new Error("Cannot find Revenue per session column");
}

function getStaffIDAndName(
  wsArray: unknown[][],
  idRow: number,
): StaffInfo | null {
  /*     assume the staffID can be found in the STAFF_ID_COL column.
    staffID will begin with "ID#: " the will need to be stored  in the serviceCommMap and
    commComponents maps along with First and Last name.
    First column should contain a string similar to LastName, FirstName Staff ID #: StaffID
 */

  const firstNameIndex = 1;
  const lastNameIndex = 0;
  const staffNameIndex = 0;
  const staffIDIndex = 1;
  // eslint:disable-next-line: no-shadowed-variable

  const testString = wsArray[idRow][staffNameIndex];
  const regex = new RegExp(`^.*,.*${STAFF_ID_HASH}`);
  if (regex.test(testString as string)) {
    /* Split the name and ID string into an array ["Surname, Firstname", ID] */
    const staffInfo: [string, TStaffID] | undefined =
      testString !== undefined
        ? ((testString as string).split(STAFF_ID_HASH) as [string, TStaffID])
        : undefined;
    if (staffInfo !== undefined) {
      if (staffInfo[staffIDIndex].trim() === "") {
        // Missing Staff ID in MB?
        throw new Error(
          `${staffInfo[staffNameIndex].split(",")[1]} ${
            staffInfo[staffNameIndex].split(",")[0]
          } does not appear to have a Staff ID in MB`,
        );
      }
      return {
        /* Everything OK, split the name in staffInfo[0] into Surname and First Name */
        firstName: staffInfo[staffNameIndex].split(",")[firstNameIndex].trim(),
        lastName: staffInfo[staffNameIndex].split(",")[lastNameIndex].trim(),
        //staffID: staffInfo[staffIDIndex].trim(),
        staffID: staffInfo[staffIDIndex],
      };
    } else {
      return null;
    }
  } else {
    // could legit be that we're on a line with no Staff ID#: string
    return null;
  }
}

/**
 * @function getServicesRevenue - buckets revenue by custom pay-rate. One bucket is a catch-all
 * @param {any[][]} wsArray - array representing the worksheet
 * @param {number} currentTotalRow - row number for last found "Total for" row in the worksheet
 * @param {number} currentStaffIDRow - row number for the last found "Staff ID" row in the worksheet
 * @param {number} revCol - column containing the services revenue
 * @param {TStaffID} staffID - ID for the member of staff for whom we are calculating revenues/comms
 */

export function getServiceRevenues(
  wsArray: unknown[][],
  currentTotalRow: number,
  // tslint:disable-next-line: no-shadowed-variable
  currentStaffIDRow: number,
  // tslint:disable-next-line: no-shadowed-variable
  revCol: number,
  staffID: TStaffID,
): TServRevenueMap {
  /*
    Starting on the staff member's first row, sum all the numeric values in the revenue column
    down as far as the staff member's totals row + 1. Use this as the service revenue so we can ignore
    how staff commissions are configured in MB.
    Note we are offsetting backwards from the Totals row and reducing the offset each iteration - so we're actually
    working our way down the sheet from top to bottom.
    */
  const numSearchRows = currentTotalRow - currentStaffIDRow - 1;
  const servRevenueMap: TServRevenueMap = new Map<
    TServiceName,
    TCustomRateEntry
  >();
  let serviceRevenue = 0;
  let customRate = NaN;
  const sh = getStaffHurdle(staffID, "Mindbody payroll report");
  // const customPayRates = sh.customPayRates || [];
  const customPayRates = sh.fold((sh) => sh.customPayRates || [], () => [])
  let servName: TServiceName = GENERAL_SERV_REVENUE;
  for (let i = numSearchRows; i >= 1; i--) {
    /*   first iteration should place us on a line beginning with "Hair Pay Rate: Ladies Cut and Blow Dry (55%)" or similar
          i.e. <revenue category> Pay Rate: <service name> (<commission rate>)
    */
    const v = wsArray[currentTotalRow - i][0] || "";
    const match = (v as string).match(SERVICE_ROW_REGEX) || null; // regex is something like /(.*) Pay Rate: (.*) \((.*)%\)/i
    /*
        Found a row that looks similar to:
        Hair Pay rate: Ladies Cut and Blow Dry (55%) 
        where match[0] = Hair, match[1]=Ladies Cut and Blow Dry and match[2]=55
        */
    if (match) {
      // Have a section header for a block of services
      servName = match[SERVICE_TYPE_INDEX];
      // check if we have special rates for this servType
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
        servName = GENERAL_SERV_REVENUE; // catch-all servType for everything without a custom pay-rate
        customRate = NaN;
      }
      if (!servRevenueMap.has(servName)) {
        serviceRevenue = 0;
        servRevenueMap.set(servName, { serviceRevenue, customRate });
      }
    }
    let revenueCellContents = wsArray[currentTotalRow - i][revCol];
    if (revenueCellContents !== undefined) {
      revenueCellContents = stripToNumeric(revenueCellContents);
      if (typeof revenueCellContents === "number" && revenueCellContents > 0) {
        serviceRevenue = revenueCellContents;
        // accumulate the serv revenues for this servType in the map
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

/**
 * Pure function to calculate tiered commission based on hurdle configuration.
 * No side effects - only performs calculations.
 * @param serviceRevenue - Total service revenue to calculate commission on
 * @param hurdleConfig - Commission tier configuration
 * @returns Detailed breakdown of commission calculation at each tier
 */
export function calculateTieredCommission(
  serviceRevenue: number,
  hurdleConfig: HurdleConfig,
): HurdleBreakdown {
  const {
    baseRate,
    hurdle1Level,
    hurdle1Rate,
    hurdle2Level,
    hurdle2Rate,
    hurdle3Level,
    hurdle3Rate,
  } = hurdleConfig;

  const svcD = new Decimal(serviceRevenue);
  let baseRevenueD = new Decimal(0);
  let hurdle1RevenueD = new Decimal(0);
  let hurdle2RevenueD = new Decimal(0);
  let hurdle3RevenueD = new Decimal(0);

  if (hurdle1Level <= 0) {
    // No hurdles configured - all revenue pays at base rate
    baseRevenueD = svcD;
  } else if (serviceRevenue <= hurdle1Level) {
    // Revenue below first hurdle — all bands stay zero
  } else if (hurdle2Level <= 0 || serviceRevenue <= hurdle2Level) {
    // Revenue between hurdle1 and hurdle2 (or no hurdle2)
    hurdle1RevenueD = svcD.minus(hurdle1Level);
  } else if (hurdle3Level <= 0 || serviceRevenue <= hurdle3Level) {
    // Revenue between hurdle2 and hurdle3 (or no hurdle3)
    hurdle1RevenueD = new Decimal(hurdle2Level).minus(hurdle1Level);
    hurdle2RevenueD = svcD.minus(hurdle2Level);
  } else {
    // Revenue exceeds hurdle3
    hurdle1RevenueD = new Decimal(hurdle2Level).minus(hurdle1Level);
    hurdle2RevenueD = new Decimal(hurdle3Level).minus(hurdle2Level);
    hurdle3RevenueD = svcD.minus(hurdle3Level);
  }

  // Round all revenue allocations to 2 decimal places
  baseRevenueD = baseRevenueD.toDecimalPlaces(2);
  hurdle1RevenueD = hurdle1RevenueD.toDecimalPlaces(2);
  hurdle2RevenueD = hurdle2RevenueD.toDecimalPlaces(2);
  hurdle3RevenueD = hurdle3RevenueD.toDecimalPlaces(2);

  // Calculate commission for each tier
  const baseCommission = baseRevenueD.times(baseRate).toDecimalPlaces(2);
  const hurdle1Commission = hurdle1RevenueD.times(hurdle1Rate).toDecimalPlaces(2);
  const hurdle2Commission = hurdle2RevenueD.times(hurdle2Rate).toDecimalPlaces(2);
  const hurdle3Commission = hurdle3RevenueD.times(hurdle3Rate).toDecimalPlaces(2);

  const totalCommission = baseCommission
    .plus(hurdle1Commission)
    .plus(hurdle2Commission)
    .plus(hurdle3Commission)
    .toDecimalPlaces(2);

  return {
    baseRevenue: baseRevenueD.toNumber(),
    baseCommission: baseCommission.toNumber(),
    hurdle1Revenue: hurdle1RevenueD.toNumber(),
    hurdle1Commission: hurdle1Commission.toNumber(),
    hurdle2Revenue: hurdle2RevenueD.toNumber(),
    hurdle2Commission: hurdle2Commission.toNumber(),
    hurdle3Revenue: hurdle3RevenueD.toNumber(),
    hurdle3Commission: hurdle3Commission.toNumber(),
    totalCommission: totalCommission.toNumber(),
  };
}

function calcGeneralServiceCommission(
  staffID: TStaffID,
  staffMap: TTalenoxInfoStaffMap,
  serviceRev: TServiceRevenue,
): number {
  // Get staff commission configuration with centralized validation
  const staffCommConfig = getStaffHurdle(
    staffID,
    "commission calculation",
  ).fold(
    (sh) => sh satisfies StaffCommConfig,
    () => {
      errorLogger.error(
        `Fatal: No staffHurdle found for staffID ${staffID} while calculating commission. Aborting.`,
      );
      throw new Error(`No staffHurdle found for staffID ${staffID}`);
    },
  );

  // Extract and validate hurdle configuration
  const baseRate = stripToNumeric(staffCommConfig.baseRate);
  if (!checkRate(baseRate)) {
    throw new Error("Invalid baseRate");
  }

  let hurdle1Level = 0;
  let hurdle1Rate = 0;
  if (Object.hasOwn(staffCommConfig, HURDLE_1_LEVEL)) {
    hurdle1Level = stripToNumeric(staffCommConfig.hurdle1Level);
    hurdle1Rate = stripToNumeric(staffCommConfig.hurdle1Rate);
    if (!checkRate(hurdle1Rate)) {
      errorLogger.error(
        `Fatal: Error with ${staffID}'s commission config in staffHurdle.json`,
      );
      throw new Error("Invalid hurdle1Rate");
    }
  }

  let hurdle2Level = 0;
  let hurdle2Rate = 0;
  if (Object.hasOwn(staffCommConfig, HURDLE_2_LEVEL)) {
    hurdle2Level = stripToNumeric(staffCommConfig.hurdle2Level);
    hurdle2Rate = stripToNumeric(staffCommConfig.hurdle2Rate);
    if (!checkRate(hurdle2Rate)) {
      errorLogger.error(
        `Fatal: Error with ID ${staffID}'s commission config in staffHurdle.json`,
      );
      throw new Error("Invalid hurdle2Rate");
    }
  }

  let hurdle3Level = 0;
  let hurdle3Rate = 0;
  if (Object.hasOwn(staffCommConfig, HURDLE_3_LEVEL)) {
    hurdle3Level = stripToNumeric(staffCommConfig.hurdle3Level);
    hurdle3Rate = stripToNumeric(staffCommConfig.hurdle3Rate);
    if (!checkRate(hurdle3Rate)) {
      errorLogger.error(
        `Fatal: Error with ${staffID}'s commission config in staffHurdle.json`,
      );
      throw new Error("Invalid hurdle3Rate");
    }
  }

  // Use pure function to calculate commission breakdown
  const hurdleConfig: HurdleConfig = {
    baseRate,
    hurdle1Level,
    hurdle1Rate,
    hurdle2Level,
    hurdle2Rate,
    hurdle3Level,
    hurdle3Rate,
  };

  const breakdown = calculateTieredCommission(serviceRev, hurdleConfig);

  // Store detailed breakdown in serviceCommMap for logging
  const staffName = staffMap.get(staffID);
  const tempServComm: GeneralServiceComm = {
    staffName: `${staffName?.last_name ?? "<Last Name>"} ${staffName?.first_name ?? "<First Name>"}`,
    generalServiceRevenue: serviceRev,
    base: {
      baseCommRevenue: breakdown.baseRevenue,
      baseCommRate: baseRate,
      baseCommAmt: breakdown.baseCommission,
    },
    hurdle1: {
      hurdle1Revenue: breakdown.hurdle1Revenue,
      hurdle1Level: hurdle1Level,
      hurdle1Rate: hurdle1Rate,
      hurdle1PayOut: breakdown.hurdle1Commission,
    },
    hurdle2: {
      hurdle2Revenue: breakdown.hurdle2Revenue,
      hurdle2Level: hurdle2Level,
      hurdle2Rate: hurdle2Rate,
      hurdle2Payout: breakdown.hurdle2Commission,
    },
    hurdle3: {
      hurdle3Revenue: breakdown.hurdle3Revenue,
      hurdle3Level: hurdle3Level,
      hurdle3Rate: hurdle3Rate,
      hurdle3Payout: breakdown.hurdle3Commission,
    },
    generalServiceComm: breakdown.totalCommission,
  };

  serviceCommMap.set(staffID, tempServComm);

  return breakdown.totalCommission;
}

function writePaymentsWorkBook(payments: ITalenoxPayment[]): void {
  const paymentsWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    paymentsWB,
    XLSX.utils.json_to_sheet(payments, { skipHeader: true }),
    PAYMENTS_WS_NAME,
  );
  XLSX.writeFile(paymentsWB, `${PAYMENTS_DIR}/${PAYMENTS_WB_NAME}`);
}

/**
 * Split an amount evenly across members, distributing remainder cents
 * to the first members (by array order).
 *
 * Example: $100 split 3 ways → [33.34, 33.33, 33.33]
 *
 * Note: Pool members are sorted by staffID in collectPools(),
 * so staff with lower IDs receive any remainder cents.
 */
function splitAmountAcrossMembers(
  amount: number,
  memberCount: number,
): number[] {
  if (memberCount <= 0) return [];

  const totalCents = amountToCents(amount);
  const baseShare = Math.trunc(totalCents / memberCount);
  const remainder = totalCents % memberCount;

  return Array.from({ length: memberCount }, (_value, index) => {
    const cents = baseShare + (index < remainder ? 1 : 0);
    return new Decimal(cents).dividedBy(100).toNumber();
  });
}

function sumCustomRateCommissions(
  customRateCommissions: TCommComponents["customRateCommissions"],
): number {
  return Object.values(customRateCommissions)
    .reduce((sum, amount) => sum.plus(amount), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();
}

function amountToCents(amount: number): number {
  return new Decimal(amount).times(100).toDecimalPlaces(0).toNumber();
}

type PoolTotals = {
  totalServiceRevenue: number;
  tips: number;
  productCommission: number;
  generalServiceCommission: number;
};

type PoolAggregate = {
  numericTotals: PoolTotals;
  customRateCommissions: Record<string, number>;
};

type PoolShares = {
  numericShares: {
    totalServiceRevenue: number[];
    tips: number[];
    productCommission: number[];
    generalServiceCommission: number[];
  };
  customRateShares: Record<string, number[]>;
};

type PooledStaffEntry = {
  staffID: TStaffID;
  comm: TCommComponents;
};

function assertUniquePoolMembers(
  poolMembers: TStaffID[],
  context: string,
): void {
  assert(
    new Set(poolMembers).size === poolMembers.length,
    `${context} contains duplicate pool members: ${poolMembers.join(", ")}`,
  );
}

function assertDistributedShares(
  shares: number[],
  memberCount: number,
  expectedTotal: number,
  context: string,
): void {
  assert(
    shares.length === memberCount,
    `${context} produced ${shares.length} shares for ${memberCount} members.`,
  );
  assert(
    amountToCents(shares.reduce((sum, share) => sum + share, 0)) ===
      amountToCents(expectedTotal),
    `${context} shares sum to ${shares.reduce((sum, share) => sum + share, 0)}, expected ${expectedTotal}.`,
  );
}

function getRequiredCommComponents(
  commMap: TCommMap,
  staffID: TStaffID,
  detail?: string,
): TCommComponents {
  const comm = commMap.get(staffID);
  assert(
    comm,
    detail
      ? `No commMap entry for ${staffID} ${detail}. This should never happen.`
      : `No commMap entry for ${staffID}. This should never happen.`,
  );
  return comm;
}

function createEmptyPoolTotals(): PoolTotals {
  return {
    totalServiceRevenue: 0,
    tips: 0,
    productCommission: 0,
    generalServiceCommission: 0,
  };
}

function getConfiguredPoolMembers(
  staffID: TStaffID,
  hurdle: StaffHurdle,
): TStaffID[] | null {
  if (!hurdle.poolsWith || hurdle.poolsWith.length === 0) {
    return null;
  }

  const poolMembers = [...hurdle.poolsWith, staffID];
  assertUniquePoolMembers(poolMembers, `Pooling config for ${staffID}`);
  return poolMembers.sort();
}

function collectPools(staffHurdle: TStaffHurdles): TStaffID[][] {
  const pools: TStaffID[][] = [];

  for (const [staffID, hurdle] of staffHurdle) {
    const poolMembers = getConfiguredPoolMembers(staffID, hurdle);
    if (!poolMembers) {
      continue;
    }

    let foundPoolMembers: TStaffID[] | undefined;
    for (const existingPool of pools) {
      if (!existingPool.includes(staffID)) {
        continue;
      }

      if (foundPoolMembers) {
        assert(
          eqSet(existingPool, foundPoolMembers),
          `${staffID} appears in multiple pool definitions.`,
        );
        continue;
      }

      foundPoolMembers = existingPool;
    }

    if (foundPoolMembers) {
      if (!eqSet(foundPoolMembers, poolMembers)) {
        throw new Error(
          `Pooling config for ${staffID} appears to be incorrect.`,
        );
      }
      continue;
    }

    pools.push(poolMembers);
  }

  return pools;
}

function aggregatePool(
  poolMembers: TStaffID[],
  commMap: TCommMap,
): PoolAggregate {
  let totalServiceRevenue = new Decimal(0);
  let tips = new Decimal(0);
  let productCommission = new Decimal(0);
  let generalServiceCommission = new Decimal(0);
  const customRateCommissions: Record<string, Decimal> = {};

  for (const poolMember of poolMembers) {
    const commMapElement = getRequiredCommComponents(commMap, poolMember);

    totalServiceRevenue = totalServiceRevenue.plus(commMapElement.totalServiceRevenue);
    tips = tips.plus(commMapElement.tips);
    productCommission = productCommission.plus(commMapElement.productCommission);
    generalServiceCommission = generalServiceCommission.plus(commMapElement.generalServiceCommission);

    for (const [serviceName, amount] of Object.entries(
      commMapElement.customRateCommissions,
    )) {
      customRateCommissions[serviceName] =
        (customRateCommissions[serviceName] ?? new Decimal(0)).plus(amount);
    }
  }

  const numericCustomRateCommissions: Record<string, number> = {};
  for (const [k, v] of Object.entries(customRateCommissions)) {
    numericCustomRateCommissions[k] = v.toDecimalPlaces(2).toNumber();
  }

  return {
    numericTotals: {
      totalServiceRevenue: totalServiceRevenue.toDecimalPlaces(2).toNumber(),
      tips: tips.toDecimalPlaces(2).toNumber(),
      productCommission: productCommission.toDecimalPlaces(2).toNumber(),
      generalServiceCommission: generalServiceCommission.toDecimalPlaces(2).toNumber(),
    },
    customRateCommissions: numericCustomRateCommissions,
  };
}

function splitPoolAggregate(
  aggregate: PoolAggregate,
  poolMembers: TStaffID[],
): PoolShares {
  const { numericTotals, customRateCommissions } = aggregate;
  const memberCount = poolMembers.length;
  const poolLabel = poolMembers.join(", ");

  const numericShares = {
    totalServiceRevenue: splitAmountAcrossMembers(
      numericTotals.totalServiceRevenue,
      memberCount,
    ),
    tips: splitAmountAcrossMembers(numericTotals.tips, memberCount),
    productCommission: splitAmountAcrossMembers(
      numericTotals.productCommission,
      memberCount,
    ),
    generalServiceCommission: splitAmountAcrossMembers(
      numericTotals.generalServiceCommission,
      memberCount,
    ),
  };

  assertDistributedShares(
    numericShares.totalServiceRevenue,
    memberCount,
    numericTotals.totalServiceRevenue,
    `totalServiceRevenue pool ${poolLabel}`,
  );
  assertDistributedShares(
    numericShares.tips,
    memberCount,
    numericTotals.tips,
    `tips pool ${poolLabel}`,
  );
  assertDistributedShares(
    numericShares.productCommission,
    memberCount,
    numericTotals.productCommission,
    `productCommission pool ${poolLabel}`,
  );
  assertDistributedShares(
    numericShares.generalServiceCommission,
    memberCount,
    numericTotals.generalServiceCommission,
    `generalServiceCommission pool ${poolLabel}`,
  );

  const customRateShares: Record<string, number[]> = {};
  for (const [serviceName, amount] of Object.entries(customRateCommissions)) {
    const shares = splitAmountAcrossMembers(amount, memberCount);
    assertDistributedShares(
      shares,
      memberCount,
      amount,
      `${serviceName} custom rate commission pool ${poolLabel}`,
    );
    customRateShares[serviceName] = shares;
  }

  return { numericShares, customRateShares };
}

function createPooledCustomRateCommissions(
  customRateShares: PoolShares["customRateShares"],
  index: number,
): TCommComponents["customRateCommissions"] {
  const pooledCustomRateCommissions: TCommComponents["customRateCommissions"] =
    {};

  for (const [serviceName, shares] of Object.entries(customRateShares)) {
    const share = shares[index];
    if (share !== 0) {
      pooledCustomRateCommissions[serviceName] = share;
    }
  }

  return pooledCustomRateCommissions;
}

function createPooledCommission(
  shares: PoolShares,
  index: number,
): TCommComponents {
  const customRateCommissions = createPooledCustomRateCommissions(
    shares.customRateShares,
    index,
  );
  const customRateCommission = sumCustomRateCommissions(customRateCommissions);
  const generalServiceCommission =
    shares.numericShares.generalServiceCommission[index];

  return {
    totalServiceRevenue: shares.numericShares.totalServiceRevenue[index],
    tips: shares.numericShares.tips[index],
    productCommission: shares.numericShares.productCommission[index],
    generalServiceCommission,
    customRateCommissions,
    customRateCommission,
    totalServiceCommission: generalServiceCommission + customRateCommission,
  };
}

function applyPoolShares(
  commMap: TCommMap,
  poolMembers: TStaffID[],
  shares: PoolShares,
): PooledStaffEntry[] {
  return poolMembers.map((staffID, index) => {
    const pooledComm = createPooledCommission(shares, index);
    commMap.set(staffID, pooledComm);
    return { staffID, comm: pooledComm };
  });
}

function formatPoolStaffName(
  talenoxStaff: TTalenoxInfoStaffMap,
  staffID: TStaffID,
): string {
  return `${talenoxStaff.get(staffID)?.last_name ?? "<Last Name>"}, ${
    talenoxStaff.get(staffID)?.first_name ?? "<First Name>"
  }`;
}

function logPoolShares(
  poolMembers: TStaffID[],
  aggregate: PoolAggregate,
  pooledEntries: PooledStaffEntry[],
  talenoxStaff: TTalenoxInfoStaffMap,
): void {
  const memberList = poolMembers
    .map((member) => `${member} ${formatPoolStaffName(talenoxStaff, member)}`)
    .join(", ");

  infoLogger.info("=======================================");
  infoLogger.info("Pooling Calculations");
  infoLogger.info("=======================================");

  for (const { staffID, comm } of pooledEntries) {
    const staffName = formatPoolStaffName(talenoxStaff, staffID);
    infoLogger.info(`Pooling for ${staffID} ${staffName}`);
    infoLogger.info(
      `Pool contains ${poolMembers.length} members: ${memberList}`,
    );
    infoLogger.info(
      `totalServiceRevenue: Aggregate value is ${aggregate.numericTotals.totalServiceRevenue}. 1/${poolMembers.length} share = ${comm.totalServiceRevenue}`,
    );
    infoLogger.info(
      `tips: Aggregate value is ${aggregate.numericTotals.tips}. 1/${poolMembers.length} share = ${comm.tips}`,
    );
    infoLogger.info(
      `productCommission: Aggregate value is ${aggregate.numericTotals.productCommission}. 1/${poolMembers.length} share = ${comm.productCommission}`,
    );
    infoLogger.info(
      `generalServiceCommission: Aggregate value is ${aggregate.numericTotals.generalServiceCommission}. 1/${poolMembers.length} share = ${comm.generalServiceCommission}`,
    );
    for (const [serviceName, amount] of Object.entries(
      aggregate.customRateCommissions,
    )) {
      infoLogger.info(
        `${serviceName} custom rate commission: Aggregate value is ${amount}. 1/${poolMembers.length} share = ${comm.customRateCommissions[serviceName] ?? 0}`,
      );
    }
    infoLogger.info(
      `customRateCommission recomputed as ${comm.customRateCommission}`,
    );
    infoLogger.info(
      `totalServiceCommission recomputed as ${comm.totalServiceCommission}`,
    );
    infoLogger.info("--------------");
  }
}

function assertPoolAggregatePreserved(
  poolMembers: TStaffID[],
  aggregate: PoolAggregate,
  commMap: TCommMap,
): void {
  const pooledAggregate = aggregatePool(poolMembers, commMap);
  const poolLabel = poolMembers.join(", ");

  assert(
    amountToCents(pooledAggregate.numericTotals.totalServiceRevenue) ===
      amountToCents(aggregate.numericTotals.totalServiceRevenue),
    `Pooled totalServiceRevenue drifted for pool ${poolLabel}.`,
  );
  assert(
    amountToCents(pooledAggregate.numericTotals.tips) ===
      amountToCents(aggregate.numericTotals.tips),
    `Pooled tips drifted for pool ${poolLabel}.`,
  );
  assert(
    amountToCents(pooledAggregate.numericTotals.productCommission) ===
      amountToCents(aggregate.numericTotals.productCommission),
    `Pooled productCommission drifted for pool ${poolLabel}.`,
  );
  assert(
    amountToCents(pooledAggregate.numericTotals.generalServiceCommission) ===
      amountToCents(aggregate.numericTotals.generalServiceCommission),
    `Pooled generalServiceCommission drifted for pool ${poolLabel}.`,
  );
  assert(
    eqSet(
      Object.keys(pooledAggregate.customRateCommissions),
      Object.keys(aggregate.customRateCommissions),
    ),
    `Pooled custom rate commission services drifted for pool ${poolLabel}.`,
  );

  for (const [serviceName, amount] of Object.entries(
    aggregate.customRateCommissions,
  )) {
    assert(
      amountToCents(pooledAggregate.customRateCommissions[serviceName] ?? 0) ===
        amountToCents(amount),
      `${serviceName} pooled custom rate commission drifted for pool ${poolLabel}.`,
    );
  }
}

export function doPooling(
  commMap: TCommMap,
  staffHurdle: TStaffHurdles,
  talenoxStaff: TTalenoxInfoStaffMap,
): TCommMap {
  const pools = collectPools(staffHurdle);

  // Clone the commission map to avoid mutating the input
  const pooledCommMap = new Map(commMap);

  for (const poolMembers of pools) {
    assert(poolMembers.length > 1, `Pool must contain at least 2 members.`);
    assertUniquePoolMembers(poolMembers, `Pool ${poolMembers.join(", ")}`);
    const aggregate = aggregatePool(poolMembers, pooledCommMap);
    const shares = splitPoolAggregate(aggregate, poolMembers);
    const pooledEntries = applyPoolShares(pooledCommMap, poolMembers, shares);

    logPoolShares(poolMembers, aggregate, pooledEntries, talenoxStaff);
    assertPoolAggregatePreserved(poolMembers, aggregate, pooledCommMap);
  }
  infoLogger.info("");
  infoLogger.info("=======================================");
  infoLogger.info("");

  return pooledCommMap;
}

/**
 * Extract payroll data for a single staff member from Excel rows
 */
export function extractStaffPayrollData(
  wsaa: unknown[][],
  startRow: number,
  endRow: number,
  revCol: number,
  staffID: TStaffID,
): StaffPayrollData {
  let tips = 0;
  let productCommission = 0;

  // Search backward from total row for tips and product commission
  for (let j = 3; j >= 0; j--) {
    const rowIndex = endRow - j;
    if (rowIndex < 0 || rowIndex >= wsaa.length) continue; // Bounds check
    if (!wsaa[rowIndex]) continue; // Row doesn't exist

    const payComponent: string = wsaa[rowIndex][0] as string;
    if (payComponent !== undefined) {
      if (payComponent === TIPS_FOR || payComponent === COMM_FOR) {
        const maxRowIndex = wsaa[rowIndex].length - 1;
        if (wsaa[rowIndex][maxRowIndex] !== undefined) {
          const value = Number(wsaa[rowIndex][maxRowIndex]);
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
  );

  return {
    staffID,
    staffName: "", // Will be populated by caller
    tips,
    productCommission,
    servicesRevenues,
  };
}

/**
 * Calculate all commission components for a staff member
 */
export function calculateStaffCommission(
  payrollData: StaffPayrollData,
  talenoxStaff: TTalenoxInfoStaffMap,
): TCommComponents {
  const { staffID, servicesRevenues } = payrollData;

  const commComponents: TCommComponents = {
    tips: payrollData.tips,
    productCommission: payrollData.productCommission,
    generalServiceCommission: 0,
    customRateCommissions: {},
    totalServiceRevenue: 0,
    customRateCommission: 0,
    totalServiceCommission: 0,
  };

  // Calculate total service revenue
  let totalServiceRevenueD = new Decimal(0);
  let generalServiceRevenue = 0;
  if (servicesRevenues) {
    servicesRevenues.forEach((element, serviceName) => {
      totalServiceRevenueD = totalServiceRevenueD.plus(element.serviceRevenue);
      if (serviceName === GENERAL_SERV_REVENUE) {
        generalServiceRevenue = element.serviceRevenue;
      }
    });
  }

  commComponents.totalServiceRevenue = totalServiceRevenueD.toDecimalPlaces(2).toNumber();

  // Calculate general service commission (uses hurdle logic)
  const generalServiceCommission = calcGeneralServiceCommission(
    staffID,
    talenoxStaff,
    generalServiceRevenue,
  );
  commComponents.generalServiceCommission = generalServiceCommission;
  commComponents.totalServiceCommission += generalServiceCommission;

  // Calculate custom rate service commissions
  let totalCustomServiceCommissionD = new Decimal(0);
  if (servicesRevenues) {
    servicesRevenues.forEach((customRateEntry, serviceName) => {
      if (serviceName !== GENERAL_SERV_REVENUE) {
        const commD = new Decimal(customRateEntry.serviceRevenue)
          .times(Number(customRateEntry.customRate))
          .toDecimalPlaces(2);
        commComponents.customRateCommissions[serviceName] = commD.toNumber();
        totalCustomServiceCommissionD = totalCustomServiceCommissionD.plus(commD);
      }
    });
    commComponents.customRateCommission = totalCustomServiceCommissionD.toDecimalPlaces(2).toNumber();
    commComponents.totalServiceCommission += commComponents.customRateCommission;
  }

  return commComponents;
}

/**
 * Log commission details for a staff member
 */
function logStaffCommission(
  staffID: TStaffID,
  staffName: string,
  commComponents: TCommComponents,
  servicesRevenues: TServRevenueMap,
): void {
  const isStaffContractor = isContractor(staffID);
  const staffIsPaidViaTalenox = isPayViaTalenox(staffID);
  const logger = isStaffContractor ? contractorLogger : commissionLogger;

  let text = `Payroll details for ${staffID} ${staffName}`;
  if (isStaffContractor) {
    text += ` [CONTRACTOR]`;
  }

  logger.info("");
  logger.info(text);
  if (!staffIsPaidViaTalenox && !isStaffContractor) {
    logger.info(
      `Note: ${staffID} ${staffName} is configured to NOT pay via Talenox.`,
    );
  }
  logger.info("");

  // Log revenue breakdown
  logger.info(
    fws32Left("General Services Revenue:"),
    fws14RightHKD(
      servicesRevenues.get(GENERAL_SERV_REVENUE)?.serviceRevenue ?? 0,
    ),
  );
  servicesRevenues.forEach((customRateEntry, serviceName) => {
    if (serviceName !== GENERAL_SERV_REVENUE) {
      logger.info(
        fws32Left(`${serviceName} Revenue:`),
        fws14RightHKD(customRateEntry.serviceRevenue),
      );
    }
  });

  // Log commission breakdown
  logger.info("");
  logger.info(
    fws32Left("General Service Commission:"),
    fws14RightHKD(commComponents.generalServiceCommission),
  );
  logger.info(
    fws32Left("Custom Rate Service Commission:"),
    fws14RightHKD(commComponents.customRateCommission),
  );
  logger.info(
    fws32Left("Product Commission:"),
    fws14RightHKD(commComponents.productCommission),
  );
  logger.info(fws32Left(`Tips:`), fws14RightHKD(commComponents.tips));
  logger.info(fws32Left(""), fws14Right("------------"));
  logger.info(
    fws32Left(`Total Payable`),
    fws14RightHKD(
      new Decimal(commComponents.customRateCommission)
        .plus(commComponents.generalServiceCommission)
        .plus(commComponents.productCommission)
        .plus(commComponents.tips)
        .toNumber(),
    ),
  );
  logger.info("");
}

/**
 * Process all staff payroll data from Excel worksheet
 */
function processPayrollExcelData(
  wsaa: unknown[][],
  revCol: number,
  talenoxStaff: TTalenoxInfoStaffMap,
  commMap: TCommMap,
): void {
  const maxRows = wsaa.length;
  let staffID: TStaffID | undefined;
  let staffName: TStaffName | undefined;
  let currentStaffIDRow = -1;
  let currentTotalForRow = 0;
  let staffInfo: StaffInfo | null = null;

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const element = wsaa[rowIndex][0];
    if (element !== undefined) {
      // Check if this line contains a staffID
      if (staffID === undefined) {
        staffInfo = getStaffIDAndName(wsaa, rowIndex);

        if (staffInfo) {
          currentStaffIDRow = rowIndex;
          staffID = staffInfo.staffID;
          if (staffID) {
            const staffMapInfo = talenoxStaff.get(staffID);
            if (staffID && staffMapInfo) {
              staffName = `${staffMapInfo.last_name ?? "<Last Name>"} ${staffMapInfo.first_name ?? "<First Name>"}`;
            } else {
              staffName = `${staffInfo.lastName ?? "<Last Name>"} ${staffInfo.firstName ?? "<First Name>"}`;
              if (REGRESSION_OFFLINE_MODE) {
                talenoxStaff.set(staffID, {
                  first_name: staffInfo.firstName,
                  last_name: staffInfo.lastName,
                });
              }
              if (isPayViaTalenox(staffID) && !REGRESSION_OFFLINE_MODE) {
                const text = `${staffID ? staffID : "null"}${staffInfo.firstName ? " " + staffInfo.firstName : ""}${
                  staffInfo.lastName ? " " + staffInfo.lastName : ""
                } in MB Payroll Report line ${rowIndex} not in Talenox.`;
                if (config.missingStaffAreFatal) {
                  throw new Error("Fatal: " + text);
                } else {
                  warnLogger.warn("Warning: " + text);
                }
              }
            }
          }
        }
      }

      // Check for "Total for" row - end of staff's data block
      if ((element as string).startsWith(TOTAL_FOR)) {
        if (staffID === undefined) {
          const possibleStaffName = (element as string).slice(TOTAL_FOR.length);
          throw new Error(
            "Reached Totals row with no identified StaffID. Staff name is possibly " +
              possibleStaffName,
          );
        }

        currentTotalForRow = rowIndex;

        // Extract payroll data for this staff member
        const payrollData = extractStaffPayrollData(
          wsaa,
          currentStaffIDRow,
          currentTotalForRow,
          revCol,
          staffID,
        );
        payrollData.staffName = staffName ?? "<Staff Name>";

        // Calculate commissions
        const commComponents = calculateStaffCommission(
          payrollData,
          talenoxStaff,
        );

        // Store in commission map
        commMap.set(staffID, commComponents);

        // Log results
        logStaffCommission(
          staffID,
          payrollData.staffName,
          commComponents,
          payrollData.servicesRevenues,
        );

        // Reset for next staff member
        staffID = undefined;
      }
    }
  }
}

async function main() {
  emitProgress("Initializing logs");
  const logPaths = await initLogs();

  // Now that log4js is configured, mirror the first progress marker into logs.
  infoLogger.info("Initializing logs");

  emitProgressAndInfo("Parsing payroll filename");
  const parsedFilename = parseFilename(config.PAYROLL_WB_FILENAME);
  const PAYROLL_MONTH = parsedFilename.PAYROLL_MONTH;
  const PAYROLL_YEAR = parsedFilename.PAYROLL_YEAR;
  const PAYMENTS_WB_NAME = parsedFilename.PAYMENTS_WB_NAME;
  const PAYMENTS_WS_NAME = parsedFilename.PAYMENTS_WS_NAME;

  if (REGRESSION_OFFLINE_MODE) {
    if (config.updateTalenox) {
      throw new Error(
        "Regression offline mode requires config.updateTalenox=false.",
      );
    }
    if (config.uploadToGDrive) {
      throw new Error(
        "Regression offline mode requires config.uploadToGDrive=false.",
      );
    }
  }

  // Set global variables for use in other functions
  setGlobal("PAYROLL_MONTH", PAYROLL_MONTH);
  setGlobal("PAYROLL_YEAR", PAYROLL_YEAR);
  setGlobal("PAYMENTS_WB_NAME", PAYMENTS_WB_NAME);
  setGlobal("PAYMENTS_WS_NAME", PAYMENTS_WS_NAME);

  const firstDay = new Date(Date.parse(`01 ${PAYROLL_MONTH} ${PAYROLL_YEAR}`));
  setGlobal("firstDay", firstDay);

  infoLogger.info(`Commission run begins ${firstDay.toDateString()}`);
  if (config.updateTalenox === false) {
    infoLogger.info(`Talenox update is disabled in config.`);
  }
  infoLogger.info(`Payroll Month is ${PAYROLL_MONTH}`);

  emitProgressAndInfo("Loading environment configuration");
  const envConfig = processEnv();
  const DATA_DIR = envConfig.DATA_DIR;
  const LOGS_DIR = envConfig.LOGS_DIR;
  const PAYMENTS_DIR = envConfig.PAYMENTS_DIR;

  // Set global variables for use in other functions
  setGlobal("LOGS_DIR", LOGS_DIR);
  setGlobal("PAYMENTS_DIR", PAYMENTS_DIR);

  assert(isValidDirectory(DATA_DIR));

  /* if (!isValidDirectory(DATA_DIR)) {
    errorLogger.error(`Invalid or missing data directory: ${DATA_DIR}`);
  } */

  const DATA_OLD_DIR = path.join(DATA_DIR, DEFAULT_OLD_DIR);

  if (!isValidDirectory(DATA_OLD_DIR)) {
    warnLogger.warn(
      `Invalid or missing default old data directory: ${DATA_OLD_DIR}`,
    );
  }

  const payrollWorkbookPath = path.join(DATA_DIR, config.PAYROLL_WB_FILENAME);
  if (!existsSync(payrollWorkbookPath)) {
    const candidates = readdirSync(DATA_DIR)
      .filter((f) => f.toLowerCase().endsWith(".xlsx"))
      .slice(0, 10)
      .join(", ");
    throw new Error(
      `Payroll workbook not found at '${payrollWorkbookPath}'. Check config.PAYROLL_WB_FILENAME and/or upload/copy the workbook into DATA_DIR (${DATA_DIR}). Found .xlsx files: ${candidates || "<none>"}`,
    );
  }

  infoLogger.info(
    `Moving (and compressing) files from ${DATA_DIR} to ${DATA_OLD_DIR}`,
  );
  emitProgressAndInfo(
    "Archiving old payroll workbooks",
    `From ${DATA_DIR} to ${DATA_OLD_DIR}`,
  );
  await moveFilesToOldSubDir(DATA_DIR, DEFAULT_OLD_DIR, true, 2, [
    config.PAYROLL_WB_FILENAME,
  ]);

  emitProgressAndInfo("Loading staff hurdle configuration");
  loadStaffHurdles(process.env.STAFF_HURDLE_FILE ?? DEFAULT_STAFF_HURDLES_FILE);

  let talenoxStaff: TTalenoxInfoStaffMap;
  if (REGRESSION_OFFLINE_MODE) {
    emitProgressAndInfo(
      "Using offline staff mode",
      "Skipping Talenox employee fetch for regression replay",
    );
    talenoxStaff = new Map();
  } else {
    infoLogger.info(`Requesting employees from Talenox`);
    emitProgressAndInfo("Fetching employees from Talenox");
    talenoxStaff = await getTalenoxEmployees();
    infoLogger.info(`Requesting employees complete`);
  }

  emitProgressAndInfo(
    "Reading Mindbody payroll workbook",
    config.PAYROLL_WB_FILENAME,
  );
  const WS = readExcelFile(payrollWorkbookPath);

  // Using option {header:1} returns an array of arrays
  const wsaa: unknown[][] = XLSX.utils.sheet_to_json(WS, {
    blankrows: false,
    header: 1,
  });

  emitProgressAndInfo("Locating revenue column");
  const revCol = revenueCol(wsaa);

  // Process all staff payroll data from Excel
  emitProgressAndInfo("Parsing payroll rows and calculating commissions");
  processPayrollExcelData(wsaa, revCol, talenoxStaff, commMap);

  // Apply pooling logic to commission map
  emitProgressAndInfo("Applying pooling rules");
  const pooledCommMap = doPooling(commMap, staffHurdles, talenoxStaff);

  // Create payment spreadsheet and upload to Talenox
  emitProgressAndInfo("Creating Talenox payment entries");
  const payments = createAdHocPayments(pooledCommMap, talenoxStaff);

  emitProgressAndInfo("Archiving old payment spreadsheets");
  await moveFilesToOldSubDir(PAYMENTS_DIR, undefined, true, 2);

  emitProgressAndInfo("Writing payment spreadsheet");
  writePaymentsWorkBook(payments);

  if (config.uploadToGDrive) {
    const missingEnvVars = getMissingGoogleDriveEnvVars();
    if (missingEnvVars.length > 0) {
      const detail = `Missing environment variable(s): ${missingEnvVars.join(", ")}`;
      warnLogger.warn(
        `Google Drive upload is enabled but cannot run. ${detail}.`,
      );
      emitProgressAndInfo("Skipping Google Drive upload", detail);
    } else {
      emitProgressAndInfo("Uploading artifacts to Google Drive");
      const hierarchy = buildFolderHierarchy(PAYROLL_YEAR, PAYROLL_MONTH);
      const artifacts = buildArtifactList(
        payrollWorkbookPath,
        path.join(PAYMENTS_DIR, PAYMENTS_WB_NAME),
        logPaths.commissionLog,
        logPaths.contractorLog,
        logPaths.debugLog,
        resolveFromProjectRoot(DEFAULT_STAFF_HURDLES_FILE),
      );
      const driveResult = await uploadRunArtifacts(artifacts, hierarchy);
      if (!driveResult.ok) {
        warnLogger.warn(`Google Drive upload skipped: ${driveResult.error}`);
        emitProgressAndInfo("Google Drive upload skipped", driveResult.error);
      } else {
        infoLogger.info(
          `Artifacts uploaded to Google Drive: ${hierarchy.year}/${hierarchy.month}`,
        );
      }
    }
  }

  /*
    If configuration permits updating Talenox, create a new payroll and push into it the adhoc payments for service commission, tips and product commission.
    */

  if (!config.updateTalenox) {
    emitProgressAndInfo("Complete (dry run)", "updateTalenox is disabled");
    return;
  }

  debugLogger.debug(`Requesting new payroll payment creation from Talenox`);
  emitProgressAndInfo("Creating payroll in Talenox");
  const createPayrollResult = await createPayroll(talenoxStaff);
  debugLogger.debug(`New payroll payment is created in Talenox.`);
  if (!createPayrollResult[1]) {
    if (createPayrollResult[0]) {
      errorLogger.error(
        `Failed to create payroll payment for ${PAYROLL_MONTH}: ${createPayrollResult[0].message}`,
      );
    }
    if (!createPayrollResult[0]) {
      errorLogger.error(
        `Failed to create payroll payment for ${PAYROLL_MONTH}: no reason given by Talenox API`,
      );
    }
    throw new Error(
      `Failed to create payroll payment: ${createPayrollResult[0]?.message}`,
    );
  }
  debugLogger.debug(`OK: ${createPayrollResult[1].message}`);

  debugLogger.debug(`Pushing ad-hoc payments into new payroll`);
  emitProgressAndInfo("Uploading ad-hoc payments to Talenox");
  const uploadAdHocResult = await uploadAdHocPayments(talenoxStaff, payments);
  if (!uploadAdHocResult[1]) {
    if (uploadAdHocResult[0]) {
      errorLogger.error(`Failed: ${uploadAdHocResult[0].message}`);
    }
    if (!uploadAdHocResult[0]) {
      errorLogger.error("Failed: Unknown reason");
    }
    throw new Error(
      `Failed to upload ad-hoc payments: ${uploadAdHocResult[0]?.message}`,
    );
  }
  debugLogger.debug(`Pushing ad-hoc payments is complete`);
  if (uploadAdHocResult[1]) {
    debugLogger.debug(`OK: ${uploadAdHocResult[1].message}`);
  }

  emitProgressAndInfo("Complete", "Talenox updated");
}

//initDebug()
if (process.argv[1] === fileURLToPath(import.meta.url)) main()
  .then(async () => {
    debugLogger.debug("Done!");
    await shutdownLogging();
  })
  .catch(async (error) => {
    // Important: propagate failure to the process exit code.
    // Otherwise the web runner (and shell scripts) will treat failures as success.
    process.exitCode = 1;

    if (error instanceof Error) {
      errorLogger.error(`${error.message}`);
      // Also write to stderr so the web UI (child process stderr) always surfaces the failure.
      console.error(error.message);
    } else if (typeof error === "string") {
      errorLogger.error(`${error.toString()}`);
      console.error(error.toString());
    } else {
      errorLogger.error(
        `Cannot log caught error. Unknown error type: ${typeof error}. Error: ${error.toString()}`,
      );
      // eslint-disable-next-line no-console
      console.error(
        `Cannot log caught error. Unknown error type: ${typeof error}. Error: ${error.toString()}`,
      );
    }
    await shutdownLogging();
  });

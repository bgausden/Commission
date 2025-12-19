/* global staffHurdles, PAYMENTS_WS_NAME, PAYMENTS_WB_NAME, PAYMENTS_DIR, firstDay */

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
// TODO fix catching staff missing from staffhurdle.json
// TODO Fix warning that staff are not paid via Talenox appearing in wrong place in log.
// TODO place payments spreadsheets into a "payments" folder
// TODO remove --experimental-json-modules in favour of approach in logging_functions. ts --> const log4jsConfig: Configuration = JSON.parse(await readFile(new URL(`./${log4jsConfigFile}`, import.meta.url), { encoding: 'utf-8' }))
// TODO create debug log (in addition to displaying debug in console)
// TODO remove ts-ignore from logging_functions.ts ✓
// TODO rewrite isContractor() in utility_functions.ts (unneccessarily complicated - just use ?)
// TODO make filename for staffHurdle.json a constant
// TODO remove dependency on ncp for copying files

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
  getValidatedStaffHurdle,
} from "./utility_functions.js";
//import { initDebug, log, warn, error } from "./debug_functions.js"
import {
  contractorLogger,
  commissionLogger,
  warnLogger,
  errorLogger,
  debugLogger,
  shutdownLogging,
  initLogs,
} from "./logging_functions.js";
import { fws32Left, fws14RightHKD, fws14Right } from "./string_functions.js";
import {
  DEFAULT_OLD_DIR,
  DEFAULT_STAFF_HURDLES_FILE,
  defaultStaffID,
} from "./constants.js";
import path from "node:path";
import { loadStaffHurdles } from "./staffHurdles.js";
import parseFilename from "./parseFilename.js";
import { processEnv } from "./env_functions.js";
import assert from "node:assert";

const PROGRESS_PREFIX = "__PROGRESS__ ";

function emitProgress(step: string, detail?: string): void {
  // Structured marker for the web UI/server runner to parse.
  // Must stay stable to avoid breaking parsing in serverApp.ts.
  const payload = {
    ts: new Date().toISOString(),
    step,
    ...(detail ? { detail } : {}),
  };
  // Intentionally use stdout (console.log) so it can be streamed.
  // eslint-disable-next-line no-console
  console.log(`${PROGRESS_PREFIX}${JSON.stringify(payload)}`);
}

const SERVICE_ROW_REGEX = /(.*) Pay Rate: (.*) \((.*)%\)/i;

const SERVICE_TYPE_INDEX = 2;

const FIRST_SHEET = 0;

const STAFF_ID_HASH = "Staff ID #:";
const TOTAL_FOR = "Total for ";
const TIPS_FOR = "Tips:";
const COMM_FOR = "Sales Commission:";
const REV_PER_SESS = "Rev. per Session";

const BASE_RATE = "baseRate";
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
const emptyServComm: GeneralServiceComm = {
  staffName: "",
  base: { baseCommRevenue: 0, baseCommRate: 0, baseCommAmt: 0 },
  hurdle1: {
    hurdle1PayOut: 0,
    hurdle1Level: 0,
    hurdle1Rate: 0,
    hurdle1Revenue: 0,
  },
  hurdle2: {
    hurdle2Payout: 0,
    hurdle2Level: 0,
    hurdle2Rate: 0,
    hurdle2Revenue: 0,
  },
  hurdle3: {
    hurdle3Payout: 0,
    hurdle3Level: 0,
    hurdle3Rate: 0,
    hurdle3Revenue: 0,
  },
  generalServiceComm: 0,
  generalServiceRevenue: 0,
};

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
    const staffInfo: string[] | undefined =
      testString !== undefined
        ? (testString as string).split(STAFF_ID_HASH)
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
        staffID: staffInfo[staffIDIndex].trim(),
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
  const sh = getValidatedStaffHurdle(staffID, "Mindbody payroll report");
  const customPayRates = sh?.customPayRates ?? [];
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

        serviceRevenue += serviceRevenueEntry.serviceRevenue;
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

  let baseRevenue = 0;
  let hurdle1Revenue = 0;
  let hurdle2Revenue = 0;
  let hurdle3Revenue = 0;

  if (hurdle1Level <= 0) {
    // No hurdles configured - all revenue pays at base rate
    baseRevenue = serviceRevenue;
  } else if (serviceRevenue <= hurdle1Level) {
    // Revenue below first hurdle
    baseRevenue = 0;
    hurdle1Revenue = 0;
  } else if (hurdle2Level <= 0 || serviceRevenue <= hurdle2Level) {
    // Revenue between hurdle1 and hurdle2 (or no hurdle2)
    baseRevenue = 0;
    hurdle1Revenue = serviceRevenue - hurdle1Level;
  } else if (hurdle3Level <= 0 || serviceRevenue <= hurdle3Level) {
    // Revenue between hurdle2 and hurdle3 (or no hurdle3)
    baseRevenue = 0;
    hurdle1Revenue = hurdle2Level - hurdle1Level;
    hurdle2Revenue = serviceRevenue - hurdle2Level;
  } else {
    // Revenue exceeds hurdle3
    baseRevenue = 0;
    hurdle1Revenue = hurdle2Level - hurdle1Level;
    hurdle2Revenue = hurdle3Level - hurdle2Level;
    hurdle3Revenue = serviceRevenue - hurdle3Level;
  }

  // Round all revenue allocations to 2 decimal places
  baseRevenue = Math.round(baseRevenue * 100) / 100;
  hurdle1Revenue = Math.round(hurdle1Revenue * 100) / 100;
  hurdle2Revenue = Math.round(hurdle2Revenue * 100) / 100;
  hurdle3Revenue = Math.round(hurdle3Revenue * 100) / 100;

  // Calculate commission for each tier
  const baseCommission = Math.round(baseRevenue * baseRate * 100) / 100;
  const hurdle1Commission =
    Math.round(hurdle1Revenue * hurdle1Rate * 100) / 100;
  const hurdle2Commission =
    Math.round(hurdle2Revenue * hurdle2Rate * 100) / 100;
  const hurdle3Commission =
    Math.round(hurdle3Revenue * hurdle3Rate * 100) / 100;

  const totalCommission =
    Math.round(
      (baseCommission +
        hurdle1Commission +
        hurdle2Commission +
        hurdle3Commission) *
        100,
    ) / 100;

  return {
    baseRevenue,
    baseCommission,
    hurdle1Revenue,
    hurdle1Commission,
    hurdle2Revenue,
    hurdle2Commission,
    hurdle3Revenue,
    hurdle3Commission,
    totalCommission,
  };
}

function calcGeneralServiceCommission(
  staffID: TStaffID,
  staffMap: TTalenoxInfoStaffMap,
  serviceRev: TServiceRevenue,
): number {
  // Get staff commission configuration with centralized validation
  const staffCommConfig = getValidatedStaffHurdle(
    staffID,
    "commission calculation",
  ) as StaffCommConfig;

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

function doPooling(
  commMap: TCommMap,
  staffHurdle: TStaffHurdles,
  talenoxStaff: TTalenoxInfoStaffMap,
): void {
  let poolCounter = 0;
  const pools = new Map<number, TStaffID[]>();
  Object.entries(staffHurdle).forEach((element) => {
    const [staffID, hurdle] = element;
    const poolingWith = hurdle.poolsWith;
    if (poolingWith && poolingWith.length > 0) {
      let foundPoolID: number | undefined;
      let foundPoolMembers: TStaffID[] | undefined;
      for (const pool of pools) {
        const [poolID, poolingStaff] = pool;
        if (poolingStaff.includes(staffID)) {
          if (foundPoolID) {
            if (foundPoolMembers && !eqSet(poolingStaff, foundPoolMembers)) {
              // Already appear in another pool. Something's broken
              throw new Error(`${staffID} appears to be a member of two `);
            }
          } else {
            // make sure this pool contains everyone we think we pool with
            // if not, the staffHurdle.json is incorrect
            poolingWith.push(staffID);
            if (eqSet(poolingStaff, poolingWith)) {
              foundPoolID = poolID;
              foundPoolMembers = poolingStaff;
            } else {
              throw new Error(
                `Pooling config for ${staffID} appears to be incorrect.`,
              );
            }
          }
        }
      }
      // Now set the pool if !foundPoolID
      if (foundPoolID === undefined) {
        poolingWith.push(staffID);
        pools.set(poolCounter, poolingWith);
        poolCounter += 1;
      }
    }
  });
  // Now actually allocate revenues across the pools
  for (const pool of pools) {
    const [_poolId, poolMembers] = pool;
    const aggregateComm: TCommComponents = {
      totalServiceRevenue: 0,
      totalServiceCommission: 0,
      tips: 0,
      productCommission: 0,
      customRateCommission: 0,
      customRateCommissions: {},
      generalServiceCommission: 0,
    };
    for (const poolMember of poolMembers) {
      for (const [aggregatePropName, aggregatePropValue] of Object.entries(
        aggregateComm,
      )) {
        const commMapElement = commMap.get(poolMember);
        if (commMapElement) {
          const commMapValue = commMapElement[aggregatePropName];
          if (
            typeof aggregatePropValue === "number" &&
            typeof commMapValue === "number"
          ) {
            aggregateComm[aggregatePropName] =
              aggregatePropValue + commMapValue;
          }
        } else {
          throw new Error(
            `No commMap entry for ${poolMember}. This should never happen.`,
          );
        }
      }
    }
    // divide the aggregate values across the pool members by updating their commComponents entries
    // Question: do we want to add pool_* variants of the comm components so we can see the before/after?
    commissionLogger.info("=======================================");
    commissionLogger.info("Pooling Calculations");
    commissionLogger.info("=======================================");

    for (const poolMember of poolMembers) {
      const staffName = `${
        talenoxStaff.get(poolMember)?.last_name ?? "<Last Name>"
      }, ${talenoxStaff.get(poolMember)?.first_name ?? "<First Name>"}`;
      commissionLogger.info(`Pooling for ${poolMember} ${staffName}`);
      const memberList = poolMembers
        .map(
          (member) =>
            `${member} ${
              talenoxStaff.get(member)?.last_name ?? "<Last Name>"
            } ${talenoxStaff.get(member)?.first_name ?? "<First Name>"}`,
        )
        .join(", ");
      commissionLogger.info(
        `Pool contains ${poolMembers.length} members: ${memberList}`,
      );
      for (const [aggregatePropName, aggregatePropValue] of Object.entries(
        aggregateComm,
      )) {
        const comm = commMap.get(poolMember);
        assert(
          comm,
          `No commMap entry for ${poolMember} ${staffName}. This should never happen.`,
        );

        if (typeof aggregatePropValue === "number") {
          comm[aggregatePropName] =
            Math.round((aggregatePropValue * 100) / poolMembers.length) / 100;
          const aggregateCommString =
            typeof comm[aggregatePropName] === "number"
              ? comm[aggregatePropName].toString()
              : JSON.stringify(comm[aggregatePropName]);
          commissionLogger.info(
            `${aggregatePropName}: Aggregate value is ${aggregatePropValue}. 1/${poolMembers.length} share = ${aggregateCommString}`,
          );
        }
      }
      commissionLogger.info("--------------");
    }
  }
  commissionLogger.info("");
  commissionLogger.info("=======================================");
  commissionLogger.info("");
  return;
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
  let totalServiceRevenue = 0;
  let generalServiceRevenue = 0;
  if (servicesRevenues) {
    servicesRevenues.forEach((element, serviceName) => {
      totalServiceRevenue += element.serviceRevenue;
      if (serviceName === GENERAL_SERV_REVENUE) {
        generalServiceRevenue = element.serviceRevenue;
      }
    });
  }

  commComponents.totalServiceRevenue = totalServiceRevenue;

  // Calculate general service commission (uses hurdle logic)
  const generalServiceCommission = calcGeneralServiceCommission(
    staffID,
    talenoxStaff,
    generalServiceRevenue,
  );
  commComponents.generalServiceCommission = generalServiceCommission;
  commComponents.totalServiceCommission += generalServiceCommission;

  // Calculate custom rate service commissions
  let totalCustomServiceCommission = 0;
  if (servicesRevenues) {
    servicesRevenues.forEach((customRateEntry, serviceName) => {
      if (serviceName !== GENERAL_SERV_REVENUE) {
        const customServiceRevenue =
          customRateEntry.serviceRevenue * Number(customRateEntry.customRate);
        commComponents.customRateCommissions[serviceName] =
          customServiceRevenue;
        totalCustomServiceCommission += customServiceRevenue;
      }
    });
    commComponents.customRateCommission = totalCustomServiceCommission;
    commComponents.totalServiceCommission += totalCustomServiceCommission;
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
  const logger = isContractor(staffID) ? contractorLogger : commissionLogger;

  if (!isPayViaTalenox(staffID) && !isContractor(staffID)) {
    commissionLogger.warn(
      `Note: ${staffID} ${staffName} is configured to NOT pay via Talenox.`,
    );
  }

  let text = `Payroll details for ${staffID} ${staffName}`;
  if (isContractor(staffID)) {
    text += ` [CONTRACTOR]`;
  }

  logger.info("");
  logger.info(text);
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
      commComponents.customRateCommission +
        commComponents.generalServiceCommission +
        commComponents.productCommission +
        commComponents.tips,
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
              if (isPayViaTalenox(staffID)) {
                const text = `${staffID ? staffID : "null"}${staffInfo.firstName ? " " + staffInfo.firstName : ""}${
                  staffInfo.lastName ? " " + staffInfo.lastName : ""
                } in MB Payroll Report line ${rowIndex} not in Talenox.`;
                if (config.missingStaffAreFatal) {
                  throw new Error("Fatal: " + text);
                } else {
                  warnLogger.warn("Warning: " + text);
                }
              } else {
                if (!isContractor(staffID)) {
                  warnLogger.warn(
                    `Note: ${staffID} ${staffName} is configured to NOT pay via Talenox.`,
                  );
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
  await initLogs();

  emitProgress("Parsing payroll filename");
  const { PAYROLL_MONTH, PAYROLL_YEAR, PAYMENTS_WB_NAME, PAYMENTS_WS_NAME } =
    parseFilename(config.PAYROLL_WB_FILENAME);
  global.PAYROLL_MONTH = PAYROLL_MONTH;
  global.PAYROLL_YEAR = PAYROLL_YEAR;
  global.PAYMENTS_WB_NAME = PAYMENTS_WB_NAME;
  global.PAYMENTS_WS_NAME = PAYMENTS_WS_NAME;

  global.firstDay = new Date(Date.parse(`01 ${PAYROLL_MONTH} ${PAYROLL_YEAR}`));

  commissionLogger.info(`Commission run begins ${firstDay.toDateString()}`);
  if (config.updateTalenox === false) {
    commissionLogger.info(`Talenox update is disabled in config.`);
  }
  commissionLogger.info(`Payroll Month is ${PAYROLL_MONTH}`);

  emitProgress("Loading environment configuration");
  const { PAYMENTS_DIR, DATA_DIR, LOGS_DIR } = processEnv();
  global.LOGS_DIR = LOGS_DIR;
  global.PAYMENTS_DIR = PAYMENTS_DIR;

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

  debugLogger.debug(
    `Moving (and compressing) files from ${DATA_DIR} to ${DATA_OLD_DIR}`,
  );
  emitProgress(
    "Archiving old payroll workbooks",
    `From ${DATA_DIR} to ${DATA_OLD_DIR}`,
  );
  await moveFilesToOldSubDir(DATA_DIR, DEFAULT_OLD_DIR, true, 2); // probably not necessary for the destination folder to be configurable

  const payrollWorkbookPath = path.join(DATA_DIR, config.PAYROLL_WB_FILENAME);

  emitProgress("Loading staff hurdle configuration");
  loadStaffHurdles(DEFAULT_STAFF_HURDLES_FILE);

  debugLogger.debug(`Requesting employees from Talenox`);
  emitProgress("Fetching employees from Talenox");
  const talenoxStaff = await getTalenoxEmployees();
  debugLogger.debug(`Requesting employees complete`);

  emitProgress("Reading Mindbody payroll workbook", config.PAYROLL_WB_FILENAME);
  const WS = readExcelFile(payrollWorkbookPath);

  // Using option {header:1} returns an array of arrays
  const wsaa: unknown[][] = XLSX.utils.sheet_to_json(WS, {
    blankrows: false,
    header: 1,
  });

  emitProgress("Locating revenue column");
  const revCol = revenueCol(wsaa);

  // Process all staff payroll data from Excel
  emitProgress("Parsing payroll rows and calculating commissions");
  processPayrollExcelData(wsaa, revCol, talenoxStaff, commMap);

  // Apply pooling logic to commission map
  emitProgress("Applying pooling rules");
  doPooling(commMap, staffHurdles, talenoxStaff);

  // Create payment spreadsheet and upload to Talenox
  emitProgress("Creating Talenox payment entries");
  const payments = createAdHocPayments(commMap, talenoxStaff);

  emitProgress("Archiving old payment spreadsheets");
  await moveFilesToOldSubDir(PAYMENTS_DIR, undefined, true, 2);

  emitProgress("Writing payment spreadsheet");
  writePaymentsWorkBook(payments);

  /* 
    If configuration permits updating Talenox, create a new payroll and push into it the adhoc payments for service commission, tips and product commission.
    */

  if (!config.updateTalenox) {
    emitProgress("Complete (dry run)", "updateTalenox is disabled");
    return;
  }

  debugLogger.debug(`Requesting new payroll payment creation from Talenox`);
  emitProgress("Creating payroll in Talenox");
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
  emitProgress("Uploading ad-hoc payments to Talenox");
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

  emitProgress("Complete", "Talenox updated");
}

//initDebug()
main()
  .then(() => {
    debugLogger.debug("Done!");
    shutdownLogging();
  })
  .catch((error) => {
    if (error instanceof Error) {
      errorLogger.error(`${error.message}`);
    } else if (typeof error === "string") {
      errorLogger.error(`${error.toString()}`);
    } else {
      errorLogger.error(
        `Cannot log caught error. Unknown error type: ${typeof error}. Error: ${error.toString()}`,
      );
    }
    shutdownLogging();
  });

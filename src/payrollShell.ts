import { Decimal } from "decimal.js";
import type { StaffInfo } from "./IStaffInfo.js";
import type {
  TStaffID,
  TCommComponents,
  TStaffName,
  TCommMap,
  TStaffHurdles,
  TServRevenueMap,
  TTalenoxInfoStaffMap,
} from "./types.js";
import {
  isPayViaTalenoxForLookup,
  isContractorForLookup,
  getStaffHurdle,
  type StaffHurdleGetter,
} from "./utility_functions.js";
import {
  contractorLogger,
  commissionLogger,
  infoLogger,
  warnLogger,
} from "./logging_functions.js";
import { fws32Left, fws14RightHKD, fws14Right } from "./string_functions.js";
import {
  GENERAL_SERV_REVENUE,
  TOTAL_FOR,
  extractStaffPayrollData,
  getStaffIDAndName,
} from "./payrollWorksheet.js";
import { calculateStaffCommission } from "./payrollCommission.js";
import {
  calculatePooledCommissionMap,
  type PoolAggregate,
  type PooledStaffEntry,
} from "./payrollPooling.js";

export type PayrollProcessingOptions = {
  regressionOfflineMode: boolean;
  missingStaffAreFatal: boolean;
  getStaffHurdleForContext?: StaffHurdleGetter;
};

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

export function doPooling(
  commMap: TCommMap,
  staffHurdle: TStaffHurdles,
  talenoxStaff: TTalenoxInfoStaffMap,
): TCommMap {
  const { pooledCommMap, reports } = calculatePooledCommissionMap(
    commMap,
    staffHurdle,
  );

  for (const report of reports) {
    logPoolShares(
      report.poolMembers,
      report.aggregate,
      report.pooledEntries,
      talenoxStaff,
    );
  }

  infoLogger.info("");
  infoLogger.info("=======================================");
  infoLogger.info("");

  return pooledCommMap;
}

function logStaffCommission(
  staffID: TStaffID,
  staffName: string,
  commComponents: TCommComponents,
  servicesRevenues: TServRevenueMap,
  getStaffHurdleForContext: StaffHurdleGetter = getStaffHurdle,
): void {
  const isStaffContractor = isContractorForLookup(
    getStaffHurdleForContext,
    staffID,
  );
  const staffIsPaidViaTalenox = isPayViaTalenoxForLookup(
    getStaffHurdleForContext,
    staffID,
  );
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

function resolveStaffName(
  staffInfo: StaffInfo,
  talenoxStaff: TTalenoxInfoStaffMap,
  staffID: TStaffID,
  rowIndex: number,
  regressionOfflineMode: boolean,
  missingStaffAreFatal: boolean,
  getStaffHurdleForContext: StaffHurdleGetter,
): TStaffName {
  const staffMapInfo = talenoxStaff.get(staffID);
  if (staffMapInfo) {
    return `${staffMapInfo.last_name ?? "<Last Name>"} ${staffMapInfo.first_name ?? "<First Name>"}`;
  }

  const staffName = `${staffInfo.lastName ?? "<Last Name>"} ${staffInfo.firstName ?? "<First Name>"}`;
  if (regressionOfflineMode) {
    talenoxStaff.set(staffID, {
      first_name: staffInfo.firstName,
      last_name: staffInfo.lastName,
    });
  }

  if (
    isPayViaTalenoxForLookup(getStaffHurdleForContext, staffID) &&
    !regressionOfflineMode
  ) {
    const text = `${staffID} ${staffInfo.firstName} ${staffInfo.lastName} in MB Payroll Report line ${rowIndex} not in Talenox.`;
    if (missingStaffAreFatal) {
      throw new Error(`Fatal: ${text}`);
    }
    warnLogger.warn(`Warning: ${text}`);
  }

  return staffName;
}

export function processPayrollExcelData(
  wsaa: unknown[][],
  revCol: number,
  talenoxStaff: TTalenoxInfoStaffMap,
  options: PayrollProcessingOptions,
): TCommMap {
  const {
    regressionOfflineMode,
    missingStaffAreFatal,
    getStaffHurdleForContext = getStaffHurdle,
  } = options;
  const commMap: TCommMap = new Map();
  let staffID: TStaffID | undefined;
  let staffName: TStaffName | undefined;
  let currentStaffIDRow = -1;
  let staffInfo: StaffInfo | null = null;

  for (let rowIndex = 0; rowIndex < wsaa.length; rowIndex++) {
    const element = wsaa[rowIndex][0];
    if (element === undefined) {
      continue;
    }

    if (staffID === undefined) {
      staffInfo = getStaffIDAndName(wsaa, rowIndex);
      if (staffInfo) {
        currentStaffIDRow = rowIndex;
        const currentStaffID = staffInfo.staffID;
        if (!currentStaffID) {
          continue;
        }
        staffID = currentStaffID;
        staffName = resolveStaffName(
          staffInfo,
          talenoxStaff,
          currentStaffID,
          rowIndex,
          regressionOfflineMode,
          missingStaffAreFatal,
          getStaffHurdleForContext,
        );
      }
    }

    if (!(element as string).startsWith(TOTAL_FOR)) {
      continue;
    }

    if (staffID === undefined) {
      const possibleStaffName = (element as string).slice(TOTAL_FOR.length);
      throw new Error(
        "Reached Totals row with no identified StaffID. Staff name is possibly " +
          possibleStaffName,
      );
    }

    const payrollData = extractStaffPayrollData(
      wsaa,
      currentStaffIDRow,
      rowIndex,
      revCol,
      staffID,
      getStaffHurdleForContext,
    );
    payrollData.staffName = staffName ?? "<Staff Name>";

    const commComponents = calculateStaffCommission(
      payrollData,
      talenoxStaff,
      getStaffHurdleForContext,
    );
    commMap.set(staffID, commComponents);

    logStaffCommission(
      staffID,
      payrollData.staffName,
      commComponents,
      payrollData.servicesRevenues,
      getStaffHurdleForContext,
    );

    staffID = undefined;
    staffName = undefined;
    staffInfo = null;
  }

  return commMap;
}

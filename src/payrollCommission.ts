import { Decimal } from "decimal.js";
import type { StaffCommConfig } from "./IStaffCommConfig.js";
import type {
  HurdleBreakdown,
  HurdleConfig,
  StaffPayrollData,
  TCommComponents,
  TServiceRevenue,
  TStaffID,
  TTalenoxInfoStaffMap,
} from "./types.js";
import {
  checkRate,
  getStaffHurdle,
  stripToNumeric,
  type StaffHurdleGetter,
} from "./utility_functions.js";
import { GENERAL_SERV_REVENUE } from "./payrollWorksheet.js";

const HURDLE_1_LEVEL = "hurdle1Level";
const HURDLE_2_LEVEL = "hurdle2Level";
const HURDLE_3_LEVEL = "hurdle3Level";

function sumMoney(values: Iterable<number | string | Decimal>): number {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.plus(value);
  }
  return total.toDecimalPlaces(2).toNumber();
}

function getStaffCommissionConfig(
  staffID: TStaffID,
  getStaffHurdleForContext: StaffHurdleGetter,
): StaffCommConfig {
  return getStaffHurdleForContext(staffID, "commission calculation").fold(
    (staffHurdle) => staffHurdle satisfies StaffCommConfig,
    () => {
      throw new Error(`No staffHurdle found for staffID ${staffID}`);
    },
  );
}

function buildHurdleConfig(
  staffID: TStaffID,
  getStaffHurdleForContext: StaffHurdleGetter,
): HurdleConfig {
  const staffCommConfig = getStaffCommissionConfig(
    staffID,
    getStaffHurdleForContext,
  );

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
      throw new Error("Invalid hurdle1Rate");
    }
  }

  let hurdle2Level = 0;
  let hurdle2Rate = 0;
  if (Object.hasOwn(staffCommConfig, HURDLE_2_LEVEL)) {
    hurdle2Level = stripToNumeric(staffCommConfig.hurdle2Level);
    hurdle2Rate = stripToNumeric(staffCommConfig.hurdle2Rate);
    if (!checkRate(hurdle2Rate)) {
      throw new Error("Invalid hurdle2Rate");
    }
  }

  let hurdle3Level = 0;
  let hurdle3Rate = 0;
  if (Object.hasOwn(staffCommConfig, HURDLE_3_LEVEL)) {
    hurdle3Level = stripToNumeric(staffCommConfig.hurdle3Level);
    hurdle3Rate = stripToNumeric(staffCommConfig.hurdle3Rate);
    if (!checkRate(hurdle3Rate)) {
      throw new Error("Invalid hurdle3Rate");
    }
  }

  return {
    baseRate,
    hurdle1Level,
    hurdle1Rate,
    hurdle2Level,
    hurdle2Rate,
    hurdle3Level,
    hurdle3Rate,
  };
}

function calculateGeneralServiceCommission(
  staffID: TStaffID,
  serviceRev: TServiceRevenue,
  getStaffHurdleForContext: StaffHurdleGetter = getStaffHurdle,
): number {
  const hurdleConfig = buildHurdleConfig(staffID, getStaffHurdleForContext);
  return calculateTieredCommission(serviceRev, hurdleConfig).totalCommission;
}

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
    baseRevenueD = svcD;
  } else if (serviceRevenue <= hurdle1Level) {
    // Revenue below the first hurdle yields no commission.
  } else if (hurdle2Level <= 0 || serviceRevenue <= hurdle2Level) {
    hurdle1RevenueD = svcD.minus(hurdle1Level);
  } else if (hurdle3Level <= 0 || serviceRevenue <= hurdle3Level) {
    hurdle1RevenueD = new Decimal(hurdle2Level).minus(hurdle1Level);
    hurdle2RevenueD = svcD.minus(hurdle2Level);
  } else {
    hurdle1RevenueD = new Decimal(hurdle2Level).minus(hurdle1Level);
    hurdle2RevenueD = new Decimal(hurdle3Level).minus(hurdle2Level);
    hurdle3RevenueD = svcD.minus(hurdle3Level);
  }

  baseRevenueD = baseRevenueD.toDecimalPlaces(2);
  hurdle1RevenueD = hurdle1RevenueD.toDecimalPlaces(2);
  hurdle2RevenueD = hurdle2RevenueD.toDecimalPlaces(2);
  hurdle3RevenueD = hurdle3RevenueD.toDecimalPlaces(2);

  const baseCommission = baseRevenueD.times(baseRate).toDecimalPlaces(2);
  const hurdle1Commission = hurdle1RevenueD
    .times(hurdle1Rate)
    .toDecimalPlaces(2);
  const hurdle2Commission = hurdle2RevenueD
    .times(hurdle2Rate)
    .toDecimalPlaces(2);
  const hurdle3Commission = hurdle3RevenueD
    .times(hurdle3Rate)
    .toDecimalPlaces(2);

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

export function calculateStaffCommission(
  payrollData: StaffPayrollData,
  _talenoxStaff: TTalenoxInfoStaffMap,
  getStaffHurdleForContext: StaffHurdleGetter = getStaffHurdle,
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

  let totalServiceRevenueD = new Decimal(0);
  let generalServiceRevenue = 0;
  servicesRevenues.forEach((element, serviceName) => {
    totalServiceRevenueD = totalServiceRevenueD.plus(element.serviceRevenue);
    if (serviceName === GENERAL_SERV_REVENUE) {
      generalServiceRevenue = element.serviceRevenue;
    }
  });

  commComponents.totalServiceRevenue = totalServiceRevenueD
    .toDecimalPlaces(2)
    .toNumber();
  commComponents.generalServiceCommission = calculateGeneralServiceCommission(
    staffID,
    generalServiceRevenue,
    getStaffHurdleForContext,
  );

  let totalCustomServiceCommissionD = new Decimal(0);
  servicesRevenues.forEach((customRateEntry, serviceName) => {
    if (serviceName !== GENERAL_SERV_REVENUE) {
      const commD = new Decimal(customRateEntry.serviceRevenue)
        .times(Number(customRateEntry.customRate))
        .toDecimalPlaces(2);
      commComponents.customRateCommissions[serviceName] = commD.toNumber();
      totalCustomServiceCommissionD = totalCustomServiceCommissionD.plus(commD);
    }
  });

  commComponents.customRateCommission = totalCustomServiceCommissionD
    .toDecimalPlaces(2)
    .toNumber();
  commComponents.totalServiceCommission = sumMoney([
    commComponents.generalServiceCommission,
    commComponents.customRateCommission,
  ]);

  return commComponents;
}

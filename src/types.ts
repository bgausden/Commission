import { GeneralServiceComm } from "./IServiceComm.js";
import { IStaffNames } from "./IStaffNames.js";
import { StaffHurdle } from "./IStaffHurdle.js";
import { ITalenoxStaffInfo } from "./ITalenoxStaffInfo.js";
import { monthNames } from "./constants.js";

export type TStaffName = string;
export type TTips = number;
export type TProductCommission = number;
export type TServiceCommission = number;
export type TServiceRevenue = number;
export type TBaseComm = number;
export type THurdle1Comm = number;
export type THurdle2Comm = number;
export type THurdle3Comm = number;

export type TServiceCommMap = Map<TStaffName, GeneralServiceComm>;
type TCommSimpleComponentTips = "tips";
type TCommSimpleComponentProductCommission = "productCommission";
type TCommSimpleComponentGeneralServiceCommission = "generalServiceCommisison";
export type TCommSimpleComponentsKeys =
  | TCommSimpleComponentTips
  | TCommSimpleComponentProductCommission
  | TCommSimpleComponentGeneralServiceCommission;
export type TCommSimpleComponentsValues =
  | TTips
  | TProductCommission
  | TServiceCommission;
export type TCommSimpleComponents = Record<
  TCommSimpleComponentsKeys,
  TCommSimpleComponentsValues
>;
export type TCustomRateEntry = {
  serviceRevenue: number;
  customRate: number | null;
};

export const COMM_COMPONENT_TOTAL_SERVICE_REVENUE = "totalServiceRevenue";
export const COMM_COMPONENT_TIPS = "tips";
export const COMM_COMPONENT_PRODUCT_COMMISSION = "productCommission";
export const COMM_COMPONENT_GENERAL_SERVICE_COMMISSION =
  "generalServiceCommission";
export const COMM_COMPONENT_CUSTOM_RATE_COMMISSION = "customRateCommission";
export const COMM_COMPONENT_CUSTOM_RATE_COMMISSIONS = "customRateCommissions";
export const COMM_COMPONENT_TOTAL_SERVICE_COMMISSION = "totalServiceCommission";

export type TCommComponentTotalServiceRevenue =
  typeof COMM_COMPONENT_TOTAL_SERVICE_REVENUE;
export type TCommComponentTips = typeof COMM_COMPONENT_TIPS;
export type TCommComponentProductCommission =
  typeof COMM_COMPONENT_PRODUCT_COMMISSION;
export type TCommComponentsGeneralServiceCommission =
  typeof COMM_COMPONENT_GENERAL_SERVICE_COMMISSION;
export type TCommComponentCustomRateCommission =
  typeof COMM_COMPONENT_CUSTOM_RATE_COMMISSION;
export type TCommComponentTotalServiceCommission =
  typeof COMM_COMPONENT_TOTAL_SERVICE_COMMISSION;
export type TCommComponentCustomRateCommissions = {
  [key: string]: TServiceCommission;
};

export type TCommComponents = {
  [key: string]: number | TCommComponentCustomRateCommissions;
  totalServiceRevenue: TServiceRevenue;
  tips: TTips;
  tipsChargeRate: number; // Percentage rate applied (e.g., 0.03 for 3%)
  tipsChargeAmount: number; // Amount deducted from tips
  productCommission: TProductCommission;
  generalServiceCommission: TServiceCommission;
  customRateCommission: TServiceCommission;
  customRateCommissions: TCommComponentCustomRateCommissions;
  totalServiceCommission: TServiceCommission;
};
export type TCommMap = Map<TStaffName, TCommComponents>;
export type TStaffID = string;

// TODO: make this a singleton
export type TStaffMap = Map<TStaffID, IStaffNames>;
export type TTalenoxInfoStaffMap = Map<TStaffID, Partial<ITalenoxStaffInfo>>;

export type TStaffHurdles = {
  [staffID: string]: StaffHurdle;
};

export type TServiceName = string;
export type TServiceCustomRate = number | null;
export type TServRevenueMap = Map<TServiceName, TCustomRateEntry>;

export type monthName = (typeof monthNames)[number];

// Hurdle calculation types
export interface HurdleConfig {
  baseRate: number;
  hurdle1Level: number;
  hurdle1Rate: number;
  hurdle2Level: number;
  hurdle2Rate: number;
  hurdle3Level: number;
  hurdle3Rate: number;
}

export interface HurdleBreakdown {
  baseRevenue: number;
  baseCommission: number;
  hurdle1Revenue: number;
  hurdle1Commission: number;
  hurdle2Revenue: number;
  hurdle2Commission: number;
  hurdle3Revenue: number;
  hurdle3Commission: number;
  totalCommission: number;
}

// Staff payroll data extraction
export interface StaffPayrollData {
  staffID: TStaffID;
  staffName: string;
  tips: number;
  productCommission: number;
  servicesRevenues: TServRevenueMap;
}

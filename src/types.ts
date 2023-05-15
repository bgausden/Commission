import { GeneralServiceComm } from "./GeneralServiceComm"
import { IStaffNames } from "./IStaffNames"
import { StaffHurdle } from "./IStaffHurdle"
import { ITalenoxStaffInfo } from "./ITalenoxStaffInfo"

export type TStaffName = string
export type TTips = number
export type TProductCommission = number
export type TServiceCommission = number
export type TServiceRevenue = number
export type TBaseComm = number
export type THurdle1Comm = number
export type THurdle2Comm = number
export type THurdle3Comm = number

export type TServiceCommMap = Map<TStaffName, GeneralServiceComm>
type TCommSimpleComponentTips = "tips"
type TCommSimpleComponentProductCommission = "productCommission"
type TCommSimpleComponentGeneralServiceCommission = "generalServiceCommisison"
export type TCommSimpleComponentsKeys = TCommSimpleComponentTips | TCommSimpleComponentProductCommission | TCommSimpleComponentGeneralServiceCommission
export type TCommSimpleComponentsValues = TTips | TProductCommission | TServiceCommission
export type TCommSimpleComponents = Record<TCommSimpleComponentsKeys, TCommSimpleComponentsValues>
export type TCustomRateEntry = {
   serviceRevenue: number
   customRate: number | undefined
}

export const COMM_COMPONENT_TOTAL_SERVICE_REVENUE = "totalServiceRevenue"
export const COMM_COMPONENT_TIPS = "tips"
export const COMM_COMPONENT_PRODUCT_COMMISSION = "productCommission"
export const COMM_COMPONENT_GENERAL_SERVICE_COMMISSION = "generalServiceCommission"
export const COMM_COMPONENT_CUSTOM_RATE_COMMISSION = "customRateCommission"
export const COMM_COMPONENT_CUSTOM_RATE_COMMISSIONS = "customRateCommissions"
export const COMM_COMPONENT_TOTAL_SERVICE_COMMISSION = "totalServiceCommission"

export type TCommComponentTotalServiceRevenue = typeof COMM_COMPONENT_TOTAL_SERVICE_REVENUE
export type TCommComponentTips = typeof COMM_COMPONENT_TIPS
export type TCommComponentProductCommission = typeof COMM_COMPONENT_PRODUCT_COMMISSION
export type TCommComponentsGeneralServiceCommission = typeof COMM_COMPONENT_GENERAL_SERVICE_COMMISSION
export type TCommComponentCustomRateCommission = typeof COMM_COMPONENT_CUSTOM_RATE_COMMISSION
export type TCommComponentTotalServiceCommission = typeof COMM_COMPONENT_TOTAL_SERVICE_COMMISSION
export type TCommComponentCustomRateCommissions = {
   [key: string]: TServiceCommission
}

// TODO do we have to support both number and array of CustomRates?
export type CommComponents = {
   [key: string]: number | TCommComponentCustomRateCommissions
   totalServiceRevenue: TServiceRevenue
   tips: TTips
   productCommission: TProductCommission
   generalServiceCommission: TServiceCommission
   customRateCommission: TServiceCommission
   customRateCommissions: TCommComponentCustomRateCommissions
   totalServiceCommission: TServiceCommission
}
export type TCommMap = Map<TStaffName, CommComponents>
export type TStaffID = string

// TODO: make this a singleton
export type TStaffMap = Map<TStaffID, IStaffNames>
export type TTalenoxInfoStaffMap = Map<TStaffID, Partial<ITalenoxStaffInfo>>

export type TStaffHurdles = {
   [key: string]: StaffHurdle
}

export type TServiceName = string
export type TServiceCustomRate = number | null
export type ServiceRevenue = Map<TServiceName, TCustomRateEntry>

export type PayRate = number | undefined
export function isPayRate(data: unknown): data is PayRate {
   return typeof data === "number" && data >= 0 && data <= 1
}
import { GeneralServiceComm } from "./GeneralServiceComm"
import { IndividualStaffHurdle } from "./IStaffHurdle"
import { ITalenoxStaffInfo } from "./ITalenoxStaffInfo"

export type StaffName = string
export type Tips = number
export type ProductCommission = number
export type ServiceCommission = number
export type ServiceRevenue = number

export type ServiceCommMap = Map<StaffName, GeneralServiceComm>
type CommSimpleComponentTips = "tips"
type CommSimpleComponentProductCommission = "productCommission"
type CommSimpleComponentGeneralServiceCommission = "generalServiceCommisison"
export type CommSimpleComponentsKeys = CommSimpleComponentTips | CommSimpleComponentProductCommission | CommSimpleComponentGeneralServiceCommission
export type CommSimpleComponentsValues = Tips | ProductCommission | ServiceCommission
export type CommSimpleComponents = Record<CommSimpleComponentsKeys, CommSimpleComponentsValues>
export type CustomRateEntry = {
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
   [key: string]: ServiceCommission
}

// TODO do we have to support both number and array of CustomRates?
export type CommComponents = {
   [key: string]: number | TCommComponentCustomRateCommissions
   totalServiceRevenue: ServiceRevenue
   tips: Tips
   productCommission: ProductCommission
   generalServiceCommission: ServiceCommission
   customRateCommission: ServiceCommission
   customRateCommissions: TCommComponentCustomRateCommissions
   totalServiceCommission: ServiceCommission
}
export type TCommMap = Map<StaffName, CommComponents>
export type TStaffID = string

// TODO: make this a singleton
// Might use this to store merged name data from Talenox and the spreadsheet
export type TStaffMap = Map<TStaffID, {
   firstName: string
   lastName: string
}>
export type TTalenoxInfoStaffMap = Map<TStaffID, Partial<ITalenoxStaffInfo>>
// export type TTalenoxInfoStaffMap<M extends ITalenoxStaffInfo> = Map<TStaffID, M>

export type TStaffHurdles = {
   [key: string]: IndividualStaffHurdle
}

export type TServiceName = string
export type TServiceCustomRate = number | null
export type BrokenOutServiceRevenue = Map<TServiceName, CustomRateEntry>

export type PayRate = number | undefined

export type CustomPayRate = { [name: string]: PayRate }


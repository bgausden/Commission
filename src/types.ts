import { IServiceComm } from "./IServiceComm"
import { IStaffNames } from "./IStaffNames"
import { StaffHurdle } from "./IStaffHurdle"

export type TStaffName = string
export type TTips = number
export type TProductCommission = number
export type TServiceCommission = number
export type TServiceRevenue = number
export type TBaseComm = number
export type THurdle1Comm = number
export type THurdle2Comm = number
export type THurdle3Comm = number

export type TServiceCommMap = Map<TStaffName, IServiceComm>
type TCommSimpleComponentTips = "tips"
type TCommSimpleComponentProductCommission = "productCommission"
type TCommSimpleComponentGeneralServiceCommission = "generalServiceCommisison"
export type TCommSimpleComponentsKeys = TCommSimpleComponentTips | TCommSimpleComponentProductCommission | TCommSimpleComponentGeneralServiceCommission
export type TCommSimpleComponentsValues = TTips | TProductCommission | TServiceCommission
export type TCommSimpleComponents = Record<TCommSimpleComponentsKeys,TCommSimpleComponentsValues> 
export type TSpecialRateValue = {
   serviceRevenue: number
   customRate: number
}
export type TCommSpecialRateKeys = Record<string,TSpecialRateValue>
// export type TCommComponents = [TTips, TProductCommission, TServiceCommission, TServiceRevenue]

export const COMM_COMPONENT_TOTAL_SERVICE_REVENUE = "totalServiceRevenue"
export const COMM_COMPONENT_TIPS = "tips"
export const COMM_COMPONENT_PRODUCT_COMMISSION = "productCommission"
export const COMM_COMPONENT_GENERAL_SERVICE_COMMISSION = "generalServiceCommission"
export const COMM_COMPONENT_SPECIAL_RATE_COMMISSION = "specialRateCommission"
export const COMM_COMPONENT_SPECIAL_RATE_COMMISSION_SERVICE_REVENUE = "serviceRevenue"
export const COMM_COMPONENT_SPECIAL_RATE_COMMISSION_CUSTOM_RATE = "customRate"

export type TCommComponentTotalServiceRevenue = typeof COMM_COMPONENT_TOTAL_SERVICE_REVENUE
export type TCommComponentTips = typeof COMM_COMPONENT_TIPS
export type TCommComponentProductCommission = typeof COMM_COMPONENT_PRODUCT_COMMISSION
export type TCommComponentsGeneralServiceCommission = typeof COMM_COMPONENT_GENERAL_SERVICE_COMMISSION
export type TCommComponentSpecialRateCommission = {
   [key: string]: { // key is any valid service in MB so cannot be an enum (too many, changes too often)
      serviceRevenue: TServiceRevenue
      customRate: number
   }
}

export type TCommComponents = {
   totalServiceRevenue: TServiceRevenue
   tips: TTips
   productCommission: TProductCommission
   generalServiceCommission: TServiceCommission
   specialRateCommission: {
      [key: string]: { // key is any valid service in MB so cannot be an enum (too many, changes too often)
         serviceRevenue: TServiceRevenue
         customRate: number
      }
   }
}
export type TCommMap = Map<TStaffName, TCommComponents>
export type TStaffID = string

// TODO: make this a singleton
export type TStaffMap = Map<TStaffID, IStaffNames>

export type TStaffHurdles = {
   [key: string]: StaffHurdle
}


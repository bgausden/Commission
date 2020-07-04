/* eslint-disable */
import { IServiceComm } from "./IServiceComm"
import { IStaffNames } from "./IStaffNames"
import { TALENOX_BASE_URL, TALENOX_WHOLE_MONTH } from "./talenox_constants"
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

export type TTalenoxPaymentType = "Commission (Irregular)" | "Tips"| "Others"

export type TServiceCommMap = Map<TStaffName, IServiceComm>
export type TCommSimpleComponentsKeys = "tips" | "productCommission" | "generalServiceCommission"
export type TCommSimpleComponentsValues = TTips | TProductCommission | TServiceCommission
export type TCommSimpleComponents = Record<TCommSimpleComponentsKeys,TCommSimpleComponentsValues> 
export type TSpecialRateValue = {
   serviceRevenue: number,
   customRate: number
}
export type TCommSpecialRateKeys = Record<string,TSpecialRateValue>
// export type TCommComponents = [TTips, TProductCommission, TServiceCommission, TServiceRevenue]
export type TCommComponents = {
   totalServiceRevenue: TServiceRevenue,
   tips: TTips,
   productCommission: TProductCommission,
   generalServiceCommission: TServiceCommission,
   specialRateCommission: {
      [key: string]: {
         serviceRevenue: TServiceRevenue,
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


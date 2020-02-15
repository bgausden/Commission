import { IServiceComm } from "./IServiceComm"
import { IStaffNames } from "./IStaffNames"

export type TStaffName = string
export type TTips = number
export type TProductCommission = number
export type TServiceCommission = number
export type TServiceRevenue = number
export type TRevenueShare = number
export type TBaseComm = number
export type THurdle1Comm = number
export type THurdle2Comm = number
export type THurdle3Comm = number

export type TTalenoxPaymentType = "Commission (Irregular)" | "Tips"

export type TServiceCommMap = Map<TStaffName, IServiceComm>
export type TCommComponents = [TTips, TProductCommission, TServiceCommission, TServiceRevenue, TRevenueShare]
export type TCommMap = Map<TStaffName, TCommComponents>
export type TStaffID = string

// TODO: make this a singleton
export type TStaffMap = Map<TStaffID, IStaffNames>

export type TPoolID = symbol

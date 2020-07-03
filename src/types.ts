/* eslint-disable */
import { IServiceComm } from "./IServiceComm"
import { IStaffNames } from "./IStaffNames"
import { TALENOX_BASE_URL, TALENOX_WHOLE_MONTH } from "./talenox_constants"

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
export type TCommComponents = [TTips, TProductCommission, TServiceCommission, TServiceRevenue]
export type TCommMap = Map<TStaffName, TCommComponents>
export type TStaffID = string

// TODO: make this a singleton
export type TStaffMap = Map<TStaffID, IStaffNames>
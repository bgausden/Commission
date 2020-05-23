/* eslint-disable */
import { TStaffID, TTalenoxPaymentType } from "./types"

export interface ITalenoxPayment {
    staffID: TStaffID
    staffName: string
    type: TTalenoxPaymentType
    amount: number
    remarks: string
}

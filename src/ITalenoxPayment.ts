/* eslint-disable */
import { TStaffID, TTalenoxPaymentType } from "./types"

export interface ITalenoxPayment {
    staffID: TStaffID
    staffName: string
    type: TTalenoxPaymentType | undefined
    amount: number
    remarks: string
}

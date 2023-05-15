import { TStaffID } from "./types"
import { TTalenoxPaymentType } from "./talenox_types";

export interface ITalenoxPayment {
    staffID: TStaffID
    staffName: string
    type: TTalenoxPaymentType
    amount: number
    remarks: string
}

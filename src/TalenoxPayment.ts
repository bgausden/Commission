import { TStaffID } from "./types"
import { TalenoxPaymentType } from "./talenox_types";

export interface TalenoxPayment {
    staffID: TStaffID
    staffName: string
    type: TalenoxPaymentType
    amount: number
    remarks: string
}

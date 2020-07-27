/* eslint-disable @typescript-eslint/interface-name-prefix */
import { TStaffID } from "./types"
import { TTalenoxPaymentType } from "./talenox-types";

export interface ITalenoxPayment {
    staffID: TStaffID
    staffName: string
    type: TTalenoxPaymentType
    amount: number
    remarks: string
}

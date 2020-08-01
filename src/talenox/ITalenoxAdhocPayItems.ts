import { TTalenoxPaymentType } from "./talenox-types"

/* eslint-disable */
export interface ITalenoxAdhocPayItems {
    employee_id?: string | null
    item_type: TTalenoxPaymentType
    remarks?: string
    amount: number
}

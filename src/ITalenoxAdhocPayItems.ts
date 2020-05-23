/* eslint-disable */
import { TTalenoxPaymentType } from "./types.js"
export interface ITalenoxAdhocPayItems {
    employee_id?: string | null
    item_type: TTalenoxPaymentType
    remarks?: string
    amount: number
}

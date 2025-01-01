import { TTalenoxPaymentType } from "./talenox_types.js";

/* eslint-disable */
export interface ITalenoxAdhocPayItems {
    employee_id?: string | null
    item_type: TTalenoxPaymentType
    remarks?: string
    amount: number
}

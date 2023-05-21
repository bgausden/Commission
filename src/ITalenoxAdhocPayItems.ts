import { TalenoxPaymentType } from "./talenox_types"

export interface TalenoxAdhocPayItems {
    // employee_id?: string | null
    employee_id?: string // trying to make employee_id mandatory
    item_type: TalenoxPaymentType
    remarks?: string
    amount: number
}

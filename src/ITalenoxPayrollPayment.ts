/* eslint-disable */
export interface ITalenoxPayroll {
    employee_ids: string[]
    payment: ITalenoxPayrollPayment
}

export interface ITalenoxPayrollPayment {
    year: string
    month: string
    period: string
    pay_group?: string
    with_pay_items: boolean
}

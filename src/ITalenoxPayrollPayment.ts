export interface ITalenoxPayroll {
  employee_ids: string[]
  payment: TalenoxPayrollPayment
}

export interface TalenoxPayrollPayment {
  year: string
  month: string
  period: string
  pay_group?: string | null
  with_pay_items: boolean
}

/*
Parameters
id
Payment ID. If not specified, last payment created by API will be used Example: 12345.
Integer
year
Year of the payment Example: 2018.
Integer
month
Month of the payment Example: September.
String
period
Valid types (Whole Month, 1st Half of Month, 2nd Half of Month) Example: Whole+Month.
String
pay_group
Pay group of the payment if any Example: Finance.
String
employee_id
Employee id Example: 00001.
String
item_type
Type of payment Example: Allowance.
String
amount
Payment amound Example: 1000.
Integer
remarks
Remark of the payment Example: September+allowance.
String
*/
export interface ITalenoxAdHocPayment {
    id?: number | null
    year: string
    month: string
    period: string // One of Whole Month, 1st Half of Month, 2nd Half of Month
    pay_group?: string | null // "Role: contractor" or "Cost Centre: FTE"
}

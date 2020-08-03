import { config } from "node-config-ts"

export const TALENOX_BASE_URL = `www.talenox.com/api/v1/${config.TALENOX_API_TOKEN}`
export const TALENOX_EMPLOYEE_ENDPOINT = `https://${TALENOX_BASE_URL}/employees`
export const TALENOX_PAYROLL_PAYMENT_ENDPOINT = `https://${TALENOX_BASE_URL}/payroll/payroll_payment`

export const TALENOX_WHOLE_MONTH = "Whole Month"
export const TALENOX_1ST_HALF_OF_MONTH = "1st Half of Month"
export const TALENOX_2ND_HALF_OF_MONTH = "2nd Half of Month"

export const TALENOX_COMMISSION_IRREGULAR = "Commission (Irregular)"
export const TALENOX_TIPS = "Tips"
export const TALENOX_OTHERS = "Others"

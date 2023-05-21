/* import ncts from "node-config-ts"
const { config } = ncts */

import {z} from "zod"

// TALENOX_API_TOKEN is loaded into process.env by adding "-r dotenv/config" to the launch command-line (see launch.json)

const schema = z.coerce.string().nonempty()

export const TALENOX_API_TOKEN = schema.parse(process.env.TALENOX_API_TOKEN)
export const TALENOX_BASE_URL = `api.talenox.com/api/v2`
export const TALENOX_EMPLOYEE_ENDPOINT = `https://${TALENOX_BASE_URL}/employees`
export const TALENOX_PAYROLL_PAYMENT_ENDPOINT = `https://${TALENOX_BASE_URL}/payroll/payroll_payment`
export const TALENOX_ADHOC_PAYMENT_ENDPOINT = `https://${TALENOX_BASE_URL}/payroll/adhoc_payment`

export const TALENOX_WHOLE_MONTH = "Whole Month"
export const TALENOX_1ST_HALF_OF_MONTH = "1st Half of Month"
export const TALENOX_2ND_HALF_OF_MONTH = "2nd Half of Month"

export const TALENOX_COMMISSION_IRREGULAR = "Commission (Irregular)"
export const TALENOX_TIPS = "Tips"
export const TALENOX_OTHERS = "Others"


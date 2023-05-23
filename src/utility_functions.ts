import { Appender, FileAppender } from "log4js"
import { config, Config } from "node-config-ts"
import XLSX from "xlsx"
import { z } from "zod"
import { REV_PER_SESS } from "./constants.js"
import { defaultStaffID } from "./index.js"
import staffHurdle from "./staffHurdle.json" assert { type: "json" }
import { CustomPayRate, PayRate, TStaffHurdles, TStaffID } from "./types.js"
import { TalenoxUploadAdHocPaymentsResult } from "./UploadAdHocPaymentsResult.js"


export function readExcelFile(fileName?: string): XLSX.WorkSheet {
  const FIRST_SHEET = 0
  const FILE_PATH = config.PAYROLL_WB_NAME
  const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 }
  const WB = XLSX.readFile(fileName ? fileName : FILE_PATH, READ_OPTIONS)
  const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]]
  return WS
}

export function findRevenueCol(wsArray: unknown[][]): number {
  const MAX_SEARCH_ROWS = Math.max(20, wsArray.length)
  for (let i = 0; i < MAX_SEARCH_ROWS; i++) {
    const rowLength = wsArray[i].length
    for (let j = 0; j < rowLength; j++) {
      const cell = wsArray[i][j]
      if (cell === REV_PER_SESS) {
        return j
      }
    }
  }
  throw new Error("Cannot find Revenue per session column")
}

export function checkRate(rate: unknown): boolean {
  return typeof rate === "number" && rate !== null && !isNaN(rate) && rate >= 0 && rate <= 1
}

/* export function stripToNumeric(n: unknown): number {
  // strip out everything except 0-9, "." and "-"
  const numericOnly = /[^0-9.-]+/g

  if (typeof n === "number") {
    return n
  }

  // parse the number, or return undefined if we can't
  if (typeof n === "string") {
    return parseFloat(n.replace(numericOnly, ""))
  }

  // don't know what n was, so return NaN
  return NaN
} */

/**
 * @function stripToNumeric()
 * @param data 
 * @returns number | throws Error
 */
export function stripToNumeric(data: unknown): number {
  const numericResult = z.coerce.number().safeParse(data)
  if (!numericResult.success) {
    const errorMsg = `Data cannot be coerced to numeric: ${JSON.stringify(numericResult.error.issues)}`
    console.log(errorMsg)
    return NaN
  }
  return numericResult.data
}

/**
 * Checks if the staff member with the given staff ID is paid via Talenox.
 * @function isPayViaTalenox
 * @param {TStaffID} staffID - The staff ID of the staff member to check.
 * @returns {boolean} - Returns true if the staff member is paid via Talenox, false otherwise.
 * @throws {Error} - Throws an error if the staff member is missing from staffHurdle.json and missingStaffAreFatal is true, or if the staff member has no payViaTalenox property.
 * @see https://stackoverflow.com/questions/55377365/what-does-keyof-typeof-mean-in-typescript
 */
export function isPayViaTalenox(staffID: TStaffID): boolean {
  if (!(staffID in staffHurdle) && config.missingStaffAreFatal === true) {
    throw new Error(`StaffID ${staffID} found in Payroll report but is missing from staffHurdle.json`)
  }
  if (!(staffID in staffHurdle) && config.missingStaffAreFatal === false) {
    console.warn(`Warning: staffID ${staffID} is missing from staffHurdle.json`)
    return false
  }
  if (!("payViaTalenox" in (staffHurdle[staffID as keyof typeof staffHurdle]))) {
    throw new Error(`${staffID} has no payViaTalenox property.`)
  }
  return "payViaTalenox" in staffHurdle[staffID as keyof typeof staffHurdle]
}

export function eqSet(as: unknown[], bs: unknown[]): boolean {
  if (as.length !== bs.length) return false
  for (const a of as) if (!bs.includes(a)) return false
  return true
}

export function isContractor(staffID: TStaffID): boolean {
  let isContractor = false
  if (!(staffHurdle as TStaffHurdles)[staffID]) {
    staffID = defaultStaffID
  }
  if (Object.keys((staffHurdle as TStaffHurdles)[staffID]).indexOf("contractor")) {
    isContractor = (staffHurdle as TStaffHurdles)[staffID].contractor ? true : false
  }
  return isContractor
}

export function payrollStartDate(config: Config): Date {
  const payrollFirstDay = new Date(Date.parse(`01 ${config.PAYROLL_MONTH} ${config.PAYROLL_YEAR}`))
  return payrollFirstDay
}

export function isString(data: unknown): data is string {
  return typeof data === 'string';
}

export function isPayRate(data: unknown): data is PayRate {
  return typeof data === "number" && data !== null && !isNaN(data) && data >= 0 && data <= 1
}

export function isNumber(data: unknown): data is number {
  return typeof data === "number" && data !== null
}

export function isUndefined(data: unknown): data is undefined {
  return typeof data === "undefined"
}

export function isObject(data: unknown): data is object {
  return typeof data === "object" && data !== null
}

export function isTalenoxUploadAdHocPaymentsResult(data: unknown): data is TalenoxUploadAdHocPaymentsResult {
  const paymentSchema = z.object({
    payment_id: z.number(),
    month: z.string(),
    year: z.number(),
    period: z.string(),
    pay_group: z.string(),
    message: z.string()
  }).strict()
  return paymentSchema.safeParse(data).success
}

/**
 * @function isFileAppender()
 * @param appender 
 * @returns assert appender is FileAppender
 * 
 * @summary type guard to assert that an appender is a FileAppender
 * @description some Appenders are FileAppenders. The "file" property identifies an Appender as a FileAppender
 * @see https://log4js-node.github.io/log4js-node/interfaces/fileappender.html
 */
export function isFileAppender(appender: Appender): appender is FileAppender {
  return appender.type === 'file'
}

/**
 * @function isCustomPayRate()
 * @param obj 
 * @returns assert obj is CustomPayRate
 * 
 * @summary type guard to assert that an object is a CustomPayRate
 * @description a CustomPayRate is an object with string keys (service names) and rate values between 0 and 1 (% payrate)
 * @see https://github.com/vriad/zod/blob/main/examples/record.ts
 */
export function isCustomPayRate(obj: object): obj is CustomPayRate {
  const customPayRateSchema = z.record(z.string(), z.number().min(0).max(1))
  return customPayRateSchema.safeParse(obj).success
}
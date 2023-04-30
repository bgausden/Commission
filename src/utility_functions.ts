import staffHurdle from "./staffHurdle.json" assert { type: "json" }
import { TStaffID, TStaffHurdles, PayRate } from "./types.js"
import { defaultStaffID } from "./index.js"
import { config, Config } from "node-config-ts"

export function checkRate(rate: unknown): boolean {
  return typeof rate === "number" && rate !== null && !isNaN(rate) && rate >= 0 && rate <= 1
}

export function stripToNumeric(n: unknown): number {
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
}

export function isPayViaTalenox(staffID: TStaffID): boolean {
  if ((staffHurdle as TStaffHurdles)[staffID] === undefined) {
    if (config.missingStaffAreFatal === true) {
      throw new Error(`StaffID ${staffID} found in Payroll report but is missing from staffHurdle.json`)
    } else {
      console.warn(`Warning: staffID ${staffID} is missing from staffHurdle.json`)
    }
  }

  if (!("payViaTalenox" in (staffHurdle as TStaffHurdles)[staffID])) {
    throw new Error(`${staffID} has no payViaTalenox property.`)
  }
  return (staffHurdle as TStaffHurdles)[staffID].payViaTalenox ? true : false
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
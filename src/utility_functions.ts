import { config, Config } from "node-config-ts"
import XLSX from "xlsx"
import { REV_PER_SESS } from "./constants.js"
import { defaultStaffID } from "./index.js"
import staffHurdle from "./staffHurdle.json" assert { type: "json" }
import { PayRate, TStaffHurdles, TStaffID } from "./types.js"


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

export function isUndefined(data: unknown): data is undefined {
  return typeof data === "undefined"
}
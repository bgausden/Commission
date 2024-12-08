import fs from 'node:fs'
import { type StaffHurdle } from './IStaffHurdle.js'
import { TStaffHurdles } from './types.js'

const DEFAULT_PAYMENTS_DIR = 'payments' as const
const DEFAULT_LOGS_DIR = 'logs' as const
const DEFAULT_DATA_DIR = 'data' as const
const DEFAULT_OLD_DIR = 'old' as const
const DEFAULT_CONTRACTOR_LOGFILE = 'contractor.log'
const DEFAULT_COMMISSION_LOGFILE = 'commission.log'

const defaultStaffID = '000'

/* function loadJsonFromFile<T>(filepath: string): T {
  const fileContent = fs.readFileSync(filepath, 'utf-8')
  return JSON.parse(fileContent as string) as T
} */

//const staffHurdles = loadJsonFromFile<TStaffHurdles>(DEFAULT_STAFF_HURDLES_FILE)

const defaultLog4jsConfigFile = 'log4js.json'

const DEFAULT_STAFF_HURDLES_FILE = 'dist/staffHurdle.json'

export {
  DEFAULT_DATA_DIR,
  DEFAULT_LOGS_DIR,
  DEFAULT_PAYMENTS_DIR,
  DEFAULT_OLD_DIR,
  defaultStaffID,
  defaultLog4jsConfigFile,
  DEFAULT_COMMISSION_LOGFILE,
  DEFAULT_CONTRACTOR_LOGFILE,
  DEFAULT_STAFF_HURDLES_FILE,
}

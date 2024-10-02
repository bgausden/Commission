//import staffHurdle from './staffHurdle.json' with { type: 'json' }
import { TStaffID, TStaffHurdles } from './types.js'
import { defaultStaffID, staffHurdle } from './index.js'
import { config, Config } from 'node-config-ts'
import { Configuration } from 'log4js'
import * as fs from 'fs'
import { debugLogger, warnLogger } from './logging_functions.js'
import { DEFAULT_OLD_DIR } from './constants.js'
import * as zlib from 'zlib'
import path from 'path'

export function checkRate(rate: unknown): boolean {
  if (typeof rate === 'number') {
    if (0 <= rate && rate <= 1) {
      return true
    } else {
      return false
    }
  } else {
    return false
  }
}

export function stripToNumeric(n: unknown): number {
  const numericOnly = /[^0-9.-]+/g
  let x: number
  if (typeof n === 'string') {
    // strip out everything except 0-9, "." and "-"
    x = parseFloat(n.replace(numericOnly, ''))
    if (isNaN(x)) {
      x = 0
    }
  }
  if (typeof n === 'number') {
    x = n
  } else {
    x = 0
  }
  return x
}

export function isPayViaTalenox(staffID: TStaffID): boolean {
  if ((staffHurdle as TStaffHurdles)[staffID] === undefined) {
    if (config.missingStaffAreFatal === true) {
      throw new Error(`StaffID ${staffID} found in Payroll report but is missing from staffHurdle.json`)
    } else {
      console.warn(`Warning: staffID ${staffID} is missing from staffHurdle.json`)
    }
  }

  if (!('payViaTalenox' in (staffHurdle as TStaffHurdles)[staffID])) {
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
  if (Object.keys((staffHurdle as TStaffHurdles)[staffID]).indexOf('contractor')) {
    isContractor = (staffHurdle as TStaffHurdles)[staffID].contractor ? true : false
  }
  return isContractor
}

export function payrollStartDate(config: Config): Date {
  const payrollFirstDay = new Date(Date.parse(`01 ${config.PAYROLL_MONTH} ${config.PAYROLL_YEAR}`))
  return payrollFirstDay
}

export function isLog4JsConfig(config: unknown): config is Configuration {
  return (<Configuration>config).appenders !== undefined && (<Configuration>config).categories !== undefined
}

export function isValidDirectory(dir: string): boolean {
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory()
}

/**
 * Moves files from a source directory to a destination directory.
 * Optionally compresses the files and retains a specified number of most recently modified files.
 *
 * @param sourceDir - The source directory from which to move the files.
 * @param destDir - The destination directory to move the files to. Defaults to DEFAULT_OLD_DIR. Is relative to sourceDir.
 * @param compressFiles - Specifies whether to compress the files before moving them. Defaults to false.
 * @param retainCount - The number of most recently modified files to retain. Defaults to 0.
 */
export function moveFilesToOldDir(
  sourceDir: string,
  destDir = DEFAULT_OLD_DIR,
  compressFiles = false,
  retainCount = 0
): void {
  if (!isValidDirectory(sourceDir)) {
    warnLogger.warn(`Unable to move files. Invalid source directory: ${sourceDir}`)
    return
  }

  const logFiles = fs.readdirSync(sourceDir)

  const targetDir = path.join(sourceDir, destDir)

  if (!isValidDirectory(targetDir)) {
    warnLogger.warn(`Unable to move files. Invalid target directory: ${targetDir}`)
    return
  }

  let filesToRetain: string[] = []
  if (retainCount > 0) {
    filesToRetain = getMostRecentlyModifiedFiles(sourceDir, retainCount)
  }

  logFiles.forEach((file) => {
    const filePath = `${sourceDir}/${file}`
    const newFilePath = `${targetDir}/${file}`
    if (file !== destDir && !filesToRetain.includes(file)) {
      if (compressFiles) {
        // Compress the file
        const compressedFilePath = `${newFilePath}.gz`
        const readStream = fs.createReadStream(filePath)
        const writeStream = fs.createWriteStream(compressedFilePath)
        writeStream.on('finish', () => {
          fs.unlinkSync(filePath)
          writeStream.close()
        })
        const gzip = zlib.createGzip()
        readStream.pipe(gzip).pipe(writeStream)
        // Clean-up and closing stream handled by writeStream.on('finish')
      } else {
        // Move the file without compression
        fs.renameSync(filePath, newFilePath)
        debugLogger.debug(`Moved ${filePath} to ${newFilePath}`)
      }
    }
  })
}

export function getMostRecentlyModifiedFiles(dir: string, count = 3) {
  const files = fs.readdirSync(dir)
  const stats = files.map((file) => ({
    file,
    stats: fs.statSync(path.join(dir, file)),
  }))

  const sortedFiles = stats
    .filter(({ stats }) => stats.isFile())
    .sort((a, b) => b.stats.mtime.valueOf() - a.stats.mtime.valueOf())
    .slice(0, count)

  return sortedFiles.map(({ file }) => file)
}

export function loadJsonFromFile(filepath: string): any {
  const fileContent = fs.readFileSync(filepath, 'utf-8')
  return JSON.parse(fileContent)
}

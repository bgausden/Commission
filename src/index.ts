/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-var-requires */

/* eslint-disable @typescript-eslint/prefer-regexp-exec */
/* eslint-disable @typescript-eslint/camelcase */
// TODO Implement pooling of service and product commissions, tips for Ari and Anson
// TODO Investigate why script can't be run directly from the dist folder (has to be run from dist/.. or config has no value)
/* TODO add support for hourly wage staff:
Gausden, ElizabethStaff ID #: 048 									
Hourly Pay (38.2775 hours @ HK$&nbsp;40/hr):								1,531.10	
Sales Commission:									36
      # Services	# Clients	# Comps	Base Earnings		Earnings	
Total for Gausden, Elizabeth			0	0	0	HK$ 0		1,567.10	
*/
/* TODO fix rounding for pay calculated from custom pay rates
Extensions - Application:   28152.000000000004
*/
// TODO fix catching staff missing from staffhurdle.json
// TODO Fix warning that staff are not paid via Talenox appearing in wrong place in log.
// TODO place payments spreadsheets into a "payments" folder
// TODO remove --experimental-json-modules in favour of approach in logging_functions. ts --> const log4jsConfig: Configuration = JSON.parse(await readFile(new URL(`./${log4jsConfigFile}`, import.meta.url), { encoding: 'utf-8' }))
// TODO move payments xlsx files to new directory "payment sheets" so not in root

import ncts from "node-config-ts"
const { config } = ncts
// import prettyjson from "prettyjson"
import XLSX from "xlsx"
import { StaffInfo } from "./IStaffInfo"
import staffHurdle from "./staffHurdle.json"
import { ITalenoxPayment } from "./ITalenoxPayment"
import { GeneralServiceComm } from "./IServiceComm"
import { StaffCommConfig } from "./IStaffCommConfig"
import {
  TStaffID,
  TServiceCommMap,
  TCommComponents,
  TStaffName,
  TServiceRevenue,
  TCommMap,
  TStaffHurdles,
  TCustomRateEntry,
  TServRevenueMap,
  TServiceName,
  TTalenoxInfoStaffMap,
} from "./types.js"
import { StaffHurdle } from "./IStaffHurdle"
import { createAdHocPayments, getTalenoxEmployees, createPayroll, uploadAdHocPayments, firstDay } from "./talenox_functions.js"
import { checkRate, stripToNumeric, isPayViaTalenox, eqSet, isContractor } from "./utility_functions.js"
//import { initDebug, log, warn, error } from "./debug_functions.js"
import { contractorLogger, commissionLogger, warnLogger, errorLogger, debugLogger, shutdownLogging } from "./logging_functions.js"
import { fws32Left, fws12RightHKD, fws12Right } from "./string_functions.js"

// const FILE_PATH: string = "Payroll Report.xlsx";
const FILE_PATH = config.PAYROLL_WB_NAME

const SERVICE_ROW_REGEX = /(.*) Pay Rate: (.*) \((.*)%\)/i

const SERVICE_TYPE_INDEX = 2

const FIRST_SHEET = 0

const STAFF_ID_HASH = "Staff ID #:"
const TOTAL_FOR = "Total for "
const TIPS_FOR = "Tips:"
const COMM_FOR = "Sales Commission:"
const REV_PER_SESS = "Rev. per Session"

const BASE_RATE = "baseRate"
const HURDLE_1_LEVEL = "hurdle1Level"
const HURDLE_2_LEVEL = "hurdle2Level"
const HURDLE_3_LEVEL = "hurdle3Level"
// const POOLS_WITH = "poolsWith"

const GENERAL_SERV_REVENUE = "General Services"

/* const REX_WONG_ID = "019" */

/* const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 }
const WB = XLSX.readFile(FILE_PATH, READ_OPTIONS)
const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]] */
const commMap: TCommMap = new Map<TStaffID, TCommComponents>()
// const staffMap: TStaffMap = new Map<TStaffID, IStaffNames>()
const serviceCommMap: TServiceCommMap = new Map<TStaffName, GeneralServiceComm>()
const emptyServComm: GeneralServiceComm = {
  staffName: "",
  base: { baseCommRevenue: 0, baseCommRate: 0, baseCommAmt: 0 },
  hurdle1: {
    hurdle1PayOut: 0,
    hurdle1Level: 0,
    hurdle1Rate: 0,
    hurdle1Revenue: 0,
  },
  hurdle2: {
    hurdle2Payout: 0,
    hurdle2Level: 0,
    hurdle2Rate: 0,
    hurdle2Revenue: 0,
  },
  hurdle3: {
    hurdle3Payout: 0,
    hurdle3Level: 0,
    hurdle3Rate: 0,
    hurdle3Revenue: 0,
  },
  generalServiceComm: 0,
  generalServiceRevenue: 0,
}

export const defaultStaffID = "000"

function readExcelFile(fileName?: string): XLSX.WorkSheet {
  const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 }
  const WB = XLSX.readFile(fileName ? fileName : FILE_PATH, READ_OPTIONS)
  const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]]
  return WS
}

function revenueCol(wsArray: unknown[][]): number {
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

function getStaffIDAndName(wsArray: unknown[][], idRow: number): StaffInfo | null {
  /*     assume the staffID can be found in the STAFF_ID_COL column.
    staffID will begin with "ID#: " the will need to be stored  in the serviceCommMap and
    commComponents maps along with First and Last name.
    First column should contain a string similar to LastName, FirstName Staff ID #: StaffID
 */

  const firstNameIndex = 1
  const lastNameIndex = 0
  const staffNameIndex = 0
  const staffIDIndex = 1
  // eslint:disable-next-line: no-shadowed-variable

  const testString = wsArray[idRow][staffNameIndex]
  const regex = new RegExp("^.*,.*" + STAFF_ID_HASH)
  if (regex.test(testString as string)) {
    /* Split the name and ID string into an array ["Surname, Firstname", ID] */
    const staffInfo: string[] | undefined =
      testString !== undefined ? (testString as string).split(STAFF_ID_HASH) : undefined
    if (staffInfo !== undefined) {
      if (staffInfo[staffIDIndex].trim() === "") {
        // Missing Staff ID in MB?
        throw new Error(
          `${staffInfo[staffNameIndex].split(",")[1]} ${staffInfo[staffNameIndex].split(",")[0]
          } does not appear to have a Staff ID in MB`
        )
      }
      return {
        /* Everything OK, split the name in staffInfo[0] into Surname and First Name */
        firstName: staffInfo[staffNameIndex].split(",")[firstNameIndex].trim(),
        lastName: staffInfo[staffNameIndex].split(",")[lastNameIndex].trim(),
        staffID: staffInfo[staffIDIndex].trim(),
      }
    } else {
      return null
    }
  } else {
    // could legit be that we're on a line with no Staff ID#: string
    return null
  }
}

/**
 * @function getServicesRevenue - buckets revenue by custom pay-rate. One bucket is a catch-all
 * @param {any[][]} wsArray - array representing the worksheet
 * @param {number} currentTotalRow - row number for last found "Total for" row in the worksheet
 * @param {number} currentStaffIDRow - row number for the last found "Staff ID" row in the worksheet
 * @param {number} revCol - column containing the services revenue
 * @param {TStaffID} staffID - ID for the member of staff for whom we are calculating revenues/comms
 */

function getServiceRevenues(
  wsArray: unknown[][],
  currentTotalRow: number,
  // tslint:disable-next-line: no-shadowed-variable
  currentStaffIDRow: number,
  // tslint:disable-next-line: no-shadowed-variable
  revCol: number,
  staffID: TStaffID
): TServRevenueMap {
  /*
    Starting on the staff member's first row, sum all the numeric values in the revenue column
    down as far as the staff member's totals row + 1. Use this as the service revenue so we can ignore
    how staff commissions are configured in MB.
    Note we are offsetting backwards from the Totals row and reducing the offset each iteration - so we're actually
    working our way down the sheet from top to bottom.
    */
  const numSearchRows = currentTotalRow - currentStaffIDRow - 1
  const revColumn = revCol
  const servRevenueMap: TServRevenueMap = new Map<TServiceName, TCustomRateEntry>()
  let serviceRevenue = 0
  let customRate = null
  let sh = undefined
  if ((staffHurdle as TStaffHurdles)[staffID]) {
    sh = (staffHurdle as TStaffHurdles)[staffID]
  } else {
    warnLogger.warn(`Warning: Staff ID ${staffID} is not present in staffHurdle.json`)
    sh = (staffHurdle as TStaffHurdles)[defaultStaffID]
  }
  // const sh = (staffHurdle as TStaffHurdles)[staffID] ? (staffHurdle as TStaffHurdles)[staffID] : (staffHurdle as TStaffHurdles)[defaultStaffID]
  if (!sh) {
    errorLogger.error(`Error: Staff ID ${staffID} is not present and there is no default with ID 000 in staffHurdle.json`)
    process.exit(1)
  }
  const customPayRates = sh ? sh.customPayRates : []
  // const customPayRates = Object.prototype.hasOwnProperty.call(sh, "customPayRates") ? sh["customPayRates"] : null
  //const customPayRates = sh.customPayRates ?? []
  let servName: TServiceName = GENERAL_SERV_REVENUE
  for (let i = numSearchRows; i >= 1; i--) {
    /*   first iteration should place us on a line beginning with "Hair Pay Rate: Ladies Cut and Blow Dry (55%)" or similar
          i.e. <revenue category> Pay Rate: <service name> (<commission rate>)
    */
    const v = wsArray[currentTotalRow - i][0] || ""
    const match = (v as string).match(SERVICE_ROW_REGEX) || null // regex is something like /(.*) Pay Rate: (.*) \((.*)%\)/i
    /*
        Found a row that looks similar to:
        Hair Pay rate: Ladies Cut and Blow Dry (55%) 
        where match[0] = Hair, match[1]=Ladies Cut and Blow Dry and match[2]=55
        */
    if (match) {
      // Have a section header for a block of services
      servName = match[SERVICE_TYPE_INDEX]
      // check if we have special rates for this servType
      customRate = null
      if (customPayRates) {
        customPayRates.forEach((customPayRate) => {
          for (const serviceWithCustomPayRate in customPayRate) {
            if (Object.prototype.hasOwnProperty.call(customPayRate, serviceWithCustomPayRate)) {
              if (servName === serviceWithCustomPayRate) {
                customRate = customPayRate[serviceWithCustomPayRate] || 0
                break
              }
            }
          }
        })
      }
      if (!customRate) {
        servName = GENERAL_SERV_REVENUE // catch-all servType for everything without a custom pay-rate
        customRate = null
      }
      if (!servRevenueMap.get(servName)) {
        serviceRevenue = 0
        servRevenueMap.set(servName, { serviceRevenue, customRate })
      }
    }
    let revenueCellContents = wsArray[currentTotalRow - i][revColumn]
    if (revenueCellContents !== undefined) {
      revenueCellContents = stripToNumeric(revenueCellContents)
      /*             if (typeof revenueCellContents === "string") {
                revenueCellContents = stripToNumeric(revenueCellContents)
             } else {
                if (typeof revenueCellContents === "number") {
                    // all good
                }
             } */
      if (typeof revenueCellContents === "number" && revenueCellContents > 0) {
        serviceRevenue = revenueCellContents
        // accumulate the serv revenues for this servType in the map
        const serviceRevenueEntry = servRevenueMap.get(servName)
        if (serviceRevenueEntry) {
          // customRate = custom.customRate
          // custom = [custom[0] + revenueCellContents, custom[1]]
          //servRevenueMap.set(servType, custom)
          serviceRevenue += serviceRevenueEntry.serviceRevenue
          servRevenueMap.set(servName, { serviceRevenue, customRate })
        } else {
          throw new Error(`Did not find ${servName} in servRevenueMap. This should never happen.`)
        }
      }
    }
  }
  return servRevenueMap
}

function calcGeneralServiceCommission(
  staffID: TStaffID,
  staffMap: TTalenoxInfoStaffMap,
  serviceRev: TServiceRevenue
): number {
  /* iterate through commissionComponents
    for each entry, locate corresponding hurdles and then calculate amounts payable for base rate (0 for most staff) and then from each hurdle to the next store the amounts payable in a new Map where the key is the staff name and the value is an array containing
    [baseCommission, hurdle1Commission, hurdle2Commission]
    Where staff are pooling their income, these amounts will be their equal share of what has gone into their pool (TODO) */
  let totalServiceComm: number
  const sh = staffHurdle as TStaffHurdles // get an iterable version of the staffHurdle import
  // TODO review if we really need shm or could simply use the import staffHurdle directly
  const shm = new Map<TStaffID, StaffHurdle>()
  // TODO Do we really need to build a new map from the entirety of the staff hurdle object? Surely need only this staff member
  // Object.keys(sh).forEach((k) => shm.set(k, sh[k])) // iterate through staffHurdle and build a Map
  if (sh[staffID]) {
    shm.set(staffID, sh[staffID])
  } else {
    shm.set(staffID, sh[defaultStaffID])
  }
  // cm.forEach((commComponents, staffID) => {
  // const commComponents = cm.get(staffID)!;
  if (shm.has(staffID)) {
    // we have a matching prop in staffHurdle for the current payroll key

    // clone emptyServiceComm as a temp we can fill and then add to the serviceCommMap
    const tempServComm: GeneralServiceComm = {
      ...emptyServComm,
      base: { ...emptyServComm.base },
      hurdle1: { ...emptyServComm.hurdle1 },
      hurdle2: { ...emptyServComm.hurdle2 },
      hurdle3: { ...emptyServComm.hurdle3 },
    }
    // const serviceRev = commComponents[SERV_COMM_INDEX];
    let tempStaffCommConfig: unknown = shm.get(staffID)
    let staffCommConfig: StaffCommConfig
    if (tempStaffCommConfig) {
      staffCommConfig = tempStaffCommConfig as StaffCommConfig
    } else {
      //throw new Error(`Missing staff commission config for StaffID: ${staffID}`)
      tempStaffCommConfig = shm.get(defaultStaffID)
      staffCommConfig = tempStaffCommConfig as StaffCommConfig
    }
    let baseRevenue = 0
    let baseRate = 0
    let hurdle1Revenue = 0
    let hurdle1Level = 0
    let hurdle1Rate = 0
    let hurdle2Revenue = 0
    let hurdle2Level = 0
    let hurdle2Rate = 0
    let hurdle3Revenue = 0
    let hurdle3Level = 0
    let hurdle3Rate = 0

    if (Object.prototype.hasOwnProperty.call(staffCommConfig, BASE_RATE)) {
      // if (staffCommConfig.hasOwnProperty(BASE_RATE)) {
      baseRate = stripToNumeric(staffCommConfig.baseRate)
      if (!checkRate(baseRate)) {
        throw new Error("Invalid baseRate")
      }
    }

    if (Object.prototype.hasOwnProperty.call(staffCommConfig, HURDLE_1_LEVEL)) {
      hurdle1Level = stripToNumeric(staffCommConfig.hurdle1Level)
      hurdle1Rate = stripToNumeric(staffCommConfig.hurdle1Rate)
      if (!checkRate(hurdle1Rate)) {
        errorLogger.error(`Fatal: Error with ${staffID}'s commission config in staffHurdle.json`)
        throw new Error("Invalid hurdle1Rate")
      }
    }

    if (Object.prototype.hasOwnProperty.call(staffCommConfig, HURDLE_2_LEVEL)) {
      hurdle2Level = stripToNumeric(staffCommConfig.hurdle2Level)
      hurdle2Rate = stripToNumeric(staffCommConfig.hurdle2Rate)
      if (!checkRate(hurdle2Rate)) {
        errorLogger.error(`Fatal: Error with ID ${staffID}'s commission config in staffHurdle.json`)
        throw new Error("Invalid hurdle2Rate")
      }
    }

    if (Object.prototype.hasOwnProperty.call(staffCommConfig, HURDLE_3_LEVEL)) {
      hurdle3Level = stripToNumeric(staffCommConfig.hurdle3Level)
      hurdle3Rate = stripToNumeric(staffCommConfig.hurdle3Rate)
      if (!checkRate(hurdle3Rate)) {
        errorLogger.error(`Fatal: Error with ${staffID}'s commission config in staffHurdle.json`)
        throw new Error("Invalid hurdle3Rate")
      }
    }
    // TODO get rid of this nesting logic
    if (hurdle1Level <= 0) {
      // no hurdle. All servicesRev pays comm at baseRate
      baseRevenue = serviceRev
      /* remove?
                hurdle1Revenue = 0;
                hurdle1Level = 0;
                hurdle2Revenue = 0;
                hurdle2Level = 0; */
    } else {
      // there is a hurdle1
      baseRevenue = Math.round(Math.max(serviceRev - hurdle1Level, 0) * 100) / 100
      if (serviceRev > hurdle1Level) {
        if (hurdle2Level > 0) {
          // service revenue  that falls between hurdle1 and hurdle2 generate comm at the hurdle1 Rate
          hurdle1Revenue = Math.round(Math.min(serviceRev - hurdle1Level, hurdle2Level - hurdle1Level) * 100) / 100
          if (serviceRev > hurdle2Level) {
            if (hurdle3Level > 0) {
              // have  a hurdle3
              /* revenue applicable to hurdle2 is either the amount of service revenue above
                                hurdle2 or if the revenue exceeds hurdle3, the amount of revenue equal to
                                the difference between hurdle3 and hurdle2 */
              hurdle2Revenue = Math.round(Math.min(serviceRev - hurdle2Level, hurdle3Level - hurdle2Level) * 100) / 100
              if (serviceRev > hurdle3Level) {
                hurdle3Revenue = Math.round((serviceRev - hurdle3Level) * 100) / 100
              } else {
                // service revenue doesn't exceed hurdle3. All rev above hurdle 2 is hurdle2Revenue
                hurdle2Revenue = Math.round((serviceRev - hurdle2Level) * 100) / 100
              }
            } else {
              // no hurdle3level so all revenue above hurdle2 generates comm at the hurdle2 rate
              hurdle2Revenue = Math.round((serviceRev - hurdle2Level) * 100) / 100
            }
          } else {
            // service revenue doesn't exceed hurdle2
            hurdle1Revenue = Math.round((serviceRev - hurdle1Level) * 100) / 100
          }
        } else {
          // no hurdle2 so all revenue above hurdle1 generates comm at the hurdle1 rate
          hurdle1Revenue = Math.round(((serviceRev - hurdle1Level) * 100) / 100)
        }
      } else {
        hurdle1Revenue = 0
      }
    }

    /*  
        Note: This special comission structure was removed in the 2021 September payroll
        
        Rex 019 has a special legacy arrangement. If he hits 100k in Service Revenue
        his commission is calculated at hurdle2 rate applied to total Service Revenue 
        ( not just the revenue between hurdle1 and hurdle2)
        */

    /*     if (staffID === REX_WONG_ID && serviceRev > hurdle2Level) {
          const monthlySalary = hurdle1Level * hurdle1Rate // back out salary instead of hard-coding
          hurdle1Revenue = 0
          hurdle2Revenue = serviceRev - monthlySalary / hurdle2Rate // monthlySalary / hurdle2Rate will pay out at $monthlySalary
          hurdle3Revenue = 0
          commissionLogger.warn("Rex 019 has a special legacy pay scheme. See Sioban")
        }
     */
    // no hurdles so work out how much they receive in comm by applying base rate to entire services revenue

    // TODO: sum and set servicesComm once we have all the components.
    // const servicesComm = servicesRev * baseRate;
    // commComponents is an array containing [tips, productCommission, serviceCommission]
    // commComponents[serviceCommissionIndex] = servicesComm;

    const staffName = staffMap.get(staffID)

    tempServComm.staffName = `${staffName?.last_name} ${staffName?.first_name}`
    tempServComm.generalServiceRevenue = serviceRev

    tempServComm.base.baseCommRevenue = baseRevenue
    tempServComm.base.baseCommRate = baseRate
    const baseCommPayout = baseRevenue * baseRate
    tempServComm.base.baseCommAmt = Math.round(baseCommPayout * 100) / 100

    tempServComm.hurdle1.hurdle1Revenue = hurdle1Revenue
    tempServComm.hurdle1.hurdle1Level = hurdle1Level
    tempServComm.hurdle1.hurdle1Rate = hurdle1Rate
    const hurdle1Payout = hurdle1Revenue * hurdle1Rate
    tempServComm.hurdle1.hurdle1PayOut = Math.round(hurdle1Payout * 100) / 100

    tempServComm.hurdle2.hurdle2Revenue = hurdle2Revenue
    tempServComm.hurdle2.hurdle2Level = hurdle2Level
    tempServComm.hurdle2.hurdle2Rate = hurdle2Rate
    const hurdle2Payout = hurdle2Revenue * hurdle2Rate
    tempServComm.hurdle2.hurdle2Payout = Math.round(hurdle2Payout * 100) / 100

    tempServComm.hurdle3.hurdle3Revenue = hurdle3Revenue
    tempServComm.hurdle3.hurdle3Level = hurdle3Level
    tempServComm.hurdle3.hurdle3Rate = hurdle3Rate
    const hurdle3Payout = hurdle3Revenue * hurdle3Rate
    tempServComm.hurdle3.hurdle3Payout = Math.round(hurdle3Payout * 100) / 100

    totalServiceComm = Math.round((baseCommPayout + hurdle1Payout + hurdle2Payout + hurdle3Payout) * 100) / 100
    tempServComm.generalServiceComm = totalServiceComm

    serviceCommMap.set(staffID, tempServComm)

    // log(prettyjson.render(serviceCommMap.get(staffID)))
  } else {
    throw new Error(`${staffID} doesn't appear in staffHurdle.json (commission setup file)`)
  }
  // });

  return totalServiceComm
}

function writePaymentsWorkBook(payments: ITalenoxPayment[]): void {
  const paymentsWB = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    paymentsWB,
    XLSX.utils.json_to_sheet(payments, { skipHeader: true }),
    config.PAYMENTS_WS_NAME
  )
  XLSX.writeFile(paymentsWB, config.PAYMENTS_WB_NAME)
}

function doPooling(commMap: TCommMap, staffHurdle: TStaffHurdles, talenoxStaff: TTalenoxInfoStaffMap): void {
  let poolCounter = 0
  const pools = new Map<number, TStaffID[]>()
  Object.entries(staffHurdle).forEach((element) => {
    const [staffID, hurdle] = element
    const poolingWith = hurdle.poolsWith
    if (poolingWith && poolingWith.length > 0) {
      let foundPoolID: number | undefined
      let foundPoolMembers: TStaffID[] | undefined
      for (const pool of pools) {
        const [poolID, poolingStaff] = pool
        if (poolingStaff.includes(staffID)) {
          if (foundPoolID) {
            if (foundPoolMembers && !eqSet(poolingStaff, foundPoolMembers)) {
              // Already appear in another pool. Something's broken
              throw new Error(`${staffID} appears to be a member of two `)
            }
          } else {
            // make sure this pool contains everyone we think we pool with
            // if not, the staffHurdle.json is incorrect
            poolingWith.push(staffID)
            if (eqSet(poolingStaff, poolingWith)) {
              foundPoolID = poolID
              foundPoolMembers = poolingStaff
            } else {
              throw new Error(`Pooling config for ${staffID} appears to be incorrect.`)
            }
          }
        }
      }
      // Now set the pool if !foundPoolID
      if (foundPoolID === undefined) {
        poolingWith.push(staffID)
        pools.set(poolCounter, poolingWith)
        poolCounter += 1
      }
    }
  })
  // Now actually allocate revenues across the pools
  for (const pool of pools) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [poolID, poolMembers] = pool
    const aggregateComm: TCommComponents = {
      totalServiceRevenue: 0,
      totalServiceCommission: 0,
      tips: 0,
      productCommission: 0,
      customRateCommission: 0,
      customRateCommissions: {},
      generalServiceCommission: 0,
    }
    poolMembers.forEach((poolMember) =>
      Object.entries(aggregateComm).forEach((aggregateElement) => {
        const [aggregatePropName, aggregatePropValue] = aggregateElement
        const commMapElement = commMap.get(poolMember)
        if (commMapElement) {
          const commMapValue = commMapElement[aggregatePropName]
          if (typeof aggregatePropValue === "number" && typeof commMapValue === "number") {
            aggregateComm[aggregatePropName] = aggregatePropValue + commMapValue
          }
        } else {
          throw new Error(`No commMap entry for ${poolMember}. This should never happen.`)
        }
      })
    )
    // divide the aggregate values across the pool members by updating their commComponents entries
    // Question: do we want to add pool_* variants of the comm components so we can see the before/after?
    commissionLogger.info("=======================================")
    commissionLogger.info("Pooling Calculations")
    commissionLogger.info("=======================================")

    poolMembers.forEach((poolMember) => {
      const staffName = `${talenoxStaff.get(poolMember)?.last_name}, ${talenoxStaff.get(poolMember)?.first_name}`
      commissionLogger.info(`Pooling for ${poolMember} ${staffName}`)
      let memberList = ""
      let comma = ""
      poolMembers.forEach((member) => {
        memberList += `${comma}${member} ${talenoxStaff.get(member)?.last_name} ${talenoxStaff.get(member)?.first_name
          }`
        comma = ", "
      })
      commissionLogger.info(`Pool contains ${poolMembers.length} members: ${memberList}`)
      Object.entries(aggregateComm).forEach((aggregate) => {
        const [aggregatePropName, aggregatePropValue] = aggregate
        const comm = commMap.get(poolMember)
        if (comm) {
          if (typeof aggregatePropValue === "number") {
            comm[aggregatePropName] = Math.round((aggregatePropValue * 100) / poolMembers.length) / 100
            commissionLogger.info(
              `${aggregatePropName}: Aggregate value is ${aggregatePropValue}. 1/${poolMembers.length} share = ${comm[aggregatePropName]}`
            )
          }
        } else {
          throw new Error(`No commMap entry for ${poolMember} ${staffName}. This should never happen.`)
        }
      })
      commissionLogger.info("--------------")
    })
  }
  commissionLogger.info('')
  commissionLogger.info("=======================================")
  commissionLogger.info('')
  return
}

async function main(): Promise<void> {
  commissionLogger.info(`Commission run begins ${firstDay}`)
  if (config.updateTalenox === false) {
    commissionLogger.info(`Talenox update is disabled in config.`)
  }
  commissionLogger.info(`Payroll Month is ${config.PAYROLL_MONTH}`)
  debugLogger.debug(`Requesting employees from Talenox`)
  const talenoxStaff = await getTalenoxEmployees()
  debugLogger.debug(`Requesting employees complete`)
  const WS = readExcelFile(config.PAYROLL_WB_NAME)
  // Using option {header:1} returns an array of arrays
  // Since specifying header results in blank rows in the worksheet being returned, we could force blank rows off
  // wsaa is our worksheet presented as an array of arrays (row major)
  const wsaa: unknown[][] = XLSX.utils.sheet_to_json(WS, {
    blankrows: false,
    header: 1,
  })
  const maxRows = wsaa.length
  let staffID: TStaffID | undefined
  let staffName: TStaffName | undefined
  const revCol = revenueCol(wsaa)
  let currentStaffIDRow = -1
  let currentTotalForRow = 0
  let staffInfo: StaffInfo | null = null
  // start building commission components working through the rows of the spreadsheet (array of arrays)
  // ignore the first row which contains the date range for the report
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const element = wsaa[rowIndex][0]
    if (element !== undefined) {
      // Check if this line contans a staffID
      // We null out staffID when we've finished processing the previous staffmember's commission.
      // If staffID has a value then were still processing commission for one of the team
      if (staffID === undefined) {

        staffInfo = getStaffIDAndName(wsaa, rowIndex) // may return null if we don't find the magic string in the current row



        if (staffInfo) {
          // found staffID so keep a note of which row it's on
          currentStaffIDRow = rowIndex
          staffID = staffInfo.staffID
          if (staffID) {
            const staffMapInfo = talenoxStaff.get(staffID)
            if (staffID && staffMapInfo) {
              // found staffmember in Talenox
              staffName = `${staffMapInfo.last_name} ${staffMapInfo.first_name}`
              /*               if (!isPayViaTalenox(staffID)) {
                              warnLogger.warn(`Note: ${staffID} ${staffName} is configured to NOT pay via Talenox but is in Talenox.`)
                            } */
            } else {
              /*
                Even if the staffmember doesn't appear in Talenox, we will need
                a valid staffName. Use the info from the MB Payroll report.
             */
              staffName = `${staffInfo.lastName} ${staffInfo.firstName}`
              if (isPayViaTalenox(staffID)) {
                const text = `${staffID ? staffID : "null"}${staffInfo.firstName ? " " + staffInfo.firstName : ""}${staffInfo.lastName ? " " + staffInfo.lastName : ""
                  } in MB Payroll Report line ${rowIndex} not in Talenox.`
                if (config.missingStaffAreFatal) {
                  throw new Error("Fatal: " + text)
                } else {
                  //if (!isContractor(staffID)) {
                  warnLogger.warn("Warning: " + text)
                  //}
                }
              } else {
                if (!isContractor(staffID)) { warnLogger.warn(`Note: ${staffID} ${staffName} is configured to NOT pay via Talenox.`) }
              }
            }
          }
        }
      }
      if ((element as string).startsWith(TOTAL_FOR)) {
        // If we've found a line beginning with "Total for " then we've got to the subtotals  and total for a staff member
        if (staffID === undefined) {
          // Likely a new member of staff in Mindbody has not been assigned a staffID
          // When there's no staffID assigned, the Total row will likely contain the offending person's name.
          const possibleStaffName = (element as string).slice(TOTAL_FOR.length)
          throw new Error("Reached Totals row with no identified StaffID. Staff name is possibly " + possibleStaffName)
        }
        /* Keep track of the last totals row (for the previous employee) because we'll need to search
                    back to this row to locate all of the revenue numbers for the current staff member.
                */

        currentTotalForRow = rowIndex

        /**
         * @var commComponents - The commission and revenue values for each user.
         *  Object of the form:
         *  {
         *      totalServiceRevenue: number
         *      tips: number
         *      productCommission: number
         *      generalServiceCommission: number
         *      customRateCommission: {key: string]: TServiceCommission}
         *  }
         */

        const commComponents: TCommComponents = {
          tips: 0,
          productCommission: 0,
          generalServiceCommission: 0,
          customRateCommissions: {},
          totalServiceRevenue: 0,
          customRateCommission: 0,
          totalServiceCommission: 0,
        }
        /*
                Find and process tips, product commission and services commission
                go back 3 lines from the "Total for:" line - the tips and product commission
                should be in that range .
                Note tips and or product commission may not exist. 
                */
        //contractorLogger.info('')
        if (!isPayViaTalenox(staffID) && !isContractor(staffID)) {
          commissionLogger.warn(`Note: ${staffID} ${staffName} is configured to NOT pay via Talenox.`)
        }
        let text = `Payroll details for ${staffID} ${staffName}`
        if (isContractor(staffID)) {
          text += ` [CONTRACTOR]`
          contractorLogger.info('')
          contractorLogger.info(text)
        } else {
          commissionLogger.info('')
          commissionLogger.info(text)
        } for (let j = 3; j >= 0; j--) {
          let payComponent: string = wsaa[rowIndex - j][0] as string
          if (payComponent !== undefined) {
            let value = 0
            if (payComponent === TIPS_FOR || payComponent === COMM_FOR || payComponent.startsWith(TOTAL_FOR)) {
              /* Work out what the value is for the Tip or Commission
                            by looking at the last cell in the row */
              const maxRowIndex = wsaa[rowIndex - j].length - 1
              if (wsaa[rowIndex - j][maxRowIndex] !== undefined) {
                value = Number(wsaa[rowIndex - j][maxRowIndex])
                if (payComponent === TIPS_FOR) {
                  payComponent = "Tips:"
                  commComponents.tips = value
                  // log(`${payComponent} ${value}`)
                }
                if (payComponent === COMM_FOR) {
                  payComponent = "Product Commission:"
                  commComponents.productCommission = value
                  // log(`${payComponent} ${value}`)
                }
              } else {
                value = 0
              }
              if (payComponent.startsWith(TOTAL_FOR)) {
                // Reached the end of this staff members block in the report. Go back and add all the revenue amounts

                payComponent = "Services Revenue:"

                // Old way - services revenue is a single number
                if (staffID) {
                  // have a guard further up so this check might be superfluous
                  /* const totalServicesRevenues = sumServiceRevenues(
                                        getServiceRevenues(wsaa, currentTotalForRow, currentStaffIDRow, revCol, staffID)
                                    ) */

                  // New way - some revenues from "general services", some revenues from custom pay rates
                  const servicesRevenues = getServiceRevenues(
                    wsaa,
                    currentTotalForRow,
                    currentStaffIDRow,
                    revCol,
                    staffID
                  )
                  // const generalServRevenue= servicesRevenues.get(GENERAL_SERV_REVENUE)
                  // value = generalServRevenue ? generalServRevenue.revenue : 0
                  let totalServiceRevenue = 0
                  let generalServiceRevenue = 0
                  if (servicesRevenues) {
                    servicesRevenues.forEach((element, serviceName) => {
                      totalServiceRevenue += element.serviceRevenue
                      if (serviceName === GENERAL_SERV_REVENUE) {
                        generalServiceRevenue = element.serviceRevenue
                      }
                    })
                  }

                  commComponents.totalServiceRevenue = totalServiceRevenue
                  // set services comm to  total revenue for now. Will fill-in later
                  payComponent = "General Services Commission"
                  // const serviceRevenue = value

                  const generalServiceCommission = calcGeneralServiceCommission(
                    staffID,
                    talenoxStaff,
                    generalServiceRevenue // The  value is the the total services revenue calculated above
                  )
                  commComponents.generalServiceCommission = generalServiceCommission
                  commComponents.totalServiceCommission += generalServiceCommission
                  // log(`${payComponent} ${generalServiceCommission}`)

                  /*
                  Calculate the commission for each of the custom pay rate services
                  in servicesRevenues and add to commComponents.customRateCommission.
                  While we're here we can also add up the total custom service commission.
                  */
                  let totalCustomServiceCommission = 0
                  if (servicesRevenues) {
                    servicesRevenues.forEach((customRateEntry, serviceName) => {
                      if (serviceName !== GENERAL_SERV_REVENUE) {
                        const customServiceRevenue =
                          customRateEntry.serviceRevenue * Number(customRateEntry.customRate)
                        commComponents.customRateCommissions[serviceName] = customServiceRevenue
                        totalCustomServiceCommission += customServiceRevenue
                      }
                    })
                    commComponents.customRateCommission = totalCustomServiceCommission
                    commComponents.totalServiceCommission += totalCustomServiceCommission
                  }
                } else {
                  throw new Error(`Somehow don't have a staffID despite guard further up`)
                }
              }
              value = 0
            }

            if (j === 0) {
              if (!staffID) {
                throw new Error(`Fatal: Missing staffID for staff: ${staffName}`)
              } else {
                commMap.set(staffID, commComponents)
                //log(prettyjson.render(commComponents))

                if (!isContractor(staffID)) {
                  commissionLogger.info(fws32Left("General Service Commission:"), fws12RightHKD(commComponents.generalServiceCommission))
                  commissionLogger.info(fws32Left("Custom Rate Service Commission:"), fws12RightHKD(commComponents.customRateCommission))
                  commissionLogger.info(fws32Left("Product Commission:"), fws12RightHKD(commComponents.productCommission))
                  commissionLogger.info(fws32Left(`Tips:`), fws12RightHKD(commComponents.tips))
                  commissionLogger.info(fws32Left(''), fws12Right('------------'))
                  commissionLogger.info(
                    fws32Left(`Total Payable`),
                    fws12RightHKD(commComponents.customRateCommission +
                      commComponents.generalServiceCommission +
                      commComponents.productCommission +
                      commComponents.tips)
                  )
                } else {
                  contractorLogger.info(fws32Left("General Service Commission:"), fws12RightHKD(commComponents.generalServiceCommission))
                  contractorLogger.info(fws32Left("Custom Rate Service Commission:"), fws12RightHKD(commComponents.customRateCommission))
                  contractorLogger.info(fws32Left("Product Commission:"), fws12RightHKD(commComponents.productCommission))
                  contractorLogger.info(fws32Left(`Tips:`), fws12RightHKD(commComponents.tips))
                  contractorLogger.info(fws32Left(''), fws12Right('------------'))
                  contractorLogger.info(
                    fws32Left(`Total Payable`),
                    fws12RightHKD(commComponents.customRateCommission +
                      commComponents.generalServiceCommission +
                      commComponents.productCommission +
                      commComponents.tips)
                  )
                }
              }
              //log("==========")
            }
          }
        }
        // Reset staffID and start looking for the next staff payments block in the report
        staffID = undefined
      }
    }
  }

  doPooling(commMap, staffHurdle, talenoxStaff)

  /*
 Looking at staffHurdle.json work out how much commission is paid at each commission hurdle
 and populate the commMap service commission map
*/

  // Call calcServiceCommission(staffID!, commMap);
  // TODO: loop through commMap and update the service commission for everyone

  /*
Create a spreadsheet containing one line for each payment to be made for each of the staff.
This spreadsheet will be copied/pasted into Talenox and together with their salary payments will
form the payroll for the month 
*/

  const payments = createAdHocPayments(commMap, talenoxStaff)
  writePaymentsWorkBook(payments)

  /* 
    If configuration permits updating Talenox, create a new payroll and push into it the adhoc payments for service commission, tips and product commission.
    */

  if (config.updateTalenox) {
    debugLogger.debug(`Requesting new payroll payment creation from Talenox`)
    const createPayrollResult = await createPayroll(talenoxStaff)
    debugLogger.debug(`New payroll payment is created in Talenox.`)
    if (createPayrollResult[1]) {
      debugLogger.debug(`OK: ${createPayrollResult[1].message}`)
    } else {
      if (createPayrollResult[0]) {
        errorLogger.error(`Failed to create payroll payment for ${config.PAYROLL_MONTH}: ${createPayrollResult[0].message}`)
      } else
        errorLogger.error(`Failed to create payroll payment for ${config.PAYROLL_MONTH}: no reason given by Talenox API`)
    }
    debugLogger.debug(`Pushing ad-hoc payments into new payroll`)
    const uploadAdHocResult = await uploadAdHocPayments(talenoxStaff, payments)
    debugLogger.debug(`Pushing ad-hoc payments is complete`)
    if (uploadAdHocResult[1]) {
      debugLogger.debug(`OK: ${uploadAdHocResult[1].message}`)
    } else {
      if (uploadAdHocResult[0]) {
        errorLogger.error(`Failed: ${uploadAdHocResult[0].message}`)
      } else errorLogger.error("Failed: Unknown reason")
    }
  }
}

//initDebug()
main()
  .then(() => {
    debugLogger.debug("Done!")
    shutdownLogging()
  })
  .catch((error) => {
    errorLogger.error(`${error}`)
    shutdownLogging()
  })

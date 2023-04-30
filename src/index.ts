/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-var-requires */

/* eslint-disable @typescript-eslint/prefer-regexp-exec */
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
// TODO create debug log (in addition to displaying debug in console)
// TODO add validation of staffHurdle.json to ensure the values are valid

import { config } from "node-config-ts"
// import prettyjson from "prettyjson"
import XLSX from "xlsx"
import { StaffInfo } from "./IStaffInfo"
import staffHurdle from "./staffHurdle.json" assert { type: "json" }
import { GeneralServiceComm } from "./GeneralServiceComm"
import {
  TStaffID,
  TServiceCommMap,
  CommComponents,
  TStaffName,
  TCommMap,
  PayRate,
  TTalenoxInfoStaffMap
} from "./types.js"
import { createAdHocPayments, getTalenoxEmployees, createPayroll, uploadAdHocPayments, firstDay } from "./talenox_functions.js"
import { isPayViaTalenox, isContractor, isString } from "./utility_functions.js"
//import { initDebug, log, warn, error } from "./debug_functions.js"
import { contractorLogger, commissionLogger, warnLogger, errorLogger, debugLogger, shutdownLogging } from "./logging_functions.js"
import { fws32Left, fws12RightHKD, fws12Right } from "./string_functions.js"
import { GENERAL_SERV_REVENUE, getServiceRevenue } from "./getServiceRevenue.js"
import { getStaffIDAndName as getStaffIDAndNameFromWS } from "./getStaffIDAndName.js"
import { writePaymentsWorkBook } from "./writePaymentsWorkBook.js"
import { calcGeneralServiceCommission } from "./calcGeneralServiceCommission.js"
import { doPooling } from "./doPooling.js"
import { getTipsOrProductCommissionAmounts as getTipsProdCommissionAmounts } from "./getTipsAndProductCommissionAmounts.js"
import { REV_PER_SESS, TOTAL_FOR, TIPS_FOR, COMM_FOR, STATUS, STATUS_UNKNOWN, STATUS_OK, STATUS_ERROR, STATUS_WARN } from "./constants.js"

// const FILE_PATH: string = "Payroll Report.xlsx";
const FILE_PATH = config.PAYROLL_WB_NAME

export const SERVICE_ROW_REGEX = /(.*) Pay Rate: (.*) \((.*)%\)/i

export const SERVICE_TYPE_INDEX = 2

const FIRST_SHEET = 0

// const POOLS_WITH = "poolsWith"

/* const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 }
const WB = XLSX.readFile(FILE_PATH, READ_OPTIONS)
const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]] */
const commMap: TCommMap = new Map<TStaffID, CommComponents>()
// const staffMap: TStaffMap = new Map<TStaffID, IStaffNames>()
export const serviceCommMap: TServiceCommMap = new Map<TStaffName, GeneralServiceComm>()
export const emptyServComm: GeneralServiceComm = {
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

async function main() {
  commissionLogger.info(`Commission run begins ${firstDay.toDateString()}`)
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
  let wsStaffInfo: StaffInfo | undefined = undefined

  // start building commission components working through the rows of the spreadsheet (array of arrays)
  // ignore the first row which contains the date range for the report
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const firstCellInRow = wsaa[rowIndex][0]
    if (firstCellInRow === undefined) { continue }
    // Check if this line contans a staffID
    // We null out staffID when we've finished processing the previous staffmember's commission.
    // If staffID has a value then were still processing commission for one of the team

    if (staffID === undefined) { // get StaffID and Name details as we're processing a new staff member's commission
      wsStaffInfo = getStaffIDAndNameFromWS(wsaa, rowIndex) // may return undefined if we don't find the magic string in the current row
      staffID = wsStaffInfo?.staffID
      if (staffID === undefined) {
        // staffID is undefined so the row we're on doesn't contain a staffID to get us started
        //errorLogger.error(`StaffID is undefined at row ${rowIndex} for ${staffName}`)
        //throw new Error(`StaffID is undefined at row ${rowIndex} for ${staffName}`)
        continue
      }
      currentStaffIDRow = rowIndex // found staffID so keep a note of which row it's on
      staffName = setStaffName(talenoxStaff, staffID, staffName, wsStaffInfo)
      let { status, message } = payViaTalenoxChecks(staffID, rowIndex, staffName, talenoxStaff) // check it's OK for the staffmember to be missing from Talenox. Check only once when we're starting to process a staff member's commission
      if (status==STATUS_ERROR) {
        throw new Error(message)
      }
    }

    if ((firstCellInRow as string).startsWith(TOTAL_FOR)) {
      // If we've found a line beginning with "Total for " then we've got to the subtotals  and total for a staff member

      /*       if (staffID === undefined) { // probably can't happen as we've already checked for staffID being undefined above
              // Likely a new member of staff in Mindbody has not been assigned a staffID
              // When there's no staffID assigned, the Total row will likely contain the offending person's name.
              const possibleStaffName = (firstCellInRow as string).slice(TOTAL_FOR.length)
              throw new Error("Reached Totals row with no identified StaffID. Staff name is possibly " + possibleStaffName)
            } */

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

      const commComponents: CommComponents = {
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
        warnLogger.warn(`Note: ${staffID} ${staffName ? staffName : "<Staff Name>"} is configured to NOT pay via Talenox.`)
      }
      let text = `Payroll details for ${staffID} ${staffName ? staffName : "<Staff Name>"}`
      if (isContractor(staffID)) {
        text += ` [CONTRACTOR]`
        contractorLogger.info('')
        contractorLogger.info(text)
      } else {
        commissionLogger.info('')
        commissionLogger.info(text)
      }
      /*
      Find and process tips, product commission and services commission
      go back 3 lines from the "Total for:" line - the tips and product commission
      should be in that range .
      Note tips and or product commission may not exist.
      sample:

      +-----------------------------+--+--+------------+-----------+---------+---------------+--+----------+------+
      | Sales Commission:           |  |  |            |           |         |               |  |          | 228  |
      +-----------------------------+--+--+------------+-----------+---------+---------------+--+----------+------+
      |                             |  |  | # Services | # Clients | # Comps | Base Earnings |  | Earnings |      |
      | Total for Guilfoyle, Sioban |  |  | 1          | 1         | 0       | HK$ 0         |  | 228      |      |
      +-----------------------------+--+--+------------+-----------+---------+---------------+--+----------+------+
      */
      for (let j = 3; j >= 0; j--) {
        let payComponent = wsaa[rowIndex - j][0]
        let value = 0
        let currentRowNumber = rowIndex - j
        let currentRow = wsaa[currentRowNumber]

        if (!isString(payComponent)) {
          // errorLogger.error(`Unexpected value ${payComponent} at row ${currentRowNumber} for ${staffName}`)
          //throw new Error(`Unexpected value ${payComponent} at row ${currentRowNumber} for ${staffName}`)
          continue
        }

/*         if (payComponent !== TIPS_FOR && payComponent !== COMM_FOR && !payComponent.startsWith(TOTAL_FOR)) {
          errorLogger.error(`Unexpected value ${payComponent} at row ${currentRowNumber} for ${staffName}`)
          throw new Error(`Unexpected value ${payComponent} at row ${currentRowNumber} for ${staffName}`)
        } */

        /* Work out what the value is for the Tip or Commission
                      by looking at the last cell in the row */
        getTipsProdCommissionAmounts(currentRow, payComponent, commComponents)
        if (!isString(payComponent)) { continue }  // just to keep typescript happy
        if (payComponent.startsWith(TOTAL_FOR)) {
          // Reached the end of this staff members block in the report. Go back and add up all the revenue amounts

          payComponent = "Services Revenue:"

          // Old way - services revenue is a single number
          if (staffID) {
            // have a guard further up so this check might be superfluous
            /* const totalServicesRevenues = sumServiceRevenues(
                                  getServiceRevenues(wsaa, currentTotalForRow, currentStaffIDRow, revCol, staffID)
                              ) */

            // New way - some revenues from "general services", some revenues from custom pay rates
            const servicesRevenues = getServiceRevenue(
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


        if (j === 0) { // last row in the block "Total for <staff name>"
          if (!staffID) {
            throw new Error(`Fatal: Missing staffID for staff: ${staffName ? staffName : "<Staff Name>"}`)
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
        //}
      }
      // Reset staffID and start looking for the next staff payments block in the report
      staffID = undefined
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
    if (error instanceof Error) {
      errorLogger.error(`${error.message}`)
    } else if (error instanceof String) {
      errorLogger.error(`${error.toString()}`)
    } else {
      errorLogger.error(`Cannot log caught error. Unknown error type: ${typeof error}`)
    }
    shutdownLogging()
  })

function setStaffName(talenoxStaff: TTalenoxInfoStaffMap, staffID: string, staffName: string | undefined, wsStaffInfo: StaffInfo | undefined) {
  const talenoxStaffEntry = talenoxStaff.get(staffID)
  if (talenoxStaffEntry !== undefined) {
    // found staffmember in Talenox. Use the staff name from Talenox
    staffName = `${talenoxStaffEntry.last_name ?? "<Last Name>"} ${talenoxStaffEntry.first_name ?? "<First Name>"}`
    /*               if (!isPayViaTalenox(staffID)) {
                    warnLogger.warn(`Note: ${staffID} ${staffName} is configured to NOT pay via Talenox but is in Talenox.`)
                  } */
  } else {
    /*
      Even if the staffmember doesn't appear in Talenox, we will need
      a valid staffName. Use the info from the MB Payroll report.
   */
    staffName = `${wsStaffInfo?.lastName ?? "<Last Name>"} ${wsStaffInfo?.firstName ?? "<First Name>"}`
  }
  return staffName
}

function payViaTalenoxChecks(staffID: string, rowIndex: number, staffName: string, talenoxStaff: TTalenoxInfoStaffMap): { status: STATUS, message: string } {
  let text: string
  let inTalenox = (talenoxStaff.get(staffID) !== undefined)
  if (isPayViaTalenox(staffID) && !inTalenox) {
    text = `${staffID} ${staffName} in MB Payroll Report line ${rowIndex} not in Talenox.`
    if (config.missingStaffAreFatal) {
      errorLogger.error("Fatal: " + text)
      throw new Error("Fatal: " + text)
    } else {
      warnLogger.warn("Warning: " + text)
      return { status: STATUS_ERROR, message: text }
    }
  }

  if (!isContractor(staffID) && !isPayViaTalenox(staffID)) {
    text = `Warn: ${staffID} ${staffName} is not a contractor, and is not in Talenox.`
    warnLogger.warn(text)
    return { status: STATUS_WARN, message: text }
  }

  if (isContractor(staffID) && inTalenox) {
    text = `Warn: ${staffID} ${staffName} is a contractor, and is in Talenox.`
    warnLogger.warn(text)
    return { status: STATUS_WARN, message: text }
  }

  return { status: STATUS_OK, message: "" }
}


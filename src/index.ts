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
import { GeneralServiceComm } from "./GeneralServiceComm.js"
import { StaffInfo } from "./IStaffInfo.js"
import staffHurdle from "./staffHurdle.json" assert { type: "json" }
import { createAdHocPayments, firstDay, getTalenoxEmployees } from "./talenox_functions.js"
import {
  CommComponents, ServiceCommMap, TStaffID, StaffName
} from "./types.js"
import { isContractor, isPayViaTalenox, readExcelFile } from "./utility_functions.js"
//import { initDebug, log, warn, error } from "./debug_functions.js"
import { STATUS_ERROR, TOTAL_FOR } from "./constants.js"
import { doPooling } from "./doPooling.js"
import { gatherCommissionComponents } from "./gatherCommissionComponents.js"
import { getStaffIDAndName as getStaffIDAndNameFromWS } from "./getStaffIDAndName.js"
import { commissionLogger, contractorLogger, debugLogger, errorLogger, shutdownLogging, warnLogger } from "./logging_functions.js"
import { payViaTalenoxChecks } from "./payViaTalenoxChecks.js"
import { pushCommissionToTalenox } from "./pushCommissionToTalenox.js"
import { setStaffName } from "./setStaffName.js"
import { writePaymentsWorkBook } from "./writePaymentsWorkBook.js"

// const FILE_PATH: string = "Payroll Report.xlsx";

export const SERVICE_ROW_REGEX = /(.*) Pay Rate: (.*) \((.*)%\)/i

export const SERVICE_TYPE_INDEX = 2

// const POOLS_WITH = "poolsWith"

/* const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 }
const WB = XLSX.readFile(FILE_PATH, READ_OPTIONS)
const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]] */
export const commMap = new Map<TStaffID, CommComponents>()
// const staffMap: TStaffMap = new Map<TStaffID, IStaffNames>()
export const serviceCommMap: ServiceCommMap = new Map<StaffName, GeneralServiceComm>()
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
  let staffName: StaffName | undefined
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
      const { status, message } = payViaTalenoxChecks(staffID, rowIndex, staffName, talenoxStaff) // check it's OK for the staffmember to be missing from Talenox. Check only once when we're starting to process a staff member's commission
      if (status == STATUS_ERROR) {
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
      | Total for Guilfoyle, Sioban |  |  | 1          | 1         | 0       | HK$0          |  | 228      |      |
      +-----------------------------+--+--+------------+-----------+---------+---------------+--+----------+------+
      */
      gatherCommissionComponents(wsaa, rowIndex, commComponents, staffID, currentTotalForRow, currentStaffIDRow, talenoxStaff, staffName)
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

  const payments = createAdHocPayments(commMap, talenoxStaff)
  writePaymentsWorkBook(payments)

  // If configuration permits updating Talenox, create a new payroll and push into it the adhoc payments for service commission, tips and product commission.
  if (config.updateTalenox) {
    await pushCommissionToTalenox(talenoxStaff, payments)
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



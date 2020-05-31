/* eslint-disable @typescript-eslint/camelcase */
// TODO Implement pooling of service and product commissions, tips for Ari and Anson
// TODO Implement per-service payment rates (Pay rate: Mens Cut and Blow Dry - immediately follows staff id # line)
// TODO Investigate why script can't be run directly from the dist folder (has to be run from dist/.. or config has no value)
import { config } from "node-config-ts"
import prettyjson from "prettyjson"
import XLSX from "xlsx"
import fetch from "node-fetch"
import { IStaffInfo } from "./IStaffInfo"
import { Headers, RequestInit } from "node-fetch"
import staffHurdle from "./staffHurdle.json"
import { ITalenoxPayment } from "./ITalenoxPayment"
import { IServiceComm } from "./IServiceComm"
import { IStaffCommConfig } from "./IStaffCommConfig"
import { IStaffNames } from "./IStaffNames"
import {
    TStaffID,
    TServiceCommMap,
    TCommComponents,
    TStaffName,
    TStaffMap,
    TServiceRevenue,
    TCommMap,
    TStaffHurdle,
} from "./types.js"
import { ITalenoxStaffInfo } from "./ITalenoxStaffInfo"
import { ITalenoxAdHocPayment } from "./ITalenoxAdHocPayment"
import { ITalenoxAdhocPayItems } from "./ITalenoxAdhocPayItems"
import { TALENOX_BASE_URL, TALENOX_WHOLE_MONTH } from "./talenox_constants"
import { ITalenoxPayroll, ITalenoxPayrollPayment } from "./ITalenoxPayrollPayment"
import { ITalenoxPayrollPaymentResult } from "./ITalenoxPayrollPaymentResult"

// const FILE_PATH: string = "Payroll Report.xlsx";
const FILE_PATH = config.PAYROLL_WB_NAME

const TOTAL_FOR_REGEX = /Total for /
const DOCTYPE_HTML = /DOCTYPE html/

const TIPS_INDEX = 0
const PROD_COMM_INDEX = 1
const SERV_COMM_INDEX = 2
const SERV_REV_INDEX = 3

const FIRST_SHEET = 0

const STAFF_ID_HASH = "Staff ID #:"
const TOTAL_FOR = "Total for "
const TIPS_FOR = "Tips:"
const COMM_FOR = "Sales Commission:"
const REVENUE = "Revenue"
const REV_PER_SESS = "Rev. per Session"

const BASE_RATE = "baseRate"
const HURDLE_1_LEVEL = "hurdle1Level"
const HURDLE_1_RATE = "hurdle1Rate"
const HURDLE_2_LEVEL = "hurdle2Level"
const HURDLE_2_RATE = "hurdle2Rate"
const HURDLE_3_LEVEL = "hurdle3Level"
const HURDLE_3_RATE = "hurdle3Rate"
const CONTRACTOR = "contractor"

const SERVICES_COMM_REMARK = "Services commission"
const TIPS_REMARK = "Tips"
const PRODUCT_COMM_REMARK = "Product commission"

/* const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 }
const WB = XLSX.readFile(FILE_PATH, READ_OPTIONS)
const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]] */
const commMap = new Map<TStaffName, TCommComponents>()
// const staffMap: TStaffMap = new Map<TStaffID, IStaffNames>()
const serviceCommMap: TServiceCommMap = new Map<TStaffName, IServiceComm>()
const emptyServComm: IServiceComm = {
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
    serviceComm: 0,
    serviceRevenue: 0,
}

// let maxRows = 0

function readExcelFile(fileName?: string): XLSX.WorkSheet {
    const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 0 }
    const WB = XLSX.readFile(fileName ? fileName : FILE_PATH, READ_OPTIONS)
    const WS = WB.Sheets[WB.SheetNames[FIRST_SHEET]]
    return WS
}

function checkRate(rate: unknown): boolean {
    if (typeof rate === "number") {
        if (0 <= rate && rate <= 1) {
            return true
        } else {
            return false
        }
    } else {
        return false
    }
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

function stripToNumeric(n: string | number): number {
    const numericOnly = /[^0-9.-]+/g
    let x: number
    if (typeof n === "string") {
        // strip out everything except 0-9, "." and "-"
        x = parseFloat(n.replace(numericOnly, ""))
        if (isNaN(x)) {
            x = 0
        }
    } else {
        x = n
    }
    return x
}

function getStaffIDAndName(wsArray: unknown[][], idRow: number): IStaffInfo | null {
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
                    `${staffInfo[staffNameIndex].split(",")[1]} ${
                        staffInfo[staffNameIndex].split(",")[0]
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
        return null
    }
}

function sumRevenue(
    wsArray: unknown[][],
    currentTotalRow: number,
    // tslint:disable-next-line: no-shadowed-variable
    currentStaffIDRow: number,
    // tslint:disable-next-line: no-shadowed-variable
    revCol: number
): number {
    /* starting on the staff member's totals row, sum all the numeric values in the revenue column
    back as far as the prior staff member's totals row + 1. Use this as the service revenue so we can ignore
    how staff commissions are configured in MB. */
    const numSearchRows = currentTotalRow - currentStaffIDRow - 1
    const revColumn = revCol
    let serviceRevenue = 0
    for (let i = 1; i <= numSearchRows; i++) {
        let revenueCellContents = wsArray[currentTotalRow - i][revColumn]
        if (revenueCellContents !== undefined) {
            if (typeof revenueCellContents === "string") {
                revenueCellContents = stripToNumeric(revenueCellContents)
            } else {
                if (typeof revenueCellContents === "number") {
                    // all good
                }
            }
            if (typeof revenueCellContents === "number" && revenueCellContents >= 0) {
                serviceRevenue += revenueCellContents
            }
        }
    }
    return serviceRevenue
}

function isContractor(staffID: string): boolean {
    const sh = staffHurdle as TStaffHurdle
    return Object.prototype.hasOwnProperty.call(sh[staffID], CONTRACTOR) ? true : false
}

function calcServiceCommission(staffID: TStaffID, staffMap: TStaffMap, serviceRev: TServiceRevenue): number {
    /* iterate through commissionComponents
    for each entry, locate corresponding hurdles
    calculate amounts payable for base rate (0 for most staff) and then from each hurdle to the next
    store the amounts payable in a new Map where the key is the staff name and the value is an array containing
    [baseCommission, hurdle1Commission, hurdle2Commission]
    Where staff are pooling their income, these amounts will be their equal share of what has gone into their pool*/
    let totalServiceComm: number
    const sh = staffHurdle as TStaffHurdle // get an iterable version of the staffHurdle import
    const shm = new Map<TStaffID, any>()
    // eslint-disable-next-line arrow-parens
    Object.keys(sh).forEach((k) => shm.set(k, sh[k])) // iterate through staffHurdle and build a Map
    // cm.forEach((commComponents, staffID) => {
    // const commComponents = cm.get(staffID)!;
    if (shm.has(staffID)) {
        // we have a matching prop in staffHurdle for the current payroll key
        // clone emptyServiceComm as a temp we can fill and then add to the serviceCommMap
        const tempServComm: IServiceComm = {
            ...emptyServComm,
            base: { ...emptyServComm.base },
            hurdle1: { ...emptyServComm.hurdle1 },
            hurdle2: { ...emptyServComm.hurdle2 },
            hurdle3: { ...emptyServComm.hurdle3 },
        }
        // const serviceRev = commComponents[SERV_COMM_INDEX];
        const staffCommConfig: IStaffCommConfig = shm.get(staffID)

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
                console.log(`Fatal: Error with ${staffID}'s commission config in staffHurdle.json`)
                throw new Error("Invalid hurdle1Rate")
            }
        }

        if (Object.prototype.hasOwnProperty.call(staffCommConfig, HURDLE_2_LEVEL)) {
            hurdle2Level = stripToNumeric(staffCommConfig.hurdle2Level)
            hurdle2Rate = stripToNumeric(staffCommConfig.hurdle2Rate)
            if (!checkRate(hurdle2Rate)) {
                console.log(`Fatal: Error with ID ${staffID}'s commission config in staffHurdle.json`)
                throw new Error("Invalid hurdle2Rate")
            }
        }

        if (Object.prototype.hasOwnProperty.call(staffCommConfig, HURDLE_3_LEVEL)) {
            hurdle3Level = stripToNumeric(staffCommConfig.hurdle3Level)
            hurdle3Rate = stripToNumeric(staffCommConfig.hurdle3Rate)
            if (!checkRate(hurdle3Rate)) {
                console.log(`Fatal: Error with ${staffID}'s commission config in staffHurdle.json`)
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
                    hurdle1Revenue =
                        Math.round(Math.min(serviceRev - hurdle1Level, hurdle2Level - hurdle1Level) * 100) / 100
                    if (serviceRev > hurdle2Level) {
                        if (hurdle3Level > 0) {
                            // have  a hurdle3
                            /* revenue applicable to hurdle2 is either the amount of service revenue above
                                hurdle2 or if the revenue exceeds hurdle3, the amount of revenue equal to
                                the difference between hurdle3 and hurdle2 */
                            hurdle2Revenue =
                                Math.round(Math.min(serviceRev - hurdle2Level, hurdle3Level - hurdle2Level) * 100) / 100
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
        // no hurdles so work out how much they receive in comm by applying base rate to entire services revenue

        // TODO: sum and set servicesComm once we have all the components.
        // const servicesComm = servicesRev * baseRate;
        // commComponents is an array containing [tips, productCommission, serviceCommission]
        // commComponents[serviceCommissionIndex] = servicesComm;

        const staffName = staffMap.get(staffID)

        tempServComm.staffName = `${staffName?.lastName} ${staffName?.firstName}`
        tempServComm.serviceRevenue = serviceRev

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
        tempServComm.serviceComm = totalServiceComm

        serviceCommMap.set(staffID, tempServComm)

        // console.log(prettyjson.render(serviceCommMap.get(staffID)))
    } else {
        throw new Error(`${staffID} doesn't appear in staffHurdle.json (commission setup file)`)
    }
    // });

    return totalServiceComm
}

function createAdHocPayments(_commMap: TCommMap, staffMap: TStaffMap): ITalenoxPayment[] {
    const emptyTalenoxPayment: ITalenoxPayment = {
        staffID: "",
        staffName: "",
        type: "Others",
        amount: 0,
        remarks: "",
    }

    const payments: ITalenoxPayment[] = []
    let paymentProto: ITalenoxPayment
    _commMap.forEach((commMapEntry, staffID) => {
        if (!isContractor(staffID)) {
            // const payment: ITalenoxPayment = { ...emptyTalenoxPayment };
            // const staffID = staffID;
            const staffMapEntry = staffMap.get(staffID)
            let payment: ITalenoxPayment
            /* const firstName = !!staffMapEntry ? staffMapEntry.firstName : "";
        const lastName = !!staffMapEntry ? staffMapEntry.lastName : ""; */
            if (staffMapEntry === undefined) {
                throw new Error(`Empty staffMap returned for staffID ${staffID}`)
            } else {
                paymentProto = {
                    ...emptyTalenoxPayment,
                    staffID,
                    staffName: `${staffMapEntry.lastName} ${staffMapEntry.firstName}`,
                }
            }
            const serviceCommMapEntry = _commMap.get(staffID)
            if (serviceCommMapEntry === undefined) {
                throw new Error(`Empty serviceCommMap entry returned for staffID ${staffID}. (Should never happen)`)
            } else {
                for (let k = 0; k < commMapEntry.length; k++) {
                    /* Create a new payment object based on paymentProto which
                contains staffID, firstName, etc. */
                    payment = { ...paymentProto }
                    switch (k) {
                        case TIPS_INDEX:
                            payment.amount = commMapEntry[TIPS_INDEX]
                            payment.type = "Tips"
                            payment.remarks = TIPS_REMARK
                            payments.push(payment)
                            break
                        case PROD_COMM_INDEX:
                            payment.amount = commMapEntry[PROD_COMM_INDEX]
                            payment.type = "Commission (Irregular)"
                            payment.remarks = PRODUCT_COMM_REMARK
                            payments.push(payment)
                            break
                        case SERV_COMM_INDEX:
                            payment.type = "Commission (Irregular)"
                            payment.amount = commMapEntry[SERV_COMM_INDEX]
                            payment.remarks = SERVICES_COMM_REMARK
                            payments.push(payment)
                            break
                        case SERV_REV_INDEX:
                            // do nothing
                            break
                        default:
                            throw new Error("Commission Map has more entries than expected.")
                            break
                    }
                }
            }
        }
    })
    return payments
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

async function getTalenoxEmployees(): Promise<TStaffMap> {
    const url = new URL(`https://${TALENOX_BASE_URL}/employees`)
    const myHeaders = new Headers()
    myHeaders.append("Content-Type", "application/json; charset=utf-8")
    const init: RequestInit = {
        headers: myHeaders,
        redirect: "follow",
        method: "GET",
    }

    const response = await fetch(url, init)
    if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`)
    }

    const result = JSON.parse(await response.text()) as ITalenoxStaffInfo[]
    const staffMap = new Map<TStaffID, IStaffNames>()
    result.forEach((staffInfo) => {
        staffMap.set(staffInfo.employee_id, { firstName: staffInfo.first_name, lastName: staffInfo.last_name })
    })
    return staffMap
}

async function createPayroll(staffMap: TStaffMap): Promise<[boolean, any]> {
    const url = new URL(`https://${TALENOX_BASE_URL}/payroll/payroll_payment`)

    const myHeaders = new Headers()
    myHeaders.append("Content-Type", "application/json; charset=utf-8")

    const employee_ids: TStaffID[] = []
    staffMap.forEach((staffInfo, staffID) => {
        employee_ids.push(staffID)
    })

    const payment: ITalenoxPayrollPayment = {
        year: config.PAYROLL_YEAR,
        month: config.PAYROLL_MONTH,
        period: TALENOX_WHOLE_MONTH,
        with_pay_items: true,
    }

    const body = JSON.stringify({ employee_ids, payment } as ITalenoxPayroll)

    const init: RequestInit = {
        headers: myHeaders,
        body,
        redirect: "follow",
        method: "POST",
    }
    try {
        const response = await fetch(url, init)
        if (!response.ok) {
            throw new Error(`${response.status}: ${response.statusText}`)
        }

        /**
         *  result: { message:"Successfully updated payment.",
            month:"May"
            pay_group:null
            payment_id:793605
            period:"Whole Month"
            year:"2020" }
         */

        const result = JSON.parse(await response.text())

        return [response.ok, result as ITalenoxPayrollPaymentResult]
    } catch (error) {
        return [false, error]
    }
}

async function uploadAdHocPayments(payments: ITalenoxPayment[]): Promise<[boolean, any]> {
    const url = new URL(`https://${TALENOX_BASE_URL}/payroll/adhoc_payment`)

    const myHeaders = new Headers()
    myHeaders.append("Content-Type", "application/json; charset=utf-8")

    const payment: ITalenoxAdHocPayment = {
        // id: 790479,
        year: config.PAYROLL_YEAR,
        month: config.PAYROLL_MONTH,
        period: TALENOX_WHOLE_MONTH,
        //  pay_group: null,
    }

    // eslint-disable-next-line @typescript-eslint/camelcase
    const pay_items: ITalenoxAdhocPayItems[] = []
    payments.forEach((mbPayment) => {
        // eslint-disable-next-line @typescript-eslint/camelcase
        pay_items.push({
            // eslint-disable-next-line @typescript-eslint/camelcase
            employee_id: mbPayment.staffID,
            // eslint-disable-next-line @typescript-eslint/camelcase
            item_type: mbPayment.type,
            remarks: mbPayment.remarks,
            amount: mbPayment.amount,
        })
    })

    const body = JSON.stringify({ payment, pay_items })

    const init: RequestInit = {
        headers: myHeaders,
        body,
        redirect: "follow",
        method: "POST",
    }
    try {
        const response = await fetch(url, init)
        if (!response.ok) {
            throw new Error(`${response.status}: ${response.statusText}`)
        }

        const result = JSON.parse(await response.text())
        /* Result has form
        {
            "payment_id":790462,
            "month":"May",
            "year":"2020",
            "period":"Whole Month",
            "pay_group":null,
            "message":"Successfully updated payment."
        } */
        return [response.ok, result]
    } catch (error) {
        return [false, error]
    }
}

async function main(): Promise<void> {
    console.log(`Payroll Month is ${config.PAYROLL_MONTH}`)
    console.log(`Requesting employees from Talenox`)
    const staffMap = await getTalenoxEmployees()
    console.log(`Requesting employees complete`)
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
    // start building commission components working through the rows of the spreadsheet (array of arrays)
    // ignore the first row which contains the date range for the report
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
        const element = wsaa[rowIndex][0]
        if (element !== undefined) {
            // Check if this line contans a staffID
            // We null out staffID when we've finished processing the previous staffmembers commission.
            // If staffID has a value then were still processing commission for one of the team
            if (staffID === undefined) {
                const staffInfo = getStaffIDAndName(wsaa, rowIndex)
                if (staffInfo) {
                    // found staffID so keep a note of which row it's on
                    currentStaffIDRow = rowIndex
                    staffID = staffInfo.staffID
                    if (staffID) {
                        let staffMapInfo = staffMap.get(staffID)
                        if (staffID && staffMapInfo) {
                            staffName = `${staffMapInfo.lastName} ${staffMapInfo.firstName}`
                        } else {
                            const text = `${staffID ? staffID : "null"}${
                                staffInfo.firstName ? " " + staffInfo.firstName : ""
                            }${
                                staffInfo.lastName ? " " + staffInfo.lastName : ""
                            } in MB Payroll Report line ${rowIndex} not in Talenox.`
                            if (config.missingStaffAreFatal) {
                                throw new Error(text)
                            } else {
                                console.warn(text)
                            }
                        }
                    }
                } /* else {
                    We expect to fall through to here. Not every row contains a staff ID and name
                } */
            }
            if ((element as string).startsWith(TOTAL_FOR)) {
                // If we've found a line beginning with "Total for " then we've got to the subtotals  and total for a staff member
                // Keep track of the last totals row (for the previous employee) because we'll need to search
                // back to this row to locate all of the revenue numbers for the current staff member.
                // currentIDRow = currentTotalForRow;
                currentTotalForRow = rowIndex
                // const staffID = getStaffID(wsaa, prevTotalForRow);
                const commComponents: [number, number, number, number] = [0, 0, 0, 0]
                /* find and process tips, product commission and services commission
                go back 3 lines from the "Total for:" line - the tips and product commission
                should be in that range .
                Note tips and or product commission may not exist. */
                console.log(`Payroll details for  ${staffID} ${staffName}`)
                for (let j = 3; j >= 0; j--) {
                    let payComponent: string = wsaa[rowIndex - j][0] as string
                    if (payComponent !== undefined) {
                        let value = 0
                        if (
                            payComponent === TIPS_FOR ||
                            payComponent === COMM_FOR ||
                            payComponent.startsWith(TOTAL_FOR)
                        ) {
                            // work out what the value is for the Tip or Commission
                            // by looking at the last cell in the row
                            const maxRowIndex = wsaa[rowIndex - j].length - 1
                            if (wsaa[rowIndex - j][maxRowIndex] !== undefined) {
                                value = Number(wsaa[rowIndex - j][maxRowIndex])
                                if (payComponent === TIPS_FOR) {
                                    payComponent = "Tips:"
                                    commComponents[TIPS_INDEX] = value
                                    console.log(`${payComponent} ${value}`)
                                }
                                if (payComponent === COMM_FOR) {
                                    payComponent = "Product Commission:"
                                    commComponents[PROD_COMM_INDEX] = value
                                    console.log(`${payComponent} ${value}`)
                                }
                            } else {
                                value = 0
                            }
                            if (payComponent.startsWith(TOTAL_FOR)) {
                                // Reached the end of this staff members block in the report

                                payComponent = "Services Revenue:"
                                value = sumRevenue(wsaa, currentTotalForRow, currentStaffIDRow, revCol)
                                commComponents[SERV_REV_INDEX] = value
                                // set services comm to zero for now. Will fill-in later
                                payComponent = "Services Commission"
                                const serviceRevenue = value
                                value = calcServiceCommission(
                                    staffID!,
                                    staffMap,
                                    serviceRevenue // The  value is the the total services revenue calculated above
                                )
                                commComponents[SERV_COMM_INDEX] = value
                                console.log(`${payComponent} ${value}`)
                            }
                            value = 0
                        }

                        if (j === 0) {
                            if (staffID) {
                                commMap.set(staffID, commComponents)
                            } else {
                                throw new Error(`Fatal: Missing staffID for staff: ${staffName}`)
                            }
                            console.log("==========")
                        }
                    }
                }
                // Reset staffID and start looking for the next staff payments block in the report
                staffID = undefined
            }
        }
    }

    /* Looking at staffHurdle.json work out how much commission is paid at each commission hurdle
and populate the commMap service commission map */
    // Call calcServiceCommission(staffID!, commMap);
    // TODO: loop through commMap and update the service commission for everyone

    /* Create a spreadsheet containing one line for each payment to be made for each of the staff.
This spreadsheet will be copied/pasted into Talenox and together with their salary payments will
form the payroll for the month */

    const payments = createAdHocPayments(commMap, staffMap)
    writePaymentsWorkBook(payments)
    console.log(`Requesting new payroll payment creation from Talenox`)
    const createPayrollResult = await createPayroll(staffMap)
    console.log(`New payroll payment is complete`)
    console.log(`${createPayrollResult[0] ? "OK" : "Failed"}: ${createPayrollResult[1].message}`)
    console.log(`Pushing ad-hoc payments into new payroll`)
    const uploadAdHocResult = await uploadAdHocPayments(payments)
    console.log(`Pushing ad-hoc payments is complete`)
    console.log(`${uploadAdHocResult[0] ? "OK" : "Failed"}: ${uploadAdHocResult[1].message}`)
}

main()
    .then(() => {
        "Waiting on Talenox updates."
    })
    .catch((error) => console.error(`${error}`))

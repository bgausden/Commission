/* eslint-disable @typescript-eslint/camelcase */
import { config } from "node-config-ts"
import { ITalenoxPayment } from "./ITalenoxPayment.js"
import {
    TStaffID,
    TCommMap,
    COMM_COMPONENT_TIPS,
    COMM_COMPONENT_PRODUCT_COMMISSION,
    COMM_COMPONENT_GENERAL_SERVICE_COMMISSION,
    COMM_COMPONENT_TOTAL_SERVICE_REVENUE,
    COMM_COMPONENT_CUSTOM_RATE_COMMISSION,
    COMM_COMPONENT_CUSTOM_RATE_COMMISSIONS,
    COMM_COMPONENT_TOTAL_SERVICE_COMMISSION,
    TTalenoxInfoStaffMap
} from "./types.js"
import { TALENOX_TIPS, TALENOX_COMMISSION_IRREGULAR, TALENOX_ADHOC_PAYMENT_ENDPOINT, TALENOX_API_TOKEN } from "./talenox_constants.js"
import { isContractor, payrollStartDate } from "./utility_functions.js"
import { ITalenoxAdHocPayment } from "./ITalenoxAdHocPayment.js"
import { ITalenoxAdhocPayItems } from "./ITalenoxAdhocPayItems.js"
import { TALENOX_WHOLE_MONTH, TALENOX_PAYROLL_PAYMENT_ENDPOINT, TALENOX_EMPLOYEE_ENDPOINT } from "./talenox_constants.js"
import { ITalenoxPayroll, TalenoxPayrollPayment } from "./ITalenoxPayrollPayment.js"
import { TalenoxPayrollPaymentResult } from "./ITalenoxPayrollPaymentResult.js"
import { TalenoxUploadAdHocPaymentsResult } from "./IUploadAdHocPaymentsResult.js"
import fetch from "node-fetch"
import { Headers, RequestInit } from "node-fetch"
import { ITalenoxStaffInfo } from "./ITalenoxStaffInfo.js"
import debug from "debug"

const SERVICES_COMM_REMARK = "Services commission"
const TIPS_REMARK = "Tips"
const PRODUCT_COMM_REMARK = "Product commission"

const talenoxFunctionsDebug = debug("talenox_functions")

export const firstDay = payrollStartDate(config)

export function createAdHocPayments(_commMap: TCommMap, staffMap: TTalenoxInfoStaffMap): ITalenoxPayment[] {
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
            const staffMapEntry = staffMap.get(staffID)
            let payment: ITalenoxPayment
            if (staffMapEntry === undefined) {
                throw new Error(`Empty staffMap returned for staffID ${staffID}`)
            }
            else {
                paymentProto = {
                    ...emptyTalenoxPayment,
                    staffID,
                    staffName: `${staffMapEntry.last_name} ${staffMapEntry.first_name}`,
                }
            }
            const commMapEntry = _commMap.get(staffID)
            if (commMapEntry === undefined) {
                throw new Error(`Empty commMap entry returned for staffID ${staffID}. (Should never happen)`)
            }
            else {
                for (const [key, value] of Object.entries(commMapEntry)) {
                    /*
                    Create a new payment object based on paymentProto which
                    contains staffID, firstName, etc.
                    */
                    payment = { ...paymentProto }
                    switch (key) {
                        case COMM_COMPONENT_TIPS:
                            if (typeof value === "number") {
                                payment.amount = value
                            }
                            else {
                                throw new Error(`Invalid value for 'tips' in commMapEntry`)
                            }
                            payment.type = TALENOX_TIPS
                            payment.remarks = TIPS_REMARK
                            payments.push(payment)
                            break
                        case COMM_COMPONENT_PRODUCT_COMMISSION:
                            payment.amount = commMapEntry.productCommission
                            payment.type = TALENOX_COMMISSION_IRREGULAR
                            payment.remarks = PRODUCT_COMM_REMARK
                            payments.push(payment)
                            break
                        case COMM_COMPONENT_GENERAL_SERVICE_COMMISSION:
                            payment.type = TALENOX_COMMISSION_IRREGULAR
                            payment.amount = commMapEntry.generalServiceCommission
                            payment.remarks = SERVICES_COMM_REMARK
                            payments.push(payment)
                            break
                        case COMM_COMPONENT_CUSTOM_RATE_COMMISSIONS:
                            /*
                            Loop through all the special rates services and create a Talenox payment entry for each
                            */
                            for (const [service, specialRateCommission] of Object.entries(
                                commMapEntry.customRateCommissions
                            )) {
                                if (specialRateCommission) {
                                    payment.amount = specialRateCommission
                                    payment.type = TALENOX_COMMISSION_IRREGULAR
                                    payment.remarks = `${service} at custom rate.`
                                    payments.push(payment)
                                }
                                payment = { ...paymentProto } // reset to empty payment
                            }
                            break
                        case COMM_COMPONENT_TOTAL_SERVICE_REVENUE:
                            // do nothing
                            break
                        case COMM_COMPONENT_CUSTOM_RATE_COMMISSION:
                            // do nothing
                            break
                        case COMM_COMPONENT_TOTAL_SERVICE_COMMISSION:
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

export async function getTalenoxEmployees(): Promise<TTalenoxInfoStaffMap> {
    const getEmployeesDebug = talenoxFunctionsDebug.extend("getTalenoxEmployees")
    const url = TALENOX_EMPLOYEE_ENDPOINT
    const myHeaders = new Headers({
        "Content-Type": "application/json;charset=utf-8",
        "Authorization": `Bearer ${TALENOX_API_TOKEN}`
    })
    //myHeaders.append("Content-Type", "application/json;charset=utf-8")
    const init: RequestInit = {
        headers: myHeaders,
        redirect: "follow",
        method: "GET",
    }
    getEmployeesDebug("url: %s", url)
    getEmployeesDebug("init: %O", init)
    const response = await fetch(url, init)
    if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`)
    }

    const result = JSON.parse(await response.text()) as ITalenoxStaffInfo[]
    const staffMap = new Map<TStaffID, Partial<ITalenoxStaffInfo>>()
    result.forEach((staffInfo) => {
        staffMap.set(staffInfo.employee_id, { first_name: staffInfo.first_name, last_name: staffInfo.last_name, resign_date: staffInfo.resign_date })
    })
    return staffMap
}


export async function createPayroll(staffMap: TTalenoxInfoStaffMap): Promise<[Error | undefined, TalenoxPayrollPaymentResult | undefined]> {
    const url = TALENOX_PAYROLL_PAYMENT_ENDPOINT

    /* const myHeaders = new Headers()
    myHeaders.append("Content-Type", "application/json; charset=utf-8") */
    const myHeaders = new Headers({
        "Content-Type": "application/json;charset=utf-8",
        "Authorization": `Bearer ${TALENOX_API_TOKEN}`
    })

    const employee_ids: TStaffID[] = []
    staffMap.forEach((staffInfo, staffID) => {
        if (typeof staffInfo.resign_date !== "undefined") {
            const resignDate = new Date(Date.parse(staffInfo.resign_date))
            if (resignDate < firstDay) {
                console.log(`${staffInfo.first_name} ${staffInfo.last_name} resigned prior to this payroll month`)
            } else {
                employee_ids.push(staffID)
            }
        } else {
            employee_ids.push(staffID)
        }
    })

    const payment: TalenoxPayrollPayment = {
        year: config.PAYROLL_YEAR,
        month: config.PAYROLL_MONTH,
        period: TALENOX_WHOLE_MONTH,
        with_pay_items: true,
        pay_group: `${config.PAYROLL_MONTH} ${config.PAYROLL_YEAR}`,
    }

    const body = JSON.stringify({ employee_ids, payment } as ITalenoxPayroll)

    const init: RequestInit = {
        headers: myHeaders,
        body,
        redirect: "follow",
        method: "POST",
    }
    const response = await fetch(url, init)
    if (!response.ok) {
        // Something went horribly wrong. Unlikely we can do anything useful with the failure
        return [Error(`${response.status}: ${response.statusText}`), undefined]
    }

    /**
         * Sample response.text():
         *
         result: { message:"Successfully updated payment.",
            month:"May"
            pay_group:null
            payment_id:793605
            period:"Whole Month"
            year:"2020" }
         */
    const result = JSON.parse(await response.text())
    return [undefined, result as TalenoxPayrollPaymentResult]
}

export async function uploadAdHocPayments(staffMap: TTalenoxInfoStaffMap, payments: ITalenoxPayment[]): Promise<[Error | undefined, TalenoxUploadAdHocPaymentsResult | undefined]> {
    const url = TALENOX_ADHOC_PAYMENT_ENDPOINT

    /* const myHeaders = new Headers()
    myHeaders.append("Content-Type", "application/json; charset=utf-8") */
    const myHeaders = new Headers({
        "Content-Type": "application/json;charset=utf-8",
        "Authorization": `Bearer ${TALENOX_API_TOKEN}`
    })

    const payment: ITalenoxAdHocPayment = {
        // id: 790479,
        year: config.PAYROLL_YEAR,
        month: config.PAYROLL_MONTH,
        period: TALENOX_WHOLE_MONTH,
    }

    // eslint-disable-next-line @typescript-eslint/camelcase
    const pay_items: ITalenoxAdhocPayItems[] = []
    payments.forEach((mbPayment) => {
        // eslint-disable-next-line @typescript-eslint/camelcase
        const resignDateString = staffMap.get(mbPayment.staffID)?.resign_date
        if (resignDateString) {
            const resignDate = new Date(Date.parse(resignDateString))
            if (resignDate < firstDay) {
                console.warn(`${mbPayment.staffName} has commission due but resigned prior to this payroll month`)
            }
            else {
                pay_items.push({
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    employee_id: mbPayment.staffID,
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    item_type: mbPayment.type,
                    remarks: mbPayment.remarks,
                    amount: mbPayment.amount,
                })
            }
        } else {
            pay_items.push({
                // eslint-disable-next-line @typescript-eslint/camelcase
                employee_id: mbPayment.staffID,
                // eslint-disable-next-line @typescript-eslint/camelcase
                item_type: mbPayment.type,
                remarks: mbPayment.remarks,
                amount: mbPayment.amount,
            })
        }
    })

    const body = JSON.stringify({ payment, pay_items })

    const init: RequestInit = {
        headers: myHeaders,
        body,
        redirect: "follow",
        method: "POST",
    }

    const response = await fetch(url, init)
    if (!response.ok) {
        return [new Error(`${response.status}: ${response.statusText}`), undefined]
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
    return [undefined, result as TalenoxUploadAdHocPaymentsResult]
}

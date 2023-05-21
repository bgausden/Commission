import { CommComponents, TTalenoxInfoStaffMap } from "./types.js";
import { findRevenueCol, isString } from "./utility_functions.js";
import { GENERAL_SERV_REVENUE, getServiceRevenue } from "./getServiceRevenue.js";
import { calcGeneralServiceCommission } from "./calcGeneralServiceCommission.js";
import { getTipsOrProductCommissionAmounts as getTipsProdCommissionAmounts } from "./getTipsAndProductCommissionAmounts.js";
import { TOTAL_FOR } from "./constants.js";
import { logCommission } from "./logCommission.js";
import { commMap } from "./index.js";

export function gatherCommissionComponents(wsaa: unknown[][], rowIndex: number, commComponents: CommComponents, staffID: string, currentTotalForRow: number, currentStaffIDRow: number, talenoxStaff: TTalenoxInfoStaffMap, staffName: string | undefined) {
    const revCol = findRevenueCol(wsaa);
    for (let j = 3; j >= 0; j--) {
        let payComponent = wsaa[rowIndex - j][0];
        // let value = 0;
        const currentRowNumber = rowIndex - j;
        const currentRow = wsaa[currentRowNumber];

        if (!isString(payComponent)) {
            // errorLogger.error(`Unexpected value ${payComponent} at row ${currentRowNumber} for ${staffName}`)
            //throw new Error(`Unexpected value ${payComponent} at row ${currentRowNumber} for ${staffName}`)
            continue;
        }

        /*         if (payComponent !== TIPS_FOR && payComponent !== COMM_FOR && !payComponent.startsWith(TOTAL_FOR)) {
                  errorLogger.error(`Unexpected value ${payComponent} at row ${currentRowNumber} for ${staffName}`)
                  throw new Error(`Unexpected value ${payComponent} at row ${currentRowNumber} for ${staffName}`)
                } */
        /* Work out what the value is for the Tip or Commission
                      by looking at the last cell in the row */
        getTipsProdCommissionAmounts(currentRow, payComponent, commComponents);
        if (!isString(payComponent)) { continue; } // just to keep typescript happy
        if (payComponent.startsWith(TOTAL_FOR)) {
            // Reached the end of this staff members block in the report. Go back and add up all the revenue amounts
            payComponent = "Services Revenue:";

            // Old way - services revenue is a single number
            if (!staffID) {
                throw new Error(`Somehow don't have a staffID despite guard further up`);
            }
            /* const totalServicesRevenues = sumServiceRevenues(
                                  getServiceRevenues(wsaa, currentTotalForRow, currentStaffIDRow, revCol, staffID)
                              ) */
            // New way - some revenues from "general services", some revenues from custom pay rates
            const servicesRevenue = getServiceRevenue(
                wsaa,
                currentTotalForRow,
                currentStaffIDRow,
                revCol,
                staffID
            );
            // const generalServRevenue= servicesRevenues.get(GENERAL_SERV_REVENUE)
            // value = generalServRevenue ? generalServRevenue.revenue : 0
            let totalServiceRevenue = 0;
            let generalServiceRevenue = 0;
            if (servicesRevenue) {
                servicesRevenue.forEach((element, serviceName) => {
                    totalServiceRevenue += element.serviceRevenue;
                    if (serviceName === GENERAL_SERV_REVENUE) {
                        generalServiceRevenue = element.serviceRevenue;
                    }
                });
            }

            commComponents.totalServiceRevenue = totalServiceRevenue;
            // set services comm to  total revenue for now. Will fill-in later
            payComponent = "General Services Commission";
            // const serviceRevenue = value
            const generalServiceCommission = calcGeneralServiceCommission(
                staffID,
                talenoxStaff,
                generalServiceRevenue // The  value is the the total services revenue calculated above
            );
            commComponents.generalServiceCommission = generalServiceCommission;
            commComponents.totalServiceCommission += generalServiceCommission;
            // log(`${payComponent} ${generalServiceCommission}`)
            /*
            Calculate the commission for each of the custom pay rate services
            in servicesRevenues and add to commComponents.customRateCommission.
            While we're here we can also add up the total custom service commission.
            */
            let totalCustomServiceCommission = 0;
            if (servicesRevenue) {
                servicesRevenue.forEach((customRateEntry, serviceName) => {
                    if (serviceName !== GENERAL_SERV_REVENUE) {
                        const customServiceRevenue = customRateEntry.serviceRevenue * Number(customRateEntry.customRate);
                        commComponents.customRateCommissions[serviceName] = customServiceRevenue;
                        totalCustomServiceCommission += customServiceRevenue;
                    }
                });
                commComponents.customRateCommission = totalCustomServiceCommission;
                commComponents.totalServiceCommission += totalCustomServiceCommission;
            }
        } /* else {
                throw new Error(`Somehow don't have a staffID despite guard further up`)
              } */




        // value = 0;

        if (j === 0) { // last row in the block "Total for <staff name>"
            if (!staffID) {
                throw new Error(`Fatal: Missing staffID for staff: ${staffName ? staffName : "<Staff Name Unknown>"}`)
            }
            commMap.set(staffID, commComponents);
            logCommission(staffID, commComponents);
        }
    }
}

/* eslint-disable no-irregular-whitespace */
import staffHurdle from "./staffHurdle.json" assert { type: "json" }
import {
    TStaffID, TStaffHurdles,
    TCustomRateEntry,
    ServiceRevenue,
    TServiceName, PayRate
} from "./types.js";
import { CustomPayRate } from "./IStaffHurdle";
import { stripToNumeric } from "./utility_functions.js";
import { warnLogger, errorLogger, debugLogger } from "./logging_functions.js";
import { defaultStaffID, SERVICE_ROW_REGEX, SERVICE_TYPE_INDEX } from "./index.js";
import { isString, isNumber } from "./utility_functions.js"

export const GENERAL_SERV_REVENUE = "General Services"

/**
 * @function getServicesRevenue - buckets revenue by custom pay-rate. One bucket is a catch-all
 * @param {unknown[][]} wsArray - array representing the worksheet
 * @param {number} currentTotalRow - row number for last found "Total for" row in the worksheet
 * @param {number} currentStaffIDRow - row number for the last found "Staff ID" row in the worksheet
 * @param {number} revCol - column containing the services revenue
 * @param {TStaffID} staffID - ID for the member of staff for whom we are calculating revenues/comms
 */
export function getServiceRevenue(
    wsArray: unknown[][],
    currentTotalRow: number,
    // tslint:disable-next-line: no-shadowed-variable
    currentStaffIDRow: number,
    // tslint:disable-next-line: no-shadowed-variable
    revCol: number,
    staffID: TStaffID): ServiceRevenue {
    /*
      Starting on the staff member's first row, sum all the numeric values in the revenue column
      down as far as the staff member's totals row + 1. Use this as the service revenue so we can ignore
      how staff commissions are configured in MB.
      Note we are offsetting backwards from the Totals row and reducing the offset each iteration - so we're actually
      working our way down the sheet from top to bottom.
      */
    const numSearchRows = currentTotalRow - currentStaffIDRow - 1;
    const revColumn = revCol;
    const servRevenueMap: ServiceRevenue = new Map<TServiceName, TCustomRateEntry>();
    let serviceRevenue = 0;
    let customRate = undefined;
    let sh = undefined;
    if ((staffHurdle as TStaffHurdles)[staffID]) {
        sh = (staffHurdle as TStaffHurdles)[staffID];
    } else {
        warnLogger.warn(`Warning: Staff ID ${staffID} is not present in staffHurdle.json`);
        sh = (staffHurdle as TStaffHurdles)[defaultStaffID];
    }
    // const sh = (staffHurdle as TStaffHurdles)[staffID] ? (staffHurdle as TStaffHurdles)[staffID] : (staffHurdle as TStaffHurdles)[defaultStaffID]
    if (!sh) {
        errorLogger.error(`Error: Staff ID ${staffID} is not present and there is no default with ID 000 in staffHurdle.json`);
        //process.exit(1)
        throw new Error("Error: Staff ID ${staffID} is not present and there is no default with ID 000 in staffHurdle.json");
    }
    const customPayRates = sh ? sh.customPayRates : [];
    // const customPayRates = Object.prototype.hasOwnProperty.call(sh, "customPayRates") ? sh["customPayRates"] : null
    //const customPayRates = sh.customPayRates ?? []
    let serviceName: TServiceName = GENERAL_SERV_REVENUE;
    for (let i = numSearchRows; i >= 1; i--) {
        const currentRow = currentTotalRow - i;
        /*   first iteration should place us on a line beginning with "Hair Pay Rate: Ladies Cut and Blow Dry (55%)" or similar
              i.e. <revenue category> Pay Rate: <service name> (<commission rate>)
        */
        const possibleServiceDescription = wsArray[currentRow][0];
        if (!isString(possibleServiceDescription)) {
            continue;
        }
        const match = (possibleServiceDescription).match(SERVICE_ROW_REGEX); // regex is something like /(.*) Pay Rate: (.*) \((.*)%\)/i












        /*
            Found a row that looks similar to:
            Hair Pay rate: Ladies Cut and Blow Dry (55%)
            where match[0] = Hair, match[1]=Ladies Cut and Blow Dry and match[2]=55
            e.g. below - first line is the info on the service, then a column header row, then the rows for each provided service
            Hair Pay rate: K18 Treatment (50%)
            Appointment Date	Appt. Time	    Client Name	Series Used		          Revenue		Rev. per Session	Earnings
            Saturday, 18 March 2023	10:00 am	M. Williams	Add on- K18 Treatment		880		    880	              440
            Monday, 27 March 2023	2:00 pm	    Z. Pearson	Add on- K18 Treatment		800		    800	              400
                                                                                                                              840
     
            */
        if (match) {
            // Have a section header for a block of services
            serviceName = match[SERVICE_TYPE_INDEX];
            // check if we have special rates for this servType
            customRate = getCustomPayRate();
            if (!customRate) {
                serviceName = GENERAL_SERV_REVENUE; // catch-all servType for everything without a custom pay-rate
            }
            //Check if the service name is present in the servRevenueMap if not present then add the service name. Later in the code we depend on all services being present.
            if (!servRevenueMap.get(serviceName)) {
                servRevenueMap.set(serviceName, { serviceRevenue: 0, customRate });
            }
            // Won't be any revenue on this line so skip to next line
            continue;
        }

        // If there's no revenue on this row, don't continue processing
        const revenue = stripToNumeric(wsArray[currentRow][revColumn]);
        if (!isNumber(revenue) || revenue == 0 || isNaN(revenue)) { continue; }

        //revenueCellContents = stripToNumeric(revenueCellContents)
        /*             if (typeof revenueCellContents === "string") {
                  revenueCellContents = stripToNumeric(revenueCellContents)
               } else {
                  if (typeof revenueCellContents === "number") {
                      // all good
                  }
               } */
        // serviceRevenue = revenue
        // accumulate the serv revenues for this servType in the map
        const serviceRevenueEntry = servRevenueMap.get(serviceName);
        if (serviceRevenueEntry === undefined) {
            errorLogger.error(`Error: ${serviceName} is not present in servRevenueMap`);
            throw new Error(`Did not find ${serviceName} in servRevenueMap. This should never happen.`);
        }

        // customRate = custom.customRate
        // custom = [custom[0] + revenueCellContents, custom[1]]
        //servRevenueMap.set(servType, custom)
        serviceRevenue = revenue + serviceRevenueEntry.serviceRevenue;
        servRevenueMap.set(serviceName, { serviceRevenue, customRate });
    }
    return servRevenueMap;

    function getCustomPayRate(): PayRate | undefined {
        customRate = undefined;
        if (!customPayRates) { return customRate; }
        for (const customPayRate of customPayRates) {
            customRate = findCustomRateInServices(serviceName, customPayRate);
            if (customRate) {
                return customRate;
            }
        }
        return customRate;
    }

    /**
     *
     * @param customPayRate: { [serviceName: string]: PayRate}
     * @returns customRate: PayRate
     *
     * customPayRate is an object with possibly multiple key:PayRate pairs e.g.
     * {
     *    "Ladies Cut and Blow Dry": 0.55,
     *    "Gents Cut": 0.5
     * }
     */
    function findCustomRateInServices(servName: string, customPayRate: CustomPayRate): PayRate | undefined {
        // we generally don't have multiple services defined in the customPayRate object but we might in future, so we can just iterate through the keys
        if (!(servName in customPayRate)) { return undefined; }
        if (process.env.DEBUG) { 
            const rate = customPayRate[servName] ? JSON.stringify(customPayRate[servName]) : "undefinedPayRate"
            debugLogger.debug(`Found custom pay rate for ${servName}. Rate is ${rate}`) }
        return customPayRate[servName];
        /*     for (const serviceWithCustomPayRate in customPayRate) {
              //if (Object.prototype.hasOwnProperty.call(customPayRate, serviceWithCustomPayRate) && servName === serviceWithCustomPayRate) {
              if (serviceWithCustomPayRate === servName) {
                return customPayRate[serviceWithCustomPayRate]
                break
              }
            }
            return undefined */
    }
}

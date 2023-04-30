import staffHurdle from "./staffHurdle.json" assert { type: "json" }
import { GeneralServiceComm } from "./GeneralServiceComm";
import { StaffCommConfig } from "./IStaffCommConfig";
import {
    TStaffID, TServiceRevenue, TStaffHurdles,
    TTalenoxInfoStaffMap
} from "./types.js";
import { StaffHurdle } from "./IStaffHurdle"
import { checkRate, stripToNumeric } from "./utility_functions.js";
import { errorLogger } from "./logging_functions.js";
import { defaultStaffID, emptyServComm, serviceCommMap } from "./index.js";
import { BASE_RATE, HURDLE_1_LEVEL, HURDLE_2_LEVEL, HURDLE_3_LEVEL } from "./constants.js";

export function calcGeneralServiceCommission(
    staffID: TStaffID,
    staffMap: TTalenoxInfoStaffMap,
    serviceRev: TServiceRevenue): number {
    /* iterate through commissionComponents
      for each entry, locate corresponding hurdles and then calculate amounts payable for base rate (0 for most staff) and then from each hurdle to the next store the amounts payable in a new Map where the key is the staff name and the value is an array containing
      [baseCommission, hurdle1Commission, hurdle2Commission]
      Where staff are pooling their income, these amounts will be their equal share of what has gone into their pool (TODO) */
    let totalServiceComm: number;
    const sh = staffHurdle as TStaffHurdles; // get an iterable version of the staffHurdle import

    // TODO review if we really need shm or could simply use the import staffHurdle directly
    const shm = new Map<TStaffID, StaffHurdle>();
    // TODO Do we really need to build a new map from the entirety of the staff hurdle object? Surely need only this staff member
    // Object.keys(sh).forEach((k) => shm.set(k, sh[k])) // iterate through staffHurdle and build a Map
    if (sh[staffID]) {
        shm.set(staffID, sh[staffID]);
    } else {
        shm.set(staffID, sh[defaultStaffID]);
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
        };
        // const serviceRev = commComponents[SERV_COMM_INDEX];
        let tempStaffCommConfig: unknown = shm.get(staffID);
        let staffCommConfig: StaffCommConfig;
        if (tempStaffCommConfig) {
            staffCommConfig = tempStaffCommConfig as StaffCommConfig;
        } else {
            //throw new Error(`Missing staff commission config for StaffID: ${staffID}`)
            tempStaffCommConfig = shm.get(defaultStaffID);
            staffCommConfig = tempStaffCommConfig as StaffCommConfig;
        }
        let baseRevenue = 0;
        let baseRate = 0;
        let hurdle1Revenue = 0;
        let hurdle1Level = 0;
        let hurdle1Rate = 0;
        let hurdle2Revenue = 0;
        let hurdle2Level = 0;
        let hurdle2Rate = 0;
        let hurdle3Revenue = 0;
        let hurdle3Level = 0;
        let hurdle3Rate = 0;

        if (Object.prototype.hasOwnProperty.call(staffCommConfig, BASE_RATE)) {
            // if (staffCommConfig.hasOwnProperty(BASE_RATE)) {
            baseRate = stripToNumeric(staffCommConfig.baseRate);
            if (!checkRate(baseRate)) {
                throw new Error("Invalid baseRate");
            }
        }

        if (Object.prototype.hasOwnProperty.call(staffCommConfig, HURDLE_1_LEVEL)) {
            hurdle1Level = stripToNumeric(staffCommConfig.hurdle1Level);
            hurdle1Rate = stripToNumeric(staffCommConfig.hurdle1Rate);
            if (!checkRate(hurdle1Rate)) {
                errorLogger.error(`Fatal: Error with ${staffID}'s commission config in staffHurdle.json`);
                throw new Error("Invalid hurdle1Rate");
            }
        }

        if (Object.prototype.hasOwnProperty.call(staffCommConfig, HURDLE_2_LEVEL)) {
            hurdle2Level = stripToNumeric(staffCommConfig.hurdle2Level);
            hurdle2Rate = stripToNumeric(staffCommConfig.hurdle2Rate);
            if (!checkRate(hurdle2Rate)) {
                errorLogger.error(`Fatal: Error with ID ${staffID}'s commission config in staffHurdle.json`);
                throw new Error("Invalid hurdle2Rate");
            }
        }

        if (Object.prototype.hasOwnProperty.call(staffCommConfig, HURDLE_3_LEVEL)) {
            hurdle3Level = stripToNumeric(staffCommConfig.hurdle3Level);
            hurdle3Rate = stripToNumeric(staffCommConfig.hurdle3Rate);
            if (!checkRate(hurdle3Rate)) {
                errorLogger.error(`Fatal: Error with ${staffID}'s commission config in staffHurdle.json`);
                throw new Error("Invalid hurdle3Rate");
            }
        }
        // TODO get rid of this nesting logic
        if (hurdle1Level <= 0) {
            // no hurdle. All servicesRev pays comm at baseRate
            baseRevenue = serviceRev;
            /* remove?
                      hurdle1Revenue = 0;
                      hurdle1Level = 0;
                      hurdle2Revenue = 0;
                      hurdle2Level = 0; */
        } else {
            // there is a hurdle1
            baseRevenue = Math.round(Math.max(serviceRev - hurdle1Level, 0) * 100) / 100;
            if (serviceRev > hurdle1Level) {
                if (hurdle2Level > 0) {
                    // service revenue  that falls between hurdle1 and hurdle2 generate comm at the hurdle1 Rate
                    hurdle1Revenue = Math.round(Math.min(serviceRev - hurdle1Level, hurdle2Level - hurdle1Level) * 100) / 100;
                    if (serviceRev > hurdle2Level) {
                        if (hurdle3Level > 0) {
                            // have  a hurdle3
                            /* revenue applicable to hurdle2 is either the amount of service revenue above
                                              hurdle2 or if the revenue exceeds hurdle3, the amount of revenue equal to
                                              the difference between hurdle3 and hurdle2 */
                            hurdle2Revenue = Math.round(Math.min(serviceRev - hurdle2Level, hurdle3Level - hurdle2Level) * 100) / 100;
                            if (serviceRev > hurdle3Level) {
                                hurdle3Revenue = Math.round((serviceRev - hurdle3Level) * 100) / 100;
                            } else {
                                // service revenue doesn't exceed hurdle3. All rev above hurdle 2 is hurdle2Revenue
                                hurdle2Revenue = Math.round((serviceRev - hurdle2Level) * 100) / 100;
                            }
                        } else {
                            // no hurdle3level so all revenue above hurdle2 generates comm at the hurdle2 rate
                            hurdle2Revenue = Math.round((serviceRev - hurdle2Level) * 100) / 100;
                        }
                    } else {
                        // service revenue doesn't exceed hurdle2
                        hurdle1Revenue = Math.round((serviceRev - hurdle1Level) * 100) / 100;
                    }
                } else {
                    // no hurdle2 so all revenue above hurdle1 generates comm at the hurdle1 rate
                    hurdle1Revenue = Math.round(((serviceRev - hurdle1Level) * 100) / 100);
                }
            } else {
                hurdle1Revenue = 0;
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
        const staffName = staffMap.get(staffID);

        tempServComm.staffName = `${staffName?.last_name ?? "<Last Name>"} ${staffName?.first_name ?? "<First Name>"}`;
        tempServComm.generalServiceRevenue = serviceRev;

        tempServComm.base.baseCommRevenue = baseRevenue;
        tempServComm.base.baseCommRate = baseRate;
        const baseCommPayout = baseRevenue * baseRate;
        tempServComm.base.baseCommAmt = Math.round(baseCommPayout * 100) / 100;

        tempServComm.hurdle1.hurdle1Revenue = hurdle1Revenue;
        tempServComm.hurdle1.hurdle1Level = hurdle1Level;
        tempServComm.hurdle1.hurdle1Rate = hurdle1Rate;
        const hurdle1Payout = hurdle1Revenue * hurdle1Rate;
        tempServComm.hurdle1.hurdle1PayOut = Math.round(hurdle1Payout * 100) / 100;

        tempServComm.hurdle2.hurdle2Revenue = hurdle2Revenue;
        tempServComm.hurdle2.hurdle2Level = hurdle2Level;
        tempServComm.hurdle2.hurdle2Rate = hurdle2Rate;
        const hurdle2Payout = hurdle2Revenue * hurdle2Rate;
        tempServComm.hurdle2.hurdle2Payout = Math.round(hurdle2Payout * 100) / 100;

        tempServComm.hurdle3.hurdle3Revenue = hurdle3Revenue;
        tempServComm.hurdle3.hurdle3Level = hurdle3Level;
        tempServComm.hurdle3.hurdle3Rate = hurdle3Rate;
        const hurdle3Payout = hurdle3Revenue * hurdle3Rate;
        tempServComm.hurdle3.hurdle3Payout = Math.round(hurdle3Payout * 100) / 100;

        totalServiceComm = Math.round((baseCommPayout + hurdle1Payout + hurdle2Payout + hurdle3Payout) * 100) / 100;
        tempServComm.generalServiceComm = totalServiceComm;

        serviceCommMap.set(staffID, tempServComm);

        // log(prettyjson.render(serviceCommMap.get(staffID)))
    } else {
        throw new Error(`${staffID} doesn't appear in staffHurdle.json (commission setup file)`);
    }
    // });
    return totalServiceComm;
}

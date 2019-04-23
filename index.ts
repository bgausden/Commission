import XLSX from "xlsx";
import staffHurdle from "./staffHurdle.json";
import prettyjson from "prettyjson";

type TstaffName = string;
type Ttips = number;
type TproductCommission = number;
type TserviceCommission = number;
type TbaseComm = number;
type Thurdle1Comm = number;
type Thurdle2Comm = number;
type TserviceComm = {
    serviceComm: number;
    serviceRevenue: number;
    base: {
        baseCommRevenue: number;
        baseCommRate: number;
        baseCommAmt: number;
    };
    hurdle1: {
        hurdle1Revenue: number;
        hurdle1Level: number;
        hurdle1Rate: number;
        hurdle1Amt: number;
    };
    hurdle2: {
        hurdle2Revenue: number;
        hurdle2Level: number;
        hurdle2Rate: number;
        hurdle2Amt: number;
    };
};
type TserviceCommMap = Map<TstaffName, TserviceComm>;
type TcommComponents = [Ttips, TproductCommission, TserviceCommission];
type TcommMap = Map<TstaffName, TcommComponents>;

interface IstaffCommConfig {
    mbCommRate: number;
    baseRate: number;
    hurdle1Level: number;
    hurdle1Rate: number;
    hurdle2Level: number;
    hurdle2Rate: number;
    poolsWith: [string];
}

const staffIDOffset = 1;
const tipsIndex = 0;
const productCommissionIndex = 1;
const serviceCommissionIndex = 2;

const idHash: string = "ID #:";
const totalFor: string = "Total for ";
const tipsFor: string = "Tips:";
const commissionFor: string = "Sales Commission:";
const revenue = "Revenue";

const baseRateStr = "baseRate";
const hurdle1LevelStr = "hurdle1Level";
const hurdle1RateStr = "hurdle1Rate";
const hurdle2LevelStr = "hurdle2Level";
const hurdle2RateStr = "hurdle2Rate";

const filePath: string = "Sample Payroll Report with ID.xlsx";
const readOptions = { raw: true, blankrows: true, sheetrows: 50 };
const wb = XLSX.readFile(filePath, readOptions);
//console.log(sheetName);
const ws: XLSX.WorkSheet = wb.Sheets[wb.SheetNames[0]];
const commMap = new Map<TstaffName, TcommComponents>();
const serviceCommMap = new Map<TstaffName, TserviceComm>();
const emptyServiceComm: TserviceComm = {
    serviceComm: 0,
    serviceRevenue: 0,
    base: { baseCommRevenue: 0, baseCommRate: 0, baseCommAmt: 0 },
    hurdle1: {
        hurdle1Revenue: 0,
        hurdle1Level: 0,
        hurdle1Rate: 0,
        hurdle1Amt: 0,
    },
    hurdle2: {
        hurdle2Revenue: 0,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle2Amt: 0,
    },
};

let maxRows = 0;

function checkRate(rate: any): boolean {
    if (typeof rate === "number") {
        if (0 <= rate && rate <= 1) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

function revenueCol(wsaa: any[][]): number {
    const maxSearchRows = Math.max(20, wsaa.length);
    for (let i = 0; i < maxSearchRows; i++) {
        const rowLength = wsaa[i].length;
        for (let j = 0; j < rowLength; j++) {
            const cell = wsaa[i][j];
            if (cell === revenue) {
                return j;
            }
        }
    }
    throw "Cannot find Revenue column";
}

function stripToNumeric(n: string | number): number {
    let x = 0;
    if (typeof n === "string") {
        x = parseFloat(n.trim().replace(/[^0-9.-]+/g, ""));
        if (x === NaN) {
            console.log(n + "Warning: " + n + " interpreted as a non-numeric.");
            x = 0;
        }
    } else {
        x = n;
    }
    return x;
}

function sumRevenue(
    wsaa: any[][],
    currentTotalForRow: number,
    prevTotalForRow: number,
    revenueColumn: number
): number {
    // starting on the staff member's totals row, sum all the numeric values in the revenue column back as far as the prior staff member's totals row + 1. Use this as the service revenue so we can ignore how staff commissions are configured in MB.
    const numSearchRows = currentTotalForRow - prevTotalForRow - 1;
    const k = revenueColumn;
    let serviceRevenue = 0;
    for (let i = 1; i <= numSearchRows; i++) {
        let revenueCellContents = wsaa[currentTotalForRow - i][k];
        if (revenueCellContents !== undefined) {
            if (typeof revenueCellContents === "string") {
                revenueCellContents = parseFloat(
                    revenueCellContents.trim().replace(/[^0-9.-]+/g, "")
                );
            } else {
                if (typeof revenueCellContents === "number") {
                }
            }
            if (
                typeof revenueCellContents === "number" &&
                revenueCellContents >= 0
            ) {
                serviceRevenue += revenueCellContents;
            }
        }
    }
    return serviceRevenue;
}

function worksheetEmpty(ws: XLSX.WorkSheet) {
    if (ws["!ref"] === undefined) {
        throw "Worksheet range is empty. Empty worksheet?";
    } else {
        return false;
    }
}

function calcServiceCommission(commMap: TcommMap) {
    /* iterate through commissionComponents
    for each entry, locate corresponding hurdles
    calculate amounts payable for base rate (0 for most staff) and then from each hurdle to the next
    store the amounts payable in a new Map where the key is the staff name and the value is an array containing [baseCommission, hurdle1Commission, hurdle2Commission]
    Where staff are pooling their income, these amounts will be their equal share of what has gone into their pool*/
    let sh = staffHurdle as { [key: string]: any }; // get an iterable version of the staffHurdle import
    const shm = new Map<TstaffName, any>();
    Object.keys(sh).forEach(k => shm.set(k, sh[k])); // iterate through staffHurdle and build a Map
    commMap.forEach((commComponents, staffName) => {
        // console.log(staffName, commComponents);
        if (shm.has(staffName)) {
            // we have a matching prop in staffHurdle for the current payroll key
            // clone emptyServiceComm as a temp we can fill and then add to the serviceCommMap
            let tempServiceComm: TserviceComm = {
                ...emptyServiceComm,
                base: { ...emptyServiceComm.base },
                hurdle1: { ...emptyServiceComm.hurdle1 },
                hurdle2: { ...emptyServiceComm.hurdle2 },
            };
            let servicesRev = commComponents[serviceCommissionIndex];
            const staffCommConfig: IstaffCommConfig = shm.get(staffName);

            let baseRevenue = 0;
            let baseRate: number = 0;
            let hurdle1Revenue = 0;
            let hurdle1Level = 0;
            let hurdle1Rate = 0;
            let hurdle2Revenue = 0;
            let hurdle2Level = 0;
            let hurdle2Rate = 0;

            if (staffCommConfig.hasOwnProperty(baseRateStr)) {
                baseRate = stripToNumeric(staffCommConfig.baseRate);
                if (!checkRate(baseRate)) {
                    throw "Invalid baseRate";
                }
            }

            if (staffCommConfig.hasOwnProperty("hurdle1Level")) {
                hurdle1Level = stripToNumeric(staffCommConfig.hurdle1Level);
                hurdle1Rate = stripToNumeric(staffCommConfig.hurdle1Rate);
                if (!checkRate(hurdle1Rate)) {
                    console.log(
                        "Fatal: Error with " +
                            staffName +
                            "'s commission config in staffHurdle.json"
                    );
                    throw "Invalid hurdle1Rate";
                }
            }

            if (staffCommConfig.hasOwnProperty("hurdle2Level")) {
                hurdle2Level = stripToNumeric(staffCommConfig.hurdle2Level);
                hurdle2Rate = stripToNumeric(staffCommConfig.hurdle2Rate);
                if (!checkRate(hurdle2Rate)) {
                    throw "Invalid hurdle1Rate";
                }
            }

            if (hurdle1Level <= 0) {
                // no hurdle. All servicesRev pays comm at baseRate
                baseRevenue = servicesRev;
                hurdle1Revenue = 0;
                hurdle1Level = 0;
                hurdle2Revenue = 0;
                hurdle2Level = 0;
            } else {
                // there is a hurdle1
                if (servicesRev > hurdle1Level) {
                    if (hurdle2Level > 0) {
                        // service revenue  that falls between hurdle1 and hurdle2 generate comm at the hurdle1 Rate
                        hurdle1Revenue = Math.min(
                            servicesRev - hurdle1Level,
                            hurdle2Level - hurdle1Level
                        );
                        if (servicesRev > hurdle2Level) {
                            // service revenue above hurdle2Level generates comm at the hurdle2Rate
                            hurdle2Revenue = servicesRev - hurdle2Level;
                        } else {
                            hurdle2Revenue = 0;
                        }
                    } else {
                        // no hurdle2 so all revenue above hurdle1 generates comm at the hurdle1 rate
                        hurdle1Revenue = servicesRev - hurdle1Level;
                    }
                } else {
                    hurdle1Revenue = 0;
                }
            }
            // no hurdles so work out how much they receive in comm by applying base rate to entire services revenue

            // TODO: sum and set servicesComm once we have all the components.
            //const servicesComm = servicesRev * baseRate;
            // commComponents is an array containing [tips, productCommission, serviceCommission]
            //commComponents[serviceCommissionIndex] = servicesComm;

            tempServiceComm.serviceRevenue = servicesRev;

            tempServiceComm.base.baseCommRevenue = baseRevenue;
            tempServiceComm.base.baseCommRate = baseRate;
            const baseCommAmt = baseRevenue * baseRate;
            tempServiceComm.base.baseCommAmt = baseCommAmt;

            tempServiceComm.hurdle1.hurdle1Revenue = hurdle1Revenue;
            tempServiceComm.hurdle1.hurdle1Level = hurdle1Level;
            tempServiceComm.hurdle1.hurdle1Rate = hurdle1Rate;
            const hurdle1Amt = hurdle1Revenue * hurdle1Rate;
            tempServiceComm.hurdle1.hurdle1Amt = hurdle1Amt;

            tempServiceComm.hurdle2.hurdle2Revenue = hurdle2Revenue;
            tempServiceComm.hurdle2.hurdle2Level = hurdle2Level;
            tempServiceComm.hurdle2.hurdle2Rate = hurdle2Rate;
            const hurdle2Amt = hurdle2Revenue * hurdle2Rate;
            tempServiceComm.hurdle2.hurdle2Amt = hurdle2Amt;

            tempServiceComm.serviceComm = baseCommAmt + hurdle1Amt + hurdle2Amt;

            serviceCommMap.set(staffName, tempServiceComm);

            console.log(staffName);
            console.log(prettyjson.render(serviceCommMap.get(staffName)));
            console.log("=========");
        } else {
            throw staffName +
                " doesn't appear in staffHurdle.json (commission setup file)";
        }
    });
}

// Using option {header:1} returns an array of arrays
// Since specifying header results in blank rows in the worksheet being returned, we could force blank rows off
// wsaa is our worksheet presented as an array of arrays (row major)
const wsaa: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: false,
});
maxRows = wsaa.length;
const revenueColumn = revenueCol(wsaa);
let prevTotalForRow = 0;
let currentTotalForRow = 0;
// start building commission components working through the rows of the spreadsheet (array of arrays)
for (let i = 0; i < maxRows; i++) {
    const element = wsaa[i][0];
    if (element !== undefined) {
        // if we've found a line beginning with "Total for " then we've got to the subtotals and total for a staff member
        if ((element as string).slice(0, totalFor.length) === totalFor) {
            const staffName: string = (element as string)
                .slice(totalFor.length)
                .trim();
            const idElement: string = wsaa[i][staffIDOffset] as string;
            // TODO: add staffID to the comm and serviceComm maps
            // staffID isn't on the Total row - it's on the first row of this client's section. Need to go back there to retrieve the staffID
            // const staffID: string = (idElement as string).split(":")[1].trim();
            // keep track of the last totals row (for the previous employee) because we'll need to search back to this row to locate all of the revenue numbers for the current staff member.
            prevTotalForRow = currentTotalForRow;
            currentTotalForRow = i;
            let commissionComponents: [number, number, number] = [0, 0, 0];
            // find and process tips, product commission and services commission
            // go back 3 lines from the "Total for:" line - the tips and product commission should be in that range . Note tips and or product commission may not exist.
            console.log("Payroll details for: " + staffName);
            for (let j = 3; j >= 0; j--) {
                let payComponent: string = wsaa[i - j][0];
                if (payComponent !== undefined) {
                    let value = 0;
                    if (
                        payComponent === tipsFor ||
                        payComponent === commissionFor ||
                        payComponent.slice(0, totalFor.length) === totalFor
                    ) {
                        // work out what the value is for the Tip or Commission
                        const maxRowIndex = wsaa[i - j].length - 1;
                        if (wsaa[i - j][maxRowIndex] !== undefined) {
                            value = wsaa[i - j][maxRowIndex];
                            if (payComponent === tipsFor) {
                                payComponent = "Tips:";
                                commissionComponents[tipsIndex] = value;
                            }
                            if (payComponent === commissionFor) {
                                payComponent = "Product Commission:";
                                commissionComponents[
                                    productCommissionIndex
                                ] = value;
                            }
                        } else {
                            value = 0;
                        }
                        if (
                            payComponent.slice(0, totalFor.length) === totalFor
                        ) {
                            payComponent = "Services Revenue:";
                            value = sumRevenue(
                                wsaa,
                                currentTotalForRow,
                                prevTotalForRow,
                                revenueColumn
                            );
                            commissionComponents[
                                serviceCommissionIndex
                            ] = value;
                        }
                        console.log(payComponent + " " + value);
                        value = 0;
                    }

                    if (j == 0) {
                        commMap.set(staffName, commissionComponents);
                        console.log("==========");
                    }
                }
            }
        }
    }
}
calcServiceCommission(commMap);

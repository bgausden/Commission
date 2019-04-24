// tslint:disable: no-console

// TODO:  key everything off staffID and store staff-name as two top-level fields (firstName and lastName)
// TODO:  add a 3rd hurdle level
// TODO:  output excel file (google sheet) containing one row for each commission payment type (tip, product, service)

import prettyjson from "prettyjson";
import XLSX from "xlsx";
import staffHurdle from "./staffHurdle.json";

type TstaffName = string;
type Ttips = number;
type TproductCommission = number;
type TserviceCommission = number;
type TbaseComm = number;
type Thurdle1Comm = number;
type Thurdle2Comm = number;
// tslint:disable-next-line: interface-name
interface IserviceComm {
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
}
type TserviceCommMap = Map<TstaffName, IserviceComm>;
type TcommComponents = [Ttips, TproductCommission, TserviceCommission];
type TcommMap = Map<TstaffName, TcommComponents>;

interface IStaffCommConfig {
    mbCommRate: number;
    baseRate: number;
    hurdle1Level: number;
    hurdle1Rate: number;
    hurdle2Level: number;
    hurdle2Rate: number;
    poolsWith: [string];
}

const STAFF_ID_OFFSET = 1;
const TIPS_INDEX = 0;
const PROD_COMM_INDEX = 1;
const SERV_COMM_INDEX = 2;

const ID_HASH: string = "ID #:";
const TOTAL_FOR: string = "Total for ";
const TIPS_FOR: string = "Tips:";
const COMM_FOR: string = "Sales Commission:";
const REVENUE = "Revenue";

const BASE_RATE = "baseRate";
const HURDLE_1_LEVEL = "hurdle1Level";
const HURDLE_1_RATE = "hurdle1Rate";
const HURDLE_2_LEVEL = "hurdle2Level";
const HURDLE_2_RATE = "hurdle2Rate";

const FILE_PATH: string = "Sample Payroll Report with ID.xlsx";
const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 50 };
const WB = XLSX.readFile(FILE_PATH, READ_OPTIONS);
// console.log(sheetName);
const WS: XLSX.WorkSheet = WB.Sheets[WB.SheetNames[0]];
const COMM_MAP = new Map<TstaffName, TcommComponents>();
const SERVICE_COMM_MAP: TserviceCommMap = new Map<TstaffName, IserviceComm>();
const EMPTY_SERV_COMM: IserviceComm = {
    base: { baseCommRevenue: 0, baseCommRate: 0, baseCommAmt: 0 },
    hurdle1: {
        hurdle1Amt: 0,
        hurdle1Level: 0,
        hurdle1Rate: 0,
        hurdle1Revenue: 0,
    },
    hurdle2: {
        hurdle2Amt: 0,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle2Revenue: 0,
    },
    serviceComm: 0,
    serviceRevenue: 0,
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

function revenueCol(wsArray: any[][]): number {
    const MAX_SEARCH_ROWS = Math.max(20, wsArray.length);
    for (let i = 0; i < MAX_SEARCH_ROWS; i++) {
        const rowLength = wsArray[i].length;
        for (let j = 0; j < rowLength; j++) {
            const cell = wsArray[i][j];
            if (cell === REVENUE) {
                return j;
            }
        }
    }
    throw new Error("Cannot find Revenue column");
}

function stripToNumeric(n: string | number): number {
    let x = 0;
    if (typeof n === "string") {
        x = parseFloat(n.trim().replace(/[^0-9.-]+/g, ""));
        if (isNaN(x)) {
            console.log(n + "Warning: " + n + " interpreted as a non-numeric.");
            x = 0;
        }
    } else {
        x = n;
    }
    return x;
}

function sumRevenue(
    wsArray: any[][],
    currentTotal: number,
    prevTotal: number,
    revColumn: number,
): number {
    /* starting on the staff member's totals row, sum all the numeric values in the revenue column
    back as far as the prior staff member's totals row + 1. Use this as the service revenue so we can ignore
    how staff commissions are configured in MB. */
    const NUM_SEARCH_ROWS = currentTotal - prevTotal - 1;
    const REV_COLUMN = revColumn;
    let serviceRevenue = 0;
    for (let i = 1; i <= NUM_SEARCH_ROWS; i++) {
        let revenueCellContents = wsArray[currentTotal - i][REV_COLUMN];
        if (revenueCellContents !== undefined) {
            if (typeof revenueCellContents === "string") {
                revenueCellContents = stripToNumeric(revenueCellContents);
            } else {
                if (typeof revenueCellContents === "number") {
                    // all good
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

function calcServiceCommission(cm: TcommMap) {
    /* iterate through commissionComponents
    for each entry, locate corresponding hurdles
    calculate amounts payable for base rate (0 for most staff) and then from each hurdle to the next
    store the amounts payable in a new Map where the key is the staff name and the value is an array containing
    [baseCommission, hurdle1Commission, hurdle2Commission]
    Where staff are pooling their income, these amounts will be their equal share of what has gone into their pool*/
    const SH = staffHurdle as { [key: string]: any }; // get an iterable version of the staffHurdle import
    const SHM = new Map<TstaffName, any>();
    Object.keys(SH).forEach((k) => SHM.set(k, SH[k])); // iterate through staffHurdle and build a Map
    cm.forEach((commComponents, staffName) => {
        // console.log(staffName, commComponents);
        if (SHM.has(staffName)) {
            // we have a matching prop in staffHurdle for the current payroll key
            // clone emptyServiceComm as a temp we can fill and then add to the serviceCommMap
            const TEMP_SERV_COM: IserviceComm = {
                ...EMPTY_SERV_COMM,
                base: { ...EMPTY_SERV_COMM.base },
                hurdle1: { ...EMPTY_SERV_COMM.hurdle1 },
                hurdle2: { ...EMPTY_SERV_COMM.hurdle2 },
            };
            const SERVICE_REV = commComponents[SERV_COMM_INDEX];
            const STAFF_COMM_CONFIG: IStaffCommConfig = SHM.get(staffName);

            let baseRevenue = 0;
            let baseRate: number = 0;
            let hurdle1Revenue = 0;
            let hurdle1Level = 0;
            let hurdle1Rate = 0;
            let hurdle2Revenue = 0;
            let hurdle2Level = 0;
            let hurdle2Rate = 0;

            if (STAFF_COMM_CONFIG.hasOwnProperty(BASE_RATE)) {
                baseRate = stripToNumeric(STAFF_COMM_CONFIG.baseRate);
                if (!checkRate(baseRate)) {
                    throw new Error("Invalid baseRate");
                }
            }

            if (STAFF_COMM_CONFIG.hasOwnProperty("hurdle1Level")) {
                hurdle1Level = stripToNumeric(STAFF_COMM_CONFIG.hurdle1Level);
                hurdle1Rate = stripToNumeric(STAFF_COMM_CONFIG.hurdle1Rate);
                if (!checkRate(hurdle1Rate)) {
                    console.log(
                        "Fatal: Error with " +
                            staffName +
                            "'s commission config in staffHurdle.json",
                    );
                    throw new Error("Invalid hurdle1Rate");
                }
            }

            if (STAFF_COMM_CONFIG.hasOwnProperty("hurdle2Level")) {
                hurdle2Level = stripToNumeric(STAFF_COMM_CONFIG.hurdle2Level);
                hurdle2Rate = stripToNumeric(STAFF_COMM_CONFIG.hurdle2Rate);
                if (!checkRate(hurdle2Rate)) {
                    throw new Error("Invalid hurdle1Rate");
                }
            }

            if (hurdle1Level <= 0) {
                // no hurdle. All servicesRev pays comm at baseRate
                baseRevenue = SERVICE_REV;
                hurdle1Revenue = 0;
                hurdle1Level = 0;
                hurdle2Revenue = 0;
                hurdle2Level = 0;
            } else {
                // there is a hurdle1
                if (SERVICE_REV > hurdle1Level) {
                    if (hurdle2Level > 0) {
                        // service revenue  that falls between hurdle1 and hurdle2 generate comm at the hurdle1 Rate
                        hurdle1Revenue = Math.min(
                            SERVICE_REV - hurdle1Level,
                            hurdle2Level - hurdle1Level,
                        );
                        if (SERVICE_REV > hurdle2Level) {
                            // service revenue above hurdle2Level generates comm at the hurdle2Rate
                            hurdle2Revenue = SERVICE_REV - hurdle2Level;
                        } else {
                            hurdle2Revenue = 0;
                        }
                    } else {
                        // no hurdle2 so all revenue above hurdle1 generates comm at the hurdle1 rate
                        hurdle1Revenue = SERVICE_REV - hurdle1Level;
                    }
                } else {
                    hurdle1Revenue = 0;
                }
            }
            // no hurdles so work out how much they receive in comm by applying base rate to entire services revenue

            // TODO: sum and set servicesComm once we have all the components.
            // const servicesComm = servicesRev * baseRate;
            // commComponents is an array containing [tips, productCommission, serviceCommission]
            // commComponents[serviceCommissionIndex] = servicesComm;

            TEMP_SERV_COM.serviceRevenue = SERVICE_REV;

            TEMP_SERV_COM.base.baseCommRevenue = baseRevenue;
            TEMP_SERV_COM.base.baseCommRate = baseRate;
            const BASE_COMM_AMT = baseRevenue * baseRate;
            TEMP_SERV_COM.base.baseCommAmt = BASE_COMM_AMT;

            TEMP_SERV_COM.hurdle1.hurdle1Revenue = hurdle1Revenue;
            TEMP_SERV_COM.hurdle1.hurdle1Level = hurdle1Level;
            TEMP_SERV_COM.hurdle1.hurdle1Rate = hurdle1Rate;
            const HURDLE_1_AMT = hurdle1Revenue * hurdle1Rate;
            TEMP_SERV_COM.hurdle1.hurdle1Amt = HURDLE_1_AMT;

            TEMP_SERV_COM.hurdle2.hurdle2Revenue = hurdle2Revenue;
            TEMP_SERV_COM.hurdle2.hurdle2Level = hurdle2Level;
            TEMP_SERV_COM.hurdle2.hurdle2Rate = hurdle2Rate;
            const HURDLE_2_AMT = hurdle2Revenue * hurdle2Rate;
            TEMP_SERV_COM.hurdle2.hurdle2Amt = HURDLE_2_AMT;

            TEMP_SERV_COM.serviceComm =
                BASE_COMM_AMT + HURDLE_1_AMT + HURDLE_2_AMT;

            SERVICE_COMM_MAP.set(staffName, TEMP_SERV_COM);

            console.log(staffName);
            console.log(prettyjson.render(SERVICE_COMM_MAP.get(staffName)));
            console.log("=========");
        } else {
            throw new Error(
                staffName +
                    " doesn't appear in staffHurdle.json (commission setup file)",
            );
        }
    });
}

// Using option {header:1} returns an array of arrays
// Since specifying header results in blank rows in the worksheet being returned, we could force blank rows off
// wsaa is our worksheet presented as an array of arrays (row major)
const WSAA: any[][] = XLSX.utils.sheet_to_json(WS, {
    blankrows: false,
    header: 1,
});
maxRows = WSAA.length;
const REVENUE_COLUMN = revenueCol(WSAA);
let prevTotalForRow = 0;
let currentTotalForRow = 0;
// start building commission components working through the rows of the spreadsheet (array of arrays)
for (let i = 0; i < maxRows; i++) {
    const ELEMENT = WSAA[i][0];
    if (ELEMENT !== undefined) {
        // if we've found a line beginning with "Total for " then we've got to the subtotals
        // and total for a staff member
        if ((ELEMENT as string).slice(0, TOTAL_FOR.length) === TOTAL_FOR) {
            const STAFF_NAME: string = (ELEMENT as string)
                .slice(TOTAL_FOR.length)
                .trim();
            const ID_ELEMENT: string = WSAA[i][STAFF_ID_OFFSET] as string;
            // TODO: add staffID to the comm and serviceComm maps
            // staffID isn't on the Total row - it's on the first row of this client's section.
            // Need to go back there to retrieve the staffID
            // const staffID: string = (idElement as string).split(":")[1].trim();
            // keep track of the last totals row (for the previous employee) because we'll need to search
            // back to this row to locate all of the revenue numbers for the current staff member.
            prevTotalForRow = currentTotalForRow;
            currentTotalForRow = i;
            const COMM_COMPONENTS: [number, number, number] = [0, 0, 0];
            // find and process tips, product commission and services commission
            // go back 3 lines from the "Total for:" line - the tips and product commission should be in that range .
            // Note tips and or product commission may not exist.
            console.log("Payroll details for: " + STAFF_NAME);
            for (let j = 3; j >= 0; j--) {
                let payComponent: string = WSAA[i - j][0];
                if (payComponent !== undefined) {
                    let value = 0;
                    if (
                        payComponent === TIPS_FOR ||
                        payComponent === COMM_FOR ||
                        payComponent.slice(0, TOTAL_FOR.length) === TOTAL_FOR
                    ) {
                        // work out what the value is for the Tip or Commission
                        const maxRowIndex = WSAA[i - j].length - 1;
                        if (WSAA[i - j][maxRowIndex] !== undefined) {
                            value = WSAA[i - j][maxRowIndex];
                            if (payComponent === TIPS_FOR) {
                                payComponent = "Tips:";
                                COMM_COMPONENTS[TIPS_INDEX] = value;
                            }
                            if (payComponent === COMM_FOR) {
                                payComponent = "Product Commission:";
                                COMM_COMPONENTS[PROD_COMM_INDEX] = value;
                            }
                        } else {
                            value = 0;
                        }
                        if (
                            payComponent.slice(0, TOTAL_FOR.length) ===
                            TOTAL_FOR
                        ) {
                            payComponent = "Services Revenue:";
                            value = sumRevenue(
                                WSAA,
                                currentTotalForRow,
                                prevTotalForRow,
                                REVENUE_COLUMN,
                            );
                            COMM_COMPONENTS[SERV_COMM_INDEX] = value;
                        }
                        console.log(payComponent + " " + value);
                        value = 0;
                    }

                    if (j === 0) {
                        COMM_MAP.set(STAFF_NAME, COMM_COMPONENTS);
                        console.log("==========");
                    }
                }
            }
        }
    }
}
calcServiceCommission(COMM_MAP);

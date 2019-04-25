"use strict";
// tslint:disable: no-console
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// TODO:  key everything off staffID and store staff-name as two top-level fields (firstName and lastName)
// TODO:  add a 3rd hurdle level
// TODO:  output excel file (google sheet) containing one row for each commission payment type (tip, product, service)
const prettyjson_1 = __importDefault(require("prettyjson"));
const xlsx_1 = __importDefault(require("xlsx"));
const staffHurdle_json_1 = __importDefault(require("./staffHurdle.json"));
const TIPS_INDEX = 0;
const PROD_COMM_INDEX = 1;
const SERV_COMM_INDEX = 2;
const ID_HASH = "Staff ID #:";
const TOTAL_FOR = "Total for ";
const TIPS_FOR = "Tips:";
const COMM_FOR = "Sales Commission:";
const REVENUE = "Revenue";
const BASE_RATE = "baseRate";
const HURDLE_1_LEVEL = "hurdle1Level";
const HURDLE_1_RATE = "hurdle1Rate";
const HURDLE_2_LEVEL = "hurdle2Level";
const HURDLE_2_RATE = "hurdle2Rate";
const HURDLE_3_LEVEL = "hurdle3Level";
const HURDLE_3_RATE = "hurdle3Rate";
const FILE_PATH = "Sample Payroll Report with ID.xlsx";
const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 50 };
const WB = xlsx_1.default.readFile(FILE_PATH, READ_OPTIONS);
const WS = WB.Sheets[WB.SheetNames[0]];
const commMap = new Map();
const staffMap = new Map();
const serviceCommMap = new Map();
const emptyServComm = {
    staffName: "",
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
function checkRate(rate) {
    if (typeof rate === "number") {
        if (0 <= rate && rate <= 1) {
            return true;
        }
        else {
            return false;
        }
    }
    else {
        return false;
    }
}
function revenueCol(wsArray) {
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
function stripToNumeric(n) {
    let x = 0;
    if (typeof n === "string") {
        x = parseFloat(n.trim().replace(/[^0-9.-]+/g, ""));
        if (isNaN(x)) {
            // console.log(n + "Warning: " + n + " interpreted as a non-numeric.");
            x = 0;
        }
    }
    else {
        x = n;
    }
    return x;
}
function getStaffIDAndName(wsArray, idRow) {
    /*     assume the staffID can be found in the STAFF_ID_COL column.
    staffID will begin with "ID#: " the will need to be stored  in the serviceCommMap and
    commComponents maps along with First and Last name.
    First column should contain a string similar to LastName, FirstName Staff ID #: StaffID
 */
    const firstNameIndex = 1;
    const lastNameIndex = 0;
    const staffNameIndex = 0;
    const staffIDIndex = 1;
    // tslint:disable-next-line: no-shadowed-variable
    const testString = wsArray[idRow][staffNameIndex];
    const regex = new RegExp("^.*,.*" + ID_HASH);
    if (regex.test(testString)) {
        const staffInfo = testString !== undefined
            ? testString.split(ID_HASH)
            : undefined;
        if (staffInfo !== undefined) {
            return {
                found: true,
                firstName: staffInfo[staffNameIndex]
                    .split(",")[firstNameIndex].trim(),
                lastName: staffInfo[staffNameIndex]
                    .split(",")[lastNameIndex].trim(),
                staffID: staffInfo[staffIDIndex].trim(),
            };
        }
        else {
            return { found: false };
        }
    }
    else {
        return { found: false };
    }
}
function sumRevenue(wsArray, currentTotalRow, 
// tslint:disable-next-line: no-shadowed-variable
currentIDRow, 
// tslint:disable-next-line: no-shadowed-variable
revCol) {
    /* starting on the staff member's totals row, sum all the numeric values in the revenue column
    back as far as the prior staff member's totals row + 1. Use this as the service revenue so we can ignore
    how staff commissions are configured in MB. */
    const numSearchRows = currentTotalRow - currentIDRow - 1;
    const revColumn = revCol;
    let serviceRevenue = 0;
    for (let i = 1; i <= numSearchRows; i++) {
        let revenueCellContents = wsArray[currentTotalRow - i][revColumn];
        if (revenueCellContents !== undefined) {
            if (typeof revenueCellContents === "string") {
                revenueCellContents = stripToNumeric(revenueCellContents);
            }
            else {
                if (typeof revenueCellContents === "number") {
                    // all good
                }
            }
            if (typeof revenueCellContents === "number" &&
                revenueCellContents >= 0) {
                serviceRevenue += revenueCellContents;
            }
        }
    }
    return serviceRevenue;
}
function calcServiceCommission(cm) {
    /* iterate through commissionComponents
    for each entry, locate corresponding hurdles
    calculate amounts payable for base rate (0 for most staff) and then from each hurdle to the next
    store the amounts payable in a new Map where the key is the staff name and the value is an array containing
    [baseCommission, hurdle1Commission, hurdle2Commission]
    Where staff are pooling their income, these amounts will be their equal share of what has gone into their pool*/
    const sh = staffHurdle_json_1.default; // get an iterable version of the staffHurdle import
    const shm = new Map();
    Object.keys(sh).forEach((k) => shm.set(k, sh[k])); // iterate through staffHurdle and build a Map
    // tslint:disable-next-line: no-shadowed-variable
    cm.forEach((commComponents, staffID) => {
        // console.log(staffName, commComponents);
        if (shm.has(staffID)) {
            // we have a matching prop in staffHurdle for the current payroll key
            // clone emptyServiceComm as a temp we can fill and then add to the serviceCommMap
            const tempServComm = Object.assign({}, emptyServComm, { base: Object.assign({}, emptyServComm.base), hurdle1: Object.assign({}, emptyServComm.hurdle1), hurdle2: Object.assign({}, emptyServComm.hurdle2) });
            const serviceRev = commComponents[SERV_COMM_INDEX];
            const staffCommConfig = shm.get(staffID);
            let baseRevenue = 0;
            let baseRate = 0;
            let hurdle1Revenue = 0;
            let hurdle1Level = 0;
            let hurdle1Rate = 0;
            let hurdle2Revenue = 0;
            let hurdle2Level = 0;
            let hurdle2Rate = 0;
            if (staffCommConfig.hasOwnProperty(BASE_RATE)) {
                baseRate = stripToNumeric(staffCommConfig.baseRate);
                if (!checkRate(baseRate)) {
                    throw new Error("Invalid baseRate");
                }
            }
            if (staffCommConfig.hasOwnProperty(HURDLE_1_LEVEL)) {
                hurdle1Level = stripToNumeric(staffCommConfig.hurdle1Level);
                hurdle1Rate = stripToNumeric(staffCommConfig.hurdle1Rate);
                if (!checkRate(hurdle1Rate)) {
                    console.log(`Fatal: Error with ${staffID}'s commission config in staffHurdle.json`);
                    throw new Error("Invalid hurdle1Rate");
                }
            }
            if (staffCommConfig.hasOwnProperty(HURDLE_2_LEVEL)) {
                hurdle2Level = stripToNumeric(staffCommConfig.hurdle2Level);
                hurdle2Rate = stripToNumeric(staffCommConfig.hurdle2Rate);
                if (!checkRate(hurdle2Rate)) {
                    console.log(`Fatal: Error with ID ${staffID}'s commission config in staffHurdle.json`);
                    throw new Error("Invalid hurdle2Rate");
                }
            }
            /*             if (staffCommConfig.hasOwnProperty(HURDLE_3_LEVEL)) {
                hurdle3Level = stripToNumeric(staffCommConfig.hurdle3Level);
                hurdle3Rate = stripToNumeric(staffCommConfig.hurdle3Rate);
                if (!checkRate(hurdle3Rate)) {
                    console.log(`Fatal: Error with ${staffID}'s commission config in staffHurdle.json`)
                    throw new Error("Invalid hurdle3Rate");
                }
            } */
            if (hurdle1Level <= 0) {
                // no hurdle. All servicesRev pays comm at baseRate
                baseRevenue = serviceRev;
                hurdle1Revenue = 0;
                hurdle1Level = 0;
                hurdle2Revenue = 0;
                hurdle2Level = 0;
            }
            else {
                // there is a hurdle1
                if (serviceRev > hurdle1Level) {
                    if (hurdle2Level > 0) {
                        // service revenue  that falls between hurdle1 and hurdle2 generate comm at the hurdle1 Rate
                        hurdle1Revenue = Math.min(serviceRev - hurdle1Level, hurdle2Level - hurdle1Level);
                        if (serviceRev > hurdle2Level) {
                            // service revenue above hurdle2Level generates comm at the hurdle2Rate
                            hurdle2Revenue = serviceRev - hurdle2Level;
                        }
                        else {
                            hurdle2Revenue = 0;
                        }
                    }
                    else {
                        // no hurdle2 so all revenue above hurdle1 generates comm at the hurdle1 rate
                        hurdle1Revenue = serviceRev - hurdle1Level;
                    }
                }
                else {
                    hurdle1Revenue = 0;
                }
            }
            // no hurdles so work out how much they receive in comm by applying base rate to entire services revenue
            // TODO: sum and set servicesComm once we have all the components.
            // const servicesComm = servicesRev * baseRate;
            // commComponents is an array containing [tips, productCommission, serviceCommission]
            // commComponents[serviceCommissionIndex] = servicesComm;
            const sn = staffMap.get(staffID);
            if (sn !== undefined) {
                tempServComm.staffName = sn.firstName;
            }
            tempServComm.serviceRevenue = serviceRev;
            tempServComm.base.baseCommRevenue = baseRevenue;
            tempServComm.base.baseCommRate = baseRate;
            const baseCommAmt = baseRevenue * baseRate;
            tempServComm.base.baseCommAmt = baseCommAmt;
            tempServComm.hurdle1.hurdle1Revenue = hurdle1Revenue;
            tempServComm.hurdle1.hurdle1Level = hurdle1Level;
            tempServComm.hurdle1.hurdle1Rate = hurdle1Rate;
            const hurdle1Amt = hurdle1Revenue * hurdle1Rate;
            tempServComm.hurdle1.hurdle1Amt = hurdle1Amt;
            tempServComm.hurdle2.hurdle2Revenue = hurdle2Revenue;
            tempServComm.hurdle2.hurdle2Level = hurdle2Level;
            tempServComm.hurdle2.hurdle2Rate = hurdle2Rate;
            const hurdle2Amt = hurdle2Revenue * hurdle2Rate;
            tempServComm.hurdle2.hurdle2Amt = hurdle2Amt;
            tempServComm.serviceComm = baseCommAmt + hurdle1Amt + hurdle2Amt;
            serviceCommMap.set(staffID, tempServComm);
            console.log(staffID);
            console.log(prettyjson_1.default.render(serviceCommMap.get(staffID)));
            console.log("=========");
        }
        else {
            throw new Error(`${staffID} doesn't appear in staffHurdle.json (commission setup file)`);
        }
    });
}
// Using option {header:1} returns an array of arrays
// Since specifying header results in blank rows in the worksheet being returned, we could force blank rows off
// wsaa is our worksheet presented as an array of arrays (row major)
const wsaa = xlsx_1.default.utils.sheet_to_json(WS, {
    blankrows: false,
    header: 1,
});
maxRows = wsaa.length;
let staffID;
let staffName;
let staffNames;
const revCol = revenueCol(wsaa);
let currentIDRow = -1;
let currentTotalForRow = 0;
// start building commission components working through the rows of the spreadsheet (array of arrays)
for (let i = 0; i < maxRows; i++) {
    const element = wsaa[i][0];
    if (element !== undefined) {
        // Check if this line contans a staffID
        if (staffID === undefined) {
            const staffInfo = getStaffIDAndName(wsaa, i);
            if (staffInfo.found) {
                // found staffID so keep a note of which row it's on
                currentIDRow = i;
                staffID = staffInfo.staffID;
                staffName = `${staffInfo.firstName} ${staffInfo.lastName}`;
                staffNames = {
                    firstName: !!staffInfo.firstName ? staffInfo.firstName : "",
                    lastName: !!staffInfo.lastName ? staffInfo.lastName : "",
                };
            }
        }
        const testString = element.slice(0, TOTAL_FOR.length);
        if (testString === TOTAL_FOR) {
            /*         if we've found a line beginning with "Total for " then we've got to the subtotals
        and total for a staff member */
            // keep track of the last totals row (for the previous employee) because we'll need to search
            // back to this row to locate all of the revenue numbers for the current staff member.
            // currentIDRow = currentTotalForRow;
            currentTotalForRow = i;
            // const staffID = getStaffID(wsaa, prevTotalForRow);
            const commComponents = [0, 0, 0];
            // find and process tips, product commission and services commission
            // go back 3 lines from the "Total for:" line - the tips and product commission should be in that range .
            // Note tips and or product commission may not exist.
            console.log(`Payroll details for  ${staffID} ${staffName}`);
            for (let j = 3; j >= 0; j--) {
                let payComponent = wsaa[i - j][0];
                if (payComponent !== undefined) {
                    let value = 0;
                    if (payComponent === TIPS_FOR ||
                        payComponent === COMM_FOR ||
                        payComponent.slice(0, TOTAL_FOR.length) === TOTAL_FOR) {
                        // work out what the value is for the Tip or Commission
                        // by looking at the last cell in the row
                        const maxRowIndex = wsaa[i - j].length - 1;
                        if (wsaa[i - j][maxRowIndex] !== undefined) {
                            value = wsaa[i - j][maxRowIndex];
                            if (payComponent === TIPS_FOR) {
                                payComponent = "Tips:";
                                commComponents[TIPS_INDEX] = value;
                            }
                            if (payComponent === COMM_FOR) {
                                payComponent = "Product Commission:";
                                commComponents[PROD_COMM_INDEX] = value;
                            }
                        }
                        else {
                            value = 0;
                        }
                        if (payComponent.slice(0, TOTAL_FOR.length) ===
                            TOTAL_FOR) {
                            payComponent = "Services Revenue:";
                            value = sumRevenue(wsaa, currentTotalForRow, currentIDRow, revCol);
                            commComponents[SERV_COMM_INDEX] = value;
                        }
                        console.log(payComponent + " " + value);
                        value = 0;
                    }
                    if (j === 0) {
                        if (!!staffID) {
                            commMap.set(staffID, commComponents);
                            if (staffNames !== undefined) {
                                staffMap.set(staffID, staffNames);
                            }
                            else {
                                throw new Error(`Fatal: Missing staffNames for staff: ${staffName}`);
                            }
                        }
                        else {
                            throw new Error(`Fatal: Missing staffID for staff: ${staffName}`);
                        }
                        console.log("==========");
                    }
                }
            }
            staffID = undefined;
            staffNames = undefined;
        }
    }
}
calcServiceCommission(commMap);
//# sourceMappingURL=index.js.map
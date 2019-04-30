/// tslint:disable
// tslint:disable: no-console

// TODO:  add a 3rd hurdle level
// TODO:  output excel file (google sheet) containing one row for each commission payment type (tip, product, service)

import prettyjson from "prettyjson";
import XLSX from "xlsx";
import staffHurdle from "./staffHurdle.json";

type TStaffName = string;
type TTips = number;
type TProductCommission = number;
type TServiceCommission = number;
type TServiceRevenue = number;
type TBaseComm = number;
type THurdle1Comm = number;
type THurdle2Comm = number;
type THurdle3Comm = number;

type TTalenoxPaymentType = "Commission (Irregular)" | "Tips";

interface ITalenoxPayment {
    staffID: TStaffID;
    firstName: string;
    lastName: string;
    type: TTalenoxPaymentType | undefined;
    amount: number;
    remarks: string;
}

interface IStaffInfo {
    found: boolean;
    staffID?: TStaffID;
    firstName?: string;
    lastName?: string;
}

interface IServiceComm {
    staffName: string;
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
    hurdle3: {
        hurdle3Revenue: number;
        hurdle3Level: number;
        hurdle3Rate: number;
        hurdle3Amt: number;
    };
}
type TServiceCommMap = Map<TStaffName, IServiceComm>;
type TCommComponents = [
    TTips,
    TProductCommission,
    TServiceCommission,
    TServiceRevenue
];
type TCommMap = Map<TStaffName, TCommComponents>;
type TStaffID = string;

interface IStaffNames {
    firstName: string;
    lastName: string;
}

// TODO: make this a singleton
type TStaffMap = Map<TStaffID, IStaffNames>;

interface IStaffCommConfig {
    staffName: string;
    mbCommRate: number;
    baseRate: number;
    hurdle1Level: number;
    hurdle1Rate: number;
    hurdle2Level: number;
    hurdle2Rate: number;
    hurdle3Level: number;
    hurdle3Rate: number;
    poolsWith: [string];
}

const TOTAL_FOR_REGEX = /Total for /;

const TIPS_INDEX = 0;
const PROD_COMM_INDEX = 1;
const SERV_COMM_INDEX = 2;
const SERV_REV_INDEX = 3;

const ID_HASH: string = "Staff ID #:";
const TOTAL_FOR: string = "Total for ";
const TIPS_FOR: string = "Tips:";
const COMM_FOR: string = "Sales Commission:";
const REVENUE = "Revenue";

const BASE_RATE = "baseRate";
const HURDLE_1_LEVEL = "hurdle1Level";
const HURDLE_1_RATE = "hurdle1Rate";
const HURDLE_2_LEVEL = "hurdle2Level";
const HURDLE_2_RATE = "hurdle2Rate";
const HURDLE_3_LEVEL = "hurdle3Level";
const HURDLE_3_RATE = "hurdle3Rate";

const SERVICES_COMM_REMARK = "Services commission";
const TIPS_REMARK = "Tips";
const PRODUCT_COMM_REMARK = "Product commission";

const FILE_PATH: string = "Sample Payroll Report with ID.xlsx";
const READ_OPTIONS = { raw: true, blankrows: true, sheetrows: 50 };
const WB = XLSX.readFile(FILE_PATH, READ_OPTIONS);
const WS: XLSX.WorkSheet = WB.Sheets[WB.SheetNames[0]];
const commMap = new Map<TStaffName, TCommComponents>();
const staffMap: TStaffMap = new Map<TStaffID, IStaffNames>();
const serviceCommMap: TServiceCommMap = new Map<TStaffName, IServiceComm>();
const emptyServComm: IServiceComm = {
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
    hurdle3: {
        hurdle3Amt: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
        hurdle3Revenue: 0,
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
    const numericOnly = /[^0-9.-]+/g;
    let x = 0;
    if (typeof n === "string") {
        // strip out everything except 0-9, "." and "-"
        x = parseFloat(n.replace(numericOnly, ""));
        if (isNaN(x)) {
            x = 0;
        }
    } else {
        x = n;
    }
    return x;
}

function getStaffIDAndName(wsArray: any[][], idRow: number): IStaffInfo {
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
        const staffInfo: string[] | undefined =
            testString !== undefined
                ? (testString as string).split(ID_HASH)
                : undefined;
        if (staffInfo !== undefined) {
            if (staffInfo[staffIDIndex].trim() === undefined) {
                // Missing Staff ID in MB?
                throw new Error(`${staffInfo[staffNameIndex]
                .split(",")} ${staffInfo[staffNameIndex]
                    .split(",")} does not appear to have a Staff ID in MB`);
            }
            return {
                found: true,
                firstName: staffInfo[staffNameIndex]
                    .split(",")
                    [firstNameIndex].trim(),
                lastName: staffInfo[staffNameIndex]
                    .split(",")
                    [lastNameIndex].trim(),
                staffID: staffInfo[staffIDIndex].trim(),
            };
        } else {
            return { found: false };
        }
    } else {
        return { found: false };
    }
}

function sumRevenue(
    wsArray: any[][],
    currentTotalRow: number,
    // tslint:disable-next-line: no-shadowed-variable
    currentIDRow: number,
    // tslint:disable-next-line: no-shadowed-variable
    revCol: number,
): number {
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

function calcServiceCommission(
    staffID: TStaffID,
    serviceRev: TServiceRevenue,
): number {
    /* iterate through commissionComponents
    for each entry, locate corresponding hurdles
    calculate amounts payable for base rate (0 for most staff) and then from each hurdle to the next
    store the amounts payable in a new Map where the key is the staff name and the value is an array containing
    [baseCommission, hurdle1Commission, hurdle2Commission]
    Where staff are pooling their income, these amounts will be their equal share of what has gone into their pool*/
    let totalServiceComm: number;
    const sh = staffHurdle as { [key: string]: any }; // get an iterable version of the staffHurdle import
    const shm = new Map<TStaffID, any>();
    Object.keys(sh).forEach((k) => shm.set(k, sh[k])); // iterate through staffHurdle and build a Map
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
        };
        // const serviceRev = commComponents[SERV_COMM_INDEX];
        const staffCommConfig: IStaffCommConfig = shm.get(staffID);

        let baseRevenue = 0;
        let baseRate: number = 0;
        let hurdle1Revenue = 0;
        let hurdle1Level = 0;
        let hurdle1Rate = 0;
        let hurdle2Revenue = 0;
        let hurdle2Level = 0;
        let hurdle2Rate = 0;
        let hurdle3Revenue = 0;
        let hurdle3Level = 0;
        let hurdle3Rate = 0;

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
                console.log(
                    `Fatal: Error with ${staffID}'s commission config in staffHurdle.json`,
                );
                throw new Error("Invalid hurdle1Rate");
            }
        }

        if (staffCommConfig.hasOwnProperty(HURDLE_2_LEVEL)) {
            hurdle2Level = stripToNumeric(staffCommConfig.hurdle2Level);
            hurdle2Rate = stripToNumeric(staffCommConfig.hurdle2Rate);
            if (!checkRate(hurdle2Rate)) {
                console.log(
                    `Fatal: Error with ID ${staffID}'s commission config in staffHurdle.json`,
                );
                throw new Error("Invalid hurdle2Rate");
            }
        }

        if (staffCommConfig.hasOwnProperty(HURDLE_3_LEVEL)) {
            hurdle3Level = stripToNumeric(staffCommConfig.hurdle3Level);
            hurdle3Rate = stripToNumeric(staffCommConfig.hurdle3Rate);
            if (!checkRate(hurdle3Rate)) {
                console.log(
                    `Fatal: Error with ${staffID}'s commission config in staffHurdle.json`,
                );
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
            if (serviceRev > hurdle1Level) {
                if (hurdle2Level > 0) {
                    // service revenue  that falls between hurdle1 and hurdle2 generate comm at the hurdle1 Rate
                    hurdle1Revenue = Math.min(
                        serviceRev - hurdle1Level,
                        hurdle2Level - hurdle1Level,
                    );
                    if (serviceRev > hurdle2Level) {
                        if (hurdle3Level > 0) {
                            // have  a hurdle3
                            /* revenue applicable to hurdle2 is either the amount of service revenue above
                                hurdle2 or if the revenue exceeds hurdle3, the amount of revenue equal to
                                the difference between hurdle3 and hurdle2 */
                            hurdle2Revenue = Math.min(
                                serviceRev - hurdle2Level,
                                hurdle3Level - hurdle2Level,
                            );
                            if (serviceRev > hurdle3Level) {
                                hurdle3Revenue = serviceRev - hurdle3Level;
                            } else {
                                // service revenue doesn't exceed hurdle3. All rev above hurdle 2 is hurdle2Revenue
                                hurdle2Revenue = serviceRev - hurdle2Level;
                            }
                        } else {
                            // no hurdle3level so all revenue above hurdle2 generates comm at the hurdle2 rate
                            hurdle2Revenue = serviceRev - hurdle2Level;
                        }
                    } else {
                        // service revenue doesn't exceed hurdle2
                        hurdle1Revenue = serviceRev - hurdle1Level;
                    }
                } else {
                    // no hurdle2 so all revenue above hurdle1 generates comm at the hurdle1 rate
                    hurdle1Revenue = serviceRev - hurdle1Level;
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

        tempServComm.hurdle3.hurdle3Revenue = hurdle3Revenue;
        tempServComm.hurdle3.hurdle3Level = hurdle3Level;
        tempServComm.hurdle3.hurdle3Rate = hurdle3Rate;
        const hurdle3Amt = hurdle3Revenue * hurdle3Rate;
        tempServComm.hurdle3.hurdle3Amt = hurdle3Amt;

        totalServiceComm = baseCommAmt + hurdle1Amt + hurdle2Amt + hurdle3Amt;
        tempServComm.serviceComm = totalServiceComm;

        serviceCommMap.set(staffID, tempServComm);

        console.log(staffID);
        console.log(prettyjson.render(serviceCommMap.get(staffID)));
    } else {
        throw new Error(
            `${staffID} doesn't appear in staffHurdle.json (commission setup file)`,
        );
    }
    // });

    return totalServiceComm;
}

function createPaymentSpreadsheet(cm: TCommMap, sm: TStaffMap) {
    const emptyTalenoxPayment: ITalenoxPayment = {
        staffID: "",
        firstName: "",
        lastName: "",
        type: undefined,
        amount: 0,
        remarks: "",
    };

    const payments: ITalenoxPayment[] = [];
    let paymentProto: ITalenoxPayment;
    cm.forEach((commMapEntry, sid) => {
        // const payment: ITalenoxPayment = { ...emptyTalenoxPayment };
        // const staffID = sid;
        const staffMapEntry = sm.get(sid);
        let payment: ITalenoxPayment;
        /* const firstName = !!staffMapEntry ? staffMapEntry.firstName : "";
        const lastName = !!staffMapEntry ? staffMapEntry.lastName : ""; */
        if (staffMapEntry === undefined) {
            throw new Error(`Empty staffMap returned for staffID ${sid}`);
        } else {
            paymentProto = {
                ...emptyTalenoxPayment,
                /* put a single-quote in front of the staffID to ensure when
                pasted into Google Sheets, it's not interpreted as a number
                and the leading "0" is stripped. */
                staffID: `'${sid}`,
                firstName: staffMapEntry.firstName,
                lastName: staffMapEntry.lastName,
            };
        }
        const serviceCommMapEntry = cm.get(sid);
        if (serviceCommMapEntry === undefined) {
            throw new Error(
                `Empty serviceCommMap entry return for staffID ${sid}`,
            );
        } else {
            for (let k = 0; k < commMapEntry.length; k++) {
                /* create a new payment object based on paymentProto which
                contains staffID, firstName, etc. */
                payment = { ...paymentProto };
                switch (k) {
                    case TIPS_INDEX:
                        payment.amount = commMapEntry[TIPS_INDEX];
                        payment.type = "Tips";
                        payment.remarks = TIPS_REMARK;
                        break;
                    case PROD_COMM_INDEX:
                        payment.amount = commMapEntry[PROD_COMM_INDEX];
                        payment.type = "Commission (Irregular)";
                        payment.remarks = PRODUCT_COMM_REMARK;
                        break;
                    case SERV_COMM_INDEX:
                        payment.type = "Commission (Irregular)";
                        payment.amount = commMapEntry[SERV_COMM_INDEX];
                        payment.remarks = SERVICES_COMM_REMARK;
                        break;
                    case SERV_REV_INDEX:
                        // do nothing
                        break;
                    default:
                        throw new Error(
                            "Commission Map has more entries than expected.",
                        );
                        break;
                }
                payments.push(payment);
            }
        }
    });
    const PAYMENTS_WB_NAME = "Talenox Payments.xlsx";
    const PAYMENTS_WS_NAME = "Payments";
    const paymentsWB = XLSX.utils.book_new();
    const paymentsWS = XLSX.utils.json_to_sheet(payments, { skipHeader: true });
    XLSX.utils.book_append_sheet(paymentsWB, paymentsWS, PAYMENTS_WS_NAME);
    XLSX.writeFile(paymentsWB, PAYMENTS_WB_NAME);
}

function main() {
    // Using option {header:1} returns an array of arrays
    // Since specifying header results in blank rows in the worksheet being returned, we could force blank rows off
    // wsaa is our worksheet presented as an array of arrays (row major)
    const wsaa: any[][] = XLSX.utils.sheet_to_json(WS, {
        blankrows: false,
        header: 1,
    });
    maxRows = wsaa.length;
    let staffID: TStaffID | undefined;
    let staffName: TStaffName | undefined;
    let staffNames;
    const revCol = revenueCol(wsaa);
    let currentIDRow = -1;
    let currentTotalForRow = 0;
    // start building commission components working through the rows of the spreadsheet (array of arrays)
    // ignore the first row which contains the date range for the report
    for (let i = 0; i < maxRows; i++) {
        const element = wsaa[i][0];
        if (element !== undefined) {
            // Check if this line contans a staffID
            if (staffID === undefined) {
                const staffInfo: IStaffInfo = getStaffIDAndName(wsaa, i);
                if (staffInfo.found) {
                    // found staffID so keep a note of which row it's on
                    currentIDRow = i;
                    staffID = staffInfo.staffID;
                    staffName = `${staffInfo.firstName} ${staffInfo.lastName}`;
                    staffNames = {
                        firstName: !!staffInfo.firstName
                            ? staffInfo.firstName
                            : "",
                        lastName: !!staffInfo.lastName
                            ? staffInfo.lastName
                            : "",
                    };
                    staffMap.set(staffID!, staffNames);
                } else {
                    /* throw new Error(
                        `Fatal: Staff Member in MB Payroll Report has no StaffID. Fix and re-run Payroll Report`,
                    ); */
                }
            }

            const testString: string = (element as string).slice(
                0,
                TOTAL_FOR.length,
            );
            if (testString === TOTAL_FOR) {
                /*         if we've found a line beginning with "Total for " then we've got to the subtotals
        and total for a staff member */

                // keep track of the last totals row (for the previous employee) because we'll need to search
                // back to this row to locate all of the revenue numbers for the current staff member.
                // currentIDRow = currentTotalForRow;
                currentTotalForRow = i;
                // const staffID = getStaffID(wsaa, prevTotalForRow);
                const commComponents: [number, number, number, number] = [
                    0,
                    0,
                    0,
                    0,
                ];
                /* find and process tips, product commission and services commission
                go back 3 lines from the "Total for:" line - the tips and product commission
                should be in that range .
                Note tips and or product commission may not exist. */
                console.log(`Payroll details for  ${staffID} ${staffName}`);
                for (let j = 3; j >= 0; j--) {
                    let payComponent: string = wsaa[i - j][0];
                    if (payComponent !== undefined) {
                        let value = 0;
                        if (
                            payComponent === TIPS_FOR ||
                            payComponent === COMM_FOR ||
                            payComponent.slice(0, TOTAL_FOR.length) ===
                                TOTAL_FOR
                        ) {
                            // work out what the value is for the Tip or Commission
                            // by looking at the last cell in the row
                            const maxRowIndex = wsaa[i - j].length - 1;
                            if (wsaa[i - j][maxRowIndex] !== undefined) {
                                value = wsaa[i - j][maxRowIndex];
                                if (payComponent === TIPS_FOR) {
                                    payComponent = "Tips:";
                                    commComponents[TIPS_INDEX] = value;
                                    console.log(`${payComponent} ${value}`);
                                }
                                if (payComponent === COMM_FOR) {
                                    payComponent = "Product Commission:";
                                    commComponents[PROD_COMM_INDEX] = value;
                                }
                                console.log(`${payComponent} ${value}`);
                            } else {
                                value = 0;
                            }
                            if (
                                payComponent.slice(0, TOTAL_FOR.length) ===
                                TOTAL_FOR
                            ) {
                                payComponent = "Services Revenue:";
                                value = sumRevenue(
                                    wsaa,
                                    currentTotalForRow,
                                    currentIDRow,
                                    revCol,
                                );
                                commComponents[SERV_REV_INDEX] = value;
                                console.log(`${payComponent} ${value}`);
                                // set services comm to zero for now. Will fill-in later
                                payComponent = "Services Commission";
                                const serviceRevenue = value;
                                value = calcServiceCommission(
                                    staffID!,
                                    serviceRevenue, // value is the the total services revenue calculated above
                                );
                                commComponents[SERV_COMM_INDEX] = value;
                                console.log(`${payComponent} ${value}`);
                            }
                            value = 0;
                        }

                        if (j === 0) {
                            if (!!staffID) {
                                commMap.set(staffID, commComponents);
                                /*                                 if (staffNames !== undefined) {
                                    staffMap.set(staffID, staffNames);
                                } else {
                                    throw new Error(
                                        `Fatal: Missing staffNames for staff: ${staffName}`,
                                    );
                                } */
                            } else {
                                throw new Error(
                                    `Fatal: Missing staffID for staff: ${staffName}`,
                                );
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

    /* looking at staffHurdle.json work out how much commission is paid at each commission hurdle
and populate the commMap service commission map */
    // calcServiceCommission(staffID!, commMap);
    // TODO: loop through commMap and update the service commission for everyone

    /* create a spreadsheet containing one line for each payment to be made for each of the staff.
This spreadsheet will be copied/pasted into Talenox and together with their salary payments will
form the payroll for the month */

    createPaymentSpreadsheet(commMap, staffMap);
}

main();

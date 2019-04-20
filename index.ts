import XLSX from "xlsx";
import prettyJSON from "prettyjson";


type TstaffName = string;
type Ttips = number;
type TproductCommission = number;
type TserviceCommission = number;
type TcommissionComponents = [Ttips, TproductCommission, TserviceCommission];
const tipsIndex = 0;
const productCommissionIndex = 1;
const serviceCommissionIndex = 2;

const totalFor: string = "Total for ";
const tipsFor: string = "Tips:";
const commissionFor: string = "Sales Commission:";
const baseEarnings: string = "Base Earnings";
const apptDate: string = "Appointment Date";
const revenue = "Revenue";
const filePath: string = "Payroll Sample Report.xlsx";
const readOptions = { raw: true, blankrows: true, sheetrows: 50 };
const wb = XLSX.readFile(filePath, readOptions);
// console.log(workbook.SheetNames);
const sheetName = wb.SheetNames[0];
//console.log(sheetName);
const ws: XLSX.WorkSheet = wb.Sheets[wb.SheetNames[0]];
const wsRange = ws["!ref"];
const payroll = new Map<TstaffName, TcommissionComponents>();

let maxRows = 0;

function revenueCol(wsaa: any[][]):number {
    const maxSearchRows = Math.max(20,wsaa.length);
    for (let i = 0; i < maxSearchRows; i++) {
        const rowLength = wsaa[i].length
        for (let j = 0; j < rowLength; j++) {
            const cell = wsaa[i][j];
            if (cell === revenue) {
                return j
            }            
        }
    }
    throw("Cannof find Revenue column")
}

if (wsRange !== undefined) {
    // probably all redundant
    const startA1 = wsRange.slice(0, wsRange.indexOf(":"));
    const endA1 = wsRange.slice(wsRange.indexOf(":") + 1);
    // console.log(startA1+" "+endA1)
    const startRef = XLSX.utils.decode_cell(startA1);
    const endRef = XLSX.utils.decode_cell(endA1);
    // console.log(startRef+" "+endRef)
    // maxRows = endRef.r - startRef.r;
    maxRows = endRef.r
} else {
    throw "Worksheet range is empty. Empty worksheet?";
}
// console.log(maxRows);

// Address a cell in the worksheet and retrieve its value
// let test = ws["A1"].v;

// Using option {header:1} returns an array of arrays
// Since specifying header results in blank rows in the worksheet being returned, we could force blank rows off 
// wsaa is our worksheet presented as an array of arrays (row major)
const wsaa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows:false});
maxRows = wsaa.length;
const revenueColumn = revenueCol(wsaa);
for (let i = 0; i < maxRows; i++) {
    const element = wsaa[i][0];
    if (element !== undefined) {
        // if we've found a line beginning with "Total for " then we've got to the subtotals and total for a staff member
        if ((element as string).slice(0, totalFor.length) === totalFor) {
            const staffName: string = (element as string).slice(
                totalFor.length
            );
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
                        // special case for Total line - we need the Base Earnings number (which isn't the last value on the line) by looking at which value in the row has a cell above it containing the string "Base Earnings"
                        if (
                            payComponent.slice(0, totalFor.length) === totalFor
                        ) {
                            payComponent = "Services Commission:";
                            for (let k = maxRowIndex; k >= 1; k--) {
                                if (wsaa[i - j][k] !== undefined) {
                                    // if the cell above the current iterated cell === "Base Earnings"
                                    if (wsaa[i - (j + 1)][k] === baseEarnings) {
                                        const re = /[^0-9.-]+/g;
                                        value = parseFloat(
                                            (wsaa[i - j][k] as string).replace(
                                                re,
                                                ""
                                            )
                                        );
                                        commissionComponents[
                                            serviceCommissionIndex
                                        ] = value;
                                        break;
                                    }
                                }
                            }
                        }
                        console.log(payComponent + " " + value);
                        value = 0;
                    }

                    if (j == 0) {
                        payroll.set(staffName, commissionComponents);
                        // console.log(payroll);
                        console.log("==========");
                    }
                }
            }

            // console.log(element);
        }
    }
}

// console.log(wsj[0]);

/* console.log(ws["A1"].v);
console.log(ws["A2"].v);
console.log(ws["A3"].v);
console.log(ws["A4"].v); */

// const wbJSON = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
// console.log(prettyJSON.render(wbJSON));

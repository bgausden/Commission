"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const xlsx_1 = __importDefault(require("xlsx"));
/*
pass excel file name as parameter
read the excel file
find employee lines by locating line beginning with "Stylists"
foreach employee
    check for commission structure e.g hurdle
    calculate services commission
generate report
push into talenox
*/
// Button callback if we're doing things via a web page
function onButtonClicked() {
    return __awaiter(this, void 0, void 0, function* () {
        return yield selectFile("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });
}
/**
 * Select file(s). If we're doing things via a web page.
 * @param {String} contentType The content type of files you wish to select. For instance "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to select an Excel file.
 * @returns {Promise<File|File[]>} A promise of a file or array of files in case the multiple parameter is true.
 */
function selectFile(contentType) {
    return new Promise(resolve => {
        let input = document.createElement("input");
        input.type = "file";
        input.accept = contentType;
        input.onchange = _ => {
            let files;
            if (input.files !== null) {
                files = Array.from(input.files);
                resolve(files[0]);
            }
            else {
                resolve();
            }
        };
        input.click();
    });
}
const tipsIndex = 0;
const productCommissionIndex = 1;
const serviceCommissionIndex = 2;
const totalFor = "Total for ";
const tipsFor = "Tips:";
const commissionFor = "Sales Commission:";
const baseEarnings = "Base Earnings";
const filePath = "Payroll Sample Report.xlsx";
const readOptions = { raw: true, blankrows: true, sheetrows: 50 };
const wb = xlsx_1.default.readFile(filePath, readOptions);
// console.log(workbook.SheetNames);
const sheetName = wb.SheetNames[0];
//console.log(sheetName);
// TODO: delete first two rows of sheet. Contains date range and a blank line
const ws = wb.Sheets[wb.SheetNames[0]];
const wsRange = ws["!ref"];
const payroll = new Map();
let maxRows = 0;
if (wsRange !== undefined) {
    const startA1 = wsRange.slice(0, wsRange.indexOf(":"));
    const endA1 = wsRange.slice(wsRange.indexOf(":") + 1);
    // console.log(startA1+" "+endA1)
    const startRef = xlsx_1.default.utils.decode_cell(startA1);
    const endRef = xlsx_1.default.utils.decode_cell(endA1);
    // console.log(startRef+" "+endRef)
    maxRows = endRef.r - startRef.r;
}
else {
    throw "Worksheet range is empty. Empty worksheet?";
}
// console.log(maxRows);
// Address a cell in the worksheet and retrieve its value
// let test = ws["A1"].v;
// Using option {header:1} returns an array of arrays
const wsj = xlsx_1.default.utils.sheet_to_json(ws, { header: 1 });
for (let i = 0; i < maxRows; i++) {
    const element = wsj[i][0];
    if (element !== undefined) {
        // if we've found a line beginning with "Total for " then we've got to the subtotals and total for a staff member
        if (element.slice(0, totalFor.length) === totalFor) {
            const staffName = element.slice(totalFor.length);
            let commissionComponents = [0, 0, 0];
            // find and process tips, product commission and services commission
            console.log("Payroll details for: " + staffName);
            for (let j = 4; j >= 0; j--) {
                let payComponent = wsj[i - j][0];
                if (payComponent !== undefined) {
                    let value = 0;
                    if (payComponent === tipsFor ||
                        payComponent === commissionFor ||
                        payComponent.slice(0, totalFor.length) === totalFor) {
                        // work out what the value is for the Tip or Commission
                        const maxRowIndex = wsj[i - j].length - 1;
                        if (wsj[i - j][maxRowIndex] !== undefined) {
                            value = wsj[i - j][maxRowIndex];
                            if (payComponent === tipsFor) {
                                payComponent = "Tips:";
                                commissionComponents[tipsIndex] = value;
                            }
                            if (payComponent === commissionFor) {
                                payComponent = "Product Commission:";
                                commissionComponents[productCommissionIndex] = value;
                            }
                        }
                        else {
                            value = 0;
                        }
                        // special case for Total line - we need the Base Earnings number (which isn't the last value on the line) by looking at which value in the row has a cell above it containing the string "Base Earnings"
                        if (payComponent.slice(0, totalFor.length) === totalFor) {
                            payComponent = "Services Commission:";
                            for (let k = maxRowIndex; k >= 1; k--) {
                                if (wsj[i - j][k] !== undefined) {
                                    // if the cell above the current iterated cell === "Base Earnings"
                                    if (wsj[i - (j + 1)][k] === baseEarnings) {
                                        const re = /[^0-9.-]+/g;
                                        value = parseFloat(wsj[i - j][k].replace(re, ""));
                                        commissionComponents[serviceCommissionIndex] = value;
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
                        console.log(payroll);
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
//# sourceMappingURL=index.js.map
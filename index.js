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
const prettyjson_1 = __importDefault(require("prettyjson"));
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
const filePath = "/Users/barryga/Documents/Sample Payroll Report.xlsx";
let workbook = xlsx_1.default.readFile(filePath);
console.log(workbook.SheetNames);
let sheetName = workbook.SheetNames[0];
console.log(sheetName);
let wbJSON = xlsx_1.default.utils.sheet_to_json(workbook.Sheets[sheetName]);
console.log(prettyjson_1.default.render(wbJSON));

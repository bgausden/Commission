import XLSX from "xlsx";
import * as fs from "node:fs";
import { ITalenoxPayment } from "./ITalenoxPayment.js";

XLSX.set_fs(fs);

const FIRST_SHEET = 0;

export function readPayrollWorksheetRows(fileName: string): unknown[][] {
  const readOptions = { raw: true, blankrows: true, sheetrows: 0 };
  const workbook = XLSX.readFile(fileName, readOptions);
  const worksheet = workbook.Sheets[workbook.SheetNames[FIRST_SHEET]];

  return XLSX.utils.sheet_to_json(worksheet, {
    blankrows: false,
    header: 1,
  });
}

export function writePaymentsWorkbook(params: {
  payments: ITalenoxPayment[];
  worksheetName: string;
  workbookPath: string;
}): void {
  const { payments, worksheetName, workbookPath } = params;
  const paymentsWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    paymentsWorkbook,
    XLSX.utils.json_to_sheet(payments, { skipHeader: true }),
    worksheetName,
  );
  XLSX.writeFile(paymentsWorkbook, workbookPath);
}

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import * as fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import type { ITalenoxPayment } from "./ITalenoxPayment.js";
import {
  readPayrollWorksheetRows,
  writePaymentsWorkbook,
} from "./payrollWorkbook.js";
import { TALENOX_TIPS } from "./talenox_constants.js";

XLSX.set_fs(fs);

const OUTPUT_DIR = path.join(
  process.cwd(),
  ".test-output",
  "payrollWorkbook-spec",
);

function ensureOutputDir(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

afterEach(() => {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
});

describe("payrollWorkbook", () => {
  it("reads rows from the first worksheet", () => {
    ensureOutputDir();
    const workbookPath = path.join(OUTPUT_DIR, "input.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Staff", "Rev. per Session"],
        ["Jane", 123.45],
      ]),
      "Payroll",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Ignored"]]),
      "Other",
    );
    XLSX.writeFile(workbook, workbookPath);

    expect(readPayrollWorksheetRows(workbookPath)).toEqual([
      ["Staff", "Rev. per Session"],
      ["Jane", 123.45],
    ]);
  });

  it("writes payment rows without a header row", () => {
    ensureOutputDir();
    const workbookPath = path.join(OUTPUT_DIR, "payments.xlsx");
    const payments: ITalenoxPayment[] = [
      {
        staffID: "123",
        staffName: "Jane Doe",
        type: TALENOX_TIPS,
        amount: 123.45,
        remarks: "Monthly tips",
      },
    ];

    writePaymentsWorkbook({
      payments,
      worksheetName: "Ad Hoc Payments",
      workbookPath,
    });

    const workbook = XLSX.readFile(workbookPath, { raw: true });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Ad Hoc Payments"], {
      header: 1,
      blankrows: false,
    });

    expect(workbook.SheetNames).toEqual(["Ad Hoc Payments"]);
    expect(rows).toEqual([["123", "Jane Doe", "Tips", 123.45, "Monthly tips"]]);
  });
});

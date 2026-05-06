import XLSX from "xlsx";
import * as fs from "node:fs";
import {
  type TRedoWorkbookRow,
  type TStaffID,
  type TStaffHurdles,
  type Result,
  ok,
  err,
} from "./types.js";

XLSX.set_fs(fs);

const REQUIRED_HEADERS = [
  "Original Service Date",
  "Client Name",
  "Original Staff ID",
  "Original Staff Name",
  "Redo Staff ID",
  "Redo Staff Name",
  "Debit Amount",
  "Credit Amount",
] as const;

const COL = {
  ORIGINAL_SERVICE_DATE: 0,
  CLIENT_NAME: 1,
  ORIGINAL_STAFF_ID: 2,
  ORIGINAL_STAFF_NAME: 3,
  REDO_STAFF_ID: 4,
  REDO_STAFF_NAME: 5,
  DEBIT_AMOUNT: 6,
  CREDIT_AMOUNT: 7,
} as const;

export function parseRedoWorkbook(
  filePath: string,
  staffHurdles: TStaffHurdles,
): Result<TRedoWorkbookRow[]> {
  let rows: unknown[][];
  try {
    const workbook = XLSX.readFile(filePath, {
      raw: true,
      cellDates: true,
    });
    if (workbook.SheetNames.length === 0) {
      return err(`Redo workbook '${filePath}' contains no worksheets`);
    }
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(firstSheet, {
      blankrows: false,
      header: 1,
    }) as unknown[][];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`Failed to read redo workbook '${filePath}': ${message}`);
  }

  if (rows.length === 0) {
    return err(`Redo workbook '${filePath}' is empty`);
  }

  const headerValidation = validateHeaders(rows[0], filePath);
  if (!headerValidation.ok) {
    return headerValidation;
  }

  const dataRows = rows.slice(1);
  const result: TRedoWorkbookRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2; // 1-based, row 1 is header
    const parsed = parseRow(row, rowNumber, staffHurdles);
    if (!parsed.ok) {
      return parsed;
    }
    result.push(parsed.value);
  }

  return ok(result);
}

function validateHeaders(headerRow: unknown[], filePath: string): Result<void> {
  for (let i = 0; i < REQUIRED_HEADERS.length; i++) {
    const actual = String(headerRow[i] ?? "").trim();
    const expected = REQUIRED_HEADERS[i];
    if (actual !== expected) {
      return err(
        `Redo workbook '${filePath}' header mismatch at column ${i + 1}: expected '${expected}', got '${actual}'`,
      );
    }
  }
  return ok(undefined);
}

function parseRow(
  row: unknown[],
  rowNumber: number,
  staffHurdles: TStaffHurdles,
): Result<TRedoWorkbookRow> {
  const rawDate = row[COL.ORIGINAL_SERVICE_DATE];
  const originalServiceDate = parseDate(rawDate);
  if (originalServiceDate === null) {
    return err(
      `Row ${rowNumber}: 'Original Service Date' is missing or unparseable (got ${JSON.stringify(rawDate)})`,
    );
  }

  const clientName = String(row[COL.CLIENT_NAME] ?? "").trim();

  const rawOriginalStaffID = String(row[COL.ORIGINAL_STAFF_ID] ?? "").trim();
  if (!rawOriginalStaffID) {
    return err(`Row ${rowNumber}: 'Original Staff ID' is required`);
  }
  const originalStaffID = rawOriginalStaffID as TStaffID;
  if (!staffHurdles.has(originalStaffID)) {
    return err(
      `Row ${rowNumber}: 'Original Staff ID' '${originalStaffID}' not found in staffHurdle.json`,
    );
  }

  const originalStaffName = String(row[COL.ORIGINAL_STAFF_NAME] ?? "").trim();

  const rawRedoStaffID = String(row[COL.REDO_STAFF_ID] ?? "").trim();
  const redoStaffID =
    rawRedoStaffID !== "" ? (rawRedoStaffID as TStaffID) : null;
  if (redoStaffID !== null && !staffHurdles.has(redoStaffID)) {
    return err(
      `Row ${rowNumber}: 'Redo Staff ID' '${redoStaffID}' not found in staffHurdle.json`,
    );
  }

  const redoStaffName = String(row[COL.REDO_STAFF_NAME] ?? "").trim();

  const rawDebitAmount = row[COL.DEBIT_AMOUNT];
  const debitAmount = parsePositiveNumber(rawDebitAmount);
  if (debitAmount === null) {
    return err(
      `Row ${rowNumber}: 'Debit Amount' must be a strictly positive number (got ${JSON.stringify(rawDebitAmount)})`,
    );
  }

  const rawCreditAmount = row[COL.CREDIT_AMOUNT];
  const rawCreditStr = String(rawCreditAmount ?? "").trim();

  if (redoStaffID === null) {
    if (
      rawCreditAmount !== null &&
      rawCreditAmount !== undefined &&
      rawCreditStr !== ""
    ) {
      return err(
        `Row ${rowNumber}: 'Credit Amount' must be blank when 'Redo Staff ID' is absent`,
      );
    }
    return ok({
      sourceRowNumber: rowNumber,
      originalServiceDate,
      clientName,
      originalStaffID,
      originalStaffName,
      redoStaffID: null,
      redoStaffName,
      debitAmount,
      creditAmount: null,
    });
  }

  if (
    rawCreditAmount === null ||
    rawCreditAmount === undefined ||
    rawCreditStr === ""
  ) {
    return err(
      `Row ${rowNumber}: 'Credit Amount' is required when 'Redo Staff ID' is present`,
    );
  }

  const creditAmount = parseNonNegativeNumber(rawCreditAmount);
  if (creditAmount === null) {
    return err(
      `Row ${rowNumber}: 'Credit Amount' must be a non-negative number (got ${JSON.stringify(rawCreditAmount)})`,
    );
  }

  return ok({
    sourceRowNumber: rowNumber,
    originalServiceDate,
    clientName,
    originalStaffID,
    originalStaffName,
    redoStaffID,
    redoStaffName,
    debitAmount,
    creditAmount,
  });
}

function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    return new Date(date.y, date.m - 1, date.d);
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parsePositiveNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return raw > 0 ? raw : null;
  }
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

function parseNonNegativeNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return raw >= 0 ? raw : null;
  }
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) return n;
  }
  return null;
}

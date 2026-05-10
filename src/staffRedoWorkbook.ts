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
import { debugLogger } from "./logging_functions.js";

XLSX.set_fs(fs);

/** Cell values treated as zero for amount columns. */
const NA_PATTERN = /^\s*(na|n\/a|none|nil|n\.a\.|-|tbc|tbd)\s*$/i;

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

type RequiredHeader = (typeof REQUIRED_HEADERS)[number];

type ColIndex = {
  ORIGINAL_SERVICE_DATE: number;
  CLIENT_NAME: number;
  ORIGINAL_STAFF_ID: number;
  ORIGINAL_STAFF_NAME: number;
  REDO_STAFF_ID: number;
  REDO_STAFF_NAME: number;
  DEBIT_AMOUNT: number;
  CREDIT_AMOUNT: number;
};

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

  const colResult = resolveColumns(rows[0], filePath);
  if (!colResult.ok) {
    return colResult;
  }
  const COL = colResult.value;

  const dataRows = rows.slice(1);
  const result: TRedoWorkbookRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2; // 1-based, row 1 is header
    const parsed = parseRow(row, rowNumber, staffHurdles, COL);
    if (!parsed.ok) {
      return parsed;
    }
    result.push(parsed.value);
  }

  return ok(result);
}

function resolveColumns(
  headerRow: unknown[],
  filePath: string,
): Result<ColIndex> {
  const index = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    index.set(String(headerRow[i] ?? "").trim(), i);
  }

  const missing: RequiredHeader[] = REQUIRED_HEADERS.filter(
    (h) => !index.has(h),
  );
  if (missing.length > 0) {
    return err(
      `Redo workbook '${filePath}' is missing required header(s): ${missing.map((h) => `'${h}'`).join(", ")}`,
    );
  }

  return ok({
    ORIGINAL_SERVICE_DATE: index.get("Original Service Date")!,
    CLIENT_NAME: index.get("Client Name")!,
    ORIGINAL_STAFF_ID: index.get("Original Staff ID")!,
    ORIGINAL_STAFF_NAME: index.get("Original Staff Name")!,
    REDO_STAFF_ID: index.get("Redo Staff ID")!,
    REDO_STAFF_NAME: index.get("Redo Staff Name")!,
    DEBIT_AMOUNT: index.get("Debit Amount")!,
    CREDIT_AMOUNT: index.get("Credit Amount")!,
  });
}

function parseRow(
  row: unknown[],
  rowNumber: number,
  staffHurdles: TStaffHurdles,
  COL: ColIndex,
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
  const debitCoerced = coerceAmountToZero(
    rawDebitAmount,
    rowNumber,
    "Debit Amount",
  );
  if (debitCoerced !== null) {
    // NA/blank coerced to 0 — use it directly
  } else {
    const debitParsed = parsePositiveNumber(rawDebitAmount);
    if (debitParsed === null) {
      return err(
        `Row ${rowNumber}: 'Debit Amount' must be a strictly positive number (got ${JSON.stringify(rawDebitAmount)})`,
      );
    }
  }
  const debitAmount =
    debitCoerced !== null ? 0 : parsePositiveNumber(rawDebitAmount)!;

  const rawCreditAmount = row[COL.CREDIT_AMOUNT];
  const creditCoerced = coerceAmountToZero(
    rawCreditAmount,
    rowNumber,
    "Credit Amount",
  );

  if (redoStaffID === null) {
    // Credit must be absent, zero, or NA-like when there is no redo staff
    if (creditCoerced === null) {
      const creditParsed = parseNonNegativeNumber(rawCreditAmount);
      if (
        rawCreditAmount !== null &&
        rawCreditAmount !== undefined &&
        String(rawCreditAmount).trim() !== "" &&
        creditParsed !== 0
      ) {
        return err(
          `Row ${rowNumber}: 'Credit Amount' must be blank when 'Redo Staff ID' is absent`,
        );
      }
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

  let creditAmount: number;
  if (creditCoerced !== null) {
    creditAmount = 0;
  } else {
    const creditParsed = parseNonNegativeNumber(rawCreditAmount);
    if (creditParsed === null) {
      return err(
        `Row ${rowNumber}: 'Credit Amount' must be a non-negative number (got ${JSON.stringify(rawCreditAmount)})`,
      );
    }
    creditAmount = creditParsed;
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

/**
 * Returns 0 if the raw cell value is blank, null/undefined, or an NA-like
 * string ("NA", "N/A", "None", "nil", "-", "TBC", "TBD", etc.).
 * Returns null when the value is not NA-like (caller should attempt numeric parse).
 * Logs at debug level when coercion occurs.
 */
function coerceAmountToZero(
  raw: unknown,
  rowNumber: number,
  columnName: string,
): 0 | null {
  if (raw === null || raw === undefined) {
    debugLogger.debug(
      `staffRedoWorkbook row ${rowNumber}: '${columnName}' is blank/missing — treating as 0`,
    );
    return 0;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      debugLogger.debug(
        `staffRedoWorkbook row ${rowNumber}: '${columnName}' is empty string — treating as 0`,
      );
      return 0;
    }
    if (NA_PATTERN.test(trimmed)) {
      debugLogger.debug(
        `staffRedoWorkbook row ${rowNumber}: '${columnName}' is NA-like value '${trimmed}' — treating as 0`,
      );
      return 0;
    }
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

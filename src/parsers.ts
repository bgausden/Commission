import XLSX from "xlsx";
import { debugLogger } from "./logging_functions.js";

/** Cell values treated as zero for amount columns. */
export const NA_PATTERN = /^\s*(na|n\/a|none|nil|n\.a\.|-|tbc|tbd)\s*$/i;

/**
 * Parse a raw Excel cell value as a Date.
 * Handles: Date objects, Excel serial date numbers, ISO/parseable date strings.
 * Returns null for null/undefined/empty/unparseable values.
 */
export function parseDate(raw: unknown): Date | null {
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
 * Parse a raw cell value as a strictly positive number.
 * Returns the number if > 0, otherwise null.
 */
export function parsePositiveNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return raw > 0 ? raw : null;
  }
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

/**
 * Parse a raw cell value as a non-negative number (zero is allowed).
 * Returns the number if >= 0, otherwise null.
 */
export function parseNonNegativeNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return raw >= 0 ? raw : null;
  }
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) return n;
  }
  return null;
}

/**
 * Returns 0 if the raw cell value is blank, null/undefined, or an NA-like
 * string ("NA", "N/A", "None", "nil", "-", "TBC", "TBD", etc.).
 * Returns null when the value is not NA-like (caller should attempt numeric parse).
 * Logs at debug level when coercion occurs.
 *
 * @param raw        Raw cell value from Excel
 * @param rowNumber  1-based row number (for log messages)
 * @param columnName Column display name (for log messages)
 * @param logPrefix  Prefix for debug log messages (e.g. "staffRedoWorkbook")
 */
export function coerceAmountToZero(
  raw: unknown,
  rowNumber: number,
  columnName: string,
  logPrefix: string,
): 0 | null {
  if (raw === null || raw === undefined) {
    debugLogger.debug(
      `${logPrefix} row ${rowNumber}: '${columnName}' is blank/missing — treating as 0`,
    );
    return 0;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      debugLogger.debug(
        `${logPrefix} row ${rowNumber}: '${columnName}' is empty string — treating as 0`,
      );
      return 0;
    }
    if (NA_PATTERN.test(trimmed)) {
      debugLogger.debug(
        `${logPrefix} row ${rowNumber}: '${columnName}' is NA-like value '${trimmed}' — treating as 0`,
      );
      return 0;
    }
  }
  return null;
}

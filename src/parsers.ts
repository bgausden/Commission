import XLSX from "xlsx";

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
 */
export function coerceAmountToZero(
  raw: unknown,
  rowNumber: number,
  columnName: string,
): 0 | null {
  if (raw === null || raw === undefined) {
    return 0;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return 0;
    }
    if (NA_PATTERN.test(trimmed)) {
      return 0;
    }
  }
  return null;
}

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  NA_PATTERN,
  parseDate,
  parsePositiveNumber,
  parseNonNegativeNumber,
  coerceAmountToZero,
} from "./parsers.js";

// ---------------------------------------------------------------------------
// NA_PATTERN
// ---------------------------------------------------------------------------

describe("NA_PATTERN", () => {
  it.each(["NA", "na", "Na", "N/A", "n/a", "None", "none", "NONE", "nil", "NIL", "n.a.", "N.A.", "-", "TBC", "tbc", "TBD", "tbd"])(
    "matches '%s'",
    (value) => {
      expect(NA_PATTERN.test(value)).toBe(true);
    },
  );

  it.each(["  NA  ", "  -  ", "  TBC  "])(
    "matches '%s' with surrounding whitespace",
    (value) => {
      expect(NA_PATTERN.test(value)).toBe(true);
    },
  );

  it.each(["0", "100", "1.5", "abc", "", "N A", "not applicable"])(
    "does not match '%s'",
    (value) => {
      expect(NA_PATTERN.test(value)).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------

describe("parseDate", () => {
  it("returns null for null", () => {
    expect(parseDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns a valid Date object unchanged", () => {
    const d = new Date(2026, 2, 15);
    expect(parseDate(d)).toBe(d);
  });

  it("returns null for an invalid Date object", () => {
    expect(parseDate(new Date("not a date"))).toBeNull();
  });

  it("parses a parseable date string", () => {
    const result = parseDate("2026-03-15");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2026);
  });

  it("returns null for an unparseable string", () => {
    expect(parseDate("not a date")).toBeNull();
  });

  it("returns null for a non-date type (object)", () => {
    expect(parseDate({ year: 2026 })).toBeNull();
  });

  it("parses Excel serial date number", () => {
    // Excel serial 45000 => 2023-03-15
    const result = parseDate(45000);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2023);
  });
});

// ---------------------------------------------------------------------------
// parsePositiveNumber
// ---------------------------------------------------------------------------

describe("parsePositiveNumber", () => {
  it("returns the number when raw is a positive number", () => {
    expect(parsePositiveNumber(100)).toBe(100);
    expect(parsePositiveNumber(0.01)).toBe(0.01);
  });

  it("returns null when raw is zero", () => {
    expect(parsePositiveNumber(0)).toBeNull();
  });

  it("returns null when raw is negative", () => {
    expect(parsePositiveNumber(-5)).toBeNull();
  });

  it("parses a positive numeric string", () => {
    expect(parsePositiveNumber("42.5")).toBe(42.5);
    expect(parsePositiveNumber("0.01")).toBe(0.01);
  });

  it("returns null for a zero string", () => {
    expect(parsePositiveNumber("0")).toBeNull();
  });

  it("returns null for a negative string", () => {
    expect(parsePositiveNumber("-10")).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parsePositiveNumber("abc")).toBeNull();
    expect(parsePositiveNumber("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parsePositiveNumber(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parsePositiveNumber(undefined)).toBeNull();
  });

  it("returns null for an object", () => {
    expect(parsePositiveNumber({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseNonNegativeNumber
// ---------------------------------------------------------------------------

describe("parseNonNegativeNumber", () => {
  it("returns the number when raw is a positive number", () => {
    expect(parseNonNegativeNumber(100)).toBe(100);
  });

  it("returns 0 when raw is zero", () => {
    expect(parseNonNegativeNumber(0)).toBe(0);
  });

  it("returns null when raw is negative", () => {
    expect(parseNonNegativeNumber(-1)).toBeNull();
  });

  it("parses a non-negative numeric string", () => {
    expect(parseNonNegativeNumber("0")).toBe(0);
    expect(parseNonNegativeNumber("99")).toBe(99);
  });

  it("returns null for a negative string", () => {
    expect(parseNonNegativeNumber("-1")).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parseNonNegativeNumber("abc")).toBeNull();
    expect(parseNonNegativeNumber("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseNonNegativeNumber(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseNonNegativeNumber(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// coerceAmountToZero
// ---------------------------------------------------------------------------

vi.mock("./logging_functions.js", () => ({
  debugLogger: { debug: vi.fn() },
}));

describe("coerceAmountToZero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 for null", () => {
    expect(coerceAmountToZero(null, 2, "Amount", "test")).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(coerceAmountToZero(undefined, 2, "Amount", "test")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(coerceAmountToZero("", 2, "Amount", "test")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(coerceAmountToZero("   ", 2, "Amount", "test")).toBe(0);
  });

  it.each(["NA", "N/A", "None", "nil", "n.a.", "-", "TBC", "TBD"])(
    "returns 0 for NA-like value '%s'",
    (value) => {
      expect(coerceAmountToZero(value, 2, "Amount", "test")).toBe(0);
    },
  );

  it("returns null for a numeric string (not NA-like)", () => {
    expect(coerceAmountToZero("100", 2, "Amount", "test")).toBeNull();
  });

  it("returns null for a positive number", () => {
    expect(coerceAmountToZero(50, 2, "Amount", "test")).toBeNull();
  });

  it("returns null for a numeric string that looks like a number", () => {
    expect(coerceAmountToZero("0", 2, "Amount", "test")).toBeNull();
  });

  it("includes logPrefix in the debug log message for null input", async () => {
    const { debugLogger } = await import("./logging_functions.js");
    coerceAmountToZero(null, 3, "Debit Amount", "staffRedoWorkbook");
    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining("staffRedoWorkbook"),
    );
    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining("Debit Amount"),
    );
  });

  it("includes logPrefix in the debug log message for NA-like string", async () => {
    const { debugLogger } = await import("./logging_functions.js");
    coerceAmountToZero("NA", 5, "Credit Amount", "myModule");
    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining("myModule"),
    );
  });
});

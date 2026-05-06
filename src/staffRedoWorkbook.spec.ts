import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import * as fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { parseRedoWorkbook } from "./staffRedoWorkbook.js";
import type { TStaffHurdles } from "./types.js";
import type { StaffHurdle } from "./IStaffHurdle.js";

XLSX.set_fs(fs);

const OUTPUT_DIR = path.join(
  process.cwd(),
  ".test-output",
  "staffRedoWorkbook-spec",
);

function ensureOutputDir(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

afterEach(() => {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
});

/** Build a minimal staffHurdles map for the given IDs. */
function makeStaffHurdles(ids: string[]): TStaffHurdles {
  const hurdles = new Map<string, StaffHurdle>();
  for (const id of ids) {
    hurdles.set(id, {
      staffName: `Staff ${id}`,
      baseRate: 0.3,
      contractor: false,
      payViaTalenox: true,
    } as StaffHurdle);
  }
  return hurdles as TStaffHurdles;
}

/** Write a redo workbook with the given data rows (header is auto-prepended). */
function writeRedoWorkbook(filePath: string, dataRows: unknown[][]): void {
  const headerRow = [
    "Original Service Date",
    "Client Name",
    "Original Staff ID",
    "Original Staff Name",
    "Redo Staff ID",
    "Redo Staff Name",
    "Debit Amount",
    "Credit Amount",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Redo");
  XLSX.writeFile(wb, filePath);
}

describe("parseRedoWorkbook", () => {
  describe("header validation", () => {
    it("returns Err when first header column is wrong", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "bad-header.xlsx");
      const ws = XLSX.utils.aoa_to_sheet([
        [
          "Wrong Header",
          "Client Name",
          "Original Staff ID",
          "Original Staff Name",
          "Redo Staff ID",
          "Redo Staff Name",
          "Debit Amount",
          "Credit Amount",
        ],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Redo");
      XLSX.writeFile(wb, filePath);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles([]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("header mismatch");
        expect(result.error).toContain("Original Service Date");
      }
    });

    it("returns Err when a middle header column is wrong", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "bad-middle-header.xlsx");
      const ws = XLSX.utils.aoa_to_sheet([
        [
          "Original Service Date",
          "Client Name",
          "Original Staff ID",
          "Original Staff Name",
          "Redo Staff ID",
          "Redo Staff Name",
          "Debit WRONG",
          "Credit Amount",
        ],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Redo");
      XLSX.writeFile(wb, filePath);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles([]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Debit Amount");
      }
    });

    it("returns Err for a missing workbook file", () => {
      const result = parseRedoWorkbook(
        path.join(OUTPUT_DIR, "nonexistent.xlsx"),
        makeStaffHurdles([]),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Failed to read redo workbook");
      }
    });
  });

  describe("row validation", () => {
    it("returns Err when Original Service Date is missing", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "missing-date.xlsx");
      writeRedoWorkbook(filePath, [
        [null, "Client A", "001", "Staff One", null, "", 100, null],
      ]);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles(["001"]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Original Service Date");
      }
    });

    it("returns Err when Original Staff ID is blank", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "missing-orig-id.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 2, 15),
          "Client A",
          "",
          "Staff One",
          null,
          "",
          100,
          null,
        ],
      ]);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles(["001"]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Original Staff ID");
        expect(result.error).toContain("required");
      }
    });

    it("returns Err when Original Staff ID is not in staffHurdles", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "unknown-orig-id.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 2, 15),
          "Client A",
          "999",
          "Unknown",
          null,
          "",
          100,
          null,
        ],
      ]);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles(["001"]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("'999'");
        expect(result.error).toContain("not found in staffHurdle.json");
      }
    });

    it("returns Err when Redo Staff ID is not in staffHurdles", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "unknown-redo-id.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 2, 15),
          "Client A",
          "001",
          "Staff One",
          "888",
          "Unknown Redo",
          100,
          80,
        ],
      ]);

      const result = parseRedoWorkbook(
        filePath,
        makeStaffHurdles(["001", "002"]),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("'888'");
        expect(result.error).toContain("not found in staffHurdle.json");
      }
    });

    it("returns Err when Debit Amount is zero", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "zero-debit.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 2, 15),
          "Client A",
          "001",
          "Staff One",
          null,
          "",
          0,
          null,
        ],
      ]);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles(["001"]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Debit Amount");
        expect(result.error).toContain("strictly positive");
      }
    });

    it("returns Err when Debit Amount is negative", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "negative-debit.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 2, 15),
          "Client A",
          "001",
          "Staff One",
          null,
          "",
          -50,
          null,
        ],
      ]);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles(["001"]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Debit Amount");
      }
    });

    it("returns Err when Credit Amount is present but Redo Staff ID is absent", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "credit-no-redo.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 2, 15),
          "Client A",
          "001",
          "Staff One",
          null,
          "",
          100,
          80,
        ],
      ]);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles(["001"]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Credit Amount");
        expect(result.error).toContain("blank");
      }
    });

    it("returns Err when Credit Amount is blank but Redo Staff ID is present", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "no-credit-with-redo.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 2, 15),
          "Client A",
          "001",
          "Staff One",
          "002",
          "Staff Two",
          100,
          null,
        ],
      ]);

      const result = parseRedoWorkbook(
        filePath,
        makeStaffHurdles(["001", "002"]),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Credit Amount");
        expect(result.error).toContain("required");
      }
    });

    it("returns Err when Credit Amount is negative", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "negative-credit.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 2, 15),
          "Client A",
          "001",
          "Staff One",
          "002",
          "Staff Two",
          100,
          -10,
        ],
      ]);

      const result = parseRedoWorkbook(
        filePath,
        makeStaffHurdles(["001", "002"]),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Credit Amount");
        expect(result.error).toContain("non-negative");
      }
    });
  });

  describe("valid rows", () => {
    it("parses a debit-only row successfully", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "debit-only.xlsx");
      const serviceDate = new Date(2026, 2, 15); // 2026-03-15
      writeRedoWorkbook(filePath, [
        [serviceDate, "Client Alpha", "001", "Alice", null, "", 120.5, null],
      ]);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles(["001"]));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        const row = result.value[0];
        expect(row.sourceRowNumber).toBe(2);
        expect(row.originalStaffID).toBe("001");
        expect(row.originalStaffName).toBe("Alice");
        expect(row.redoStaffID).toBeNull();
        expect(row.debitAmount).toBe(120.5);
        expect(row.creditAmount).toBeNull();
        expect(row.clientName).toBe("Client Alpha");
        // Date comparison: just check year/month/day
        expect(row.originalServiceDate.getFullYear()).toBe(2026);
        expect(row.originalServiceDate.getMonth()).toBe(2); // March = 2
        expect(row.originalServiceDate.getDate()).toBe(15);
      }
    });

    it("parses a debit+credit row successfully", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "debit-credit.xlsx");
      const serviceDate = new Date(2026, 3, 1);
      writeRedoWorkbook(filePath, [
        [serviceDate, "Client Beta", "001", "Alice", "002", "Bob", 150, 120],
      ]);

      const result = parseRedoWorkbook(
        filePath,
        makeStaffHurdles(["001", "002"]),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        const row = result.value[0];
        expect(row.originalStaffID).toBe("001");
        expect(row.redoStaffID).toBe("002");
        expect(row.debitAmount).toBe(150);
        expect(row.creditAmount).toBe(120);
        expect(row.originalStaffName).toBe("Alice");
        expect(row.redoStaffName).toBe("Bob");
      }
    });

    it("parses a zero credit amount (salaried redo staff) as valid", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "zero-credit.xlsx");
      writeRedoWorkbook(filePath, [
        [
          new Date(2026, 3, 1),
          "Client Gamma",
          "001",
          "Alice",
          "002",
          "Bob",
          100,
          0,
        ],
      ]);

      const result = parseRedoWorkbook(
        filePath,
        makeStaffHurdles(["001", "002"]),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].creditAmount).toBe(0);
      }
    });

    it("parses multiple rows and returns all of them", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "multi-row.xlsx");
      const date1 = new Date(2026, 2, 10);
      const date2 = new Date(2026, 2, 20);
      writeRedoWorkbook(filePath, [
        [date1, "Client A", "001", "Alice", null, "", 80, null],
        [date2, "Client B", "001", "Alice", "002", "Bob", 200, 160],
      ]);

      const result = parseRedoWorkbook(
        filePath,
        makeStaffHurdles(["001", "002"]),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].sourceRowNumber).toBe(2);
        expect(result.value[1].sourceRowNumber).toBe(3);
      }
    });

    it("stops at the first invalid row and returns Err with row number", () => {
      ensureOutputDir();
      const filePath = path.join(OUTPUT_DIR, "first-bad-row.xlsx");
      writeRedoWorkbook(filePath, [
        [new Date(2026, 2, 10), "Client A", "001", "Alice", null, "", 80, null],
        [null, "Client B", "001", "Alice", null, "", 100, null], // bad date
        [new Date(2026, 2, 20), "Client C", "001", "Alice", null, "", 90, null],
      ]);

      const result = parseRedoWorkbook(filePath, makeStaffHurdles(["001"]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Row 3");
        expect(result.error).toContain("Original Service Date");
      }
    });
  });
});

import { describe, expect, it } from "vitest";
import { buildRedoMap } from "./staffRedoAdjustments.js";
import type { TRedoWorkbookRow } from "./types.js";

function makeRow(overrides: Partial<TRedoWorkbookRow> = {}): TRedoWorkbookRow {
  return {
    sourceRowNumber: 2,
    originalServiceDate: new Date("2024-04-10"),
    clientName: "Test Client",
    originalStaffID: "001",
    originalStaffName: "Original Staff",
    redoStaffID: null,
    redoStaffName: "",
    debitAmount: 100,
    creditAmount: null,
    ...overrides,
  };
}

describe("buildRedoMap", () => {
  it("debit-only row creates a DEBIT entry for original staff", () => {
    const rows: TRedoWorkbookRow[] = [makeRow()];
    const map = buildRedoMap(rows);

    expect(map.size).toBe(1);
    const adj = map.get("001");
    expect(adj).toBeDefined();
    expect(adj!.redoEntries).toHaveLength(1);
    expect(adj!.redoEntries[0].direction).toBe("DEBIT");
    expect(adj!.redoEntries[0].amount).toBe(100);
    expect(adj!.redoDebitTotal).toBe(100);
    expect(adj!.redoCreditTotal).toBe(0);
    expect(adj!.redoNetAdjustment).toBe(-100);
  });

  it("debit+credit row creates DEBIT for original staff and CREDIT for redo staff", () => {
    const rows: TRedoWorkbookRow[] = [
      makeRow({
        redoStaffID: "002",
        redoStaffName: "Redo Staff",
        creditAmount: 80,
      }),
    ];
    const map = buildRedoMap(rows);

    expect(map.size).toBe(2);

    const debitAdj = map.get("001");
    expect(debitAdj!.redoDebitTotal).toBe(100);
    expect(debitAdj!.redoCreditTotal).toBe(0);
    expect(debitAdj!.redoNetAdjustment).toBe(-100);

    const creditAdj = map.get("002");
    expect(creditAdj!.redoCreditTotal).toBe(80);
    expect(creditAdj!.redoDebitTotal).toBe(0);
    expect(creditAdj!.redoNetAdjustment).toBe(80);
  });

  it("credit entry carries correct counterparty fields pointing back to original staff", () => {
    const rows: TRedoWorkbookRow[] = [
      makeRow({
        redoStaffID: "002",
        redoStaffName: "Redo Staff",
        creditAmount: 80,
      }),
    ];
    const map = buildRedoMap(rows);

    const creditAdj = map.get("002");
    const entry = creditAdj!.redoEntries[0];
    expect(entry.direction).toBe("CREDIT");
    expect(entry.counterpartyStaffID).toBe("001");
    expect(entry.counterpartyStaffName).toBe("Original Staff");
    expect(entry.originalStaffID).toBe("001");
    expect(entry.originalStaffName).toBe("Original Staff");
  });

  it("debit entry carries correct counterparty fields pointing to redo staff", () => {
    const rows: TRedoWorkbookRow[] = [
      makeRow({
        redoStaffID: "002",
        redoStaffName: "Redo Staff",
        creditAmount: 80,
      }),
    ];
    const map = buildRedoMap(rows);

    const debitAdj = map.get("001");
    const entry = debitAdj!.redoEntries[0];
    expect(entry.counterpartyStaffID).toBe("002");
    expect(entry.counterpartyStaffName).toBe("Redo Staff");
  });

  it("multiple rows for the same staff accumulate correctly", () => {
    const rows: TRedoWorkbookRow[] = [
      makeRow({ debitAmount: 100 }),
      makeRow({ debitAmount: 50, clientName: "Client B", sourceRowNumber: 3 }),
    ];
    const map = buildRedoMap(rows);

    const adj = map.get("001");
    expect(adj!.redoEntries).toHaveLength(2);
    expect(adj!.redoDebitTotal).toBe(150);
    expect(adj!.redoNetAdjustment).toBe(-150);
  });

  it("zero credit amount still emits CREDIT entry", () => {
    const rows: TRedoWorkbookRow[] = [
      makeRow({
        redoStaffID: "002",
        redoStaffName: "Redo Staff",
        creditAmount: 0,
      }),
    ];
    const map = buildRedoMap(rows);

    const creditAdj = map.get("002");
    expect(creditAdj!.redoCreditTotal).toBe(0);
    expect(creditAdj!.redoNetAdjustment).toBe(0);
  });

  it("debit-only row does not create redo staff entry when redoStaffID is null", () => {
    const rows: TRedoWorkbookRow[] = [makeRow()];
    const map = buildRedoMap(rows);

    expect(map.size).toBe(1);
    expect(map.has("002")).toBe(false);
  });

  it("empty rows produces empty map", () => {
    const map = buildRedoMap([]);
    expect(map.size).toBe(0);
  });

  it("net adjustment = creditTotal - debitTotal", () => {
    const rows: TRedoWorkbookRow[] = [
      makeRow({
        redoStaffID: "002",
        redoStaffName: "Redo Staff",
        creditAmount: 80,
      }),
      makeRow({
        debitAmount: 40,
        clientName: "Client B",
        sourceRowNumber: 3,
        redoStaffID: null,
        creditAmount: null,
      }),
    ];
    const map = buildRedoMap(rows);

    const adj001 = map.get("001");
    expect(adj001!.redoDebitTotal).toBe(140); // 100 + 40
    expect(adj001!.redoCreditTotal).toBe(0);
    expect(adj001!.redoNetAdjustment).toBe(-140);
  });
});

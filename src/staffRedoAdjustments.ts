import type {
  TRedoAdjustment,
  TRedoLedgerEntry,
  TRedoMap,
  TRedoWorkbookRow,
} from "./types.js";
import type { TStaffID } from "./types.js";

function upsertAdjustment(map: TRedoMap, staffID: TStaffID): TRedoAdjustment {
  let adj = map.get(staffID);
  if (!adj) {
    adj = {
      redoEntries: [],
      redoDebitTotal: 0,
      redoCreditTotal: 0,
      redoNetAdjustment: 0,
    };
    map.set(staffID, adj);
  }
  return adj;
}

function addEntry(
  map: TRedoMap,
  staffID: TStaffID,
  entry: TRedoLedgerEntry,
): void {
  const adj = upsertAdjustment(map, staffID);
  adj.redoEntries.push(entry);
  if (entry.direction === "DEBIT") {
    adj.redoDebitTotal += entry.amount;
  } else {
    adj.redoCreditTotal += entry.amount;
  }
  adj.redoNetAdjustment = adj.redoCreditTotal - adj.redoDebitTotal;
}

export function buildRedoMap(rows: TRedoWorkbookRow[]): TRedoMap {
  const map: TRedoMap = new Map();

  for (const row of rows) {
    // DEBIT against the staff member who originally performed the service
    const debitEntry: TRedoLedgerEntry = {
      direction: "DEBIT",
      amount: row.debitAmount,
      clientName: row.clientName,
      originalServiceDate: row.originalServiceDate,
      sourceRowNumber: row.sourceRowNumber,
      counterpartyStaffID: row.redoStaffID,
      counterpartyStaffName: row.redoStaffName,
      originalStaffID: row.originalStaffID,
      originalStaffName: row.originalStaffName,
    };
    addEntry(map, row.originalStaffID, debitEntry);

    // CREDIT to the staff member who performed the redo (when present)
    if (row.redoStaffID !== null && row.creditAmount !== null) {
      const creditEntry: TRedoLedgerEntry = {
        direction: "CREDIT",
        amount: row.creditAmount,
        clientName: row.clientName,
        originalServiceDate: row.originalServiceDate,
        sourceRowNumber: row.sourceRowNumber,
        counterpartyStaffID: row.originalStaffID,
        counterpartyStaffName: row.originalStaffName,
        originalStaffID: row.originalStaffID,
        originalStaffName: row.originalStaffName,
      };
      addEntry(map, row.redoStaffID, creditEntry);
    }
  }

  return map;
}

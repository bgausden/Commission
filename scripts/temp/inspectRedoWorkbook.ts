/* global console */
// One-off inspection: compare a redo workbook's shape against what
// src/staffRedoWorkbook.ts expects. Usage:
//   npx tsx scripts/temp/inspectRedoWorkbook.ts <path-to-xlsx>
import XLSX from "xlsx";
import * as fs from "node:fs";

XLSX.set_fs(fs);

const filePath = process.argv[2];
if (!filePath) {
  console.error("usage: tsx scripts/temp/inspectRedoWorkbook.ts <file.xlsx>");
  process.exit(1);
}

const REQUIRED_HEADERS = [
  "Original Service Date",
  "Client Name",
  "Original Staff ID",
  "Original Staff Name",
  "Redo Staff ID",
  "Redo Staff Name",
  "Debit Amount",
  "Credit Amount",
];

const workbook = XLSX.readFile(filePath, { raw: true, cellDates: true });
console.log("Sheet names:", workbook.SheetNames);

const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
  blankrows: false,
  header: 1,
  defval: null,
});

const headerRow = rows[0] ?? [];
console.log("\nHeader row (trimmed in brackets):");
headerRow.forEach((cell, i) => {
  const raw = cell === null ? "(null)" : JSON.stringify(String(cell));
  const trimmed = String(cell ?? "").trim();
  const ok = REQUIRED_HEADERS.includes(trimmed) ? "OK" : "--";
  console.log(`  col ${i}: ${raw} [${trimmed}] ${ok}`);
});

const missing = REQUIRED_HEADERS.filter(
  (h) => !headerRow.some((c) => String(c ?? "").trim() === h),
);
console.log(
  missing.length === 0
    ? "\nAll required headers present."
    : `\nMISSING HEADERS: ${missing.join(", ")}`,
);

console.log(`\nData rows: ${rows.length - 1}`);
rows.slice(1, 15).forEach((row, i) => {
  console.log(
    `Row ${i + 2}: ${JSON.stringify(
      row.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c)),
    )}`,
  );
});
if (rows.length - 1 > 14) console.log(`... (${rows.length - 15} more rows)`);

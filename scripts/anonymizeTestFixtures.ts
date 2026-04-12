/**
 * Script to anonymize staff names in test fixture files
 */

import XLSX from "../vendor/xlsx-0.20.3/xlsx.mjs";
import * as fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

// Configure xlsx to use Node.js fs
XLSX.set_fs(fs);

const sampleFile = join(PROJECT_ROOT, "test-fixtures", "sample-payments.xlsx");

console.log("Anonymizing test fixture:", sampleFile);

// Read the workbook
const workbook = XLSX.readFile(sampleFile);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convert to JSON for easier manipulation
const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
  header: 1,
  defval: "",
});

// Track unique staff names and create anonymous mappings
const staffNameMap = new Map<string, string>();
let staffCounter = 1;

// Process each row
for (let i = 0; i < data.length; i++) {
  const row = data[i];
  if (!Array.isArray(row) || row.length < 2) {
    continue;
  }

  const staffId = String(row[0] || "").trim();
  const staffName = String(row[1] || "").trim();

  // Skip header rows or empty rows
  if (!staffId || !staffName || !/^\d+$/.test(staffId)) {
    continue;
  }

  // Create anonymous name if not already mapped
  if (!staffNameMap.has(staffName)) {
    const anonymousName = `Staff ${String.fromCharCode(64 + staffCounter)}`; // A, B, C...
    staffNameMap.set(staffName, anonymousName);
    console.log(`  ${staffName} → ${anonymousName}`);
    staffCounter++;
  }

  // Replace the name in the row
  row[1] = staffNameMap.get(staffName);
}

// Convert back to worksheet
const newSheet = XLSX.utils.aoa_to_sheet(data);

// Replace the sheet
workbook.Sheets[sheetName] = newSheet;

// Write back to file
XLSX.writeFile(workbook, sampleFile);

console.log(`\n✓ Anonymized ${staffNameMap.size} staff members`);
console.log(`✓ Updated: ${sampleFile}`);

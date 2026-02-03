import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const file1 = process.argv[2];
const file2 = process.argv[3];

if (!file1 || !file2) {
  console.error('Usage: tsx compareExcel.ts <file1> <file2>');
  process.exit(1);
}

console.log(`Comparing:\n  File 1: ${file1}\n  File 2: ${file2}\n`);

const wb1 = XLSX.readFile(file1);
const wb2 = XLSX.readFile(file2);

let foundDifferences = false;

// Compare sheet names
const sheets1 = wb1.SheetNames;
const sheets2 = wb2.SheetNames;

if (sheets1.length !== sheets2.length || !sheets1.every((s, i) => s === sheets2[i])) {
  console.log('❌ Sheet names differ:');
  console.log('  File 1:', sheets1);
  console.log('  File 2:', sheets2);
  foundDifferences = true;
}

// Compare each sheet
for (const sheetName of sheets1) {
  if (!sheets2.includes(sheetName)) {
    console.log(`❌ Sheet "${sheetName}" missing in File 2`);
    foundDifferences = true;
    continue;
  }

  const sheet1 = wb1.Sheets[sheetName];
  const sheet2 = wb2.Sheets[sheetName];

  const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' });
  const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: '' });

  const maxRows = Math.max(data1.length, data2.length);
  const maxCols = Math.max(
    ...data1.map((row: any) => row.length),
    ...data2.map((row: any) => row.length)
  );

  let sheetHasDiff = false;

  for (let r = 0; r < maxRows; r++) {
    const row1 = data1[r] || [];
    const row2 = data2[r] || [];

    for (let c = 0; c < maxCols; c++) {
      const cell1 = row1[c] ?? '';
      const cell2 = row2[c] ?? '';

      if (cell1 !== cell2) {
        if (!sheetHasDiff) {
          console.log(`\n❌ Differences in sheet "${sheetName}":`);
          sheetHasDiff = true;
        }
        const colLetter = XLSX.utils.encode_col(c);
        const cellRef = `${colLetter}${r + 1}`;
        console.log(`  Cell ${cellRef}:`);
        console.log(`    File 1: "${cell1}"`);
        console.log(`    File 2: "${cell2}"`);
        foundDifferences = true;
      }
    }
  }
}

// Check for sheets in file2 not in file1
for (const sheetName of sheets2) {
  if (!sheets1.includes(sheetName)) {
    console.log(`❌ Sheet "${sheetName}" only exists in File 2`);
    foundDifferences = true;
  }
}

if (!foundDifferences) {
  console.log('✅ Files are identical');
} else {
  console.log('\n❌ Files have differences');
}

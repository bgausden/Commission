import XLSX from 'xlsx';

const file1 = process.argv[2];
const file2 = process.argv[3];

if (!file1 || !file2) {
  console.error('Usage: tsx compareStaffPayments.ts <file1> <file2>');
  process.exit(1);
}

interface StaffPayment {
  staffId: string;
  staffName: string;
  total: number;
  details: Array<{ type: string; amount: number }>;
}

function parsePayments(filePath: string): Map<string, StaffPayment> {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const payments = new Map<string, StaffPayment>();

  for (let r = 0; r < data.length; r++) {
    const row: any = data[r];
    const staffId = String(row[0] || '').trim();
    const staffName = String(row[1] || '').trim();
    const paymentType = String(row[2] || '').trim();
    const amount = parseFloat(row[3]) || 0;

    // Skip header rows and empty rows
    if (!staffId || staffId === 'Staff ID' || !staffName || amount === 0) {
      continue;
    }

    // Skip if staffId is not numeric
    if (!/^\d+$/.test(staffId)) {
      continue;
    }

    const key = `${staffId}-${staffName}`;

    if (!payments.has(key)) {
      payments.set(key, {
        staffId,
        staffName,
        total: 0,
        details: []
      });
    }

    const payment = payments.get(key)!;
    payment.total += amount;
    payment.details.push({ type: paymentType, amount });
  }

  return payments;
}

console.log('Processing files...\n');

const payments1 = parsePayments(file1);
const payments2 = parsePayments(file2);

// Get all unique staff members
const allStaffKeys = new Set([...payments1.keys(), ...payments2.keys()]);

console.log('═'.repeat(100));
console.log('STAFF PAYMENT COMPARISON');
console.log('═'.repeat(100));
console.log();

let totalFile1 = 0;
let totalFile2 = 0;
let hasDifferences = false;

// Sort by staff ID
const sortedKeys = Array.from(allStaffKeys).sort((a, b) => {
  const idA = a.split('-')[0];
  const idB = b.split('-')[0];
  return idA.localeCompare(idB);
});

for (const key of sortedKeys) {
  const payment1 = payments1.get(key);
  const payment2 = payments2.get(key);

  const amount1 = payment1?.total || 0;
  const amount2 = payment2?.total || 0;
  const diff = amount1 - amount2;

  totalFile1 += amount1;
  totalFile2 += amount2;

  const staffId = payment1?.staffId || payment2?.staffId || '';
  const staffName = payment1?.staffName || payment2?.staffName || '';

  const diffIndicator = Math.abs(diff) > 0.01 ? '❌' : '✅';
  if (Math.abs(diff) > 0.01) hasDifferences = true;

  console.log(`${diffIndicator} Staff ${staffId} - ${staffName}`);
  console.log(`   File 1 (local):       HK$ ${amount1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`   File 2 (Google Drive): HK$ ${amount2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  
  if (Math.abs(diff) > 0.01) {
    console.log(`   Difference:           HK$ ${diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' })}`);
  }
  
  console.log();
}

console.log('─'.repeat(100));
console.log('TOTALS:');
console.log(`   File 1 (local):       HK$ ${totalFile1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`   File 2 (Google Drive): HK$ ${totalFile2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`   Difference:           HK$ ${(totalFile1 - totalFile2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' })}`);
console.log('═'.repeat(100));

if (hasDifferences) {
  console.log('\n❌ Files have payment differences');
} else {
  console.log('\n✅ All staff payments match');
}

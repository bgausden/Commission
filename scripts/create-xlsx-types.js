#!/usr/bin/env node

/**
 * Creates xlsx.d.mts type declaration wrapper for vendored xlsx library
 * This bridges TypeScript's NodeNext module resolution to the vendored types
 */

import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VENDOR_DIR = join(__dirname, '..', 'vendor', 'xlsx-0.20.3');
const TYPES_FILE = join(VENDOR_DIR, 'types', 'index.d.ts');
const OUTPUT_FILE = join(VENDOR_DIR, 'xlsx.d.mts');

// Verify vendored types exist
if (!existsSync(TYPES_FILE)) {
  console.error(`Error: Types file not found at ${TYPES_FILE}`);
  console.error('Please ensure xlsx is vendored in ./vendor/xlsx-0.20.3/');
  process.exit(1);
}

// Create type declaration wrapper
const typeDeclaration = `// Type declarations for xlsx.mjs
import * as XLSX from './types/index.js';

// Export all named exports
export * from './types/index.js';

// Export the default namespace
export default XLSX;
`;

try {
  writeFileSync(OUTPUT_FILE, typeDeclaration, 'utf-8');
  console.log(`✓ Created ${OUTPUT_FILE}`);
  console.log('  This allows TypeScript to find types when importing from xlsx.mjs');
} catch (error) {
  console.error(`Error writing ${OUTPUT_FILE}:`, error.message);
  process.exit(1);
}

/**
 * Wrapper for vendored xlsx module
 * Configures and re-exports the vendored xlsx-0.20.3 library
 */
import XLSX from '../vendor/xlsx-0.20.3/xlsx.mjs';
import * as fs from 'fs';

// Configure xlsx to use Node.js fs module
XLSX.set_fs(fs);

export default XLSX;

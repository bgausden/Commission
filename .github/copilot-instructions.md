# Commission Calculator - AI Agent Instructions

## Project Overview

TypeScript-based commission calculator for salon staff that:

1. Reads Mindbody Payroll Reports (Excel)
2. Calculates tiered commissions with custom pay rates
3. Integrates with Talenox payroll API
4. Generates payment spreadsheets

**Entry points**: [src/index.ts](../src/index.ts) (CLI), [src/server.ts](../src/server.ts) (web UI on port 3000)

## Architecture & Data Flow

### Core Workflow ([src/index.ts](../src/index.ts))

1. Parse Excel filename → extract payroll month/year (`parseFilename.ts`)
2. Load `config/staffHurdle.json` → commission tiers, custom rates, contractor status
3. Fetch Talenox employees via API (`talenox_functions.ts`)
4. Parse Mindbody Excel report → extract services revenue, tips, product commissions per staff
5. Calculate commissions using tiered hurdles (base rate → hurdle1 → hurdle2 → hurdle3)
6. Handle commission pooling for paired staff members
7. Generate payments Excel + push to Talenox (if `config.updateTalenox === true`)

### Global State Pattern

Uses TypeScript global declarations ([src/globals.d.ts](../src/globals.d.ts)) for shared state:

```typescript
global.PAYROLL_MONTH = PAYROLL_MONTH;  // Set in index.ts, used in talenox_functions.ts
global.staffHurdles = {...};           // Loaded from staffHurdle.json
```

**Important**: Add `/* global PAYROLL_MONTH, PAYROLL_YEAR */` comment in files using globals to satisfy ESLint.

## Critical Configuration Files

### `config/staffHurdle.json`

Defines per-staff commission structure. Example:

```json
{
  "012": {
    "staffName": "Kate",
    "baseRate": 0, // Commission rate before first hurdle
    "hurdle1Level": 30000, // Revenue threshold for hurdle1
    "hurdle1Rate": 0.11, // Commission rate above hurdle1
    "contractor": false, // Skip Talenox if true
    "payViaTalenox": true,
    "poolsWith": ["019"], // Share revenue with these staff IDs
    "customPayRates": [
      // Override rates for specific services
      { "Extensions": 0.15 }
    ]
  }
}
```

**Default fallback**: ID `"000"` provides defaults when staff not configured.

### `config/default.json`

Runtime configuration:

- `PAYROLL_WB_FILENAME`: Excel file to process (e.g., `"Payroll Report 9-1-2025 - 9-30-2025.xlsx"`)
- `missingStaffAreFatal`: Throw error if staff in Excel not in staffHurdle.json
- `updateTalenox`: Push payments to Talenox API (false for dry runs)

## Build & Execution

### Build Process

```bash
npm run build  # OS-aware: runs scripts/build.sh or build.cmd
```

Custom build script ([scripts/build.js](../scripts/build.js)):

1. Compiles TypeScript → `dist/`
2. Copies `config/staffHurdle.json` → `dist/`
3. Copies `log4js.json` → `dist/`

**Why custom script**: Uses `ncp` for file copying (TODO in code to remove this dependency).

### Running

```bash
npm run run:tsx        # Process commission (via tsx)
npm run server:tsx     # Web UI for config/file upload
npm test               # Vitest tests in src/**/*.spec.ts
```

**Environment variables** (see [src/env_functions.ts](../src/env_functions.ts)):

- `PAYMENTS_DIR`: Output directory for payment spreadsheets
- `DATA_DIR`: Input directory for Mindbody Excel reports
- `LOGS_DIR`: Log file output location

## Testing Patterns

Uses **Vitest** (not Jest). Test files: `src/**/*.spec.ts`

Example from [src/parseFilename.spec.ts](../src/parseFilename.spec.ts):

```typescript
import { describe, it, expect } from "vitest";
describe("parseFilename", () => {
  it("parses valid filename", () => { ... });
});
```

**Mock filesystem**: Uses `memfs` for file I/O tests (see `__mocks__/fs.cjs`).

### Testing Staff ID Validation

Comprehensive validation tests in [src/utility_functions.validation.spec.ts](../src/utility_functions.validation.spec.ts):

**Test coverage includes**:

- Staff ID exists in staffHurdle.json → returns configuration directly
- Staff ID missing + `missingStaffAreFatal=true` → throws error with context
- Staff ID missing + `missingStaffAreFatal=false` → returns default "000" with warning
- Default "000" missing → always throws (regardless of config)
- Context parameter → included in all error/warning messages
- Edge cases → empty strings, whitespace, multiple calls with same ID

**Mock setup pattern**:

```typescript
// Mock global staffHurdles
global.staffHurdles = {
  "012": { staffName: "Kate", baseRate: 0, ... },
  "000": { staffName: "Default", baseRate: 0, ... }
};

// Reset in beforeEach to avoid test pollution
beforeEach(() => {
  global.staffHurdles = { ...mockStaffHurdles };
});
```

**Key testing principles**:

- Always reset global state in `beforeEach()` to prevent test pollution
- Mock both `node-config-ts` and `logging_functions.js` to control behavior
- Test all three fallback tiers independently
- Verify logger calls (error, warn) for proper diagnostics

## Key Conventions

### Commission Calculation Logic

- **General services**: Apply tiered hurdles (base → hurdle1 → hurdle2 → hurdle3)
- **Custom rate services**: Flat rate × revenue (e.g., Extensions at 15%)
- **Pooling**: Staff with `poolsWith` array split total revenue equally
- Revenue buckets tracked in `TServRevenueMap` keyed by service name

### Staff ID Validation Strategy

**Centralized validation** via `getValidatedStaffHurdle()` in [src/utility_functions.ts](../src/utility_functions.ts):

**Three-tier fallback behavior**:

1. **Primary**: Returns staff's configuration from `staffHurdle.json` if exists
2. **Conditional fail-fast**: If missing and `config.missingStaffAreFatal === true`, throws error
3. **Fallback with warning**: If missing and `config.missingStaffAreFatal === false`, warns and returns default ID "000"
4. **Safety check**: Always throws if default "000" is missing

**Used consistently across**:

- `getServiceRevenues()` - validates when parsing Excel service revenue
- `calcGeneralServiceCommission()` - validates when calculating tiered commissions
- `isPayViaTalenox()` - validates when checking Talenox payment settings
- `isContractor()` - validates when checking contractor status

**Configuration control**: Set `missingStaffAreFatal: true` in `config/default.json` to require all staff in config (strict mode), or `false` to allow defaults (lenient mode)

### Logging Strategy ([src/logging_functions.ts](../src/logging_functions.ts))

Multiple log4js loggers:

- `commissionLogger` → regular staff calculations
- `contractorLogger` → contractor payments (separate visibility)
- `debugLogger`, `warnLogger`, `errorLogger` → diagnostics

**Always call** `shutdownLogging()` before process exit (flushes async appenders).

### Type System Patterns

- Uses type aliases extensively: `TStaffID`, `TCommMap`, `TTalenoxInfoStaffMap`
- Zod schemas for validation ([src/staffHurdleSchema.json](../src/staffHurdleSchema.json))
- Avoid `any` (eslint warns, not errors)

## Integration Points

### Talenox API ([src/talenox_functions.ts](../src/talenox_functions.ts))

Key functions:

- `getTalenoxEmployees()` → Returns `Map<StaffID, ITalenoxStaffInfo>`
- `createPayroll()` → Creates monthly payroll in Talenox
- `uploadAdHocPayments()` → Pushes commission/tips/product payments

**Auth**: `TALENOX_API_TOKEN` constant (TODO: move to env var).

### Excel Processing

- Uses `xlsx` library (`XLSX.readFile`, `XLSX.utils.sheet_to_json`)
- Mindbody report format assumptions:
  - Staff blocks start with `"Staff ID #: <ID>"`
  - Revenue per service in column found by searching for `"Rev. per Session"`
  - Totals row starts with `"Total for "`

## Debugging Workflows

### Debug Configurations (`.vscode/launch.json`)

**Available configurations**:

- **"Main via TSX"**: Debug CLI commission processor with full debug output
- **"Server via TSX"**: Debug web UI on port 3000
- **"Current file via TSX"**: Debug any TypeScript file directly
- **"Attach to process"**: Attach to running Node process on port 9229

**Environment variables in launch configs**:

```json
"env": {
  "DEBUG": "*,-talenox_functions:*,-log4js:*,-streamroller:*",  // Enable debug package output (excludes noisy modules)
  "DEBUG_COLORS": "true",
  "NODE_ENV": "production"
}
```

### Debug Commands

```bash
# Run with debugger attached (breakpoint on first line)
npm run server:debug:tsx     # Debug web server
npm run test:debug           # Debug Vitest tests
npm run test:debug:tsx       # Debug tests with tsx

# Or use VSCode debugger (F5) with appropriate launch config
```

### Tracing a Staff Member's Commission

**Step 1: Check log files** (timestamped in `LOGS_DIR`):

- `commission-<timestamp>.log` → Regular staff calculations
- `contractor-<timestamp>.log` → Contractor-only calculations
- `commission.debug` → Detailed debug output

**Step 2: Locate staff block in logs**:

```
Payroll details for 012 Kate

General Services Revenue:         HK$ 35,000.00
Extensions Revenue:                HK$ 10,000.00

General Service Commission:        HK$ 3,550.00
Custom Rate Service Commission:    HK$ 1,500.00
Product Commission:                HK$ 200.00
Tips:                              HK$ 300.00
                                   ------------
Total Payable                      HK$ 5,550.00
```

**Step 3: Trace commission calculation** (in [src/index.ts](../src/index.ts)):

1. Find staff in `getStaffIDAndName()` → extracts ID from Excel row
2. `getServiceRevenues()` → buckets revenue into general vs custom rates
3. `calcGeneralServiceCommission()` → applies hurdle logic
4. Custom rate loop → calculates flat-rate commissions
5. `doPooling()` → redistributes if `poolsWith` configured
6. `createAdHocPayments()` → formats for Talenox

**Step 4: Set breakpoints** for detailed inspection:

- Line where `staffID` matches target (e.g., `if (staffID === "012")`)
- `calcGeneralServiceCommission()` entry point
- `doPooling()` to inspect revenue redistribution
- `createAdHocPayments()` to verify final payment amounts

### Debug Package Usage

Project uses `debug` package for granular logging:

```typescript
import debug from "debug";
const talenoxFunctionsDebug = debug("talenox_functions");
talenoxFunctionsDebug("url: %s", url); // Enabled when DEBUG=talenox_functions:*
```

**Enable debug output**:

```bash
DEBUG=* npm run run:tsx                    # All debug output
DEBUG=talenox_functions:* npm run run:tsx  # Talenox API calls only
```

### Common Debugging Scenarios

**Issue: Commission calculation doesn't match expected**

1. Check `staffHurdle.json` for correct hurdle levels/rates
2. Verify `customPayRates` array for service name matches (exact string match required)
3. Inspect `servRevenueMap` in debugger to see revenue bucketing
4. Check pooling logic if `poolsWith` is configured

**Issue: Staff not appearing in output**

1. Check if `contractor: true` in `staffHurdle.json` (separate log file)
2. Verify `payViaTalenox: true` (false skips Talenox upload)
3. Check `config.missingStaffAreFatal` if staff ID missing from config
4. Inspect `getTalenoxEmployees()` response to verify staff in Talenox

**Issue: Talenox API failures**

1. Enable `DEBUG=talenox_functions:*` to see API requests/responses
2. Check `TALENOX_API_TOKEN` in [src/talenox_constants.ts](../src/talenox_constants.ts)
3. Verify `config.updateTalenox === true` (dry-run mode if false)
4. Inspect `createPayroll()` and `uploadAdHocPayments()` return tuples

## Common Gotchas

1. **Missing Staff IDs**: If Mindbody report has staff without ID in staffHurdle.json, behavior controlled by `config.missingStaffAreFatal`
2. **File archiving**: `moveFilesToOldSubDir()` automatically archives old data/payment files to `old/` subdirectory with gzip compression
3. **Module system**: Project uses ESM (`.js` imports, `"type": "module"` in package.json) - always include `.js` extension in imports
4. **Rounding**: Commission amounts rounded to 2 decimals with `Math.round(value * 100) / 100`

## TODOs in Codebase

Active TODOs in [src/index.ts](../src/index.ts):

- Implement pooling for service/product commissions and tips
- Remove `ncp` dependency in build script
- Move staffHurdle.json filename to constant
- Fix rounding for custom pay rates (floating point precision)

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript-based commission calculator for salon staff that reads Mindbody payroll reports (Excel), calculates tiered commissions with custom pay rates, integrates with Talenox payroll API, and generates payment spreadsheets.

**Entry points**: `src/index.ts` (CLI processor), `src/server.ts` (web UI on port 3000)

## Commands

```bash
# Build
npm run build              # Compiles TypeScript, copies config files to dist/

# Run
npm run run:tsx            # Process commissions via tsx
npm run server:tsx         # Start web UI server on port 3000

# Test
npm test                   # Run Vitest test suite
npm run test:debug         # Run tests with Vitest debugger

# Debug
npm run server:debug:tsx   # Debug web server (breakpoint on first line)
DEBUG=* npm run run:tsx    # Enable all debug output
DEBUG=talenox_functions:* npm run run:tsx  # Debug Talenox API calls only
```

**Logging control** via `LOG4JS_CONSOLE` env var: `on` (default), `errors` (only errors to console), `off` (file logs only)

## Architecture

### Core Workflow (`src/index.ts` main function)

1. Parse Excel filename → extract payroll month/year (`parseFilename.ts`)
2. Load `config/staffHurdle.json` → commission tiers, custom rates, contractor status
3. Fetch Talenox employees via API (`talenox_functions.ts`)
4. Parse Mindbody Excel report → extract service revenue, tips, product commissions per staff
5. Calculate commissions using tiered hurdles (base → hurdle1 → hurdle2 → hurdle3)
6. Apply commission pooling for paired staff members
7. Generate payments Excel + push to Talenox (if `config.updateTalenox === true`)

### Key Modules

| Module | Purpose |
|--------|---------|
| `src/index.ts` | CLI orchestrator, Excel parsing, commission calculations |
| `src/server.ts`, `src/serverApp.ts` | Express web UI for config/file upload |
| `src/talenox_functions.ts` | Talenox API: fetch employees, create payroll, upload payments |
| `src/utility_functions.ts` | Staff validation, file operations |
| `src/logging_functions.ts` | log4js setup with multiple loggers |
| `src/staffHurdles.ts` | Loads staff config into globals |

### Global State Pattern

Uses TypeScript global declarations (`src/globals.d.ts`) set in `index.ts`:
- `global.staffHurdles` - Commission config from JSON
- `global.PAYROLL_MONTH`, `global.PAYROLL_YEAR` - From parsed filename
- `global.PAYMENTS_DIR`, `global.LOGS_DIR` - Output directories

Add `/* global PAYROLL_MONTH, PAYROLL_YEAR */` comment in files using globals to satisfy ESLint.

## Configuration Files

### `config/staffHurdle.json`

Per-staff commission structure:
```json
{
  "012": {
    "staffName": "Kate",
    "baseRate": 0,
    "hurdle1Level": 30000, "hurdle1Rate": 0.11,
    "hurdle2Level": 50000, "hurdle2Rate": 0.13,
    "hurdle3Level": 75000, "hurdle3Rate": 0.15,
    "contractor": false,
    "payViaTalenox": true,
    "poolsWith": ["019"],
    "customPayRates": [{ "Extensions": 0.15 }]
  },
  "000": { ... }  // Default fallback
}
```

### `config/default.json`

- `PAYROLL_WB_FILENAME`: Excel file to process
- `missingStaffAreFatal`: Throw error if staff not in staffHurdle.json
- `updateTalenox`: Push payments to Talenox API (false for dry runs)

## Staff ID Validation

Centralized via `getValidatedStaffHurdle()` in `utility_functions.ts`:

1. Returns staff config if exists in `staffHurdle.json`
2. If missing and `config.missingStaffAreFatal === true` → throws error
3. If missing and `config.missingStaffAreFatal === false` → warns, returns default "000"
4. Always throws if default "000" is missing

## Testing

Uses **Vitest** (not Jest). Test files: `src/**/*.spec.ts`

- Mock filesystem uses `memfs` for file I/O tests
- Reset `global.staffHurdles` in `beforeEach()` to prevent test pollution
- Mock both `node-config-ts` and `logging_functions.js` to control behavior

## Key Conventions

- **ESM modules**: Always use `.js` extension in imports
- **Commission rounding**: `Math.round(value * 100) / 100`
- **Logging**: Multiple loggers (`commissionLogger`, `contractorLogger`, `debugLogger`, etc.). Always call `shutdownLogging()` before process exit
- **File archiving**: `moveFilesToOldSubDir()` archives old files to `old/` with gzip compression

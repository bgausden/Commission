# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Decisions and Constraints

### xlsx is vendored — do not install from npm

This project uses a vendored copy of xlsx at `vendor/xlsx-0.20.3/`, not the npm package. The npm package is intentionally absent to ensure version stability.

- Vitest alias in `vitest.config.ts` maps `'xlsx'` imports to `src/vendor-xlsx.mjs`
- `src/vendor-xlsx.mjs` is the wrapper that configures xlsx with Node.js `fs`
- `@types/xlsx` is installed for type definitions only

**Do not run `npm install xlsx`.**

### ESM imports require `.js` extension

This is an ESM project (`"type": "module"`). All relative imports must use `.js` even when the source file is `.ts`. TypeScript resolves these correctly at compile time.

### ESLint global declarations

Files that use `global.PAYROLL_MONTH`, `global.PAYROLL_YEAR`, etc. must include a comment at the top to satisfy ESLint:

```ts
/* global PAYROLL_MONTH, PAYROLL_YEAR */
```

The full set of globals is declared in `src/globals.d.ts`.

### Always `await shutdownLogging()` before process exit

log4js buffers writes asynchronously. `shutdownLogging()` returns a `Promise<void>` — any code path that exits the process must `await` it or log entries will be lost.

### `updateTalenox: false` is a dry-run safety flag

`config/default.json` contains `updateTalenox`. When `false`, commissions are calculated and the payments Excel is generated but nothing is pushed to the Talenox API. Leave this `false` unless running a real payroll.

### Regression tests auto-discover the oldest baseline

`regression.spec.ts` does not hardcode a baseline name. On each run it scans `test-baselines/`, reads `metadata.json` from each subdirectory, and selects the entry with the earliest `createdDate`. Set `BASELINE_NAME` to override:

```bash
BASELINE_NAME=dec-2025-baseline npm run test:regression
```

`test-baselines/` is gitignored. Tests skip gracefully (not fail) when no baseline exists.

The discovery logic lives in `scripts/utils/baselineUtils.ts` (`findOldestBaseline`).

### Test fixtures use anonymized staff names

`test-fixtures/sample-payments.xlsx` has real staff names replaced with generic labels ("Staff A", "Staff B", etc.). This is intentional. Do not replace them with real names.

To update fixtures after a real payroll run:

```bash
cp "payments/Talenox Payments YYYYMM.xlsx" test-fixtures/sample-payments.xlsx
npm run anonymize-fixtures
```

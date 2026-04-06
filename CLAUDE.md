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

### Regression test axiom

The regression test processes a **fixed input file** (the Mindbody commission xlsx stored in the baseline) and asserts that **all generated outputs** (payments Excel, commission log, contractor log) are field-for-field identical to the baseline outputs. Any difference — including added staff, removed staff, or modified values — is a test failure. All changes to regression logic must preserve this invariant.

### Regression tests auto-discover the oldest baseline

`regression.spec.ts` does not hardcode a baseline name. On each run it scans `test-baselines/`, reads `metadata.json` from each subdirectory, and selects the entry with the earliest `createdDate`. Set `BASELINE_NAME` to override:

```bash
BASELINE_NAME=dec-2025-baseline npm run test:regression
```

`test-baselines/` is gitignored. Regression tests fail with a clear error when no baseline exists.

### Baseline assembly from archived artifacts

Use `npm run assemble-baseline -- ...` to build a baseline directly from archived artifacts without rerunning historical payrolls.

- Supports auto-discovery from `data[/old]`, `payments[/old]`, and `logs[/old]`
- Requires matching `commission-*` and `contractor-*` run logs
- `--preflight` validates availability without writing files
- `--force` requires confirmation; use `--confirm-force` for non-interactive runs

### Git workflow — do not work in master

All new features and bug fixes must be developed on a separate branch. Do not implement feature/fix work directly on `master`.

### Test fixtures use anonymized staff names

`test-fixtures/sample-payments.xlsx` has real staff names replaced with generic labels ("Staff A", "Staff B", etc.). This is intentional. Do not replace them with real names. See `test-fixtures/README.md` for update instructions.

## Coding Philosophy

When proposing a bug fix, always assess whether the underlying issue can be eliminated through type-level constraints rather than runtime checks. Prefer compile-time impossibility over runtime defence.

Design requirement: prefer a functional core, imperative shell architecture. Keep pure business logic in small deterministic functions and isolate I/O, API calls, filesystem access, logging, and process/environment interactions in thin orchestration layers.

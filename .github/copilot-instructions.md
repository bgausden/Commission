# Commission Calculator - AI Agent Instructions

## Project Overview

TypeScript-based commission calculator for salon staff that processes Mindbody payroll reports and calculates tiered commissions with custom pay rates.

**Entry points**: [src/index.ts](../src/index.ts) (CLI), [src/server.ts](../src/server.ts) (web UI, default port 3000, overridable via `PORT` env var)

## Non-Obvious Constraints

### Global State — ESLint comment required

Files using `global.PAYROLL_MONTH`, `global.PAYROLL_YEAR`, etc. must include a comment at the top:

```typescript
/* global PAYROLL_MONTH, PAYROLL_YEAR */
```

Full set declared in [src/globals.d.ts](../src/globals.d.ts). Without this comment ESLint reports undefined variable errors.

### `updateTalenox: false` is a dry-run safety flag

`config/default.json` → `updateTalenox`. When `false`, commissions are calculated and the payments Excel is generated but nothing is pushed to the Talenox API. **Do not set to `true`** unless running a real payroll.

### xlsx is vendored — do not install from npm

Vendored at `vendor/xlsx-0.20.3/`. Vitest alias in `vitest.config.ts` maps `'xlsx'` to `src/vendor-xlsx.mjs`. Installing from npm will break this.

### Always `await shutdownLogging()` before process exit

log4js buffers writes asynchronously. `shutdownLogging()` returns `Promise<void>` — any exit path that skips `await shutdownLogging()` will lose log entries.

## Key Behavioral Notes

### `staffHurdle.json` default fallback

Staff ID `"000"` is the fallback entry used when a staff member appears in the Mindbody report but has no entry in `config/staffHurdle.json`. Behaviour is controlled by `config.missingStaffAreFatal`:

1. Staff ID found → use their config directly
2. Staff ID missing + `missingStaffAreFatal: true` → throw error
3. Staff ID missing + `missingStaffAreFatal: false` → warn and return `"000"` config
4. `"000"` itself missing → always throws regardless of config

### Mindbody Excel format assumptions

The parser ([src/index.ts](../src/index.ts)) locates staff blocks, the revenue column, and totals rows by exact string matches against constants defined at the top of that file. Whitespace or capitalisation changes in the source report will break parsing silently.

### Commission pooling

Staff with a `poolsWith` array in `staffHurdle.json` share total revenue equally before hurdle calculation. Pooling currently applies to general services only — tips, product commission, and custom rate commissions are **not** pooled (active TODO).

### Regression test axiom

The regression test processes a **fixed input file** (the Mindbody commission xlsx stored in the baseline) and asserts that **all generated outputs** (payments Excel, commission log, contractor log) are field-for-field identical to the baseline outputs. Any difference — including added staff, removed staff, or modified values — is a test failure. All changes to regression logic must preserve this invariant.

### Regression baseline discovery

`regression.spec.ts` auto-discovers the oldest available baseline in `test-baselines/` (by `createdDate` in `metadata.json`). Override with:

```bash
BASELINE_NAME=dec-2025-baseline npm run test:regression
```

`test-baselines/` is gitignored. Regression tests fail with a clear error when no baseline exists.

### Baseline assembly from saved artifacts

Use `npm run assemble-baseline -- ...` to create baselines from archived run artifacts instead of hand-rolling directory contents.

- Supports `.gz` and plain artifacts in `data[/old]`, `payments[/old]`, `logs[/old]`
- Requires matching `commission-*` and `contractor-*` logs for the same run key
- `--preflight` validates artifact/config availability without writing files
- `--force` overwrites an existing baseline and asks for confirmation
- Use `--confirm-force` to auto-confirm (required in non-interactive terminals)

## Integration Points

### Talenox API ([src/talenox_functions.ts](../src/talenox_functions.ts))

Auth token is loaded from `process.env.TALENOX_API_TOKEN` (via dotenv) in [src/talenox_constants.ts](../src/talenox_constants.ts).

Key functions: `getTalenoxEmployees()`, `createPayroll()`, `uploadAdHocPayments()`.

## Common Gotchas

1. **Missing staff IDs**: Behaviour controlled by `config.missingStaffAreFatal` — see above.
2. **File archiving**: `moveFilesToOldSubDir()` automatically gzip-compresses and archives old data/payment files to an `old/` subdirectory on each run.
3. **Rounding**: General service commission amounts use `Math.round(value * 100) / 100`. Custom pay rate rounding has a known floating-point precision issue (active TODO).
4. **ESM imports**: Always use `.js` extension in relative imports even for `.ts` source files.

## Active TODOs

See the top of [src/index.ts](../src/index.ts) for the current TODO list.

## Coding Philosophy

When proposing a bug fix, always assess whether the underlying issue can be eliminated through type-level constraints rather than runtime checks. Prefer compile-time impossibility over runtime defence.

## Runtime Environment Variables

| Variable             | Purpose                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| `DATA_DIR`           | Override input workbook directory (default: `data/`)                                 |
| `LOGS_DIR`           | Override log output directory (default: `logs/`)                                     |
| `PAYMENTS_DIR`       | Override payments output directory (default: `payments/`)                            |
| `LOG4JS_CONSOLE`     | Console log verbosity: `on` (default) / `errors` / `off`                             |
| `NODE_CONFIG_DIR`    | Override directory that `node-config-ts` reads config from                           |
| `STAFF_HURDLE_FILE`  | Override path to `staffHurdle.json`                                                  |
| `PORT`               | Override web server port (default: `3000`)                                           |
| `REGRESSION_OFFLINE` | Set to `1` to skip all external API calls (Talenox/GDrive); used by regression tests |

# Commission Calculator - AI Agent Instructions

## Project Overview

TypeScript-based commission calculator for salon staff that processes Mindbody payroll reports and calculates tiered commissions with custom pay rates.

**Entry points**: [src/index.ts](../src/index.ts) (CLI), [src/server.ts](../src/server.ts) (web UI on port 3000)

## Non-Obvious Constraints

### Global State — ESLint comment required

Files using `global.PAYROLL_MONTH`, `global.PAYROLL_YEAR`, etc. must include a comment at the top:

```typescript
/* global PAYROLL_MONTH, PAYROLL_YEAR */
```

Full set declared in [src/globals.ts](../src/globals.ts). Without this comment ESLint reports undefined variable errors.

### `updateTalenox: false` is a dry-run safety flag

`config/default.json` → `updateTalenox`. When `false`, commissions are calculated and the payments Excel is generated but nothing is pushed to the Talenox API. **Do not set to `true`** unless running a real payroll.

### xlsx is vendored — do not install from npm

Vendored at `vendor/xlsx-0.20.3/`. Vitest alias in `vitest.config.ts` maps `'xlsx'` to `src/vendor-xlsx.mjs`. Installing from npm will break this.

### Always call `shutdownLogging()` before process exit

log4js buffers writes asynchronously. Any exit path that skips `shutdownLogging()` will lose log entries.

## Key Behavioral Notes

### `staffHurdle.json` default fallback

Staff ID `"000"` is the fallback entry used when a staff member appears in the Mindbody report but has no entry in `config/staffHurdle.json`. Behaviour is controlled by `config.missingStaffAreFatal`:

1. Staff ID found → use their config directly
2. Staff ID missing + `missingStaffAreFatal: true` → throw error
3. Staff ID missing + `missingStaffAreFatal: false` → warn and return `"000"` config
4. `"000"` itself missing → always throws regardless of config

### Mindbody Excel format assumptions

The parser ([src/index.ts](../src/index.ts)) locates data by searching for specific header strings:

- Staff blocks begin with `"Staff ID #: <ID>"`
- Revenue column found by searching for `"Rev. per Session"`
- Totals row starts with `"Total for "`

Exact string matches — whitespace or capitalisation changes in the source report will break parsing silently.

### Commission pooling

Staff with a `poolsWith` array in `staffHurdle.json` share total revenue equally before hurdle calculation. Pooling currently applies to general services only — tips, product commission, and custom rate commissions are **not** pooled (active TODO).

### Regression baseline discovery

`regression.spec.ts` auto-discovers the oldest available baseline in `test-baselines/` (by `createdDate` in `metadata.json`). Override with:

```bash
BASELINE_NAME=dec-2025-baseline npm run test:regression
```

`test-baselines/` is gitignored. Tests skip gracefully when no baseline exists.

## Integration Points

### Talenox API ([src/talenox_functions.ts](../src/talenox_functions.ts))

Auth token is a hardcoded constant in [src/talenox_constants.ts](../src/talenox_constants.ts) (TODO: move to env var).

Key functions: `getTalenoxEmployees()`, `createPayroll()`, `uploadAdHocPayments()`.

## Common Gotchas

1. **Missing staff IDs**: Behaviour controlled by `config.missingStaffAreFatal` — see above.
2. **File archiving**: `moveFilesToOldSubDir()` automatically gzip-compresses and archives old data/payment files to an `old/` subdirectory on each run.
3. **Rounding**: General service commission amounts use `Math.round(value * 100) / 100`. Custom pay rate rounding has a known floating-point precision issue (active TODO).
4. **ESM imports**: Always use `.js` extension in relative imports even for `.ts` source files.

## Active TODOs ([src/index.ts](../src/index.ts))

- Implement pooling for service/product commissions and tips
- Remove `ncp` dependency in build script
- Move `staffHurdle.json` filename to a constant
- Fix rounding for custom pay rates
- Move `TALENOX_API_TOKEN` to env var

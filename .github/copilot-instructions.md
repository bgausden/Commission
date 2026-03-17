# Commission Calculator - AI Agent Instructions

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

### Git workflow — do not work in master

All new features and bug fixes must be developed on a separate branch. Do not implement feature/fix work directly on `master`.

## Key Behavioral Notes

### `staffHurdle.json` default fallback

`getStaffHurdle()` returns `Option<StaffHurdle>`. Staff ID `"000"` is the fallback when a staff member has no entry in `config/staffHurdle.json`:

1. Staff ID found → `Option.some(hurdle)`
2. Staff ID missing + `missingStaffAreFatal: true` → throw error
3. Staff ID missing + `missingStaffAreFatal: false` → warn and return `Option.some("000" config)`
4. `"000"` itself missing → always throws regardless of config

### Mindbody Excel format assumptions

The parser locates data by searching for exact header strings — whitespace or capitalisation changes in the source report will break parsing **silently**:

- Staff blocks begin with `"Staff ID #: <ID>"`
- Revenue column: `"Rev. per Session"`
- Totals row: `"Total for "`

### Talenox API token

`TALENOX_API_TOKEN` in [src/talenox_constants.ts](../src/talenox_constants.ts) is a hardcoded constant (TODO: move to env var).

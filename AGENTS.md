# AGENTS.md

Purpose: architecture + domain behavior contracts + non-obvious execution invariants for this repository.

## Source Of Truth

- Architecture and business behavior: this file
- Copilot-specific behavior: `.github/copilot-instructions.md`
- Claude-agent-only behavior: `CLAUDE.md`
- Setup walkthroughs and deep guides: `docs/`

## System Shape

- Runtime entry points:
  - `src/index.ts` (CLI shell)
  - `src/server.ts` + `src/serverApp.ts` (web shell)
- Commission domain core:
  - `src/payrollShell.ts`
  - `src/payrollCommission.ts`
  - `src/payrollPooling.ts`
  - `src/payrollWorkbook.ts`
  - `src/payrollWorksheet.ts`
- External adapters:
  - `src/talenox_functions.ts`
  - `src/gdrive_functions.ts`

## Canonical Domain Contracts

### Staff hurdle loading is centralized

Use `loadStaffHurdlesFromFile(filePath?)` in `src/staffHurdles.ts` as the only loader for CLI and server.

- Returns `Result<TStaffHurdles>`
- Validates with `staffHurdleSchema`
- Trims keys at load time

Do not introduce parallel loaders.

### Missing-staff semantics are business policy

`config/staffHurdle.json` fallback id `"000"` is used when staff config is missing and `missingStaffAreFatal` is false.

- Missing explicit id + `missingStaffAreFatal: true` => fail
- Missing explicit id + `missingStaffAreFatal: false` => use `"000"`
- Missing `"000"` => always fail

### Mindbody parsing is exact-string dependent

Parser behavior depends on exact worksheet labels and marker strings in `src/index.ts`.
Source workbook formatting/case drift can silently break parsing.

### Pooling scope is intentionally narrow

`poolsWith` logic in `src/payrollPooling.ts` applies to general services revenue only.
Tips, product commission, and custom pay-rate commissions are not pooled.

### Regression contract is exact-output

Regression compares generated outputs field-for-field against baseline artifacts.
Any output difference is a failure.

## Error-Handling Model

- Functional core modules return `Result<T>` for recoverable external/input failures.
- Use assertions for logic invariants that should be impossible when types/schema hold.
- Reserve throw for imperative shell boundaries.

## Non-Obvious Execution Invariants

1. Safety flag: keep `config/default.json` -> `updateTalenox: false` unless user explicitly requests live payroll.
2. Completion gate: all must pass before done.
   - `npm test`
   - `BASELINE_NAME=2025-12 npm run test:regression`
   - `npm run build`
3. Process exit paths must `await shutdownLogging()` to avoid dropped logs.
4. Relative TypeScript imports must use `.js` extensions.
5. Files using payroll globals need ESLint global comment (`/* global PAYROLL_MONTH, PAYROLL_YEAR */`).
6. Do feature/fix work on a branch, not `master`.
7. At session start, detect host OS and available shell utilities before running commands; use PowerShell-native commands on Windows and POSIX tooling on macOS.

## Fresh-Session Accelerator

1. Branch guard: `git branch --show-current`
2. Script inventory: `npm run`
3. Regression harness: `scripts/regression.spec.ts`
4. Baseline tooling: `scripts/listBaselines.ts`, `scripts/assembleBaselineFromArtifacts.ts`, `scripts/updateBaseline.ts`
5. Baseline selection: oldest `createdDate` in `test-baselines/*/metadata.json` unless `BASELINE_NAME` is set
6. External-call-free regression mode: `REGRESSION_OFFLINE=1`
7. GDrive runtime gotcha: blank `GDRIVE_*` advanced-config values should clear runtime overrides, not set empty strings
8. GDrive visibility gotcha: skip/failure messages are emitted to stderr; web UI may hide stderr unless enabled
9. TS config intent: `tsconfig.json` (broad checks), `tsconfig.build.json` (build compile), `scripts/tsconfig.json` (scripts)

## High-Value Pointers

- `.github/copilot-instructions.md` (Copilot execution behavior)
- `CLAUDE.md` (Claude-agent-only guidance)
- `docs/README.tsconfig.md` (tsconfig split rationale)
- `docs/GOOGLE_DRIVE_SETUP.md` (GDrive provisioning and safety)
- `test-fixtures/README.md` (fixture anonymization policy)
- `.impeccable.md` (UI visual language guidance for `public/`)

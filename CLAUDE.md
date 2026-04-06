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

## Development Principles

**Functional core, imperative shell**
Pure logic at the centre; I/O and side-effects at the boundary.
Enables deterministic testing of all business logic without mocking infrastructure.

**Consistency by construction**
Model your domain so invalid state cannot be expressed in the type system.
Eliminates entire classes of defensive checks and the bugs that occur when they're forgotten.

**Use assertions to catch logic errors**
Assert invariants and preconditions that correct code should never violate.
Assertions are documentation that executes; they surface logic errors at the point of cause, not downstream.

**Parse, don't validate**
Accept raw input once at the system boundary; convert it to a guaranteed-valid type immediately.
Never re-validate the same data downstream — if it's in the system, it's already known-good.

**Total functions**
Every function handles its full input domain; return Result/Option rather than throwing or returning null.
Forces callers to handle failure paths explicitly; eliminates hidden control flow.

**Push effects to the leaves**
Clocks, randomness, and I/O belong as close to the entry point as possible.
Keeps the functional core pure and makes time/environment-dependent behaviour easy to control in tests.

**Explicit over implicit**
Functions declare all dependencies as arguments; no hidden control flow or global mutable state.
In small teams, implicit behaviour has no institutional memory to compensate for it — it becomes a trap.

**Ports and adapters**
Domain logic depends on interfaces, not concrete infrastructure.
Swapping databases, queues, or external APIs becomes a non-event; enforces FCIS at the module level.

**Prefer duplication over the wrong abstraction**
Abstract only when ≥3 concrete cases exist and the shared shape is unambiguous.
Wrong abstractions are harder to undo than duplication; in small teams the cost per person is high.

### GUI and design work

When working on the web UI (`public/`) or any design/styling task, read [`.impeccable.md`](.impeccable.md) for the project's design context — color palette, typography, spacing, component guidelines, and design principles derived from HBO's aesthetic.

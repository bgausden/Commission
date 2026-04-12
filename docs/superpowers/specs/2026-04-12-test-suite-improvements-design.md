# Test Suite Improvements Design

**Date:** 2026-04-12
**Status:** Approved

## Goals

Improve test coverage and robustness equally — not coverage for coverage's sake.

Two concrete problems to solve:

1. `index.spec.ts` uses global state mutation and mixes tests for functions now covered by dedicated spec files. It is a fragility risk and an organisational problem.
2. Several important modules have zero or thin test coverage: `Option`, `calculateTieredCommission` boundaries, `getServiceRevenues`, `calculateStaffCommission` multi-service cases, pooling edge cases.

## Approach: Option A — Surgical

Fix fragility first via migration, then add targeted coverage.

Leave `utility_functions.validation.spec.ts` global state as-is: those tests intentionally exercise the global-reading `getStaffHurdle` function, so the global mutation is appropriate.

---

## Part 1: Migrate `index.spec.ts` and delete it

`index.ts` is an entry-point shell plus five re-export lines. There is no logic unique to `index.ts` to test. However, `index.spec.ts` contains substantial real tests that must be preserved by migrating them to the appropriate dedicated spec files.

### Migration map

| Tests in `index.spec.ts` | Destination | Notes |
|---|---|---|
| `calculateTieredCommission` (~15 cases) | `payrollCommission.spec.ts` | Direct migration, no mock needed |
| `calculateStaffCommission` (~8 cases) | `payrollCommission.spec.ts` | Rewrite using injected `StaffHurdleGetter`; drop global mock |
| `getServiceRevenues` (~11 cases) | `payrollWorksheet.spec.ts` | Direct migration, no mock needed |
| `extractStaffPayrollData` (~6 cases) | `payrollWorksheet.spec.ts` | Skip cases that duplicate existing tests |
| `doPooling` (~7 cases) | `payrollPooling.spec.ts` | Test `calculatePooledCommissionMap` directly; `doPooling` = pure wrapper + logging |
| `doPooling` + `createAdHocPayments` integration test | Drop | Payment output already covered in `talenox_functions.spec.ts` |

### `calculateStaffCommission` rewrite rule

`index.spec.ts` mocks `getStaffHurdle` via `vi.mock('./utility_functions.js')` to return fixture hurdles. The modern pattern (used in `payrollCommission.spec.ts`) is to pass a `StaffHurdleGetter` directly. The migrated tests must use that pattern:

```ts
function createGetter(hurdle: StaffHurdle): StaffHurdleGetter {
  return () => Option.some(hurdle);
}
```

Hurdle values must match those used in `index.spec.ts` so commission totals remain correct.

### `doPooling` → `calculatePooledCommissionMap` rewrite rule

`doPooling` calls `calculatePooledCommissionMap` then logs the reports. Logging is not behaviour worth asserting in unit tests. Migrate all pool behaviour assertions to target `calculatePooledCommissionMap` directly and add a `vi.mock('./logging_functions.js')` to suppress output.

The `expectDerivedTotals` helper from `index.spec.ts` is worth preserving in `payrollPooling.spec.ts`.

### After migration

Delete `index.spec.ts`.

---

## Part 2: New `Option` unit tests (`src/option.spec.ts`)

`Option` is a hand-rolled ADT. Zero tests currently. All methods have non-trivial implementations that could silently break.

### Test cases

**`Option.some`**
- `fold`: calls `onSome(value)`, does not call `onNone`
- `map`: returns `some(f(value))`
- `flatMap`: returns `f(value)` directly
- `getOrElse`: returns `value`, not the default
- `isSome`: returns `true`
- `isNone`: returns `false`

**`Option.none`**
- `fold`: calls `onNone()`, does not call `onSome`
- `map`: returns `none`; the mapping function is not called
- `flatMap`: returns `none`; the mapping function is not called
- `getOrElse`: returns the default value
- `isSome`: returns `false`
- `isNone`: returns `true`

**`Option.fromNullable`**
- `fromNullable(null)` → `none`
- `fromNullable(undefined)` → `none`
- `fromNullable(0)` → `some(0)` (falsy non-null)
- `fromNullable('')` → `some('')` (falsy non-null)
- `fromNullable(value)` → `some(value)` for a truthy value

**Chaining**
- `some(x).map(f).map(g)` → `some(g(f(x)))` — verifies map composition
- `some(x).flatMap(f).getOrElse(d)` where `f` returns `none` → returns `d`

---

## Out of scope

- `string_functions.ts` — pure wrappers around the `fws` library; testing them verifies the library, not our code
- `parseFilename.spec.ts` — already has 2 happy-path cases and 1 error case; no important edge cases missing
- `utility_functions.validation.spec.ts` global state — intentional, not fragile
- Any refactoring of source files

---

## Success criteria

- `npm test` passes green after all changes
- `index.spec.ts` deleted
- Test count does not decrease (migration preserves all meaningful cases)
- No test file mutates globals except `utility_functions.validation.spec.ts` (which is intentional)
- `option.spec.ts` exists with full method coverage

## Plan: Staff Redo Workbook

Add an optional explicit redo-workbook config input, parse and fully validate a first-sheet XLSX redo table into typed redo entries, apply redo adjustments after pooling, render one report line per redo row in commission/contractor logs, and export employee redo items to Talenox as ad hoc payments using positive amounts with item types `Commission (Irregular)`, `Deduction`, or `Deduction (from Net Salary)` as dictated by the clarified month rules. Preserve existing behaviour and regression baselines by treating redo handling as disabled when the redo workbook filename is unset; once configured, any redo workbook problem must fail the run.

**Steps**

1. Phase 1: Define the redo workbook contract and config surface.
2. Add an optional config field for the redo workbook filename in `config/Config.d.ts`, `config/default.json`, the server fallback config in `src/serverApp.ts`, and any config JSON returned by `/config` or persisted by `/update-config` in `src/serverApp.ts`.
3. Keep the redo workbook config optional and default-empty so existing runs, tests, and baselines remain unchanged when no redo workbook is configured. Once the config value is non-empty, treat the redo workbook as mandatory and fail fast on any load or validation problem.
4. Define the canonical first-sheet header row exactly once and make the loader validate it strictly. Required columns: `Original Service Date`, `Client Name`, `Original Staff ID`, `Original Staff Name`, `Redo Staff ID`, `Redo Staff Name`, `Debit Amount`, `Credit Amount`.
5. Phase 2: Add a dedicated redo workbook parser/validator.
6. Create a new focused module, recommended as `src/staffRedoWorkbook.ts`, that reads the configured XLSX via the existing workbook/XLSX pattern in `src/payrollWorkbook.ts` and returns `Result<T>` rather than throwing from functional-core code.
7. Define typed redo-domain records in `src/types.ts` or a dedicated sibling type module. Use separate types for raw validated workbook rows and per-staff applied ledger entries so parsing concerns and downstream reporting/export concerns stay distinct.
8. Validate the redo workbook on load before commission calculation proceeds. Validation rules should be explicit and total:
9. The workbook must exist when configured, be readable as XLSX, and contain a first worksheet with the exact required headers.
10. Every row must have a parseable `Original Service Date` value.
11. `Original Staff ID` is required. If it is not found in `staffHurdle.json`, the redo workbook validation fails and the run exits with an error.
12. `Redo Staff ID` is the sole toggle for whether a credit entry is emitted. If present, a credit entry is emitted for that staff member. If absent, the row is debit-only. `Redo Staff Name` is informational only and is never validated.
    13a. If `Redo Staff ID` is present and not found in `staffHurdle.json`, the redo workbook validation fails and the run exits with an error.
13. `Debit Amount` is required, numeric, and strictly positive.
14. `Credit Amount` may be blank only when `Redo Staff ID` is absent. If `Redo Staff ID` is present, `Credit Amount` must be numeric and non-negative (zero is valid — e.g. redo performed by salaried staff who receive no commission credit).
15. If `Redo Staff ID` is absent, `Credit Amount` must be blank, not zero.
16. Phase 3: Introduce redo adjustments into the payroll domain without corrupting existing commission semantics.
17. Do not overload existing `generalServiceCommission`, `customRateCommission`, or `totalServiceCommission` to include redo adjustments. Those fields already have clear meanings in `src/payrollCommission.ts` and changing that meaning would create unnecessary regression risk.
18. Do not augment `TCommComponents` or `TCommMap` with redo fields. Instead, define a separate `TRedoMap: Map<TStaffID, TRedoAdjustment>` in `src/types.ts` that holds per-staff redo ledger entries and totals. `TCommMap` stays unchanged.
19. Model `TRedoAdjustment` as a structure containing an array of detailed ledger rows (`redoEntries`) plus derived totals (`redoDebitTotal`, `redoCreditTotal`, `redoNetAdjustment`). Ledger rows are needed because reports must preserve one line per redo row and Talenox export needs row-level item types and remarks.
20. Keep redo application separate from service commission calculation in `src/payrollCommission.ts`. The cleanest boundary is:
21. Parse and validate payroll workbook into the current `commMap` as today.
22. Apply pooling via `src/payrollPooling.ts` exactly as today.
23. Apply redo adjustments after pooling to the final per-staff payable view.
24. Redo adjustments must never be pooled. They are explicit staff debits/credits, not shared service revenue.
25. Build a small helper module, recommended as `src/staffRedoAdjustments.ts`, that converts validated redo workbook rows into a `TRedoMap`. When the redo workbook is unconfigured, pass an empty map — no merging required.
26. For each validated redo row, emit:
27. One debit entry against the original staff.
28. One credit entry against the redo staff only when redo-staff fields are present.
29. Preserve enough row context on each emitted entry for reporting and Talenox remarks: client name, original service date, source row number, counterparty staff identity, and original row direction.
30. Phase 4: Wire redo loading into the CLI and server configuration flow.
31. In `src/index.ts`, resolve the redo workbook path from `DATA_DIR` plus the new config filename after payroll context and directories are established, and before final payment/report generation.
32. Only attempt redo loading when the config filename is non-empty. If it is empty or absent, skip redo processing entirely.
33. When configured, load and validate the redo workbook before the run proceeds to report/export generation. Surface validation errors clearly and abort the run before any Talenox upload.
34. Add a dedicated `/upload-redo` endpoint in `src/serverApp.ts` for the redo workbook. It follows the same pattern as `/upload-commission` — saves the file to `DATA_DIR` and persists `REDO_WB_FILENAME` to config. The `/upload-commission` endpoint is unchanged.
35. Extend the config UI in `public/index.html` to expose the redo workbook filename/status independently of the payroll workbook. The plan should preserve the existing visual structure and existing config fetch/update pattern.
36. Extend `src/server.update-config.spec.ts` to verify the new config field is persisted, preserved across unrelated config updates, and exposed via `/config`.
37. Phase 5: Extend commission and contractor reporting.
38. Update report rendering in `src/payrollShell.ts` so each staff report includes a dedicated redo section after the existing commission components and before the final payable line. Thread `redoMap: TRedoMap` as an explicit additional parameter through `logStaffCommission` and its callers. For staff with no redo entries, use an empty `TRedoAdjustment` fallback.
39. Emit one log line per redo entry. Recommended content per line: direction (`DEBIT` or `CREDIT`), amount, client name, original service date, and counterparty staff when present.
40. Update `Total Payable` in `src/payrollShell.ts` to include `redoNetAdjustment` from the `TRedoMap` entry for the current staff member, in addition to existing general/custom/product/tips totals. When no redo entry exists for a staff member, treat `redoNetAdjustment` as zero.
41. Keep the existing contractor-vs-employee logger routing untouched so redo entries appear in contractor reports automatically when the affected staff member is a contractor.
42. Add or extend focused tests in `src/payrollShell.spec.ts` to assert redo sections, per-row logging, and final payable math.
43. Phase 6: Extend Talenox export for redo credits/debits.
44. Extend Talenox payment-type support in `src/talenox_constants.ts` and `src/talenox_types.ts` to include `Deduction` and `Deduction (from Net Salary)`.
45. Reuse the existing ad hoc export path in `src/talenox_functions.ts` instead of creating a second payroll export mechanism.
46. Update `createAdHocPayments()` in `src/talenox_functions.ts` to accept `redoMap: TRedoMap` as a third parameter (defaulting to an empty map). The function emits commission payments as today, then additionally emits redo payments from `redoMap` for eligible employee staff.
47. Use positive amounts for all redo exports. Skip zero-amount credit entries from Talenox export entirely — they are still logged in the commission/contractor log for audit but no payment record is sent to Talenox.
48. Credit entries use item type `Commission (Irregular)`.
49. Debit entries use item type `Deduction` when `Original Service Date` is in the current payroll month.
50. Debit entries use item type `Deduction (from Net Salary)` when `Original Service Date` is in any prior month.
51. Keep contractor rows out of Talenox export. Reuse the existing employee-only gating pattern and existing resigned-staff filtering in `uploadAdHocPayments()` rather than inventing a second eligibility path.
52. Standardize deterministic redo remarks. Templates:
    - Debit: `REDO {originalServiceDate yyyy-mm-dd} {clientName}`
    - Credit: `REDO {clientName} for {originalStaffName}` — where `originalStaffName` is the name from the workbook column, falling back to the original staff ID if the name cell is blank. Similarly, if the redo staff name cell is blank on a credit entry, substitute the redo staff ID.
53. Add or extend tests in `src/talenox_functions.spec.ts` for:
54. Redo credit export as `Commission (Irregular)`.
55. Debit export as `Deduction` when `Original Service Date` is in the current payroll month.
56. Debit export as `Deduction (from Net Salary)` when `Original Service Date` is in any prior month.
57. Positive exported amounts for all redo items.
58. Contractor redo rows being omitted from ad hoc export.
59. Phase 7: Add focused tests for parsing, validation, and end-to-end behaviour.
60. Add a dedicated spec, recommended as `src/staffRedoWorkbook.spec.ts`, covering header validation, date parsing, ID validation, blank-credit rows, and row-level failure messages.
61. Add tests for the merge/apply helper, recommended as `src/staffRedoAdjustments.spec.ts`, covering:
62. Debit-only row.
63. Debit-plus-credit row.
64. Contractor-only report participation.
65. `redoNetAdjustment` math and payable totals.
66. If web UI upload/config is changed, extend server tests for the new upload route and config persistence path.
67. Phase 8: Preserve repo gates and regression behaviour.
68. Ensure the feature is dark by default through an empty/absent redo-workbook config value so existing regression baselines remain valid unless a redo workbook is intentionally configured.
69. Do not change the current payroll workbook parsing contract or pooling contract except for the explicit post-pooling redo overlay.
70. Keep new parsing/validation in total functions returning `Result<T>` until the `main()` shell boundary in `src/index.ts`, where a failed result may be unwrapped and abort the run.
71. Update any necessary operator-facing documentation in `README.md` and, if the UI changes materially, `public/index.html` copy so users know there is now a separate redo workbook input.

**Relevant files**

- `config/Config.d.ts` - add the new redo workbook config field to the generated config typing.
- `config/default.json` - add the optional redo workbook filename default, keeping it empty/disabled by default.
- `src/index.ts` - load the redo workbook when configured, validate it, apply redo adjustments after pooling, and fail the run on any redo error.
- `src/payrollWorkbook.ts` - reuse the existing XLSX-first-sheet read pattern; avoid duplicating XLSX wiring.
- `src/payrollCommission.ts` - keep existing service commission math unchanged; do not fold redo adjustments into service commission fields.
- `src/payrollPooling.ts` - preserve current pooling behaviour and explicitly keep redo adjustments outside pooling.
- `src/payrollShell.ts` - render redo rows in commission/contractor reports and include redo net in final payable.
- `src/types.ts` - add `TRedoLedgerEntry`, `TRedoAdjustment`, and `TRedoMap` types. `TCommComponents` and `TCommMap` are unchanged.
- `src/talenox_constants.ts` - add `Deduction` and `Deduction (from Net Salary)` constants if they are not already defined.
- `src/talenox_types.ts` - widen the allowed Talenox pay-item type union.
- `src/talenox_functions.ts` - emit row-level redo ad hoc payments with the correct item types and deterministic remarks.
- `src/serverApp.ts` - expose/persist redo workbook config, and add a separate redo upload flow for the web UI.
- `public/index.html` - add redo workbook upload/config UI while preserving the existing configuration page structure.
- `src/server.update-config.spec.ts` - cover config persistence/exposure for the new redo workbook setting.
- `src/payrollShell.spec.ts` - verify redo reporting and total payable behaviour.
- `src/talenox_functions.spec.ts` - verify redo payment export behaviour and item-type selection.
- `src/payrollCommission.spec.ts` - verify unchanged existing commission semantics if any touched refactor reaches this area.
- `src/staffRedoWorkbook.ts` - new parser/validator module for redo workbook input.
- `src/staffRedoWorkbook.spec.ts` - new parser/validator tests.
- `src/staffRedoAdjustments.ts` - new post-pooling redo application helper.
- `src/staffRedoAdjustments.spec.ts` - new adjustment-merge tests.
- `README.md` - document the separate redo workbook input and fail-fast validation contract if operator docs are maintained here.

**Verification**

1. Run the focused unit tests for the new parser/validator and redo application modules.
2. Run the focused existing tests covering report rendering, server config updates, and Talenox export after the new redo behaviour is wired in.
3. Run `npm test` and fix any regressions without skipping or weakening tests.
4. Run `BASELINE_NAME=2025-12 npm run test:regression` and verify that runs without configured redo input remain baseline-identical.
5. Run `npm run build` and ensure the new config typing, domain types, and Talenox type widening compile cleanly.
6. Manually exercise the web UI flow: upload payroll workbook, upload redo workbook, confirm both filenames are visible, then run a commission calculation and inspect commission/contractor logs plus generated payment workbook rows.
7. Manually exercise a failure case: configure a redo workbook with one invalid row and confirm the run aborts before any Talenox upload is attempted.

**Decisions**

- The redo workbook is a separate explicitly configured XLSX file using the first worksheet and a required fixed header row.
- Staff matching uses only the staff ID. Staff name columns are informational only — used for Talenox remarks, never validated against `staffHurdle.json`.
- Every row present in the configured redo workbook belongs to the current run. No date range validation is applied.
- Rows may debit the original staff with no credited redo staff; in that case redo-staff columns are blank and `Credit Amount` is blank.
- The run must fail fast if the redo workbook is missing, unreadable, or contains any invalid row once redo handling is configured.
- Report output must preserve one line per redo row.
- Talenox redo credits use `Commission (Irregular)` with positive amounts.
- Talenox redo debits use positive amounts with `Deduction` (Original Service Date in current payroll month) or `Deduction (from Net Salary)` (Original Service Date in any prior month).
- Redo adjustments are applied after pooling and are never pooled.
- Existing service-commission fields keep their current semantics; redo data is modeled as separate adjustments rather than being folded into `totalServiceCommission`.

**Further Considerations**

1. Config key name resolved: use `REDO_WB_FILENAME` to mirror `PAYROLL_WB_FILENAME`.
2. Architecture resolved: use a separate `TRedoMap` merged at the reporting/export boundary. `TCommComponents` is unchanged.
3. If future requirements add filtering of redo rows by date range, the parser/validator boundary in `src/staffRedoWorkbook.ts` is the natural place to add that filter stage.

# Commission Calculator — Domain Context

## Glossary

### Redo

A business scenario where a client is dissatisfied with a service and the salon provides the service again at no charge.

- The staff member who performed the original service receives a **redo debit** — a reduction applied to their commission payable.
- The staff member who performs the redo service receives a **redo credit** — an addition applied to their commission payable.
- In some cases the original staff is debited with no credited redo staff (the salon absorbs the cost entirely). In that case the redo-staff columns in the redo workbook are blank and no credit entry is emitted.
- A redo may be performed by the same staff member who did the original service.
- Redo adjustments are applied **after pooling** and are **never pooled**.

### Redo Workbook

An operator-supplied XLSX file (first worksheet, fixed header row) that lists all redo events to be processed in the current payroll run. Each row is one redo event. When `REDO_WB_FILENAME` config is non-empty, the file is mandatory and any load, parse, or validation failure aborts the run. Required columns: `Original Service Date`, `Client Name`, `Original Staff ID`, `Original Staff Name`, `Redo Staff ID`, `Redo Staff Name`, `Debit Amount`, `Credit Amount`.

**Validation rules (in summary)**:

- `Original Staff ID` must exist in `staffHurdle.json` — unknown ID always fails the run.
- `Redo Staff ID` is the sole toggle for credit emission. Absent = debit-only. If present and unknown, fails the run.
- Staff name columns are informational only — used for Talenox remarks, never validated.
- `Debit Amount` required, numeric, strictly positive.
- `Credit Amount` required and non-negative when `Redo Staff ID` present (zero = salaried redo staff, no credit payment). Must be blank when `Redo Staff ID` absent.
- No date range constraints on `Original Service Date` — all rows in the file belong to the current run.

### Payroll Run

A single execution of the commission calculator for a given payroll month/year, processing one Mindbody payroll report and optionally one redo workbook.

### Redo Map (`TRedoMap`)

A `Map<TStaffID, TRedoAdjustment>` produced by `src/staffRedoAdjustments.ts` after redo workbook validation. Kept separate from `TCommMap` — `TCommComponents` is never augmented with redo data. Merged with `TCommMap` only at the reporting and Talenox export boundary. When the redo workbook is unconfigured, an empty map is passed and no merging occurs.
A `Map<TStaffID, TRedoAdjustment>` produced by `src/staffRedoAdjustments.ts` after redo workbook validation. Kept separate from `TCommMap` — `TCommComponents` is never augmented with redo data. Merged with `TCommMap` only at the reporting and Talenox export boundary. When the redo workbook is unconfigured, an empty map is passed and no merging occurs.

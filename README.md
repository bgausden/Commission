# Commission Calculator

TypeScript-based commission calculator for salon staff that processes Mindbody payroll reports and calculates tiered commissions with custom pay rates.

## Quick Start

```bash
npm install
npm run build
npm run run:tsx        # Process commission
npm run server:tsx     # Web UI on port 3000
npm test               # Run test suite
```

## Key Features

- Tiered commission structure with configurable hurdles
- Custom pay rates for specific services
- Commission pooling for paired staff members
- Contractor vs. employee handling
- Talenox payroll API integration
- Google Drive upload of run artifacts (configurable)
- Regression testing with baseline snapshots

## Testing

```bash
npm test                    # Run all tests
npm run test:regression     # Run regression tests only
npm run create-baseline -- baseline-name  # Create test baseline
npm run anonymize-fixtures  # Anonymize test fixture data
```

### Regression Baselines

Regression tests auto-discover the oldest available baseline in `test-baselines/` (sorted by `createdDate` in each baseline's `metadata.json`). To target a specific baseline:

```bash
BASELINE_NAME=dec-2025-baseline npm run test:regression
```

Baselines are gitignored — create one locally before regression tests will do anything meaningful:

```bash
npm run create-baseline -- <name>
npm run list-baselines          # show available baselines
```

#### Validating the current codebase against a past payroll

Use this workflow to confirm that code changes haven't altered the results for a payroll period you've already run.

**Prerequisites**

- The Mindbody source Excel file for that period must be in `data/`
- `config/default.json` → `PAYROLL_WB_FILENAME` must reference that file

**Step 1 — Create the baseline**

Pass the git commit SHA from when that payroll was run so the baseline captures results at a known-good point:

```bash
npm run create-baseline -- dec-2025-baseline <commit-sha>
```

Omit the SHA to create the baseline from the current commit instead.

`create-baseline` checks out the target commit, runs the commission calculation, captures the outputs (payments Excel + commission log) alongside the source data and config, then returns you to your original branch.

**Step 2 — Run the regression test**

```bash
npm run test:regression
# or, to target this baseline explicitly:
BASELINE_NAME=dec-2025-baseline npm run test:regression
```

The test re-runs the calculation with the December source data using the current codebase and compares per-staff payment totals against the baseline. Any modifications, additions, or removals are reported.

### Test Fixtures

The `test-fixtures/` directory contains anonymized sample data for testing. The regression test automatically uses the most recent payments file from `payments/`, falling back to the anonymized sample if needed.

## Dependencies

**xlsx**: Uses vendored `vendor/xlsx-0.20.3/` (not npm package) for Excel file processing to ensure version stability.

## Console Logging

Control whether log4js writes to stdout/stderr via `LOG4JS_CONSOLE`:

- `LOG4JS_CONSOLE=on` (default): normal console logs
- `LOG4JS_CONSOLE=errors`: only error/fatal to console
- `LOG4JS_CONSOLE=off`: no log4js console output (file logs still written)

## Documentation

- [CLAUDE.md](CLAUDE.md) - Detailed architecture and development guide
- [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md) - Google Drive integration setup
- [.github/copilot-instructions.md](.github/copilot-instructions.md) - AI agent instructions for this codebase
- [test-fixtures/README.md](test-fixtures/README.md) - Test data documentation

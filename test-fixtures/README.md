# Test Fixtures

This directory contains sample data files used for testing.

## Files

### sample-payments.xlsx

Anonymized Talenox Payments Excel file used by regression tests.

**Purpose**: Provides a fallback for the regression test suite when no actual payments files exist in the `payments/` directory.

**Data Privacy**: All staff names have been anonymized (e.g., "Staff A", "Staff B"). Staff IDs and payment amounts remain unchanged for testing accuracy.

**Usage**: The regression test in `src/regression.spec.ts` will automatically use this file if:
- The `payments/` directory is empty
- The `payments/` directory doesn't exist
- An error occurs reading the `payments/` directory

**Updating**: To update with fresh data:
```bash
# Copy a recent real payments file
cp "payments/Talenox Payments YYYYMM.xlsx" test-fixtures/sample-payments.xlsx

# Anonymize the staff names
npx tsx scripts/anonymizeTestFixtures.ts
```

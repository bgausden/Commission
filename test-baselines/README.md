# Regression Test Baselines

This directory contains baseline snapshots for regression testing of commission calculations.

## Overview

Baselines capture a complete snapshot of:
- **Source Data**: Original Mindbody payroll Excel file
- **Configuration**: Commission rates and settings at time of baseline creation
- **Expected Outputs**: Payments Excel, commission logs, contractor logs
- **Metadata**: Commit SHA, checksums, staff list for validation

## Directory Structure

```
test-baselines/
  └── <baseline-name>/
      ├── metadata.json          # Baseline metadata and validation info
      ├── README.md              # Human-readable description
      ├── source/                # Original source data
      │   └── Payroll Report...xlsx
      ├── config/                # Configuration snapshots
      │   ├── staffHurdle.json
      │   └── default.json
      └── outputs/               # Expected outputs
          ├── Talenox Payments...xlsx
          ├── commission-*.log
          └── contractor-*.log
```

## Usage

### Create a New Baseline

```bash
# Create baseline from current code
npm run create-baseline -- my-baseline-name

# Create baseline from specific git commit
npm run create-baseline -- dec-2025-baseline abc123
```

**Naming Convention**: Use descriptive names like:
- `dec-2025-baseline` - Payroll month
- `v1.2.3-baseline` - Version number
- `before-pooling-refactor` - Feature context

### Run Regression Tests

```bash
# Run against default baseline (dec-2025-baseline)
npm run test:regression

# Run against specific baseline
BASELINE_NAME=jan-2026-baseline npm run test:regression
```

### Update Existing Baseline

When you intentionally change calculations (e.g., update commission rates):

```bash
npm run update-baseline -- my-baseline-name
```

### List Available Baselines

```bash
npm run list-baselines
```

## Test Behavior

### ✅ Tests PASS when:
- All staff amounts match baseline (within ±0.01 HKD tolerance)
- New staff added (informational only, not a failure)

### ❌ Tests FAIL when:
- Any staff amounts differ from baseline
- Staff removed from results (unexpected absence)

## Handling Changes

### Scenario: New Staff Joins

**Symptom**: Test passes, shows informational message about new staff

**Action**: None required - new staff are expected

**Example**:
```
ADDITIONS (Informational):
  Staff 025 (Sarah Lee): new staff
```

### Scenario: Pay Rate Changes

**Symptom**: Test fails with modifications detected

**Action**: Review calculations, then update baseline if intentional

**Steps**:
1. Review diff report to verify calculations are correct
2. Update baseline: `npm run update-baseline -- baseline-name`
3. Re-run tests to confirm pass

### Scenario: Staff Becomes Contractor

**Symptom**: Staff appears as "REMOVED" from commission log

**Explanation**: Staff moved to contractor log (different file)

**Action**: Create new baseline to capture new state

### Scenario: Source File Changed

**Symptom**: Test skips with checksum mismatch error

**Action**: Source data shouldn't change. If it must, create new baseline.

## Maintenance

### When to Create New Baseline
- New payroll month
- Significant code refactor
- Before/after major feature changes
- Known-good calculation to preserve

### When to Update Baseline
- Intentional configuration changes (pay rates, hurdles)
- Bug fixes that change calculations
- After verifying new calculations are correct

### Baseline Storage
- **.gitignore**: Add `test-baselines/` to exclude from git (large files)
- **OR Commit**: Commit baselines for shared team regression testing
- **Archive**: Compress old baselines: `tar -czf baseline.tar.gz baseline-name/`

## Troubleshooting

### Test Fails: "Baseline does not exist"

**Solution**: Create the baseline first
```bash
npm run create-baseline -- baseline-name
```

### Test Fails: "Source file modified or missing"

**Problem**: Source Excel file checksum doesn't match baseline

**Solutions**:
1. Ensure source file hasn't been modified
2. If source must change, create new baseline
3. Check file is in correct location (`data/` directory)

### Baseline Creation Fails

**Common Issues**:
- Git working tree not clean: Commit or stash changes
- Source file missing: Ensure file exists in `data/` directory
- Config file missing: Check `config/staffHurdle.json` exists
- Commission calculation error: Check logs for errors

### Test Shows All Staff Modified

**Problem**: Likely rounding or normalization issue

**Debug Steps**:
1. Check diff amounts - are they all ~0.01?
2. Review tolerance in comparison (should be 0.01)
3. Check log normalization is working

## Advanced

### Multiple Baselines

You can maintain multiple baselines for:
- Different payroll months
- Different configuration scenarios
- Known-good states for rollback

### CI/CD Integration

```yaml
# .github/workflows/regression.yml
- name: Run Regression Tests
  run: npm run test:regression
  env:
    BASELINE_NAME: production-baseline
```

### Custom Tolerance

Edit `scripts/comparison/compareBaseline.ts`:
```typescript
const DEFAULT_OPTIONS = {
  tolerance: 0.05, // Increase to 5 cents
  ...
};
```

## Files

- `requirements.md` - Complete regression test requirements (in session folder)
- `plan.md` - Implementation plan and task tracking (in session folder)
- See also: `../src/regression.spec.ts` for test implementation

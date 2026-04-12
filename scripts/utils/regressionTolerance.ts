import type {
  BaselineMetadata,
  ComparisonKind,
  ToleranceOverride,
} from "../../src/regression.types.js";

const VALID_COMPARISON_KINDS: ComparisonKind[] = [
  "payments",
  "commission",
  "contractor",
];

function assertValidToleranceOverride(
  override: ToleranceOverride,
  metadata: BaselineMetadata,
): void {
  if (!VALID_COMPARISON_KINDS.includes(override.kind)) {
    throw new Error(
      `Baseline "${metadata.baselineName}" has invalid tolerance exception kind: ${override.kind}`,
    );
  }

  if (!override.staffId.trim()) {
    throw new Error(
      `Baseline "${metadata.baselineName}" has a tolerance exception with an empty staffId.`,
    );
  }

  if (
    override.fields.length === 0 ||
    override.fields.some((field) => field.trim().length === 0)
  ) {
    throw new Error(
      `Baseline "${metadata.baselineName}" has invalid tolerance exception fields for staff ${override.staffId}.`,
    );
  }

  if (!Number.isFinite(override.tolerance) || override.tolerance < 0) {
    throw new Error(
      `Baseline "${metadata.baselineName}" has invalid tolerance exception value for staff ${override.staffId}: ${override.tolerance}`,
    );
  }
}

export function getBaselineToleranceOverrides(
  metadata: BaselineMetadata,
): ToleranceOverride[] {
  const overrides = metadata.knownToleranceExceptions ?? [];

  for (const override of overrides) {
    assertValidToleranceOverride(override, metadata);
  }

  return overrides;
}

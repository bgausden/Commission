import type { BaselineMetadata } from "../../src/regression.types.js";

export function getEffectiveRegressionTolerance(
  requestedTolerance: number,
  metadata: BaselineMetadata,
): number {
  const knownGapMaxDelta = metadata.knownRoundingGaps?.maxDelta;

  if (knownGapMaxDelta === undefined) {
    return requestedTolerance;
  }

  if (!Number.isFinite(knownGapMaxDelta) || knownGapMaxDelta < 0) {
    throw new Error(
      `Baseline "${metadata.baselineName}" has invalid knownRoundingGaps.maxDelta: ${knownGapMaxDelta}`,
    );
  }

  return Math.max(requestedTolerance, knownGapMaxDelta);
}

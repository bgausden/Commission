import { describe, expect, it } from "vitest";
import type { BaselineMetadata } from "../../src/regression.types.js";
import { getEffectiveRegressionTolerance } from "./regressionTolerance.js";

function buildMetadata(
  knownRoundingGaps?: BaselineMetadata["knownRoundingGaps"],
): BaselineMetadata {
  return {
    baselineName: "2025-12",
    commitSHA: "abc123",
    createdDate: "2026-01-01T11:00:30.000Z",
    sourceFile: "Payroll Report 12-1-2025 - 12-31-2025.xlsx",
    sourceFileChecksum: "sha256:test",
    payrollMonth: 12,
    payrollYear: 2025,
    configChecksums: {
      staffHurdle: "sha256:staff",
      default: "sha256:default",
    },
    staffCount: 1,
    staffIds: ["001"],
    knownRoundingGaps,
  };
}

describe("getEffectiveRegressionTolerance", () => {
  it("uses baseline-known rounding gap tolerance when it is higher", () => {
    const metadata = buildMetadata({
      staffIds: ["007", "019", "024", "026"],
      maxDelta: 0.2,
      note: "Known baseline rounding gaps.",
    });

    expect(getEffectiveRegressionTolerance(0.01, metadata)).toBe(0.2);
  });

  it("preserves a higher requested tolerance", () => {
    const metadata = buildMetadata({
      staffIds: ["007"],
      maxDelta: 0.2,
    });

    expect(getEffectiveRegressionTolerance(0.25, metadata)).toBe(0.25);
  });

  it("rejects invalid baseline-known rounding gap tolerance", () => {
    const metadata = buildMetadata({
      staffIds: ["007"],
      maxDelta: Number.NaN,
    });

    expect(() => getEffectiveRegressionTolerance(0.01, metadata)).toThrow(
      /invalid knownRoundingGaps\.maxDelta/i,
    );
  });
});

import { describe, expect, it } from "vitest";
import type {
  BaselineMetadata,
  ToleranceOverride,
} from "../../src/regression.types.js";
import { getBaselineToleranceOverrides } from "./regressionTolerance.js";

function buildMetadata(
  knownToleranceExceptions?: ToleranceOverride[],
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
    knownToleranceExceptions,
  };
}

describe("getBaselineToleranceOverrides", () => {
  it("returns explicit baseline tolerance exceptions", () => {
    const metadata = buildMetadata([
      {
        kind: "commission",
        staffId: "024",
        fields: ["generalServiceCommission", "totalPayable"],
        tolerance: 0.2,
      },
    ]);

    expect(getBaselineToleranceOverrides(metadata)).toEqual([
      {
        kind: "commission",
        staffId: "024",
        fields: ["generalServiceCommission", "totalPayable"],
        tolerance: 0.2,
      },
    ]);
  });

  it("returns an empty list when no baseline tolerance exceptions are defined", () => {
    const metadata = buildMetadata();

    expect(getBaselineToleranceOverrides(metadata)).toEqual([]);
  });

  it("rejects invalid baseline tolerance exception values", () => {
    const metadata = buildMetadata([
      {
        kind: "commission",
        staffId: "007",
        fields: ["generalServiceCommission"],
        tolerance: Number.NaN,
      },
    ]);

    expect(() => getBaselineToleranceOverrides(metadata)).toThrow(
      /invalid tolerance exception value/i,
    );
  });

  it("rejects tolerance exceptions without fields", () => {
    const metadata = buildMetadata([
      {
        kind: "commission",
        staffId: "007",
        fields: [],
        tolerance: 0.05,
      },
    ]);

    expect(() => getBaselineToleranceOverrides(metadata)).toThrow(
      /invalid tolerance exception fields/i,
    );
  });
});

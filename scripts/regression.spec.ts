/**
 * End-to-end regression replay test.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import type { BaselineMetadata } from "../src/regression.types.js";
import { parsePaymentsExcel } from "./parsers/parsePaymentsExcel.js";
import { parseCommissionLog } from "./parsers/parseCommissionLog.js";
import {
  compareCommissionData,
  compareStaffPayments,
  generateDiffReport,
} from "./comparison/compareBaseline.js";
import { findOldestBaseline } from "./utils/baselineUtils.js";
import { fileExists, readJSON } from "../src/fileUtils.js";
import {
  createRegressionSandbox,
  discoverRegressionOutputs,
  prepareBaselineInputsInSandbox,
  runCommissionInSandbox,
} from "./utils/regressionRunner.js";
import { getBaselineToleranceOverrides } from "./utils/regressionTolerance.js";

dotenv.config();

const DEFAULT_TOLERANCE = 0.01;

function parseRegressionTolerance(value: string | undefined): number {
  if (!value || value.trim().length === 0) {
    return DEFAULT_TOLERANCE;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `Invalid REGRESSION_TOLERANCE value: "${value}". Expected a non-negative number.`,
    );
  }

  return parsed;
}

type LoadedBaseline = {
  name: string;
  dir: string;
  metadata: BaselineMetadata;
};

function filterOutContractorsFromCommission(
  commissionRows: Awaited<ReturnType<typeof parseCommissionLog>>,
  contractorRows: Awaited<ReturnType<typeof parseCommissionLog>>,
) {
  const contractorIds = new Set(contractorRows.map((row) => row.staffId));
  return commissionRows.filter((row) => !contractorIds.has(row.staffId));
}

function filterOutContractorsFromPayments(
  paymentRows: Awaited<ReturnType<typeof parsePaymentsExcel>>,
  contractorRows: Awaited<ReturnType<typeof parseCommissionLog>>,
) {
  const contractorIds = new Set(contractorRows.map((row) => row.staffId));
  return paymentRows.filter((row) => !contractorIds.has(row.staffId));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");
const BASELINES_ROOT = join(PROJECT_ROOT, "test-baselines");

let baseline: LoadedBaseline;
const requestedRegressionTolerance = parseRegressionTolerance(
  process.env.REGRESSION_TOLERANCE,
);

describe("Regression: fixed input must produce identical outputs to baseline", () => {
  beforeAll(async () => {
    const baselineName = process.env.BASELINE_NAME;
    if (baselineName && baselineName.trim().length > 0) {
      const dir = join(BASELINES_ROOT, baselineName);
      const metadataPath = join(dir, "metadata.json");

      if (!(await fileExists(metadataPath))) {
        throw new Error(
          `Baseline "${baselineName}" exists but has no metadata.json`,
        );
      }

      baseline = {
        name: baselineName,
        dir,
        metadata: await readJSON<BaselineMetadata>(metadataPath),
      };
      return;
    }

    const oldest = await findOldestBaseline(BASELINES_ROOT);
    if (!oldest.ok) {
      throw new Error(oldest.error);
    }

    const dir = join(BASELINES_ROOT, oldest.value);
    const metadataPath = join(dir, "metadata.json");
    if (!(await fileExists(metadataPath))) {
      throw new Error(
        `Baseline "${oldest.value}" exists but has no metadata.json`,
      );
    }

    baseline = {
      name: oldest.value,
      dir,
      metadata: await readJSON<BaselineMetadata>(metadataPath),
    };
  });

  it("replays baseline source with current branch code and matches baseline outputs", async () => {
    expect(baseline).toBeDefined();
    expect(baseline.metadata.baselineName).toBe(baseline.name);
    const toleranceOverrides = getBaselineToleranceOverrides(baseline.metadata);

    const baselineSourceFile = join(
      baseline.dir,
      "source",
      baseline.metadata.sourceFile,
    );
    const baselineDefaultConfig = join(baseline.dir, "config", "default.json");
    const baselineStaffHurdles = join(
      baseline.dir,
      "config",
      "staffHurdle.json",
    );
    const baselineOutputsDir = join(baseline.dir, "outputs");

    expect(await fileExists(baselineSourceFile)).toBe(true);
    expect(await fileExists(baselineDefaultConfig)).toBe(true);
    expect(await fileExists(baselineStaffHurdles)).toBe(true);
    expect(await fileExists(baselineOutputsDir)).toBe(true);

    const baselineOutputFiles =
      await discoverRegressionOutputs(baselineOutputsDir);
    const baselinePayments = await parsePaymentsExcel(
      join(baselineOutputsDir, baselineOutputFiles.paymentsFile),
    );
    const baselineCommission = await parseCommissionLog(
      join(baselineOutputsDir, baselineOutputFiles.commissionLogFile),
    );
    const baselineContractor = await parseCommissionLog(
      join(baselineOutputsDir, baselineOutputFiles.contractorLogFile),
    );

    const sandbox = await createRegressionSandbox();
    let runOutputFiles;
    let currentPayments;
    let currentCommission;
    let currentContractor;
    try {
      await prepareBaselineInputsInSandbox(
        sandbox,
        baseline.dir,
        baseline.metadata.sourceFile,
      );
      await runCommissionInSandbox(sandbox, PROJECT_ROOT);
      runOutputFiles = await discoverRegressionOutputs(sandbox.outputsDir);
      currentPayments = await parsePaymentsExcel(
        join(sandbox.outputsDir, runOutputFiles.paymentsFile),
      );
      currentCommission = await parseCommissionLog(
        join(sandbox.outputsDir, runOutputFiles.commissionLogFile),
      );
      currentContractor = await parseCommissionLog(
        join(sandbox.outputsDir, runOutputFiles.contractorLogFile),
      );
    } finally {
      await sandbox.cleanup();
    }

    expect(currentPayments).toBeDefined();
    expect(currentCommission).toBeDefined();
    expect(currentContractor).toBeDefined();

    const baselineCommissionNonContractor = filterOutContractorsFromCommission(
      baselineCommission,
      baselineContractor,
    );
    const currentCommissionNonContractor = filterOutContractorsFromCommission(
      currentCommission!,
      currentContractor!,
    );
    const baselinePaymentsNonContractor = filterOutContractorsFromPayments(
      baselinePayments,
      baselineContractor,
    );
    const currentPaymentsNonContractor = filterOutContractorsFromPayments(
      currentPayments!,
      currentContractor!,
    );

    const paymentsDiff = compareStaffPayments(
      baselinePaymentsNonContractor,
      currentPaymentsNonContractor,
      {
        tolerance: requestedRegressionTolerance,
        kind: "payments",
        toleranceOverrides,
      },
    );
    const commissionDiff = compareCommissionData(
      baselineCommissionNonContractor,
      currentCommissionNonContractor,
      {
        tolerance: requestedRegressionTolerance,
        kind: "commission",
        toleranceOverrides,
      },
    );
    const contractorDiff = compareCommissionData(
      baselineContractor,
      currentContractor!,
      {
        tolerance: requestedRegressionTolerance,
        kind: "contractor",
        toleranceOverrides,
      },
    );

    const paymentsReport = generateDiffReport(
      paymentsDiff,
      baseline.name,
      baseline.metadata.sourceFile,
    );
    const commissionReport = generateDiffReport(
      commissionDiff,
      baseline.name,
      baseline.metadata.sourceFile,
    );
    const contractorReport = generateDiffReport(
      contractorDiff,
      baseline.name,
      baseline.metadata.sourceFile,
    );

    const paymentPassed =
      paymentsDiff.modified.length === 0 &&
      paymentsDiff.added.length === 0 &&
      paymentsDiff.removed.length === 0;

    const commissionPassed =
      commissionDiff.modified.length === 0 &&
      commissionDiff.added.length === 0 &&
      commissionDiff.removed.length === 0;

    const contractorPassed =
      contractorDiff.modified.length === 0 &&
      contractorDiff.added.length === 0 &&
      contractorDiff.removed.length === 0;

    if (!paymentPassed) {
      console.error(`\nPAYMENTS REGRESSION FAILED\n${paymentsReport}`);
    }
    if (!commissionPassed) {
      console.error(`\nCOMMISSION REGRESSION FAILED\n${commissionReport}`);
    }
    if (!contractorPassed) {
      console.error(`\nCONTRACTOR REGRESSION FAILED\n${contractorReport}`);
    }

    expect(currentPayments!.length).toBeGreaterThan(0);
    expect(currentCommission!.length).toBeGreaterThan(0);
    expect(currentContractor!.length).toBeGreaterThan(0);

    if (!paymentPassed || !commissionPassed || !contractorPassed) {
      const failureSummary: string[] = [];

      if (!paymentPassed) {
        failureSummary.push(
          [
            "Payments regression mismatch:",
            `- Modified staff: ${paymentsDiff.modified.length}`,
            `- Added staff: ${paymentsDiff.added.length}`,
            `- Removed staff: ${paymentsDiff.removed.length}`,
          ].join("\n"),
        );
      }

      if (!commissionPassed) {
        failureSummary.push(
          [
            "Commission regression mismatch:",
            `- Baseline commission blocks (non-contractor): ${baselineCommissionNonContractor.length}`,
            `- Current commission blocks (non-contractor): ${currentCommissionNonContractor.length}`,
            `- Modified staff: ${commissionDiff.modified.length}`,
            `- Added staff: ${commissionDiff.added.length}`,
            `- Removed staff: ${commissionDiff.removed.length}`,
          ].join("\n"),
        );
      }

      if (!contractorPassed) {
        const contractorCountHint =
          baselineContractor.length !== currentContractor!.length
            ? "- Hint: Contractor block count differs. The baseline contractor log may be incomplete or from a different run; use the contractor log generated from the same successful payroll run as the commission log."
            : "- Hint: Contractor block counts match, but values differ. Verify that the baseline contractor log and baseline source/config snapshots come from the same run.";

        failureSummary.push(
          [
            "Contractor regression mismatch:",
            `- Baseline contractor blocks: ${baselineContractor.length}`,
            `- Current contractor blocks: ${currentContractor!.length}`,
            `- Modified staff: ${contractorDiff.modified.length}`,
            `- Added staff: ${contractorDiff.added.length}`,
            `- Removed staff: ${contractorDiff.removed.length}`,
            contractorCountHint,
          ].join("\n"),
        );
      }

      throw new Error(
        `Regression output mismatch for baseline ${baseline.name}\n\n${failureSummary.join("\n\n")}`,
      );
    }
  }, 30000);
});

import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildRegressionConfig,
  discoverRegressionOutputs,
  selectSingleOutputFile,
} from "./regressionRunner.js";

describe("regressionRunner helpers", () => {
  it("forces safe config for regression replay", () => {
    const baselineDefault = JSON.stringify({
      PAYROLL_WB_FILENAME: "old-file.xlsx",
      updateTalenox: true,
      uploadToGDrive: true,
      missingStaffAreFatal: true,
    });

    const result = buildRegressionConfig(
      baselineDefault,
      "baseline-input.xlsx",
    );
    const parsed = JSON.parse(result) as {
      PAYROLL_WB_FILENAME: string;
      updateTalenox: boolean;
      uploadToGDrive: boolean;
      missingStaffAreFatal: boolean;
    };

    expect(parsed.PAYROLL_WB_FILENAME).toBe("baseline-input.xlsx");
    expect(parsed.updateTalenox).toBe(false);
    expect(parsed.uploadToGDrive).toBe(false);
    expect(parsed.missingStaffAreFatal).toBe(true);
  });

  it("overrides unsafe baseline flags to prevent external uploads", () => {
    const baselineDefault = JSON.stringify({
      PAYROLL_WB_FILENAME: "unsafe-input.xlsx",
      updateTalenox: true,
      uploadToGDrive: true,
    });

    const result = buildRegressionConfig(baselineDefault, "safe-input.xlsx");
    const parsed = JSON.parse(result) as {
      PAYROLL_WB_FILENAME: string;
      updateTalenox: boolean;
      uploadToGDrive: boolean;
    };

    expect(parsed.PAYROLL_WB_FILENAME).toBe("safe-input.xlsx");
    expect(parsed.updateTalenox).toBe(false);
    expect(parsed.uploadToGDrive).toBe(false);
  });

  it("selects exactly one output file", () => {
    const file = selectSingleOutputFile(
      ["foo.log", "Talenox Payments 202603.xlsx", "bar.txt"],
      /^Talenox Payments.*\.xlsx$/,
      "payments Excel",
    );

    expect(file).toBe("Talenox Payments 202603.xlsx");
  });

  it("throws when no files match", () => {
    expect(() =>
      selectSingleOutputFile(
        ["foo.log", "bar.txt"],
        /^commission-.*\.log$/,
        "commission log",
      ),
    ).toThrow(/found none/i);
  });

  it("throws when multiple files match", () => {
    expect(() =>
      selectSingleOutputFile(
        ["commission-a.log", "commission-b.log"],
        /^commission-.*\.log$/,
        "commission log",
      ),
    ).toThrow(/found 2/i);
  });

  it("waits briefly for delayed commission and contractor log files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "regression-runner-test-"));

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "Talenox Payments delayed.xlsx"), "x");

      setTimeout(() => {
        void writeFile(join(dir, "commission-20260405T000000.log"), "ok");
        void writeFile(join(dir, "contractor-20260405T000000.log"), "ok");
      }, 150);

      const outputs = await discoverRegressionOutputs(dir);
      expect(outputs.paymentsFile).toBe("Talenox Payments delayed.xlsx");
      expect(outputs.commissionLogFile).toBe("commission-20260405T000000.log");
      expect(outputs.contractorLogFile).toBe("contractor-20260405T000000.log");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

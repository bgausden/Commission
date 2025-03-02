import { describe, it, expect } from "vitest";
import { parseFilename } from "./parseFilename.js";

describe("parseFilename", () => {
  it("should correctly parse the filename and derive the variable values", () => {
    const filename = "Payroll Report 12-1-2024 - 12-31-2024.xlsx";
    const parsedValues = parseFilename(filename);

    expect(parsedValues).toEqual({
      PAYROLL_MONTH: "December",
      PAYROLL_YEAR: "2024",
      PAYMENTS_WB_NAME: "Talenox Payments 202412.xlsx",
      PAYMENTS_WS_NAME: "Payments December 2024",
    });
  });

  it("should throw an error for incorrect filename format", () => {
    const filename = "Incorrect Filename Format.xlsx";

    expect(() => parseFilename(filename)).toThrow(
      "Filename format is incorrect",
    );
  });

  it("should correctly parse another valid filename", () => {
    const filename = "Payroll Report 01-1-2023 - 01-31-2023.xlsx";
    const parsedValues = parseFilename(filename);

    expect(parsedValues).toEqual({
      PAYROLL_MONTH: "January",
      PAYROLL_YEAR: "2023",
      PAYMENTS_WB_NAME: "Talenox Payments 202301.xlsx",
      PAYMENTS_WS_NAME: "Payments January 2023",
    });
  });
});

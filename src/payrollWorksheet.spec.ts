import { describe, expect, it } from "vitest";
import type { StaffHurdle } from "./IStaffHurdle.js";
import { Option } from "./option.js";
import {
  extractStaffPayrollData,
  getStaffIDAndName,
  revenueCol,
} from "./payrollWorksheet.js";
import type { StaffHurdleGetter } from "./utility_functions.js";

function createGetter(staffHurdle: StaffHurdle): StaffHurdleGetter {
  return () => Option.some(staffHurdle);
}

describe("payrollWorksheet", () => {
  it("finds the revenue column even when the header appears after intro rows", () => {
    const rows: unknown[][] = [
      ["Mindbody report"],
      ["Generated at", "2025-03-01"],
      ["Staff", "Service", "Rev. per Session", "Other"],
    ];

    expect(revenueCol(rows)).toBe(2);
  });

  it("throws a clear error when the revenue column is absent", () => {
    expect(() => revenueCol([["Staff", "Service", "Price"]])).toThrow(
      "Cannot find Revenue per session column",
    );
  });

  it("parses a staff header row into staff info", () => {
    const staffInfo = getStaffIDAndName([["Doe, Jane Staff ID #: 123"]], 0);

    expect(staffInfo).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      staffID: "123",
    });
  });

  it("throws when a staff header is present but the staff ID is blank", () => {
    expect(() => getStaffIDAndName([["Doe, Jane Staff ID #:   "]], 0)).toThrow(
      " Jane  Doe does not appear to have a Staff ID in MB",
    );
  });

  it("extracts tips and product commission from currency-formatted cells", () => {
    const getStaffHurdleForContext = createGetter({
      staffName: "Jane Doe",
      baseRate: 0.1,
      contractor: false,
      payViaTalenox: true,
    });
    const payrollData = extractStaffPayrollData(
      [
        ["Doe, Jane Staff ID #: 123"],
        ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
        ["Ladies Cut", "", "", "", "", 500],
        ["Tips:", "", "", "", "", "", "HK$ 12.50"],
        ["Sales Commission:", "", "", "", "", "", "$7.25"],
        ["Total for Doe, Jane", "", "", "", "", 500],
      ],
      0,
      5,
      5,
      "123",
      getStaffHurdleForContext,
    );

    expect(payrollData.tips).toBe(12.5);
    expect(payrollData.productCommission).toBe(7.25);
    expect(payrollData.servicesRevenues.get("General Services")).toEqual({
      serviceRevenue: 500,
      customRate: NaN,
    });
  });
});

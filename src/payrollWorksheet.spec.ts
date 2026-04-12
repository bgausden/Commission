import { describe, expect, it } from "vitest";
import type { StaffHurdle } from "./IStaffHurdle.js";
import { Option } from "./option.js";
import {
  extractStaffPayrollData,
  getServiceRevenues,
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

  it("extracts numeric tips and product commission when not currency-formatted", () => {
    const getStaffHurdleForContext = createGetter({
      staffName: "Rex Wong",
      baseRate: 0,
      hurdle1Level: 20000,
      hurdle1Rate: 0.1,
      contractor: false,
      payViaTalenox: true,
    });
    const rows: unknown[][] = [
      ["Wong, Rex Staff ID #: 019"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 2500],
      ["Product Pay Rate: Shampoo (10%)", "", "", "", "", 0],
      ["Shampoo", "", "", "", "", 100],
      ["Tips:", "", "", "", "", 150],
      ["Sales Commission:", "", "", "", "", 50],
      ["Total for Wong, Rex", "", "", "", "", 2600],
    ];
    const result = extractStaffPayrollData(rows, 0, 7, 5, "019", getStaffHurdleForContext);
    expect(result.staffID).toBe("019");
    expect(result.tips).toBe(150);
    expect(result.productCommission).toBe(50);
  });

  it("returns zero tips when the Tips row is absent", () => {
    const getStaffHurdleForContext = createGetter({
      staffName: "Rex Wong",
      baseRate: 0,
      hurdle1Level: 20000,
      hurdle1Rate: 0.1,
      contractor: false,
      payViaTalenox: true,
    });
    const rows: unknown[][] = [
      ["Wong, Rex Staff ID #: 019"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 1800],
      ["Sales Commission:", "", "", "", "", 30],
      ["Total for Wong, Rex", "", "", "", "", 1800],
    ];
    const result = extractStaffPayrollData(rows, 0, 4, 5, "019", getStaffHurdleForContext);
    expect(result.tips).toBe(0);
    expect(result.productCommission).toBe(30);
  });

  it("returns zero product commission when the Sales Commission row is absent", () => {
    const getStaffHurdleForContext = createGetter({
      staffName: "Kate",
      baseRate: 0,
      hurdle1Level: 30000,
      hurdle1Rate: 0.11,
      contractor: false,
      payViaTalenox: true,
    });
    const rows: unknown[][] = [
      ["Kate Staff ID #: 012"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Tips:", "", "", "", "", 200],
      ["Total for Kate", "", "", "", "", 3000],
    ];
    const result = extractStaffPayrollData(rows, 0, 3, 5, "012", getStaffHurdleForContext);
    expect(result.tips).toBe(200);
    expect(result.productCommission).toBe(0);
  });

  it("treats undefined and empty-string tip/commission cells as zero", () => {
    const getStaffHurdleForContext = createGetter({
      staffName: "Default",
      baseRate: 0,
      hurdle1Level: 20000,
      hurdle1Rate: 0.1,
      contractor: false,
      payViaTalenox: true,
    });
    const rows: unknown[][] = [
      ["Staff, Test Staff ID #: 001"],
      ["Hair Pay Rate: Cut (55%)", "", "", "", "", 0],
      ["Total for Test", "", "", "", "", 0],
      ["Tips:", "", "", "", "", undefined],
      ["Sales Commission:", "", "", "", "", ""],
    ];
    const result = extractStaffPayrollData(rows, 0, 2, 5, "001", getStaffHurdleForContext);
    expect(result.tips).toBe(0);
    expect(result.productCommission).toBe(0);
  });

  it("only reads tips and commission within the 4-row window above the Total row", () => {
    const getStaffHurdleForContext = createGetter({
      staffName: "Kate",
      baseRate: 0,
      hurdle1Level: 30000,
      hurdle1Rate: 0.11,
      contractor: false,
      payViaTalenox: true,
    });
    const rows: unknown[][] = [
      ["Kate, Staff ID #: 012"],
      ["Services..."],
      ["Total for Kate", "", "", "", "", 5000],  // endRow = 2
      ["Row index 3: Tips here", "", "", "", "", 100],
      ["Row index 4", "", "", "", "", 0],
      ["Row index 5: Sales Commission", "", "", "", "", 25],
      ["Row index 6", "", "", "", "", 0],
      ["Row index 7: Too far", "", "", "", "", 999],
    ];
    // endRow=2: search window covers indices endRow-3..endRow = -1, 0, 1, 2
    // Tips at index 3 and Sales Commission at index 5 are outside the window
    const result = extractStaffPayrollData(rows, 0, 2, 5, "012", getStaffHurdleForContext);
    expect(result.tips).toBe(0);
    expect(result.productCommission).toBe(0);
  });
});

describe("getServiceRevenues", () => {
  const revCol = 5;

  const kateHurdle: StaffHurdle = {
    staffName: "Kate",
    baseRate: 0,
    hurdle1Level: 30000,
    hurdle1Rate: 0.11,
    contractor: false,
    payViaTalenox: true,
    customPayRates: [{ Extensions: 0.15 }],
  };
  const kateGetter: StaffHurdleGetter = (_staffID, _context) => Option.some(kateHurdle);

  const plainHurdle: StaffHurdle = {
    staffName: "Default",
    baseRate: 0,
    hurdle1Level: 20000,
    hurdle1Rate: 0.1,
    contractor: false,
    payViaTalenox: true,
  };
  const plainGetter: StaffHurdleGetter = (_staffID, _context) => Option.some(plainHurdle);

  it("extracts general service revenue from a simple block", () => {
    const rows: unknown[][] = [
      ["Kate, Staff ID #: 012"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 2500],
      ["Blow Dry", "", "", "", "", 1000],
      ["Total for Kate", "", "", "", "", 3500],
    ];
    const result = getServiceRevenues(rows, 4, 0, revCol, "012", kateGetter);
    expect(result.has("General Services")).toBe(true);
    expect(result.get("General Services")?.serviceRevenue).toBe(3500);
    expect(result.get("General Services")?.customRate).toBeNaN();
  });

  it("detects a custom rate service and applies the configured rate", () => {
    const rows: unknown[][] = [
      ["Kate, Staff ID #: 012"],
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0],
      ["Extensions - Application", "", "", "", "", 5000],
      ["Extensions - Removal", "", "", "", "", 2000],
      ["Total for Kate", "", "", "", "", 7000],
    ];
    const result = getServiceRevenues(rows, 4, 0, revCol, "012", kateGetter);
    expect(result.has("Extensions")).toBe(true);
    expect(result.get("Extensions")?.serviceRevenue).toBe(7000);
    expect(result.get("Extensions")?.customRate).toBe(0.15);
  });

  it("handles mixed general and custom rate services in one block", () => {
    const rows: unknown[][] = [
      ["Kate, Staff ID #: 012"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 3000],
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0],
      ["Extensions", "", "", "", "", 8000],
      ["Hair Pay Rate: Color (50%)", "", "", "", "", 0],
      ["Color Treatment", "", "", "", "", 2000],
      ["Total for Kate", "", "", "", "", 13000],
    ];
    const result = getServiceRevenues(rows, 7, 0, revCol, "012", kateGetter);
    // Color is not in customPayRates so it rolls into General Services
    expect(result.size).toBe(2);
    expect(result.get("General Services")?.serviceRevenue).toBe(5000); // 3000 + 2000
    expect(result.get("Extensions")?.serviceRevenue).toBe(8000);
    expect(result.get("Extensions")?.customRate).toBe(0.15);
  });

  it("accumulates multiple revenue rows under the same service", () => {
    const rows: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Cut 1", "", "", "", "", 1000],
      ["Cut 2", "", "", "", "", 1500],
      ["Cut 3", "", "", "", "", 800],
      ["Cut 4", "", "", "", "", 1200],
      ["Total for Staff", "", "", "", "", 4500],
    ];
    const result = getServiceRevenues(rows, 6, 0, revCol, "001", plainGetter);
    expect(result.get("General Services")?.serviceRevenue).toBe(4500);
  });

  it("returns an empty entry (no positive revenue) for a zero-revenue block", () => {
    const rows: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Service with no revenue", "", "", "", "", 0],
      ["Total for Staff", "", "", "", "", 0],
    ];
    const result = getServiceRevenues(rows, 3, 0, revCol, "001", plainGetter);
    const gen = result.get("General Services");
    expect(gen?.serviceRevenue ?? 0).toBe(0);
  });

  it("skips undefined revenue cells and counts only valid positive values", () => {
    const rows: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Service 1", "", "", "", "", undefined],
      ["Service 2", "", "", "", "", 2000],
      ["Total for Staff", "", "", "", "", 2000],
    ];
    const result = getServiceRevenues(rows, 4, 0, revCol, "001", plainGetter);
    expect(result.get("General Services")?.serviceRevenue).toBe(2000);
  });

  it("treats a malformed Pay Rate header as a continuation of the previous service", () => {
    const rows: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Service 1", "", "", "", "", 1000],
      ["Invalid Header Format", "", "", "", "", 0],
      ["Service 2", "", "", "", "", 2000],
      ["Total for Staff", "", "", "", "", 3000],
    ];
    const result = getServiceRevenues(rows, 5, 0, revCol, "001", plainGetter);
    expect(result.get("General Services")?.serviceRevenue).toBe(3000);
  });

  it("switches revenue context on each new Pay Rate header", () => {
    const rows: unknown[][] = [
      ["Kate, Staff ID #: 012"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Cut", "", "", "", "", 1000],
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0],
      ["Extensions", "", "", "", "", 5000],
      ["Hair Pay Rate: Color (50%)", "", "", "", "", 0],
      ["Color", "", "", "", "", 1500],
      ["Total for Kate", "", "", "", "", 7500],
    ];
    const result = getServiceRevenues(rows, 7, 0, revCol, "012", kateGetter);
    expect(result.size).toBe(2);
    expect(result.get("General Services")?.serviceRevenue).toBe(2500); // 1000 + 1500
    expect(result.get("Extensions")?.serviceRevenue).toBe(5000);
  });

  it("ignores empty rows between service rows", () => {
    const rows: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["", "", "", "", "", ""],
      ["Cut", "", "", "", "", 1000],
      ["", "", "", "", "", ""],
      ["Total for Staff", "", "", "", "", 1000],
    ];
    const result = getServiceRevenues(rows, 5, 0, revCol, "001", plainGetter);
    expect(result.get("General Services")?.serviceRevenue).toBe(1000);
  });

  it("accumulates revenue from multiple Extensions rows into one entry", () => {
    const rows: unknown[][] = [
      ["Kate, Staff ID #: 012"],
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0],
      ["Extensions - Full Set", "", "", "", "", 10000],
      ["Extensions - Maintenance", "", "", "", "", 3000],
      ["Extensions - Removal", "", "", "", "", 1000],
      ["Total for Kate", "", "", "", "", 14000],
    ];
    const result = getServiceRevenues(rows, 5, 0, revCol, "012", kateGetter);
    expect(result.size).toBe(1);
    expect(result.get("Extensions")?.serviceRevenue).toBe(14000);
    expect(result.get("Extensions")?.customRate).toBe(0.15);
  });

  it("includes Pay Rate header row revenue when the cell value is positive", () => {
    const rows: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 500],
      ["Actual Service", "", "", "", "", 2000],
      ["Total for Staff", "", "", "", "", 2500],
    ];
    const result = getServiceRevenues(rows, 3, 0, revCol, "001", plainGetter);
    expect(result.get("General Services")?.serviceRevenue).toBe(2500);
  });
});

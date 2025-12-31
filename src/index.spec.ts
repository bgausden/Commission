import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  HurdleConfig,
  HurdleBreakdown,
  StaffPayrollData,
  TTalenoxInfoStaffMap,
  TServRevenueMap,
} from "./types.js";
import { StaffHurdle } from "./IStaffHurdle.js";

// Mock dependencies
vi.mock("./logging_functions.js", () => ({
  errorLogger: { error: vi.fn() },
  warnLogger: { warn: vi.fn() },
  debugLogger: { debug: vi.fn() },
  infoLogger: { info: vi.fn() },
  commissionLogger: { info: vi.fn() },
  contractorLogger: { info: vi.fn() },
  shutdownLogging: vi.fn(),
  initLogs: vi.fn(),
}));

vi.mock("./utility_functions.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./utility_functions.js")>();
  return {
    ...actual,
    getValidatedStaffHurdle: vi.fn((staffID: string) => {
      if (staffID === "012") {
        return {
          staffName: "Kate",
          baseRate: 0,
          hurdle1Level: 30000,
          hurdle1Rate: 0.11,
          hurdle2Level: 50000,
          hurdle2Rate: 0.15,
          contractor: false,
          payViaTalenox: true,
          customPayRates: [{ Extensions: 0.15 }],
        };
      }
      if (staffID === "050") {
        return {
          staffName: "Test WithCharge",
          baseRate: 0,
          hurdle1Level: 20000,
          hurdle1Rate: 0.1,
          contractor: false,
          payViaTalenox: true,
          tipsCCCharge: 0.03, // 3% tips charge
        };
      }
      if (staffID === "051") {
        return {
          staffName: "Zero Charge",
          baseRate: 0,
          hurdle1Level: 20000,
          hurdle1Rate: 0.1,
          contractor: false,
          payViaTalenox: true,
          tipsCCCharge: 0, // Explicit 0% charge
        };
      }
      return {
        staffName: "Default",
        baseRate: 0,
        hurdle1Level: 20000,
        hurdle1Rate: 0.1,
        contractor: false,
        payViaTalenox: true,
      };
    }),
  };
});

// Import functions to test - must be after mocks
import {
  calculateTieredCommission,
  extractStaffPayrollData,
  calculateStaffCommission,
  getServiceRevenues,
} from "./index.js";

describe("calculateTieredCommission", () => {
  describe("Basic Hurdle Scenarios", () => {
    it("should pay all revenue at base rate when no hurdles configured", () => {
      const config: HurdleConfig = {
        baseRate: 0.08,
        hurdle1Level: 0, // No hurdles
        hurdle1Rate: 0,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(50000, config);

      expect(result.baseRevenue).toBe(50000);
      expect(result.baseCommission).toBe(4000); // 50000 * 0.08
      expect(result.hurdle1Revenue).toBe(0);
      expect(result.hurdle2Revenue).toBe(0);
      expect(result.hurdle3Revenue).toBe(0);
      expect(result.totalCommission).toBe(4000);
    });

    it("should return zero commission when revenue below first hurdle", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(25000, config);

      expect(result.baseRevenue).toBe(0);
      expect(result.baseCommission).toBe(0);
      expect(result.hurdle1Revenue).toBe(0);
      expect(result.hurdle1Commission).toBe(0);
      expect(result.totalCommission).toBe(0);
    });

    it("should return zero commission when revenue exactly at first hurdle", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(30000, config);

      expect(result.hurdle1Revenue).toBe(0);
      expect(result.hurdle1Commission).toBe(0);
      expect(result.totalCommission).toBe(0);
    });

    it("should calculate commission for revenue between hurdle1 and hurdle2", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 50000,
        hurdle2Rate: 0.15,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(40000, config);

      expect(result.baseRevenue).toBe(0);
      expect(result.hurdle1Revenue).toBe(10000); // 40000 - 30000
      expect(result.hurdle1Commission).toBe(1100); // 10000 * 0.11
      expect(result.hurdle2Revenue).toBe(0);
      expect(result.hurdle2Commission).toBe(0);
      expect(result.totalCommission).toBe(1100);
    });
  });

  describe("Advanced Hurdle Scenarios", () => {
    it("should calculate commission for revenue between hurdle2 and hurdle3", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 50000,
        hurdle2Rate: 0.15,
        hurdle3Level: 80000,
        hurdle3Rate: 0.2,
      };

      const result = calculateTieredCommission(65000, config);

      expect(result.baseRevenue).toBe(0);
      expect(result.hurdle1Revenue).toBe(20000); // 50000 - 30000
      expect(result.hurdle1Commission).toBe(2200); // 20000 * 0.11
      expect(result.hurdle2Revenue).toBe(15000); // 65000 - 50000
      expect(result.hurdle2Commission).toBe(2250); // 15000 * 0.15
      expect(result.hurdle3Revenue).toBe(0);
      expect(result.totalCommission).toBe(4450); // 2200 + 2250
    });

    it("should calculate commission for revenue exceeding hurdle3", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 50000,
        hurdle2Rate: 0.15,
        hurdle3Level: 80000,
        hurdle3Rate: 0.2,
      };

      const result = calculateTieredCommission(100000, config);

      expect(result.baseRevenue).toBe(0);
      expect(result.hurdle1Revenue).toBe(20000); // 50000 - 30000
      expect(result.hurdle1Commission).toBe(2200); // 20000 * 0.11
      expect(result.hurdle2Revenue).toBe(30000); // 80000 - 50000
      expect(result.hurdle2Commission).toBe(4500); // 30000 * 0.15
      expect(result.hurdle3Revenue).toBe(20000); // 100000 - 80000
      expect(result.hurdle3Commission).toBe(4000); // 20000 * 0.20
      expect(result.totalCommission).toBe(10700); // 2200 + 4500 + 4000
    });

    it("should handle only hurdle1 configured (no hurdle2 or hurdle3)", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(50000, config);

      expect(result.hurdle1Revenue).toBe(20000); // 50000 - 30000
      expect(result.hurdle1Commission).toBe(2200); // 20000 * 0.11
      expect(result.hurdle2Revenue).toBe(0);
      expect(result.hurdle3Revenue).toBe(0);
      expect(result.totalCommission).toBe(2200);
    });
  });

  describe("Rounding and Precision", () => {
    it("should round fractional revenue amounts to 2 decimal places", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(33333.33, config);

      expect(result.hurdle1Revenue).toBe(3333.33); // 33333.33 - 30000
      expect(result.hurdle1Commission).toBe(366.67); // 3333.33 * 0.11 rounded
      expect(result.totalCommission).toBe(366.67);
    });

    it("should handle very small commission amounts correctly", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(30000.01, config);

      expect(result.hurdle1Revenue).toBe(0.01);
      expect(result.hurdle1Commission).toBe(0); // 0.01 * 0.11 = 0.0011 rounds to 0.00
      expect(result.totalCommission).toBe(0);
    });

    it("should handle large revenue amounts without precision issues", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 100000,
        hurdle1Rate: 0.1,
        hurdle2Level: 300000,
        hurdle2Rate: 0.12,
        hurdle3Level: 500000,
        hurdle3Rate: 0.15,
      };

      const result = calculateTieredCommission(1000000, config);

      expect(result.hurdle1Revenue).toBe(200000); // 300000 - 100000
      expect(result.hurdle1Commission).toBe(20000); // 200000 * 0.10
      expect(result.hurdle2Revenue).toBe(200000); // 500000 - 300000
      expect(result.hurdle2Commission).toBe(24000); // 200000 * 0.12
      expect(result.hurdle3Revenue).toBe(500000); // 1000000 - 500000
      expect(result.hurdle3Commission).toBe(75000); // 500000 * 0.15
      expect(result.totalCommission).toBe(119000); // 20000 + 24000 + 75000
    });
  });

  describe("Edge Cases", () => {
    it("should return zero commission for zero revenue", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(0, config);

      expect(result.baseRevenue).toBe(0);
      expect(result.hurdle1Revenue).toBe(0);
      expect(result.hurdle2Revenue).toBe(0);
      expect(result.hurdle3Revenue).toBe(0);
      expect(result.totalCommission).toBe(0);
    });

    it("should handle revenue exactly at hurdle2 boundary", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 50000,
        hurdle2Rate: 0.15,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(50000, config);

      expect(result.hurdle1Revenue).toBe(20000); // 50000 - 30000
      expect(result.hurdle1Commission).toBe(2200);
      expect(result.hurdle2Revenue).toBe(0); // Exactly at boundary
      expect(result.hurdle2Commission).toBe(0);
      expect(result.totalCommission).toBe(2200);
    });

    it("should handle revenue exactly at hurdle3 boundary", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 50000,
        hurdle2Rate: 0.15,
        hurdle3Level: 80000,
        hurdle3Rate: 0.2,
      };

      const result = calculateTieredCommission(80000, config);

      expect(result.hurdle1Revenue).toBe(20000);
      expect(result.hurdle2Revenue).toBe(30000); // 80000 - 50000
      expect(result.hurdle3Revenue).toBe(0); // Exactly at boundary
      expect(result.hurdle3Commission).toBe(0);
      expect(result.totalCommission).toBe(6700); // 2200 + 4500
    });
  });

  describe("Real-world Configuration", () => {
    it("should calculate commission using Kate's actual configuration", () => {
      // Kate's config: baseRate=0, hurdle1Level=30000, hurdle1Rate=0.11
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };

      const result = calculateTieredCommission(35000, config);

      expect(result.hurdle1Revenue).toBe(5000); // 35000 - 30000
      expect(result.hurdle1Commission).toBe(550); // 5000 * 0.11
      expect(result.totalCommission).toBe(550);
    });

    it("should handle multiple tiers with realistic Hong Kong dollar amounts", () => {
      const config: HurdleConfig = {
        baseRate: 0,
        hurdle1Level: 25000,
        hurdle1Rate: 0.12,
        hurdle2Level: 45000,
        hurdle2Rate: 0.14,
        hurdle3Level: 70000,
        hurdle3Rate: 0.16,
      };

      const result = calculateTieredCommission(85000, config);

      expect(result.hurdle1Revenue).toBe(20000); // 45000 - 25000
      expect(result.hurdle1Commission).toBe(2400); // 20000 * 0.12
      expect(result.hurdle2Revenue).toBe(25000); // 70000 - 45000
      expect(result.hurdle2Commission).toBe(3500); // 25000 * 0.14
      expect(result.hurdle3Revenue).toBe(15000); // 85000 - 70000
      expect(result.hurdle3Commission).toBe(2400); // 15000 * 0.16
      expect(result.totalCommission).toBe(8300); // 2400 + 3500 + 2400
    });
  });
});

describe("getServiceRevenues", () => {
  const revCol = 5; // Revenue column index

  it("should extract general service revenues from Excel rows", () => {
    const mockExcelArray: unknown[][] = [
      ["Kate, Staff ID #: 012"], // startRow = 0
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 2500],
      ["Blow Dry", "", "", "", "", 1000],
      ["Total for Kate", "", "", "", "", 3500], // endRow = 4
    ];

    const result = getServiceRevenues(mockExcelArray, 4, 0, revCol, "012");

    expect(result.has("General Services")).toBe(true);
    const generalServices = result.get("General Services");
    expect(generalServices?.serviceRevenue).toBe(3500); // 2500 + 1000
    expect(generalServices?.customRate).toBeNaN(); // Changed from toBeNull
  });

  it("should detect and extract custom rate service revenues", () => {
    const mockExcelArray: unknown[][] = [
      ["Kate, Staff ID #: 012"], // startRow = 0
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0],
      ["Extensions - Application", "", "", "", "", 5000],
      ["Extensions - Removal", "", "", "", "", 2000],
      ["Total for Kate", "", "", "", "", 7000], // endRow = 4
    ];

    const result = getServiceRevenues(mockExcelArray, 4, 0, revCol, "012");

    expect(result.has("Extensions")).toBe(true);
    const extensions = result.get("Extensions");
    expect(extensions?.serviceRevenue).toBe(7000); // 5000 + 2000
    expect(extensions?.customRate).toBe(0.15); // Custom rate for Extensions
  });

  it("should handle mixed general and custom rate services", () => {
    const mockExcelArray: unknown[][] = [
      ["Kate, Staff ID #: 012"], // Changed to 012 which has customPayRates
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 3000],
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0],
      ["Extensions", "", "", "", "", 8000],
      ["Hair Pay Rate: Color (50%)", "", "", "", "", 0],
      ["Color Treatment", "", "", "", "", 2000],
      ["Total for Kate", "", "", "", "", 13000], // endRow = 7
    ];

    const result = getServiceRevenues(mockExcelArray, 7, 0, revCol, "012"); // Changed to 012

    expect(result.size).toBe(2); // General Services + Extensions

    const generalServices = result.get("General Services");
    expect(generalServices?.serviceRevenue).toBe(5000); // 3000 + 2000 (Color treated as general)
    expect(generalServices?.customRate).toBeNaN(); // Changed from toBeNull

    const extensions = result.get("Extensions");
    expect(extensions?.serviceRevenue).toBe(8000);
    expect(extensions?.customRate).toBe(0.15);
  });

  it("should accumulate multiple revenue rows under same service", () => {
    const mockExcelArray: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Cut 1", "", "", "", "", 1000],
      ["Cut 2", "", "", "", "", 1500],
      ["Cut 3", "", "", "", "", 800],
      ["Cut 4", "", "", "", "", 1200],
      ["Total for Staff", "", "", "", "", 4500],
    ];

    const result = getServiceRevenues(mockExcelArray, 6, 0, revCol, "001");

    const generalServices = result.get("General Services");
    expect(generalServices?.serviceRevenue).toBe(4500); // Sum of all cuts
  });

  it("should handle zero revenue values", () => {
    const mockExcelArray: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Service with no revenue", "", "", "", "", 0],
      ["Total for Staff", "", "", "", "", 0],
    ];

    const result = getServiceRevenues(mockExcelArray, 3, 0, revCol, "001");

    // Map should be empty or have zero revenue
    const generalServices = result.get("General Services");
    expect(generalServices?.serviceRevenue || 0).toBe(0);
  });

  it("should handle rows with undefined revenue values", () => {
    const mockExcelArray: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Service 1", "", "", "", "", undefined], // Undefined revenue
      ["Service 2", "", "", "", "", 2000], // Valid revenue
      ["Total for Staff", "", "", "", "", 2000],
    ];

    const result = getServiceRevenues(mockExcelArray, 4, 0, revCol, "001");

    const generalServices = result.get("General Services");
    expect(generalServices?.serviceRevenue).toBe(2000); // Only counts valid revenue
  });

  it("should handle malformed Pay Rate headers gracefully", () => {
    const mockExcelArray: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0], // Valid header first
      ["Service 1", "", "", "", "", 1000],
      ["Invalid Header Format", "", "", "", "", 0], // Malformed - ignored
      ["Service 2", "", "", "", "", 2000], // Still under "Ladies Cut" context
      ["Total for Staff", "", "", "", "", 3000],
    ];

    const result = getServiceRevenues(mockExcelArray, 5, 0, revCol, "001");

    const generalServices = result.get("General Services");
    // Should accumulate both revenues under General Services after valid header appears
    expect(generalServices?.serviceRevenue).toBe(3000);
  });

  it("should switch context when encountering new Pay Rate header", () => {
    const mockExcelArray: unknown[][] = [
      ["Kate, Staff ID #: 012"], // Changed to 012 which has customPayRates
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Cut", "", "", "", "", 1000],
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0], // Switch to Extensions
      ["Extensions", "", "", "", "", 5000],
      ["Hair Pay Rate: Color (50%)", "", "", "", "", 0], // Switch back to general
      ["Color", "", "", "", "", 1500],
      ["Total for Kate", "", "", "", "", 7500],
    ];

    const result = getServiceRevenues(mockExcelArray, 7, 0, revCol, "012"); // Changed to 012

    expect(result.size).toBe(2);

    const generalServices = result.get("General Services");
    expect(generalServices?.serviceRevenue).toBe(2500); // 1000 + 1500

    const extensions = result.get("Extensions");
    expect(extensions?.serviceRevenue).toBe(5000);
  });

  it("should handle empty rows gracefully", () => {
    const mockExcelArray: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["", "", "", "", "", ""], // Empty row with empty strings instead of undefined
      ["Cut", "", "", "", "", 1000],
      ["", "", "", "", "", ""], // Another empty row
      ["Total for Staff", "", "", "", "", 1000],
    ];

    const result = getServiceRevenues(mockExcelArray, 5, 0, revCol, "001");

    const generalServices = result.get("General Services");
    expect(generalServices?.serviceRevenue).toBe(1000);
  });

  it("should count all rows with revenue > 0", () => {
    const mockExcelArray: unknown[][] = [
      ["Staff ID #: 001"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 500], // Header with value - will be counted
      ["Actual Service", "", "", "", "", 2000], // Real revenue
      ["Total for Staff", "", "", "", "", 2500],
    ];

    const result = getServiceRevenues(mockExcelArray, 3, 0, revCol, "001");

    const generalServices = result.get("General Services");
    expect(generalServices?.serviceRevenue).toBe(2500); // Counts both rows with revenue > 0
  });

  it("should handle multiple Extensions services correctly", () => {
    const mockExcelArray: unknown[][] = [
      ["Kate, Staff ID #: 012"], // Changed to 012 which has customPayRates for Extensions
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0],
      ["Extensions - Full Set", "", "", "", "", 10000],
      ["Extensions - Maintenance", "", "", "", "", 3000],
      ["Extensions - Removal", "", "", "", "", 1000],
      ["Total for Kate", "", "", "", "", 14000],
    ];

    const result = getServiceRevenues(mockExcelArray, 5, 0, revCol, "012"); // Changed to 012

    expect(result.size).toBe(1); // Only Extensions
    const extensions = result.get("Extensions");
    expect(extensions?.serviceRevenue).toBe(14000); // 10000 + 3000 + 1000
    expect(extensions?.customRate).toBe(0.15);
  });
});

describe("extractStaffPayrollData", () => {
  const revCol = 5; // Revenue column index

  it("should extract tips and product commission from Excel rows", () => {
    const mockExcelArray: unknown[][] = [
      ["Wong, Rex Staff ID #: 019"], // startRow = 0
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 2500],
      ["Product Pay Rate: Shampoo (10%)", "", "", "", "", 0],
      ["Shampoo", "", "", "", "", 100],
      ["Tips:", "", "", "", "", 150], // endRow - 2
      ["Sales Commission:", "", "", "", "", 50], // endRow - 1
      ["Total for Wong, Rex", "", "", "", "", 2600], // endRow = 7
    ];

    const result = extractStaffPayrollData(mockExcelArray, 0, 7, revCol, "019");

    expect(result.staffID).toBe("019");
    expect(result.tips).toBe(150);
    expect(result.productCommission).toBe(50);
  });

  it("should handle missing tips row", () => {
    const mockExcelArray: unknown[][] = [
      ["Wong, Rex Staff ID #: 019"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 1800],
      ["Sales Commission:", "", "", "", "", 30], // endRow - 1
      ["Total for Wong, Rex", "", "", "", "", 1800], // endRow = 4
    ];

    const result = extractStaffPayrollData(mockExcelArray, 0, 4, revCol, "019");

    expect(result.tips).toBe(0); // No tips row found
    expect(result.productCommission).toBe(30);
  });

  it("should handle missing product commission row", () => {
    const mockExcelArray: unknown[][] = [
      ["Kate Staff ID #: 012"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Tips:", "", "", "", "", 200], // endRow - 1
      ["Total for Kate", "", "", "", "", 3000], // endRow = 3
    ];

    const result = extractStaffPayrollData(mockExcelArray, 0, 3, revCol, "012");

    expect(result.tips).toBe(200);
    expect(result.productCommission).toBe(0); // No product commission row found
  });

  it("should extract service revenues into servicesRevenues map", () => {
    const mockExcelArray: unknown[][] = [
      ["Kate, Staff ID #: 012"],
      ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
      ["Ladies Cut", "", "", "", "", 2500],
      ["Hair Pay Rate: Extensions (55%)", "", "", "", "", 0],
      ["Extensions", "", "", "", "", 10000],
      ["Total for Kate", "", "", "", "", 12500], // endRow = 5
      ["Tips:", "", "", "", "", 100],
    ];

    const result = extractStaffPayrollData(mockExcelArray, 0, 5, revCol, "012");

    expect(result.servicesRevenues).toBeDefined();
    expect(result.servicesRevenues.size).toBeGreaterThan(0);
  });

  it("should handle empty revenue values gracefully", () => {
    const mockExcelArray: unknown[][] = [
      ["Staff, Test Staff ID #: 001"],
      ["Hair Pay Rate: Cut (55%)", "", "", "", "", 0],
      ["Total for Test", "", "", "", "", 0], // endRow = 2
      ["Tips:", "", "", "", "", undefined], // Undefined tips
      ["Sales Commission:", "", "", "", "", ""], // Empty string
    ];

    const result = extractStaffPayrollData(mockExcelArray, 0, 2, revCol, "001");

    expect(result.tips).toBe(0); // NaN becomes 0
    expect(result.productCommission).toBe(0); // Empty string becomes 0
  });

  it("should search within 4-row window from total row", () => {
    const mockExcelArray: unknown[][] = [
      ["Kate, Staff ID #: 012"],
      ["Services..."],
      ["Total for Kate", "", "", "", "", 5000], // endRow = 2
      ["Row -3: Tips here", "", "", "", "", 100], // Within window
      ["Row -2", "", "", "", "", 0],
      ["Row -1: Sales Commission here", "", "", "", "", 25], // Within window
      ["Row 0 (total row)", "", "", "", "", 0],
      ["Row +1: Too far", "", "", "", "", 999], // Outside window
    ];

    const result = extractStaffPayrollData(mockExcelArray, 0, 2, revCol, "012");

    // Should not find the row at index 7 (outside 4-row window)
    expect(result.tips).toBe(0);
    expect(result.productCommission).toBe(0);
  });
});

describe("calculateStaffCommission", () => {
  let mockTalenoxStaff: TTalenoxInfoStaffMap;

  beforeEach(() => {
    mockTalenoxStaff = new Map([
      ["012", { first_name: "Kate", last_name: "Smith" }],
      ["019", { first_name: "Rex", last_name: "Wong" }],
    ]);
  });

  it("should calculate commission for staff with only general services", () => {
    const payrollData: StaffPayrollData = {
      staffID: "012",
      staffName: "Kate Smith",
      tips: 100,
      productCommission: 50,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 35000, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.tips).toBe(100);
    expect(result.productCommission).toBe(50);
    expect(result.totalServiceRevenue).toBe(35000);
    expect(result.generalServiceCommission).toBe(550); // (35000 - 30000) * 0.11
    expect(result.customRateCommission).toBe(0);
    expect(result.totalServiceCommission).toBe(550);
  });

  it("should calculate commission for staff with only custom rate services", () => {
    const payrollData: StaffPayrollData = {
      staffID: "012",
      staffName: "Kate Smith",
      tips: 0,
      productCommission: 0,
      servicesRevenues: new Map([
        ["Extensions", { serviceRevenue: 10000, customRate: 0.15 }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.generalServiceCommission).toBe(0);
    expect(result.customRateCommission).toBe(1500); // 10000 * 0.15
    expect(result.customRateCommissions["Extensions"]).toBe(1500);
    expect(result.totalServiceCommission).toBe(1500);
  });

  it("should calculate commission for staff with both general and custom rate services", () => {
    const payrollData: StaffPayrollData = {
      staffID: "019",
      staffName: "Rex Wong",
      tips: 200,
      productCommission: 75,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 40000, customRate: null }],
        ["Extensions", { serviceRevenue: 8000, customRate: 0.15 }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.tips).toBe(200);
    expect(result.productCommission).toBe(75);
    expect(result.totalServiceRevenue).toBe(48000); // 40000 + 8000
    // Real implementation calculates using actual hurdle config (0.11 rate on revenue > 30000)
    expect(result.generalServiceCommission).toBe(2000); // Uses mocked getValidatedStaffHurdle
    expect(result.customRateCommission).toBe(1200); // 8000 * 0.15
    expect(result.totalServiceCommission).toBe(3200); // 2000 + 1200
  });

  it("should handle multiple custom rate services", () => {
    const payrollData: StaffPayrollData = {
      staffID: "012",
      staffName: "Kate Smith",
      tips: 0,
      productCommission: 0,
      servicesRevenues: new Map([
        ["Extensions", { serviceRevenue: 10000, customRate: 0.15 }],
        ["Color Treatment", { serviceRevenue: 5000, customRate: 0.12 }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.customRateCommissions["Extensions"]).toBe(1500); // 10000 * 0.15
    expect(result.customRateCommissions["Color Treatment"]).toBe(600); // 5000 * 0.12
    expect(result.customRateCommission).toBe(2100); // 1500 + 600
    expect(result.totalServiceCommission).toBe(2100);
  });

  it("should return zero commissions when revenue is zero", () => {
    const payrollData: StaffPayrollData = {
      staffID: "012",
      staffName: "Kate Smith",
      tips: 0,
      productCommission: 0,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 0, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.totalServiceRevenue).toBe(0);
    expect(result.generalServiceCommission).toBe(0);
    expect(result.customRateCommission).toBe(0);
    expect(result.totalServiceCommission).toBe(0);
  });

  it("should calculate custom rate commission accurately", () => {
    const payrollData: StaffPayrollData = {
      staffID: "012",
      staffName: "Kate Smith",
      tips: 0,
      productCommission: 0,
      servicesRevenues: new Map([
        ["Extensions", { serviceRevenue: 10000, customRate: 0.15 }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.customRateCommissions["Extensions"]).toBe(1500); // Exactly 10000 * 0.15
    expect(result.customRateCommission).toBe(1500);
  });

  it("should preserve tips and product commission in final result", () => {
    const payrollData: StaffPayrollData = {
      staffID: "019",
      staffName: "Rex Wong",
      tips: 250,
      productCommission: 125,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 35000, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.tips).toBe(250);
    expect(result.productCommission).toBe(125);
    // Tips and product commission are separate from service commissions
  });
});

describe("calculateStaffCommission - Tips Charge", () => {
  let mockTalenoxStaff: TTalenoxInfoStaffMap;

  beforeEach(() => {
    mockTalenoxStaff = new Map([
      ["012", { first_name: "Kate", last_name: "Smith" }],
      ["019", { first_name: "Rex", last_name: "Wong" }],
      ["050", { first_name: "Test", last_name: "WithCharge" }],
      ["051", { first_name: "Zero", last_name: "Charge" }],
    ]);
  });

  it("should not apply tips charge when tipsCCCharge is not configured", () => {
    const payrollData: StaffPayrollData = {
      staffID: "012", // Kate - no tipsCCCharge configured
      staffName: "Kate Smith",
      tips: 300,
      productCommission: 0,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 35000, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.tips).toBe(300); // Full tips, no charge
    expect(result.tipsCCProcessingRate).toBe(0);
    expect(result.tipsCCProcessingAmount).toBe(0);
  });

  it("should apply 3% tips charge when configured", () => {
    const payrollData: StaffPayrollData = {
      staffID: "050", // Has tipsCCCharge: 0.03
      staffName: "Test WithCharge",
      tips: 300,
      productCommission: 0,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 25000, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.tipsCCProcessingRate).toBe(0.03);
    expect(result.tipsCCProcessingAmount).toBe(9); // 300 * 0.03 = 9
    expect(result.tips).toBe(291); // 300 - 9 = 291 (net tips after charge)
  });

  it("should not apply charge when tipsCCCharge is explicitly 0", () => {
    const payrollData: StaffPayrollData = {
      staffID: "051", // Has tipsCCCharge: 0
      staffName: "Zero Charge",
      tips: 500,
      productCommission: 0,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 25000, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.tipsCCProcessingRate).toBe(0);
    expect(result.tipsCCProcessingAmount).toBe(0);
    expect(result.tips).toBe(500); // Full tips
  });

  it("should handle zero tips with charge configured", () => {
    const payrollData: StaffPayrollData = {
      staffID: "050", // Has tipsCCCharge: 0.03
      staffName: "Test WithCharge",
      tips: 0,
      productCommission: 0,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 25000, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    expect(result.tipsCCProcessingRate).toBe(0.03);
    expect(result.tipsCCProcessingAmount).toBe(0); // 0 * 0.03 = 0
    expect(result.tips).toBe(0);
  });

  it("should round tips charge amount to 2 decimal places", () => {
    const payrollData: StaffPayrollData = {
      staffID: "050", // Has tipsCCCharge: 0.03
      staffName: "Test WithCharge",
      tips: 333.33,
      productCommission: 0,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 25000, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    // 333.33 * 0.03 = 9.9999 → should round to 10.00
    expect(result.tipsCCProcessingAmount).toBe(10);
    expect(result.tips).toBe(323.33); // 333.33 - 10 = 323.33
  });

  it("should preserve other commission calculations when tips charge is applied", () => {
    const payrollData: StaffPayrollData = {
      staffID: "050", // Has tipsCCCharge: 0.03
      staffName: "Test WithCharge",
      tips: 200,
      productCommission: 100,
      servicesRevenues: new Map([
        ["General Services", { serviceRevenue: 25000, customRate: null }],
      ]),
    };

    const result = calculateStaffCommission(payrollData, mockTalenoxStaff);

    // Tips charge should not affect other calculations
    expect(result.productCommission).toBe(100);
    expect(result.generalServiceCommission).toBe(500); // (25000 - 20000) * 0.1
    expect(result.tipsCCProcessingAmount).toBe(6); // 200 * 0.03
    expect(result.tips).toBe(194); // 200 - 6
  });
});

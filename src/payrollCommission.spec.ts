import { describe, expect, it } from "vitest";
import type { StaffHurdle } from "./IStaffHurdle.js";
import { Option } from "./option.js";
import {
  calculateStaffCommission,
  calculateTieredCommission,
} from "./payrollCommission.js";
import { GENERAL_SERV_REVENUE } from "./payrollWorksheet.js";
import type {
  HurdleConfig,
  StaffPayrollData,
  TTalenoxInfoStaffMap,
} from "./types.js";
import type { StaffHurdleGetter } from "./utility_functions.js";

function createGetter(staffHurdle: StaffHurdle): StaffHurdleGetter {
  return () => Option.some(staffHurdle);
}

describe("payrollCommission", () => {
  it("calculates tiered commission with decimal revenue at each boundary", () => {
    const config: HurdleConfig = {
      baseRate: 0,
      hurdle1Level: 1000,
      hurdle1Rate: 0.1,
      hurdle2Level: 2000,
      hurdle2Rate: 0.2,
      hurdle3Level: 3000,
      hurdle3Rate: 0.3,
    };

    expect(calculateTieredCommission(3000.01, config)).toEqual({
      baseRevenue: 0,
      baseCommission: 0,
      hurdle1Revenue: 1000,
      hurdle1Commission: 100,
      hurdle2Revenue: 1000,
      hurdle2Commission: 200,
      hurdle3Revenue: 0.01,
      hurdle3Commission: 0,
      totalCommission: 300,
    });
  });

  it("uses the injected hurdle getter for general service commission", () => {
    const payrollData: StaffPayrollData = {
      staffID: "777",
      staffName: "Injected Config",
      tips: 12.34,
      productCommission: 7.89,
      servicesRevenues: new Map([
        [GENERAL_SERV_REVENUE, { serviceRevenue: 100.05, customRate: null }],
        ["Extensions", { serviceRevenue: 33.33, customRate: 0.15 }],
        ["Color", { serviceRevenue: 12.34, customRate: 0.1 }],
      ]),
    };
    const talenoxStaff: TTalenoxInfoStaffMap = new Map();
    const getStaffHurdleForContext = createGetter({
      staffName: "Injected Config",
      baseRate: 0.1,
      contractor: false,
      payViaTalenox: true,
    });

    const result = calculateStaffCommission(
      payrollData,
      talenoxStaff,
      getStaffHurdleForContext,
    );

    expect(result).toEqual({
      tips: 12.34,
      productCommission: 7.89,
      totalServiceRevenue: 145.72,
      generalServiceCommission: 10.01,
      customRateCommissions: {
        Extensions: 5,
        Color: 1.23,
      },
      customRateCommission: 6.23,
      totalServiceCommission: 16.24,
    });
  });

  it("throws when an injected hurdle configuration contains an invalid rate", () => {
    const payrollData: StaffPayrollData = {
      staffID: "777",
      staffName: "Broken Config",
      tips: 0,
      productCommission: 0,
      servicesRevenues: new Map([
        [GENERAL_SERV_REVENUE, { serviceRevenue: 1000, customRate: null }],
      ]),
    };

    const getStaffHurdleForContext = createGetter({
      staffName: "Broken Config",
      baseRate: 1.2,
      contractor: false,
      payViaTalenox: true,
    });

    expect(() =>
      calculateStaffCommission(
        payrollData,
        new Map(),
        getStaffHurdleForContext,
      ),
    ).toThrow("Invalid baseRate");
  });

  describe("calculateTieredCommission — boundary cases", () => {
    it("pays all revenue at base rate when no hurdles are configured", () => {
      const config: HurdleConfig = {
        baseRate: 0.08,
        hurdle1Level: 0,
        hurdle1Rate: 0,
        hurdle2Level: 0,
        hurdle2Rate: 0,
        hurdle3Level: 0,
        hurdle3Rate: 0,
      };
      const result = calculateTieredCommission(50000, config);
      expect(result.baseRevenue).toBe(50000);
      expect(result.baseCommission).toBe(4000);
      expect(result.hurdle1Revenue).toBe(0);
      expect(result.hurdle2Revenue).toBe(0);
      expect(result.hurdle3Revenue).toBe(0);
      expect(result.totalCommission).toBe(4000);
    });

    it("returns zero commission when revenue is below the first hurdle", () => {
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

    it("returns zero commission when revenue is exactly at the first hurdle", () => {
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

    it("calculates commission for revenue between hurdle1 and hurdle2", () => {
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
      expect(result.hurdle1Revenue).toBe(10000);
      expect(result.hurdle1Commission).toBe(1100);
      expect(result.hurdle2Revenue).toBe(0);
      expect(result.hurdle2Commission).toBe(0);
      expect(result.totalCommission).toBe(1100);
    });

    it("calculates commission for revenue between hurdle2 and hurdle3", () => {
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
      expect(result.hurdle1Revenue).toBe(20000);
      expect(result.hurdle1Commission).toBe(2200);
      expect(result.hurdle2Revenue).toBe(15000);
      expect(result.hurdle2Commission).toBe(2250);
      expect(result.hurdle3Revenue).toBe(0);
      expect(result.totalCommission).toBe(4450);
    });

    it("calculates commission for revenue exceeding hurdle3", () => {
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
      expect(result.hurdle1Revenue).toBe(20000);
      expect(result.hurdle1Commission).toBe(2200);
      expect(result.hurdle2Revenue).toBe(30000);
      expect(result.hurdle2Commission).toBe(4500);
      expect(result.hurdle3Revenue).toBe(20000);
      expect(result.hurdle3Commission).toBe(4000);
      expect(result.totalCommission).toBe(10700);
    });

    it("handles only hurdle1 configured (hurdle2 and hurdle3 absent)", () => {
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
      expect(result.hurdle1Revenue).toBe(20000);
      expect(result.hurdle1Commission).toBe(2200);
      expect(result.hurdle2Revenue).toBe(0);
      expect(result.hurdle3Revenue).toBe(0);
      expect(result.totalCommission).toBe(2200);
    });

    it("rounds fractional commission to 2 decimal places", () => {
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
      expect(result.hurdle1Revenue).toBe(3333.33);
      expect(result.hurdle1Commission).toBe(366.67);
      expect(result.totalCommission).toBe(366.67);
    });

    it("rounds sub-cent commission to zero (0.01 revenue × 0.11 = 0.0011)", () => {
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
      expect(result.hurdle1Commission).toBe(0);
      expect(result.totalCommission).toBe(0);
    });

    it("handles large revenue amounts without floating-point drift", () => {
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
      expect(result.hurdle1Revenue).toBe(200000);
      expect(result.hurdle1Commission).toBe(20000);
      expect(result.hurdle2Revenue).toBe(200000);
      expect(result.hurdle2Commission).toBe(24000);
      expect(result.hurdle3Revenue).toBe(500000);
      expect(result.hurdle3Commission).toBe(75000);
      expect(result.totalCommission).toBe(119000);
    });

    it("returns zero commission for zero revenue", () => {
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

    it("returns zero hurdle2 commission when revenue is exactly at the hurdle2 boundary", () => {
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
      expect(result.hurdle1Revenue).toBe(20000);
      expect(result.hurdle1Commission).toBe(2200);
      expect(result.hurdle2Revenue).toBe(0);
      expect(result.hurdle2Commission).toBe(0);
      expect(result.totalCommission).toBe(2200);
    });

    it("returns zero hurdle3 commission when revenue is exactly at the hurdle3 boundary", () => {
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
      expect(result.hurdle2Revenue).toBe(30000);
      expect(result.hurdle3Revenue).toBe(0);
      expect(result.hurdle3Commission).toBe(0);
      expect(result.totalCommission).toBe(6700);
    });

    it("calculates correctly for a single-hurdle real-world config (5000 above hurdle)", () => {
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
      expect(result.hurdle1Revenue).toBe(5000);
      expect(result.hurdle1Commission).toBe(550);
      expect(result.totalCommission).toBe(550);
    });

    it("calculates correctly for a three-hurdle real-world config", () => {
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
      expect(result.hurdle1Revenue).toBe(20000);
      expect(result.hurdle1Commission).toBe(2400);
      expect(result.hurdle2Revenue).toBe(25000);
      expect(result.hurdle2Commission).toBe(3500);
      expect(result.hurdle3Revenue).toBe(15000);
      expect(result.hurdle3Commission).toBe(2400);
      expect(result.totalCommission).toBe(8300);
    });
  });

  describe("calculateStaffCommission — multi-service cases", () => {
    const kateHurdle: StaffHurdle = {
      staffName: "Kate",
      baseRate: 0,
      hurdle1Level: 30000,
      hurdle1Rate: 0.11,
      contractor: false,
      payViaTalenox: true,
    };
    const defaultHurdle: StaffHurdle = {
      staffName: "Default",
      baseRate: 0,
      hurdle1Level: 20000,
      hurdle1Rate: 0.1,
      contractor: false,
      payViaTalenox: true,
    };

    it("calculates general service commission only", () => {
      const payrollData: StaffPayrollData = {
        staffID: "012",
        staffName: "Kate Smith",
        tips: 100,
        productCommission: 50,
        servicesRevenues: new Map([
          [GENERAL_SERV_REVENUE, { serviceRevenue: 35000, customRate: null }],
        ]),
      };
      const result = calculateStaffCommission(
        payrollData,
        new Map(),
        createGetter(kateHurdle),
      );
      expect(result.tips).toBe(100);
      expect(result.productCommission).toBe(50);
      expect(result.totalServiceRevenue).toBe(35000);
      expect(result.generalServiceCommission).toBe(550); // (35000-30000)*0.11
      expect(result.customRateCommission).toBe(0);
      expect(result.totalServiceCommission).toBe(550);
    });

    it("calculates custom rate commission only (no general services revenue)", () => {
      const payrollData: StaffPayrollData = {
        staffID: "012",
        staffName: "Kate Smith",
        tips: 0,
        productCommission: 0,
        servicesRevenues: new Map([
          ["Extensions", { serviceRevenue: 10000, customRate: 0.15 }],
        ]),
      };
      const result = calculateStaffCommission(
        payrollData,
        new Map(),
        createGetter(kateHurdle),
      );
      expect(result.generalServiceCommission).toBe(0);
      expect(result.customRateCommission).toBe(1500);
      expect(result.customRateCommissions["Extensions"]).toBe(1500);
      expect(result.totalServiceCommission).toBe(1500);
    });

    it("combines general and custom rate commissions", () => {
      const payrollData: StaffPayrollData = {
        staffID: "019",
        staffName: "Rex Wong",
        tips: 200,
        productCommission: 75,
        servicesRevenues: new Map([
          [GENERAL_SERV_REVENUE, { serviceRevenue: 40000, customRate: null }],
          ["Extensions", { serviceRevenue: 8000, customRate: 0.15 }],
        ]),
      };
      const result = calculateStaffCommission(
        payrollData,
        new Map(),
        createGetter(defaultHurdle),
      );
      expect(result.tips).toBe(200);
      expect(result.productCommission).toBe(75);
      expect(result.totalServiceRevenue).toBe(48000);
      expect(result.generalServiceCommission).toBe(2000); // (40000-20000)*0.1
      expect(result.customRateCommission).toBe(1200); // 8000*0.15
      expect(result.totalServiceCommission).toBe(3200);
    });

    it("calculates commission across multiple custom rate service types", () => {
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
      const result = calculateStaffCommission(
        payrollData,
        new Map(),
        createGetter(kateHurdle),
      );
      expect(result.customRateCommissions["Extensions"]).toBe(1500);
      expect(result.customRateCommissions["Color Treatment"]).toBe(600);
      expect(result.customRateCommission).toBe(2100);
      expect(result.totalServiceCommission).toBe(2100);
    });

    it("returns zero commissions when all service revenue is zero", () => {
      const payrollData: StaffPayrollData = {
        staffID: "012",
        staffName: "Kate Smith",
        tips: 0,
        productCommission: 0,
        servicesRevenues: new Map([
          [GENERAL_SERV_REVENUE, { serviceRevenue: 0, customRate: null }],
        ]),
      };
      const result = calculateStaffCommission(
        payrollData,
        new Map(),
        createGetter(kateHurdle),
      );
      expect(result.totalServiceRevenue).toBe(0);
      expect(result.generalServiceCommission).toBe(0);
      expect(result.customRateCommission).toBe(0);
      expect(result.totalServiceCommission).toBe(0);
    });

    it("preserves tips and product commission independently of service commissions", () => {
      const payrollData: StaffPayrollData = {
        staffID: "019",
        staffName: "Rex Wong",
        tips: 250,
        productCommission: 125,
        servicesRevenues: new Map([
          [GENERAL_SERV_REVENUE, { serviceRevenue: 35000, customRate: null }],
        ]),
      };
      const result = calculateStaffCommission(
        payrollData,
        new Map(),
        createGetter(defaultHurdle),
      );
      expect(result.tips).toBe(250);
      expect(result.productCommission).toBe(125);
    });

    it("sums general and custom rate commission with Decimal precision", () => {
      // generalRevenue=30001 → (30001-30000)*0.11 = 0.11
      // Extensions=2@0.1 → 0.20
      // total = 0.31 (not 0.30999... from floating-point)
      const payrollData: StaffPayrollData = {
        staffID: "012",
        staffName: "Kate Smith",
        tips: 0,
        productCommission: 0,
        servicesRevenues: new Map([
          [GENERAL_SERV_REVENUE, { serviceRevenue: 30001, customRate: null }],
          ["Extensions", { serviceRevenue: 2, customRate: 0.1 }],
        ]),
      };
      const result = calculateStaffCommission(
        payrollData,
        new Map(),
        createGetter(kateHurdle),
      );
      expect(result.generalServiceCommission).toBe(0.11);
      expect(result.customRateCommission).toBe(0.2);
      expect(result.totalServiceCommission).toBe(0.31);
    });
  });
});

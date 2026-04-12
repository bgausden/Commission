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
});

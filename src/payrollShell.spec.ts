import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffHurdle } from "./IStaffHurdle.js";
import { warnLogger } from "./logging_functions.js";
import { Option } from "./option.js";
import { processPayrollExcelData } from "./payrollShell.js";
import type { StaffHurdleGetter } from "./utility_functions.js";

vi.mock("./logging_functions.js", () => ({
  warnLogger: { warn: vi.fn() },
  infoLogger: { info: vi.fn() },
  commissionLogger: { info: vi.fn() },
  contractorLogger: { info: vi.fn() },
  errorLogger: { error: vi.fn() },
  debugLogger: { debug: vi.fn() },
}));

function createGetter(staffHurdle: StaffHurdle): StaffHurdleGetter {
  return () => Option.some(staffHurdle);
}

describe("payrollShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates missing Talenox staff from the worksheet in regression offline mode", () => {
    const talenoxStaff = new Map();
    const getStaffHurdleForContext = createGetter({
      staffName: "Jane Doe",
      baseRate: 0.1,
      contractor: false,
      payViaTalenox: true,
    });

    const commMap = processPayrollExcelData(
      [
        ["Doe, Jane Staff ID #: 123"],
        ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
        ["Ladies Cut", "", "", "", "", 1000],
        ["Tips:", "", "", "", "", "", 15.5],
        ["Sales Commission:", "", "", "", "", "", 20],
        ["Total for Doe, Jane", "", "", "", "", 1000],
      ],
      5,
      talenoxStaff,
      {
        regressionOfflineMode: true,
        missingStaffAreFatal: true,
        getStaffHurdleForContext,
      },
    );

    expect(talenoxStaff.get("123")).toEqual({
      first_name: "Jane",
      last_name: "Doe",
    });
    expect(commMap.get("123")).toEqual({
      totalServiceRevenue: 1000,
      tips: 15.5,
      productCommission: 20,
      generalServiceCommission: 100,
      customRateCommissions: {},
      customRateCommission: 0,
      totalServiceCommission: 100,
    });
    expect(warnLogger.warn).not.toHaveBeenCalled();
  });

  it("warns when a pay-via-Talenox staff member is missing from the Talenox lookup", () => {
    const getStaffHurdleForContext = createGetter({
      staffName: "Jane Doe",
      baseRate: 0.1,
      contractor: false,
      payViaTalenox: true,
    });

    const commMap = processPayrollExcelData(
      [
        ["Doe, Jane Staff ID #: 123"],
        ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
        ["Ladies Cut", "", "", "", "", 500],
        ["Total for Doe, Jane", "", "", "", "", 500],
      ],
      5,
      new Map(),
      {
        regressionOfflineMode: false,
        missingStaffAreFatal: false,
        getStaffHurdleForContext,
      },
    );

    expect(warnLogger.warn).toHaveBeenCalledWith(
      "Warning: 123 Jane Doe in MB Payroll Report line 0 not in Talenox.",
    );
    expect(commMap.get("123")?.generalServiceCommission).toBe(50);
  });
});

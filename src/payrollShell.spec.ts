import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffHurdle } from "./IStaffHurdle.js";
import { commissionLogger, warnLogger } from "./logging_functions.js";
import { Option } from "./option.js";
import { processPayrollExcelData } from "./payrollShell.js";
import type { TRedoMap, TRedoAdjustment } from "./types.js";
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

  it("logs redo debit/credit entries and adjusts total payable", () => {
    const getStaffHurdleForContext = createGetter({
      staffName: "Jane Doe",
      baseRate: 0.1,
      contractor: false,
      payViaTalenox: true,
    });

    const redoAdj: TRedoAdjustment = {
      redoEntries: [
        {
          direction: "DEBIT",
          amount: 80,
          clientName: "Alice",
          originalServiceDate: new Date("2024-04-05"),
          sourceRowNumber: 2,
          counterpartyStaffID: null,
          counterpartyStaffName: "",
          originalStaffID: "123",
          originalStaffName: "Jane Doe",
        },
        {
          direction: "CREDIT",
          amount: 50,
          clientName: "Bob",
          originalServiceDate: new Date("2024-03-20"),
          sourceRowNumber: 3,
          counterpartyStaffID: "456",
          counterpartyStaffName: "Other Staff",
          originalStaffID: "456",
          originalStaffName: "Other Staff",
        },
      ],
      redoDebitTotal: 80,
      redoCreditTotal: 50,
      redoNetAdjustment: -30,
    };

    const redoMap: TRedoMap = new Map([["123", redoAdj]]);

    const talenoxStaff = new Map([
      ["123", { first_name: "Jane", last_name: "Doe" }],
    ]);

    processPayrollExcelData(
      [
        ["Doe, Jane Staff ID #: 123"],
        ["Hair Pay Rate: Ladies Cut (55%)", "", "", "", "", 0],
        ["Ladies Cut", "", "", "", "", 1000],
        ["Total for Doe, Jane", "", "", "", "", 1000],
      ],
      5,
      talenoxStaff,
      {
        regressionOfflineMode: true,
        missingStaffAreFatal: true,
        getStaffHurdleForContext,
        redoMap,
      },
    );

    const infoCalls = (
      commissionLogger.info as ReturnType<typeof vi.fn>
    ).mock.calls.map((call: unknown[]) =>
      call
        .filter((arg) => arg !== undefined)
        .map(String)
        .join(" "),
    );

    const debitLine = infoCalls.find((line: string) =>
      line.includes("Redo Debit"),
    );
    expect(debitLine).toBeDefined();
    expect(debitLine).toContain("Alice");
    expect(debitLine).toContain("2024-04-05");

    const creditLine = infoCalls.find((line: string) =>
      line.includes("Redo Credit"),
    );
    expect(creditLine).toBeDefined();
    expect(creditLine).toContain("Bob");

    const netLine = infoCalls.find((line: string) =>
      line.includes("Redo Net Adjustment"),
    );
    expect(netLine).toBeDefined();

    // Total Payable: generalServiceCommission (100) + 0 + 0 + 0 + redoNet (-30) = 70
    const totalLine = infoCalls.find((line: string) =>
      line.includes("Total Payable"),
    );
    expect(totalLine).toBeDefined();
    expect(totalLine).toContain("70");
  });
});

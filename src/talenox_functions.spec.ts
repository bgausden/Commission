import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdHocPayments,
  createPayroll,
  uploadAdHocPayments,
} from "./talenox_functions.js";
import type { ITalenoxPayment } from "./ITalenoxPayment.js";
import type { PayrollRunContext } from "./payrollContext.js";
import type {
  TRedoAdjustment,
  TRedoMap,
  TTalenoxInfoStaffMap,
  TCommMap,
} from "./types.js";
import { isContractor } from "./utility_functions.js";

vi.mock("./logging_functions.js", () => ({
  debugLogger: { debug: vi.fn() },
}));

vi.mock("./utility_functions.js", () => ({
  isContractor: vi.fn(() => false),
  isValidStaffID: vi.fn(),
}));

function buildPayrollContext(): PayrollRunContext {
  return {
    month: "April",
    year: "2024",
    firstDay: new Date("2024-04-01T00:00:00.000Z"),
  };
}

function buildStaffMap(): TTalenoxInfoStaffMap {
  return new Map([
    [
      "001",
      {
        first_name: "Active",
        last_name: "Staff",
      },
    ],
    [
      "002",
      {
        first_name: "Former",
        last_name: "Staff",
        resign_date: "2024-03-31",
      },
    ],
    [
      "003",
      {
        first_name: "Boundary",
        last_name: "Staff",
        resign_date: "2024-04-01",
      },
    ],
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createPayroll", () => {
  it("uses explicit payroll context for the payment and resign-date filtering", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: "Successfully updated payment.",
          month: "April",
          period: "Whole Month",
          year: "2024",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const [error, result] = await createPayroll(
      buildStaffMap(),
      buildPayrollContext(),
    );

    expect(error).toBeUndefined();
    expect(result?.message).toBe("Successfully updated payment.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      employee_ids: ["001", "003"],
      payment: {
        year: "2024",
        month: "April",
        period: "Whole Month",
        with_pay_items: true,
        pay_group: "April 2024",
      },
    });
  });
});

describe("uploadAdHocPayments", () => {
  it("uses explicit payroll context and skips resigned staff before first day", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: "Successfully updated payment.",
          month: "April",
          period: "Whole Month",
          year: "2024",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const payments: ITalenoxPayment[] = [
      {
        staffID: "001",
        staffName: "Active Staff",
        type: "Others",
        amount: 120,
        remarks: "Services commission",
      },
      {
        staffID: "002",
        staffName: "Former Staff",
        type: "Others",
        amount: 80,
        remarks: "Tips",
      },
    ];

    const [error, result] = await uploadAdHocPayments(
      buildStaffMap(),
      payments,
      buildPayrollContext(),
    );

    expect(error).toBeUndefined();
    expect(result?.message).toBe("Successfully updated payment.");
    expect(warnSpy).toHaveBeenCalledWith(
      "Former Staff has commission due but resigned prior to this payroll month",
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      payment: {
        year: "2024",
        month: "April",
        period: "Whole Month",
      },
      pay_items: [
        {
          employee_id: "001",
          item_type: "Others",
          remarks: "Services commission",
          amount: 120,
        },
      ],
    });
  });
});

describe("createAdHocPayments redo export", () => {
  const payrollContext: PayrollRunContext = {
    month: "April",
    year: "2024",
    firstDay: new Date("2024-04-01T00:00:00.000Z"),
  };

  const staffMap: TTalenoxInfoStaffMap = new Map([
    ["001", { first_name: "Active", last_name: "Staff" }],
    ["002", { first_name: "Redo", last_name: "Worker" }],
  ]);

  const emptyCommMap: TCommMap = new Map();

  function makeRedoAdj(
    entries: TRedoAdjustment["redoEntries"],
  ): TRedoAdjustment {
    const debitTotal = entries
      .filter((e) => e.direction === "DEBIT")
      .reduce((sum, e) => sum + e.amount, 0);
    const creditTotal = entries
      .filter((e) => e.direction === "CREDIT")
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      redoEntries: entries,
      redoDebitTotal: debitTotal,
      redoCreditTotal: creditTotal,
      redoNetAdjustment: creditTotal - debitTotal,
    };
  }

  it("emits Commission (Irregular) for a CREDIT entry with positive amount", () => {
    const redoMap: TRedoMap = new Map([
      [
        "002",
        makeRedoAdj([
          {
            direction: "CREDIT",
            amount: 80,
            clientName: "Alice",
            originalServiceDate: new Date("2024-04-05T00:00:00.000Z"),
            sourceRowNumber: 2,
            counterpartyStaffID: "001",
            counterpartyStaffName: "Active Staff",
            originalStaffID: "001",
            originalStaffName: "Active Staff",
          },
        ]),
      ],
    ]);

    const payments = createAdHocPayments(
      emptyCommMap,
      staffMap,
      redoMap,
      payrollContext,
    );

    expect(payments).toHaveLength(1);
    expect(payments[0].type).toBe("Commission (Irregular)");
    expect(payments[0].amount).toBe(80);
    expect(payments[0].remarks).toBe("REDO Alice for Active Staff");
    expect(payments[0].staffID).toBe("002");
  });

  it("emits Deduction for a DEBIT entry in the current payroll month", () => {
    const redoMap: TRedoMap = new Map([
      [
        "001",
        makeRedoAdj([
          {
            direction: "DEBIT",
            amount: 100,
            clientName: "Bob",
            originalServiceDate: new Date("2024-04-10T00:00:00.000Z"),
            sourceRowNumber: 3,
            counterpartyStaffID: null,
            counterpartyStaffName: "",
            originalStaffID: "001",
            originalStaffName: "Active Staff",
          },
        ]),
      ],
    ]);

    const payments = createAdHocPayments(
      emptyCommMap,
      staffMap,
      redoMap,
      payrollContext,
    );

    expect(payments).toHaveLength(1);
    expect(payments[0].type).toBe("Deduction");
    expect(payments[0].amount).toBe(100);
    expect(payments[0].remarks).toBe("REDO 2024-04-10 Bob");
  });

  it("emits Deduction (from Net Salary) for a DEBIT entry in a prior month", () => {
    const redoMap: TRedoMap = new Map([
      [
        "001",
        makeRedoAdj([
          {
            direction: "DEBIT",
            amount: 60,
            clientName: "Carol",
            originalServiceDate: new Date("2024-03-20T00:00:00.000Z"),
            sourceRowNumber: 4,
            counterpartyStaffID: null,
            counterpartyStaffName: "",
            originalStaffID: "001",
            originalStaffName: "Active Staff",
          },
        ]),
      ],
    ]);

    const payments = createAdHocPayments(
      emptyCommMap,
      staffMap,
      redoMap,
      payrollContext,
    );

    expect(payments).toHaveLength(1);
    expect(payments[0].type).toBe("Deduction (from Net Salary)");
    expect(payments[0].amount).toBe(60);
    expect(payments[0].remarks).toBe("REDO 2024-03-20 Carol");
  });

  it("omits zero-amount CREDIT entries from export", () => {
    const redoMap: TRedoMap = new Map([
      [
        "002",
        makeRedoAdj([
          {
            direction: "CREDIT",
            amount: 0,
            clientName: "Dave",
            originalServiceDate: new Date("2024-04-15T00:00:00.000Z"),
            sourceRowNumber: 5,
            counterpartyStaffID: "001",
            counterpartyStaffName: "Active Staff",
            originalStaffID: "001",
            originalStaffName: "Active Staff",
          },
        ]),
      ],
    ]);

    const payments = createAdHocPayments(
      emptyCommMap,
      staffMap,
      redoMap,
      payrollContext,
    );

    expect(payments).toHaveLength(0);
  });

  it("omits redo rows for contractor staff", () => {
    vi.mocked(isContractor).mockImplementation((id) => id === "001");

    const redoMap: TRedoMap = new Map([
      [
        "001",
        makeRedoAdj([
          {
            direction: "DEBIT",
            amount: 50,
            clientName: "Eve",
            originalServiceDate: new Date("2024-04-01T00:00:00.000Z"),
            sourceRowNumber: 6,
            counterpartyStaffID: null,
            counterpartyStaffName: "",
            originalStaffID: "001",
            originalStaffName: "Active Staff",
          },
        ]),
      ],
    ]);

    const payments = createAdHocPayments(
      emptyCommMap,
      staffMap,
      redoMap,
      payrollContext,
    );

    expect(payments).toHaveLength(0);
  });

  it("all redo payment amounts are positive", () => {
    const redoMap: TRedoMap = new Map([
      [
        "001",
        makeRedoAdj([
          {
            direction: "DEBIT",
            amount: 75,
            clientName: "Frank",
            originalServiceDate: new Date("2024-04-03T00:00:00.000Z"),
            sourceRowNumber: 7,
            counterpartyStaffID: null,
            counterpartyStaffName: "",
            originalStaffID: "001",
            originalStaffName: "Active Staff",
          },
        ]),
      ],
      [
        "002",
        makeRedoAdj([
          {
            direction: "CREDIT",
            amount: 60,
            clientName: "Frank",
            originalServiceDate: new Date("2024-04-03T00:00:00.000Z"),
            sourceRowNumber: 7,
            counterpartyStaffID: "001",
            counterpartyStaffName: "Active Staff",
            originalStaffID: "001",
            originalStaffName: "Active Staff",
          },
        ]),
      ],
    ]);

    const payments = createAdHocPayments(
      emptyCommMap,
      staffMap,
      redoMap,
      payrollContext,
    );

    for (const p of payments) {
      expect(p.amount).toBeGreaterThan(0);
    }
  });
});

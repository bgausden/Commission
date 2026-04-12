import { afterEach, describe, expect, it, vi } from "vitest";
import { createPayroll, uploadAdHocPayments } from "./talenox_functions.js";
import type { ITalenoxPayment } from "./ITalenoxPayment.js";
import type { PayrollRunContext } from "./payrollContext.js";
import type { TTalenoxInfoStaffMap } from "./types.js";

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

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import type {
  StaffCommissionData,
  StaffPayment,
} from "../../src/regression.types.js";
import {
  compareCommissionData,
  compareStaffPayments,
} from "./compareBaseline.js";

function money(value: string): number {
  return new Decimal(value).toNumber();
}

function buildCommissionRow(
  overrides: Partial<StaffCommissionData> = {},
): StaffCommissionData {
  return {
    staffId: "024",
    staffName: "Ho Ava",
    generalServicesRevenue: 0,
    customRateRevenues: {},
    generalServiceCommission: money("24603.60"),
    customRateCommissions: {},
    productCommission: 0,
    tips: 0,
    totalPayable: money("25718.10"),
    ...overrides,
  };
}

function buildPaymentRow(overrides: Partial<StaffPayment> = {}): StaffPayment {
  return {
    staffId: "024",
    staffName: "Ho Ava",
    payments: [
      {
        type: "Service Commission",
        amount: money("24603.60"),
      },
    ],
    total: money("25718.10"),
    ...overrides,
  };
}

describe("compareCommissionData", () => {
  it("treats decimal-calculated values at the tolerance boundary as equal", () => {
    const baseline = [buildCommissionRow()];
    const current = [
      buildCommissionRow({
        generalServiceCommission: new Decimal("24603.60")
          .plus("0.20")
          .toNumber(),
        totalPayable: new Decimal("25718.10").plus("0.20").toNumber(),
      }),
    ];

    const result = compareCommissionData(baseline, current, { tolerance: 0.2 });

    expect(result.modified).toHaveLength(0);
    expect(result.identical).toHaveLength(1);
  });

  it("still reports values that are materially outside the tolerance", () => {
    const baseline = [buildCommissionRow()];
    const current = [
      buildCommissionRow({
        generalServiceCommission: new Decimal("24603.60")
          .plus("0.21")
          .toNumber(),
        totalPayable: new Decimal("25718.10").plus("0.21").toNumber(),
      }),
    ];

    const result = compareCommissionData(baseline, current, { tolerance: 0.2 });

    expect(result.modified).toHaveLength(1);
    expect(result.identical).toHaveLength(0);
  });

  it("allows explicit per-staff per-field commission tolerance overrides", () => {
    const baseline = [buildCommissionRow()];
    const current = [
      buildCommissionRow({
        generalServiceCommission: new Decimal("24603.60")
          .plus("0.20")
          .toNumber(),
        totalPayable: new Decimal("25718.10").plus("0.20").toNumber(),
      }),
    ];

    const result = compareCommissionData(baseline, current, {
      tolerance: 0.01,
      kind: "commission",
      toleranceOverrides: [
        {
          kind: "commission",
          staffId: "024",
          fields: ["generalServiceCommission", "totalPayable"],
          tolerance: 0.2,
        },
      ],
    });

    expect(result.modified).toHaveLength(0);
    expect(result.identical).toHaveLength(1);
  });
});

describe("compareStaffPayments", () => {
  it("treats decimal-calculated payment values at the tolerance boundary as equal", () => {
    const baseline = [buildPaymentRow()];
    const current = [
      buildPaymentRow({
        payments: [
          {
            type: "Service Commission",
            amount: new Decimal("24603.60").plus("0.20").toNumber(),
          },
        ],
        total: new Decimal("25718.10").plus("0.20").toNumber(),
      }),
    ];

    const result = compareStaffPayments(baseline, current, { tolerance: 0.2 });

    expect(result.modified).toHaveLength(0);
    expect(result.identical).toHaveLength(1);
  });

  it("still reports payment values that are materially outside the tolerance", () => {
    const baseline = [buildPaymentRow()];
    const current = [
      buildPaymentRow({
        payments: [
          {
            type: "Service Commission",
            amount: new Decimal("24603.60").plus("0.21").toNumber(),
          },
        ],
        total: new Decimal("25718.10").plus("0.21").toNumber(),
      }),
    ];

    const result = compareStaffPayments(baseline, current, { tolerance: 0.2 });

    expect(result.modified).toHaveLength(1);
    expect(result.identical).toHaveLength(0);
  });

  it("does not apply commission-only overrides to payment comparisons", () => {
    const baseline = [buildPaymentRow()];
    const current = [
      buildPaymentRow({
        payments: [
          {
            type: "Service Commission",
            amount: new Decimal("24603.60").plus("0.20").toNumber(),
          },
        ],
        total: new Decimal("25718.10").plus("0.20").toNumber(),
      }),
    ];

    const result = compareStaffPayments(baseline, current, {
      tolerance: 0.01,
      toleranceOverrides: [
        {
          kind: "commission",
          staffId: "024",
          fields: ["generalServiceCommission", "totalPayable"],
          tolerance: 0.2,
        },
      ],
    });

    expect(result.modified).toHaveLength(1);
    expect(result.identical).toHaveLength(0);
  });
});

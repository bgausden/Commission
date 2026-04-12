import { describe, expect, it } from "vitest";
import type {
  TCommComponents,
  TCommMap,
  TStaffHurdles,
  TStaffID,
} from "./types.js";
import { calculatePooledCommissionMap } from "./payrollPooling.js";

function buildPoolConfig(
  entries: Array<[TStaffID, TStaffID[] | undefined]>,
): TStaffHurdles {
  return new Map(
    entries.map(([staffID, poolsWith]) => [
      staffID,
      {
        staffName: `Staff ${staffID}`,
        baseRate: 0,
        contractor: false,
        payViaTalenox: true,
        ...(poolsWith ? { poolsWith } : {}),
      },
    ]),
  );
}

function buildCommMap(
  entries: Array<[TStaffID, Partial<TCommComponents>]>,
): TCommMap {
  return new Map(
    entries.map(([staffID, partial]) => [
      staffID,
      {
        totalServiceRevenue: 0,
        tips: 0,
        productCommission: 0,
        generalServiceCommission: 0,
        customRateCommissions: {},
        customRateCommission: 0,
        totalServiceCommission: 0,
        ...partial,
      },
    ]),
  );
}

describe("payrollPooling", () => {
  it("sorts pool members before splitting remainder cents", () => {
    const commMap = buildCommMap([
      ["013", { customRateCommissions: {}, customRateCommission: 0 }],
      [
        "011",
        {
          customRateCommissions: { Extensions: 100 },
          customRateCommission: 100,
          totalServiceCommission: 100,
        },
      ],
      ["012", { customRateCommissions: {}, customRateCommission: 0 }],
    ]);
    const staffHurdles = buildPoolConfig([
      ["013", ["012", "011"]],
      ["011", ["013", "012"]],
      ["012", ["013", "011"]],
    ]);

    const { pooledCommMap, reports } = calculatePooledCommissionMap(
      commMap,
      staffHurdles,
    );

    expect(reports).toHaveLength(1);
    expect(reports[0]?.poolMembers).toEqual(["011", "012", "013"]);
    expect(pooledCommMap.get("011")?.customRateCommissions).toEqual({
      Extensions: 33.34,
    });
    expect(pooledCommMap.get("012")?.customRateCommissions).toEqual({
      Extensions: 33.33,
    });
    expect(pooledCommMap.get("013")?.customRateCommissions).toEqual({
      Extensions: 33.33,
    });
  });

  it("rejects inconsistent reciprocal pool definitions", () => {
    const commMap = buildCommMap([
      ["011", {}],
      ["012", {}],
      ["013", {}],
    ]);
    const staffHurdles = buildPoolConfig([
      ["011", ["012"]],
      ["012", ["011", "013"]],
      ["013", ["012"]],
    ]);

    expect(() => calculatePooledCommissionMap(commMap, staffHurdles)).toThrow(
      /Pooling config for 012 appears to be incorrect/,
    );
  });

  it("rejects duplicate staff IDs inside a single pool definition", () => {
    const commMap = buildCommMap([
      ["011", {}],
      ["012", {}],
    ]);
    const staffHurdles = buildPoolConfig([
      ["011", ["012", "012"]],
      ["012", ["011"]],
    ]);

    expect(() => calculatePooledCommissionMap(commMap, staffHurdles)).toThrow(
      /contains duplicate pool members: 012, 012, 011/,
    );
  });
});

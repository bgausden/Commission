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

function expectDerivedTotals(comm: TCommComponents): void {
  const expectedCustom = Object.values(comm.customRateCommissions)
    .reduce((sum, amount) => sum + amount, 0);
  expect(comm.customRateCommission).toBeCloseTo(expectedCustom, 10);
  expect(comm.totalServiceCommission).toBeCloseTo(
    comm.generalServiceCommission + comm.customRateCommission,
    10,
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

  it("pools custom rate commissions from members with different service keys", () => {
    const commMap = buildCommMap([
      ["011", { generalServiceCommission: 3000, customRateCommission: 1500, customRateCommissions: { Extensions: 1500 }, totalServiceRevenue: 10000, totalServiceCommission: 4500 }],
      ["012", { generalServiceCommission: 1000, customRateCommission: 600, customRateCommissions: { "Color Treatment": 600 }, totalServiceRevenue: 8000, totalServiceCommission: 1600 }],
    ]);
    const staffHurdles = buildPoolConfig([["011", ["012"]], ["012", ["011"]]]);

    const { pooledCommMap } = calculatePooledCommissionMap(commMap, staffHurdles);

    expect(pooledCommMap.get("011")).toEqual({
      totalServiceRevenue: 9000,
      totalServiceCommission: 3050,
      tips: 0,
      productCommission: 0,
      customRateCommission: 1050,
      customRateCommissions: { Extensions: 750, "Color Treatment": 300 },
      generalServiceCommission: 2000,
    });
    expect(pooledCommMap.get("012")).toEqual({
      totalServiceRevenue: 9000,
      totalServiceCommission: 3050,
      tips: 0,
      productCommission: 0,
      customRateCommission: 1050,
      customRateCommissions: { Extensions: 750, "Color Treatment": 300 },
      generalServiceCommission: 2000,
    });
    expectDerivedTotals(pooledCommMap.get("011")!);
    expectDerivedTotals(pooledCommMap.get("012")!);
  });

  it("pools general service commission, tips, and product commission together", () => {
    const commMap = buildCommMap([
      ["011", { totalServiceRevenue: 15000, totalServiceCommission: 4400, tips: 500, productCommission: 300, customRateCommission: 1200, customRateCommissions: { Extensions: 1200 }, generalServiceCommission: 3200 }],
      ["012", { totalServiceRevenue: 9000, totalServiceCommission: 1200, tips: 100, productCommission: 100, customRateCommission: 400, customRateCommissions: { "Color Treatment": 400 }, generalServiceCommission: 800 }],
    ]);
    const staffHurdles = buildPoolConfig([["011", ["012"]], ["012", ["011"]]]);

    const { pooledCommMap } = calculatePooledCommissionMap(commMap, staffHurdles);

    const expectedEach = {
      totalServiceRevenue: 12000,
      totalServiceCommission: 2800,
      tips: 300,
      productCommission: 200,
      customRateCommission: 800,
      customRateCommissions: { Extensions: 600, "Color Treatment": 200 },
      generalServiceCommission: 2000,
    };
    expect(pooledCommMap.get("011")).toEqual(expectedEach);
    expect(pooledCommMap.get("012")).toEqual(expectedEach);
    expectDerivedTotals(pooledCommMap.get("011")!);
    expectDerivedTotals(pooledCommMap.get("012")!);
  });

  it("leaves non-pooled staff unchanged", () => {
    const soloComm = { totalServiceRevenue: 5000, totalServiceCommission: 950, tips: 40, productCommission: 80, customRateCommission: 250, customRateCommissions: { Keratin: 250 }, generalServiceCommission: 700 };
    const commMap = buildCommMap([
      ["011", { totalServiceRevenue: 10000, totalServiceCommission: 4500, tips: 0, productCommission: 0, customRateCommission: 1500, customRateCommissions: { Extensions: 1500 }, generalServiceCommission: 3000 }],
      ["012", { totalServiceRevenue: 8000, totalServiceCommission: 1600, tips: 0, productCommission: 0, customRateCommission: 600, customRateCommissions: { "Color Treatment": 600 }, generalServiceCommission: 1000 }],
      ["099", soloComm],
    ]);
    const staffHurdles = buildPoolConfig([["011", ["012"]], ["012", ["011"]], ["099", undefined]]);

    const { pooledCommMap } = calculatePooledCommissionMap(commMap, staffHurdles);

    expect(pooledCommMap.get("099")).toEqual(soloComm);
  });

  it("ignores a staff member whose poolsWith array is empty", () => {
    const originalComm = { totalServiceRevenue: 10000, totalServiceCommission: 4500, tips: 0, productCommission: 0, customRateCommission: 1500, customRateCommissions: { Extensions: 1500 }, generalServiceCommission: 3000 };
    const commMap = buildCommMap([["011", originalComm]]);
    // buildPoolConfig with undefined produces no poolsWith property (treated as no pool)
    const staffHurdles = buildPoolConfig([["011", undefined]]);

    const { pooledCommMap } = calculatePooledCommissionMap(commMap, staffHurdles);

    expect(pooledCommMap.get("011")).toEqual(originalComm);
  });

  it("throws when a pool member is absent from commMap", () => {
    const commMap = buildCommMap([
      ["011", { totalServiceRevenue: 10000, totalServiceCommission: 4500, tips: 0, productCommission: 0, customRateCommission: 1500, customRateCommissions: { Extensions: 1500 }, generalServiceCommission: 3000 }],
    ]);
    const staffHurdles = buildPoolConfig([["011", ["999"]], ["999", ["011"]]]);

    expect(() => calculatePooledCommissionMap(commMap, staffHurdles)).toThrow(
      /No commMap entry for 999/,
    );
  });
});

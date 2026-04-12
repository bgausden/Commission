import assert from "node:assert";
import { Decimal } from "decimal.js";
import type { StaffHurdle } from "./IStaffHurdle.js";
import type {
  TCommComponents,
  TCommMap,
  TStaffHurdles,
  TStaffID,
} from "./types.js";
import { eqSet } from "./utility_functions.js";

function splitAmountAcrossMembers(
  amount: number,
  memberCount: number,
): number[] {
  if (memberCount <= 0) return [];

  const totalCents = amountToCents(amount);
  const baseShare = Math.trunc(totalCents / memberCount);
  const remainder = totalCents % memberCount;

  return Array.from({ length: memberCount }, (_value, index) => {
    const cents = baseShare + (index < remainder ? 1 : 0);
    return new Decimal(cents).dividedBy(100).toNumber();
  });
}

function toMoneyDecimal(value: number | string | Decimal): Decimal {
  return new Decimal(value);
}

function sumMoney(values: Iterable<number | string | Decimal>): number {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.plus(value);
  }
  return total.toDecimalPlaces(2).toNumber();
}

function sumCustomRateCommissions(
  customRateCommissions: TCommComponents["customRateCommissions"],
): number {
  return sumMoney(Object.values(customRateCommissions));
}

function amountToCents(amount: number): number {
  return toMoneyDecimal(amount).times(100).toDecimalPlaces(0).toNumber();
}

type PoolTotals = {
  totalServiceRevenue: number;
  tips: number;
  productCommission: number;
  generalServiceCommission: number;
};

export type PoolAggregate = {
  numericTotals: PoolTotals;
  customRateCommissions: Record<string, number>;
};

type PoolShares = {
  numericShares: {
    totalServiceRevenue: number[];
    tips: number[];
    productCommission: number[];
    generalServiceCommission: number[];
  };
  customRateShares: Record<string, number[]>;
};

export type PooledStaffEntry = {
  staffID: TStaffID;
  comm: TCommComponents;
};

export type PoolCalculationReport = {
  poolMembers: TStaffID[];
  aggregate: PoolAggregate;
  pooledEntries: PooledStaffEntry[];
};

function assertUniquePoolMembers(
  poolMembers: TStaffID[],
  context: string,
): void {
  assert(
    new Set(poolMembers).size === poolMembers.length,
    `${context} contains duplicate pool members: ${poolMembers.join(", ")}`,
  );
}

function assertDistributedShares(
  shares: number[],
  memberCount: number,
  expectedTotal: number,
  context: string,
): void {
  assert(
    shares.length === memberCount,
    `${context} produced ${shares.length} shares for ${memberCount} members.`,
  );
  assert(
    amountToCents(sumMoney(shares)) === amountToCents(expectedTotal),
    `${context} shares sum to ${sumMoney(shares)}, expected ${expectedTotal}.`,
  );
}

function getRequiredCommComponents(
  commMap: TCommMap,
  staffID: TStaffID,
  detail?: string,
): TCommComponents {
  const comm = commMap.get(staffID);
  assert(
    comm,
    detail
      ? `No commMap entry for ${staffID} ${detail}. This should never happen.`
      : `No commMap entry for ${staffID}. This should never happen.`,
  );
  return comm;
}

function getConfiguredPoolMembers(
  staffID: TStaffID,
  hurdle: StaffHurdle,
): TStaffID[] | null {
  if (!hurdle.poolsWith || hurdle.poolsWith.length === 0) {
    return null;
  }

  const poolMembers = [...hurdle.poolsWith, staffID];
  assertUniquePoolMembers(poolMembers, `Pooling config for ${staffID}`);
  return poolMembers.sort();
}

function collectPools(staffHurdle: TStaffHurdles): TStaffID[][] {
  const pools: TStaffID[][] = [];

  for (const [staffID, hurdle] of staffHurdle) {
    const poolMembers = getConfiguredPoolMembers(staffID, hurdle);
    if (!poolMembers) {
      continue;
    }

    let foundPoolMembers: TStaffID[] | undefined;
    for (const existingPool of pools) {
      if (!existingPool.includes(staffID)) {
        continue;
      }

      if (foundPoolMembers) {
        assert(
          eqSet(existingPool, foundPoolMembers),
          `${staffID} appears in multiple pool definitions.`,
        );
        continue;
      }

      foundPoolMembers = existingPool;
    }

    if (foundPoolMembers) {
      if (!eqSet(foundPoolMembers, poolMembers)) {
        throw new Error(
          `Pooling config for ${staffID} appears to be incorrect.`,
        );
      }
      continue;
    }

    pools.push(poolMembers);
  }

  return pools;
}

function aggregatePool(
  poolMembers: TStaffID[],
  commMap: TCommMap,
): PoolAggregate {
  let totalServiceRevenue = new Decimal(0);
  let tips = new Decimal(0);
  let productCommission = new Decimal(0);
  let generalServiceCommission = new Decimal(0);
  const customRateCommissions: Record<string, Decimal> = {};

  for (const poolMember of poolMembers) {
    const commMapElement = getRequiredCommComponents(commMap, poolMember);

    totalServiceRevenue = totalServiceRevenue.plus(
      commMapElement.totalServiceRevenue,
    );
    tips = tips.plus(commMapElement.tips);
    productCommission = productCommission.plus(
      commMapElement.productCommission,
    );
    generalServiceCommission = generalServiceCommission.plus(
      commMapElement.generalServiceCommission,
    );

    for (const [serviceName, amount] of Object.entries(
      commMapElement.customRateCommissions,
    )) {
      customRateCommissions[serviceName] = (
        customRateCommissions[serviceName] ?? new Decimal(0)
      ).plus(amount);
    }
  }

  const numericCustomRateCommissions: Record<string, number> = {};
  for (const [serviceName, amount] of Object.entries(customRateCommissions)) {
    numericCustomRateCommissions[serviceName] = amount
      .toDecimalPlaces(2)
      .toNumber();
  }

  return {
    numericTotals: {
      totalServiceRevenue: totalServiceRevenue.toDecimalPlaces(2).toNumber(),
      tips: tips.toDecimalPlaces(2).toNumber(),
      productCommission: productCommission.toDecimalPlaces(2).toNumber(),
      generalServiceCommission: generalServiceCommission
        .toDecimalPlaces(2)
        .toNumber(),
    },
    customRateCommissions: numericCustomRateCommissions,
  };
}

function splitPoolAggregate(
  aggregate: PoolAggregate,
  poolMembers: TStaffID[],
): PoolShares {
  const { numericTotals, customRateCommissions } = aggregate;
  const memberCount = poolMembers.length;
  const poolLabel = poolMembers.join(", ");

  const numericShares = {
    totalServiceRevenue: splitAmountAcrossMembers(
      numericTotals.totalServiceRevenue,
      memberCount,
    ),
    tips: splitAmountAcrossMembers(numericTotals.tips, memberCount),
    productCommission: splitAmountAcrossMembers(
      numericTotals.productCommission,
      memberCount,
    ),
    generalServiceCommission: splitAmountAcrossMembers(
      numericTotals.generalServiceCommission,
      memberCount,
    ),
  };

  assertDistributedShares(
    numericShares.totalServiceRevenue,
    memberCount,
    numericTotals.totalServiceRevenue,
    `totalServiceRevenue pool ${poolLabel}`,
  );
  assertDistributedShares(
    numericShares.tips,
    memberCount,
    numericTotals.tips,
    `tips pool ${poolLabel}`,
  );
  assertDistributedShares(
    numericShares.productCommission,
    memberCount,
    numericTotals.productCommission,
    `productCommission pool ${poolLabel}`,
  );
  assertDistributedShares(
    numericShares.generalServiceCommission,
    memberCount,
    numericTotals.generalServiceCommission,
    `generalServiceCommission pool ${poolLabel}`,
  );

  const customRateShares: Record<string, number[]> = {};
  for (const [serviceName, amount] of Object.entries(customRateCommissions)) {
    const shares = splitAmountAcrossMembers(amount, memberCount);
    assertDistributedShares(
      shares,
      memberCount,
      amount,
      `${serviceName} custom rate commission pool ${poolLabel}`,
    );
    customRateShares[serviceName] = shares;
  }

  return { numericShares, customRateShares };
}

function createPooledCustomRateCommissions(
  customRateShares: PoolShares["customRateShares"],
  index: number,
): TCommComponents["customRateCommissions"] {
  const pooledCustomRateCommissions: TCommComponents["customRateCommissions"] =
    {};

  for (const [serviceName, shares] of Object.entries(customRateShares)) {
    const share = shares[index];
    if (share !== 0) {
      pooledCustomRateCommissions[serviceName] = share;
    }
  }

  return pooledCustomRateCommissions;
}

function createPooledCommission(
  shares: PoolShares,
  index: number,
): TCommComponents {
  const customRateCommissions = createPooledCustomRateCommissions(
    shares.customRateShares,
    index,
  );
  const customRateCommission = sumCustomRateCommissions(customRateCommissions);
  const generalServiceCommission =
    shares.numericShares.generalServiceCommission[index];

  return {
    totalServiceRevenue: shares.numericShares.totalServiceRevenue[index],
    tips: shares.numericShares.tips[index],
    productCommission: shares.numericShares.productCommission[index],
    generalServiceCommission,
    customRateCommissions,
    customRateCommission,
    totalServiceCommission: sumMoney([
      generalServiceCommission,
      customRateCommission,
    ]),
  };
}

function applyPoolShares(
  commMap: TCommMap,
  poolMembers: TStaffID[],
  shares: PoolShares,
): PooledStaffEntry[] {
  return poolMembers.map((staffID, index) => {
    const pooledComm = createPooledCommission(shares, index);
    commMap.set(staffID, pooledComm);
    return { staffID, comm: pooledComm };
  });
}

function assertPoolAggregatePreserved(
  poolMembers: TStaffID[],
  aggregate: PoolAggregate,
  commMap: TCommMap,
): void {
  const pooledAggregate = aggregatePool(poolMembers, commMap);
  const poolLabel = poolMembers.join(", ");

  assert(
    amountToCents(pooledAggregate.numericTotals.totalServiceRevenue) ===
      amountToCents(aggregate.numericTotals.totalServiceRevenue),
    `Pooled totalServiceRevenue drifted for pool ${poolLabel}.`,
  );
  assert(
    amountToCents(pooledAggregate.numericTotals.tips) ===
      amountToCents(aggregate.numericTotals.tips),
    `Pooled tips drifted for pool ${poolLabel}.`,
  );
  assert(
    amountToCents(pooledAggregate.numericTotals.productCommission) ===
      amountToCents(aggregate.numericTotals.productCommission),
    `Pooled productCommission drifted for pool ${poolLabel}.`,
  );
  assert(
    amountToCents(pooledAggregate.numericTotals.generalServiceCommission) ===
      amountToCents(aggregate.numericTotals.generalServiceCommission),
    `Pooled generalServiceCommission drifted for pool ${poolLabel}.`,
  );
  assert(
    eqSet(
      Object.keys(pooledAggregate.customRateCommissions),
      Object.keys(aggregate.customRateCommissions),
    ),
    `Pooled custom rate commission services drifted for pool ${poolLabel}.`,
  );

  for (const [serviceName, amount] of Object.entries(
    aggregate.customRateCommissions,
  )) {
    assert(
      amountToCents(pooledAggregate.customRateCommissions[serviceName] ?? 0) ===
        amountToCents(amount),
      `${serviceName} pooled custom rate commission drifted for pool ${poolLabel}.`,
    );
  }
}

export function calculatePooledCommissionMap(
  commMap: TCommMap,
  staffHurdle: TStaffHurdles,
): { pooledCommMap: TCommMap; reports: PoolCalculationReport[] } {
  const pools = collectPools(staffHurdle);
  const pooledCommMap = new Map(commMap);
  const reports: PoolCalculationReport[] = [];

  for (const poolMembers of pools) {
    assert(poolMembers.length > 1, "Pool must contain at least 2 members.");
    assertUniquePoolMembers(poolMembers, `Pool ${poolMembers.join(", ")}`);
    const aggregate = aggregatePool(poolMembers, pooledCommMap);
    const shares = splitPoolAggregate(aggregate, poolMembers);
    const pooledEntries = applyPoolShares(pooledCommMap, poolMembers, shares);

    assertPoolAggregatePreserved(poolMembers, aggregate, pooledCommMap);
    reports.push({ poolMembers, aggregate, pooledEntries });
  }

  return { pooledCommMap, reports };
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStaffHurdleFromMap,
  isContractorForLookup,
  isPayViaTalenoxForLookup,
  lookupStaffHurdle,
} from "./utility_functions.js";
import type { StaffHurdle } from "./IStaffHurdle.js";
import { Option } from "./option.js";
import type { TStaffHurdles, TStaffID } from "./types.js";

vi.mock("./logging_functions.js", () => ({
  errorLogger: { error: vi.fn() },
  warnLogger: { warn: vi.fn() },
  debugLogger: { debug: vi.fn() },
  infoLogger: { info: vi.fn() },
}));

const mockStaffHurdles: Record<string, StaffHurdle> = {
  "012": {
    staffName: "Kate",
    baseRate: 0,
    hurdle1Level: 30000,
    hurdle1Rate: 0.11,
    contractor: false,
    payViaTalenox: true,
  },
  "019": {
    staffName: "Rex",
    baseRate: 0,
    hurdle1Level: 25000,
    hurdle1Rate: 0.12,
    contractor: true,
    payViaTalenox: false,
  },
};

function buildStaffHurdlesMap(
  entries: Record<string, StaffHurdle> = mockStaffHurdles,
): TStaffHurdles {
  return new Map(Object.entries(entries) as Array<[TStaffID, StaffHurdle]>);
}

describe("lookupStaffHurdle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns configured staff from the provided map", () => {
    const result = lookupStaffHurdle(
      buildStaffHurdlesMap(),
      "012",
      "explicit lookup test",
    );

    expect(Option.isSome(result.hurdle)).toBe(true);
  });

  it("throws when staff ID is missing", () => {
    expect(() =>
      lookupStaffHurdle(
        buildStaffHurdlesMap(),
        "999" as TStaffID,
        "explicit lookup test",
      ),
    ).toThrow(
      "Staff ID 999 found in explicit lookup test but is missing from staffHurdle.json",
    );
  });
});

describe("getStaffHurdleFromMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the configured hurdle for known staff", async () => {
    const { errorLogger, warnLogger } = await import("./logging_functions.js");
    const result = getStaffHurdleFromMap(
      buildStaffHurdlesMap(),
      "012",
      "commission calculation",
    );

    expect(Option.isSome(result)).toBe(true);
    expect(warnLogger.warn).not.toHaveBeenCalled();
    expect(errorLogger.error).not.toHaveBeenCalled();
  });

  it("logs fatal and rethrows for unknown staff", async () => {
    const { errorLogger } = await import("./logging_functions.js");

    expect(() =>
      getStaffHurdleFromMap(
        buildStaffHurdlesMap(),
        "999" as TStaffID,
        "contractor status check",
      ),
    ).toThrow(
      "Staff ID 999 found in contractor status check but is missing from staffHurdle.json",
    );

    expect(errorLogger.error).toHaveBeenCalledWith(
      "Fatal: Staff ID 999 found in contractor status check but is missing from staffHurdle.json",
    );
  });
});

describe("lookup-based predicates", () => {
  const getter = (staffID: TStaffID, context: string) =>
    getStaffHurdleFromMap(buildStaffHurdlesMap(), staffID, context);

  it("supports contractor checks without ambient globals", () => {
    expect(isContractorForLookup(getter, "012")).toBe(false);
    expect(isContractorForLookup(getter, "019")).toBe(true);
  });

  it("supports pay-via-Talenox checks without ambient globals", () => {
    expect(isPayViaTalenoxForLookup(getter, "012")).toBe(true);
    expect(isPayViaTalenoxForLookup(getter, "019")).toBe(false);
  });
});

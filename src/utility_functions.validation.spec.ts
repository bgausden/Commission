import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getStaffHurdle, isContractor } from "./utility_functions.js";
import { StaffHurdle } from "./IStaffHurdle.js";
import { Option } from "./option.js";

// Mock dependencies
vi.mock("node-config-ts", () => {
  const config = {
    missingStaffAreFatal: true, // Default - will override in tests
  };
  return { config };
});

vi.mock("./logging_functions.js", () => ({
  errorLogger: {
    error: vi.fn(),
  },
  warnLogger: {
    warn: vi.fn(),
  },
  debugLogger: {
    debug: vi.fn(),
  },
  infoLogger: {
    info: vi.fn(),
  },
}));

// Mock global staffHurdles
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
    contractor: false,
    payViaTalenox: true,
  },
  "000": {
    staffName: "Default",
    baseRate: 0,
    hurdle1Level: 20000,
    hurdle1Rate: 0.1,
    contractor: false,
    payViaTalenox: true,
  },
};

global.staffHurdles = new Map(
  Object.entries(mockStaffHurdles),
) as typeof global.staffHurdles;

describe("getStaffHurdle", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Ensure global staffHurdles is reset to original state
    global.staffHurdles = new Map(
      Object.entries(mockStaffHurdles),
    ) as typeof global.staffHurdles;
  });

  describe("when staff ID exists in staffHurdles", () => {
    it("should return the staff's configuration directly", () => {
      const result = getStaffHurdle("012", "test context");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value).toEqual(mockStaffHurdles["012"]);
        expect(result.value.staffName).toBe("Kate");
        expect(result.value.hurdle1Level).toBe(30000);
      }
    });

    it("should not log any warnings or errors", async () => {
      const { warnLogger, errorLogger } = await import(
        "./logging_functions.js"
      );

      getStaffHurdle("019", "test context");

      expect(warnLogger.warn).not.toHaveBeenCalled();
      expect(errorLogger.error).not.toHaveBeenCalled();
    });
  });

  describe("when staff ID is missing and missingStaffAreFatal is true", () => {
    beforeEach(async () => {
      const { config } = await import("node-config-ts");
      config.missingStaffAreFatal = true;
    });

    it("should throw an error with context", async () => {
      const { errorLogger } = await import("./logging_functions.js");

      expect(() => getStaffHurdle("999", "commission calculation")).toThrow(
        "Staff ID 999 found in commission calculation but is missing from staffHurdle.json",
      );

      expect(errorLogger.error).toHaveBeenCalledWith(
        "Fatal: Staff ID 999 found in commission calculation but is missing from staffHurdle.json",
      );
    });

    it("should not return default configuration", () => {
      expect(() => getStaffHurdle("888", "payroll processing")).toThrow();
    });
  });

  describe("context parameter usage", () => {
    it("should include context in fatal error messages", async () => {
      const { config } = await import("node-config-ts");
      config.missingStaffAreFatal = true;

      expect(() => getStaffHurdle("111", "Talenox API upload")).toThrow(
        /Talenox API upload/,
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty string staff ID", async () => {
      const { config } = await import("node-config-ts");
      config.missingStaffAreFatal = true;
      // ts-ignore to test runtime behavior with invalid input
      // @ts-ignore ts-2345
      expect(() => getStaffHurdle("", "edge case test")).toThrow();
    });

    it("should return same object reference for multiple calls with same ID", () => {
      const result1 = getStaffHurdle("012", "first call");
      const result2 = getStaffHurdle("012", "second call");

      expect(Option.isSome(result1) && Option.isSome(result2)).toBe(true);
      if (Option.isSome(result1) && Option.isSome(result2)) {
        expect(result1.value).toBe(result2.value); // Same underlying StaffHurdle reference
      }
    });
  });

  describe("integration with real usage patterns", () => {
    it("should work for commission calculation context", () => {
      const result = getStaffHurdle("012", "commission calculation");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.baseRate).toBeDefined();
        expect(result.value.hurdle1Level).toBeDefined();
        expect(result.value.hurdle1Rate).toBeDefined();
      }
    });

    it("should work for contractor status check context", () => {
      const result = getStaffHurdle("019", "contractor status check");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.contractor).toBeDefined();
        expect(typeof result.value.contractor).toBe("boolean");
      }
    });

    it("should work for Talenox payment check context", () => {
      const result = getStaffHurdle("012", "payroll Talenox check");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.payViaTalenox).toBeDefined();
        expect(typeof result.value.payViaTalenox).toBe("boolean");
      }
    });
  });
});

describe("isContractor", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    global.staffHurdles = new Map(
      Object.entries(mockStaffHurdles),
    ) as typeof global.staffHurdles;

    const { config } = await import("node-config-ts");
    config.missingStaffAreFatal = true;
  });

  it("should return contractor status for configured staff", () => {
    expect(isContractor("012")).toBe(false);
  });

  it("should use default staff configuration when non-fatal missing staff fallback is enabled", async () => {
    const { config } = await import("node-config-ts");
    config.missingStaffAreFatal = false;

    expect(isContractor("999")).toBe(false);
  });

  it("should throw when staff is missing and missingStaffAreFatal is enabled", () => {
    expect(() => isContractor("999")).toThrow(
      "Staff ID 999 found in contractor status check but is missing from staffHurdle.json",
    );
  });
});

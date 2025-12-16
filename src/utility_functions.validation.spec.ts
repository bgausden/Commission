import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getValidatedStaffHurdle } from "./utility_functions.js";
import { StaffHurdle } from "./IStaffHurdle.js";

// Mock dependencies
vi.mock("node-config-ts", () => ({
  config: {
    missingStaffAreFatal: true, // Default - will override in tests
  },
}));

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

global.staffHurdles = mockStaffHurdles;

describe("getValidatedStaffHurdle", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Ensure global staffHurdles is reset to original state
    global.staffHurdles = { ...mockStaffHurdles };
  });

  describe("when staff ID exists in staffHurdles", () => {
    it("should return the staff's configuration directly", () => {
      const result = getValidatedStaffHurdle("012", "test context");

      expect(result).toEqual(mockStaffHurdles["012"]);
      expect(result.staffName).toBe("Kate");
      expect(result.hurdle1Level).toBe(30000);
    });

    it("should not log any warnings or errors", async () => {
      const { warnLogger, errorLogger } = await import("./logging_functions.js");

      getValidatedStaffHurdle("019", "test context");

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

      expect(() => getValidatedStaffHurdle("999", "commission calculation")).toThrow(
        "Staff ID 999 found in commission calculation but is missing from staffHurdle.json",
      );

      expect(errorLogger.error).toHaveBeenCalledWith(
        "Fatal: Staff ID 999 found in commission calculation but is missing from staffHurdle.json",
      );
    });

    it("should not return default configuration", () => {
      expect(() => getValidatedStaffHurdle("888", "payroll processing")).toThrow();
    });
  });

  describe("when staff ID is missing and missingStaffAreFatal is false", () => {
    beforeEach(async () => {
      const { config } = await import("node-config-ts");
      config.missingStaffAreFatal = false;
    });

    it("should return default configuration with ID 000", () => {
      const result = getValidatedStaffHurdle("777", "Excel parsing");

      expect(result).toEqual(mockStaffHurdles["000"]);
      expect(result.staffName).toBe("Default");
    });

    it("should log a warning about using default", async () => {
      const { warnLogger } = await import("./logging_functions.js");

      getValidatedStaffHurdle("666", "Mindbody report");

      expect(warnLogger.warn).toHaveBeenCalledWith(
        "Staff ID 666 not in staffHurdle.json (Mindbody report). Using default ID 000.",
      );
    });

    it("should not log an error", async () => {
      const { errorLogger } = await import("./logging_functions.js");

      getValidatedStaffHurdle("555", "test");

      expect(errorLogger.error).not.toHaveBeenCalled();
    });
  });

  describe("when staff ID is missing and default 000 is also missing", () => {
    beforeEach(() => {
      // Remove default from global staffHurdles
      delete global.staffHurdles["000"];
    });

    afterEach(() => {
      // Restore default
      global.staffHurdles["000"] = mockStaffHurdles["000"];
    });

    it("should throw an error even when missingStaffAreFatal is false", async () => {
      const { config } = await import("node-config-ts");
      const { errorLogger } = await import("./logging_functions.js");
      config.missingStaffAreFatal = false;

      expect(() => getValidatedStaffHurdle("444", "safety check")).toThrow(
        "Default staff ID 000 is missing from staffHurdle.json. Cannot process staff 444.",
      );

      expect(errorLogger.error).toHaveBeenCalledWith(
        "Fatal: Default staff ID 000 is missing from staffHurdle.json. Cannot process staff 444.",
      );
    });

    it("should throw error regardless of missingStaffAreFatal setting", async () => {
      const { config } = await import("node-config-ts");

      // Test with true
      config.missingStaffAreFatal = true;
      expect(() => getValidatedStaffHurdle("333", "test")).toThrow();

      // Test with false
      config.missingStaffAreFatal = false;
      expect(() => getValidatedStaffHurdle("222", "test")).toThrow(/Default staff ID 000 is missing/);
    });
  });

  describe("context parameter usage", () => {
    it("should include context in fatal error messages", async () => {
      const { config } = await import("node-config-ts");
      config.missingStaffAreFatal = true;

      expect(() => getValidatedStaffHurdle("111", "Talenox API upload")).toThrow(/Talenox API upload/);
    });

    it("should include context in warning messages", async () => {
      const { config } = await import("node-config-ts");
      const { warnLogger } = await import("./logging_functions.js");
      config.missingStaffAreFatal = false;

      getValidatedStaffHurdle("100", "Excel row parsing");

      expect(warnLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Excel row parsing"));
    });

    it("should include context in default-missing error messages", async () => {
      const { config } = await import("node-config-ts");
      config.missingStaffAreFatal = false;
      delete global.staffHurdles["000"];

      expect(() => getValidatedStaffHurdle("099", "commission breakdown")).toThrow(/Cannot process staff 099/);

      // Restore default
      global.staffHurdles["000"] = mockStaffHurdles["000"];
    });
  });

  describe("edge cases", () => {
    it("should handle empty string staff ID", async () => {
      const { config } = await import("node-config-ts");
      config.missingStaffAreFatal = true;

      expect(() => getValidatedStaffHurdle("", "edge case test")).toThrow();
    });

    it("should handle staff ID with leading/trailing spaces", async () => {
      // Note: This tests current behavior - spaces are NOT trimmed
      // If staff IDs should be trimmed, add .trim() to the function
      const { config } = await import("node-config-ts");
      config.missingStaffAreFatal = false;

      const result = getValidatedStaffHurdle(" 012 ", "whitespace test");

      // Should fall back to default since " 012 " !== "012"
      expect(result).toEqual(mockStaffHurdles["000"]);
    });

    it("should return same object reference for multiple calls with same ID", () => {
      const result1 = getValidatedStaffHurdle("012", "first call");
      const result2 = getValidatedStaffHurdle("012", "second call");

      expect(result1).toBe(result2); // Same reference
    });
  });

  describe("integration with real usage patterns", () => {
    it("should work for commission calculation context", () => {
      const result = getValidatedStaffHurdle("012", "commission calculation");

      expect(result.baseRate).toBeDefined();
      expect(result.hurdle1Level).toBeDefined();
      expect(result.hurdle1Rate).toBeDefined();
    });

    it("should work for contractor status check context", () => {
      const result = getValidatedStaffHurdle("019", "contractor status check");

      expect(result.contractor).toBeDefined();
      expect(typeof result.contractor).toBe("boolean");
    });

    it("should work for Talenox payment check context", () => {
      const result = getValidatedStaffHurdle("012", "payroll Talenox check");

      expect(result.payViaTalenox).toBeDefined();
      expect(typeof result.payViaTalenox).toBe("boolean");
    });

    it("should work for Mindbody payroll report parsing context", async () => {
      const { config } = await import("node-config-ts");
      const { warnLogger } = await import("./logging_functions.js");
      config.missingStaffAreFatal = false;

      const result = getValidatedStaffHurdle("999", "Mindbody payroll report");

      expect(result).toEqual(mockStaffHurdles["000"]);
      expect(warnLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Mindbody payroll report"));
    });
  });
});

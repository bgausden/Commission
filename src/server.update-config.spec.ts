import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response } from "express";
import fs from "fs";
import path from "path";

// Mock modules before imports
vi.mock("./logging_functions.js", () => ({
  debugLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("/update-config endpoint", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let readFileSyncSpy: ReturnType<typeof vi.spyOn>;
  let writeFileSyncSpy: ReturnType<typeof vi.spyOn>;

  // Simulate the endpoint logic
  function updateConfigHandler(req: Request, res: Response) {
    try {
      const configPath = path.join(process.cwd(), "config/default.json");
      const data = fs.readFileSync(configPath, "utf8");
      const config = JSON.parse(data);
      
      config.missingStaffAreFatal = Boolean(req.body.missingStaffAreFatal);
      config.updateTalenox = Boolean(req.body.updateTalenox);
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
      res.status(200).json({ message: "Config updated successfully skipper" });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(500).json({ message: "Failed to update config" });
      }
      return res.status(500).json({ message: "Failed to update config" });
    }
  }

  beforeEach(() => {
    statusMock = vi.fn().mockReturnThis();
    jsonMock = vi.fn();

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    // Spy on fs functions and prevent real file I/O
    readFileSyncSpy = vi.spyOn(fs, "readFileSync").mockReturnValue("");
    writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful updates", () => {
    it("should update config with both values true", () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Config updated successfully skipper",
      });

      // Verify writeFileSync was called with updated config
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(true);
      expect(writtenConfig.PAYROLL_WB_FILENAME).toBe("test.xlsx");
    });

    it("should update config with both values false", () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
      mockRequest.body = {
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should update config with mixed values", () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: true,
      };

      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: false,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should preserve PAYROLL_WB_FILENAME", () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "important-file.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.PAYROLL_WB_FILENAME).toBe("important-file.xlsx");
    });
  });

  describe("boolean coercion", () => {
    beforeEach(() => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };
      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
    });

    it("should coerce string 'true' to boolean true", () => {
      mockRequest.body = {
        missingStaffAreFatal: "true",
        updateTalenox: "yes",
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(true);
    });

    it("should coerce empty string to boolean false", () => {
      mockRequest.body = {
        missingStaffAreFatal: "",
        updateTalenox: "",
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should coerce number 1 to boolean true, 0 to false", () => {
      mockRequest.body = {
        missingStaffAreFatal: 1,
        updateTalenox: 0,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should coerce undefined to boolean false", () => {
      mockRequest.body = {
        missingStaffAreFatal: undefined,
        updateTalenox: undefined,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should coerce null to boolean false", () => {
      mockRequest.body = {
        missingStaffAreFatal: null,
        updateTalenox: null,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should return 500 when readFileSync throws ENOENT error", () => {
      const error = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      readFileSyncSpy.mockImplementation(() => {
        throw error;
      });

      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Failed to update config",
      });
    });

    it("should return 500 when JSON.parse throws error", () => {
      readFileSyncSpy.mockReturnValue("invalid json {{{");

      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Failed to update config",
      });
    });

    it("should return 500 when writeFileSync throws error", () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
      writeFileSyncSpy.mockImplementation(() => {
        throw new Error("EACCES: permission denied");
      });

      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Failed to update config",
      });
    });

    it("should handle non-Error exceptions", () => {
      readFileSyncSpy.mockImplementation(() => {
        throw "String error";
      });

      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Failed to update config",
      });
    });
  });

  describe("edge cases", () => {
    beforeEach(() => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };
      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
    });

    it("should handle empty request body", () => {
      mockRequest.body = {};

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      // Both should be false due to Boolean(undefined) === false
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should handle partial request body - only missingStaffAreFatal", () => {
      mockRequest.body = {
        missingStaffAreFatal: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(false); // undefined -> false
    });

    it("should handle partial request body - only updateTalenox", () => {
      mockRequest.body = {
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false); // undefined -> false
      expect(writtenConfig.updateTalenox).toBe(true);
    });

    it("should format JSON with 4-space indentation", () => {
      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      // Check that it has proper indentation
      expect(writtenData).toContain('    "PAYROLL_WB_FILENAME"');
      expect(writtenData).toContain('    "missingStaffAreFatal"');
      expect(writtenData).toContain('    "updateTalenox"');
    });
  });

  describe("file system operations", () => {
    it("should read from correct config file path", () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(readFileSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining("config/default.json"),
        "utf8"
      );
    });

    it("should write to correct config file path", () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      readFileSyncSpy.mockReturnValue(JSON.stringify(existingConfig));
      mockRequest.body = {
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      updateConfigHandler(mockRequest as Request, mockResponse as Response);

      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining("config/default.json"),
        expect.any(String)
      );
    });
  });
});

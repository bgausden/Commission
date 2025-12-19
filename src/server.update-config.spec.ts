import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import fs from "node:fs";

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
  let readFileSyncSpy: ReturnType<typeof vi.spyOn>;
  let writeFileSyncSpy: ReturnType<typeof vi.spyOn>;

  let configFileContents = "";
  let configReadError: unknown | undefined;
  let configWriteError: unknown | undefined;

  let server: Server;
  let baseUrl: string;

  async function postUpdateConfig(
    body: unknown,
  ): Promise<{ status: number; json: unknown; text: string }> {
    const response = await fetch(`${baseUrl}/update-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: response.status, json, text };
  }

  beforeEach(async () => {
    // Reset all mocks first so we don't wipe out mockReturnValue/mockImplementation set below.
    vi.clearAllMocks();

    // Import after mocks are set up (Vitest ESM) so mocked modules apply.
    const { createApp } = await import("./serverApp.js");
    const app = createApp();
    server = app.listen(0);
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Failed to acquire ephemeral port for test server");
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;

    configFileContents = "";
    configReadError = undefined;
    configWriteError = undefined;

    const isDefaultConfigPath = (p: unknown) =>
      typeof p === "string" && /config[\\/]+default\.json$/.test(p);
    const realReadFileSync = fs.readFileSync.bind(fs);
    const realWriteFileSync = fs.writeFileSync.bind(fs);

    // Spy on fs functions and prevent real file I/O
    readFileSyncSpy = vi.spyOn(fs, "readFileSync").mockImplementation(((
      pathLike: unknown,
      ...rest: unknown[]
    ) => {
      if (isDefaultConfigPath(pathLike)) {
        if (configReadError !== undefined) {
          throw configReadError;
        }
        return configFileContents;
      }
      // Allow other reads (node modules, encodings, etc.) to behave normally.
      return (realReadFileSync as unknown as (...args: unknown[]) => unknown)(
        pathLike,
        ...rest,
      );
    }) as unknown as typeof fs.readFileSync) as unknown as ReturnType<
      typeof vi.spyOn
    >;

    writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(((
      pathLike: unknown,
      data: unknown,
      ...rest: unknown[]
    ) => {
      if (isDefaultConfigPath(pathLike)) {
        if (configWriteError !== undefined) {
          throw configWriteError;
        }
        return;
      }
      return (realWriteFileSync as unknown as (...args: unknown[]) => unknown)(
        pathLike,
        data,
        ...rest,
      );
    }) as unknown as typeof fs.writeFileSync) as unknown as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe("successful updates", () => {
    it("should update config with both values true", async () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      configFileContents = JSON.stringify(existingConfig);
      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(200);
      expect(response.json).toEqual({
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

    it("should update config with both values false", async () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: true,
        updateTalenox: true,
      };

      configFileContents = JSON.stringify(existingConfig);
      const response = await postUpdateConfig({
        missingStaffAreFatal: false,
        updateTalenox: false,
      });

      expect(response.status).toBe(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should update config with mixed values", async () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: true,
      };

      configFileContents = JSON.stringify(existingConfig);
      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: false,
      });

      expect(response.status).toBe(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should preserve PAYROLL_WB_FILENAME", async () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "important-file.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      configFileContents = JSON.stringify(existingConfig);
      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(200);

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
      configFileContents = JSON.stringify(existingConfig);
    });

    it("should coerce string 'true' to boolean true", async () => {
      const response = await postUpdateConfig({
        missingStaffAreFatal: "true",
        updateTalenox: "yes",
      });

      expect(response.status).toBe(200);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(true);
    });

    it("should coerce empty string to boolean false", async () => {
      const response = await postUpdateConfig({
        missingStaffAreFatal: "",
        updateTalenox: "",
      });

      expect(response.status).toBe(200);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should coerce number 1 to boolean true, 0 to false", async () => {
      const response = await postUpdateConfig({
        missingStaffAreFatal: 1,
        updateTalenox: 0,
      });

      expect(response.status).toBe(200);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should coerce undefined to boolean false", async () => {
      const response = await postUpdateConfig({
        missingStaffAreFatal: undefined,
        updateTalenox: undefined,
      });

      expect(response.status).toBe(200);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should coerce null to boolean false", async () => {
      const response = await postUpdateConfig({
        missingStaffAreFatal: null,
        updateTalenox: null,
      });

      expect(response.status).toBe(200);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should fall back to default config when config file is missing (ENOENT)", async () => {
      const error = new Error(
        "ENOENT: no such file or directory",
      ) as NodeJS.ErrnoException;
      error.code = "ENOENT";

      configReadError = error;

      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(200);
      expect(response.json).toEqual({
        message: "Config updated successfully skipper",
      });

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.PAYROLL_WB_FILENAME).toBe("payroll.xlsx");
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(true);
    });

    it("should return 500 when JSON.parse throws error", async () => {
      configFileContents = "invalid json {{{";

      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(500);
      expect(response.json).toEqual({ message: "Failed to update config" });
    });

    it("should return 500 when writeFileSync throws error", async () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      configFileContents = JSON.stringify(existingConfig);
      configWriteError = new Error("EACCES: permission denied");

      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(500);
      expect(response.json).toEqual({ message: "Failed to update config" });
    });

    it("should handle non-Error exceptions", async () => {
      configReadError = "String error";

      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(500);
      expect(response.json).toEqual({ message: "Failed to update config" });
    });
  });

  describe("edge cases", () => {
    beforeEach(() => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };
      configFileContents = JSON.stringify(existingConfig);
    });

    it("should handle empty request body", async () => {
      const response = await postUpdateConfig({});

      expect(response.status).toBe(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      // Both should be false due to Boolean(undefined) === false
      expect(writtenConfig.missingStaffAreFatal).toBe(false);
      expect(writtenConfig.updateTalenox).toBe(false);
    });

    it("should handle partial request body - only missingStaffAreFatal", async () => {
      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
      });

      expect(response.status).toBe(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(true);
      expect(writtenConfig.updateTalenox).toBe(false); // undefined -> false
    });

    it("should handle partial request body - only updateTalenox", async () => {
      const response = await postUpdateConfig({
        updateTalenox: true,
      });

      expect(response.status).toBe(200);
      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenData);
      expect(writtenConfig.missingStaffAreFatal).toBe(false); // undefined -> false
      expect(writtenConfig.updateTalenox).toBe(true);
    });

    it("should format JSON with 4-space indentation", async () => {
      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(200);

      const writtenData = writeFileSyncSpy.mock.calls[0][1] as string;
      // Check that it has proper indentation
      expect(writtenData).toContain('    "PAYROLL_WB_FILENAME"');
      expect(writtenData).toContain('    "missingStaffAreFatal"');
      expect(writtenData).toContain('    "updateTalenox"');
    });
  });

  describe("file system operations", () => {
    it("should read from correct config file path", async () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      configFileContents = JSON.stringify(existingConfig);
      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(200);
      expect(readFileSyncSpy.mock.calls[0][0]).toMatch(
        /config[\\/]+default\.json$/,
      );
      expect(readFileSyncSpy.mock.calls[0][1]).toBe("utf8");
    });

    it("should write to correct config file path", async () => {
      const existingConfig = {
        PAYROLL_WB_FILENAME: "test.xlsx",
        missingStaffAreFatal: false,
        updateTalenox: false,
      };

      configFileContents = JSON.stringify(existingConfig);
      const response = await postUpdateConfig({
        missingStaffAreFatal: true,
        updateTalenox: true,
      });

      expect(response.status).toBe(200);

      expect(writeFileSyncSpy.mock.calls[0][0]).toMatch(
        /config[\\/]+default\.json$/,
      );
      expect(typeof writeFileSyncSpy.mock.calls[0][1]).toBe("string");
    });
  });
});

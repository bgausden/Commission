import { describe, expect, it } from "vitest";
import {
  expandHomeDirPath,
  getMissingGoogleDriveEnvVars,
} from "./gdrive_functions.js";

describe("getMissingGoogleDriveEnvVars", () => {
  it("returns both required vars when neither is set", () => {
    const result = getMissingGoogleDriveEnvVars({});

    expect(result.sort()).toEqual(
      ["GDRIVE_SERVICE_ACCOUNT_KEY", "GDRIVE_TALENOX_FOLDER_ID"].sort(),
    );
  });

  it("returns only missing vars", () => {
    const result = getMissingGoogleDriveEnvVars({
      GDRIVE_SERVICE_ACCOUNT_KEY: "/tmp/service-account.json",
      GDRIVE_TALENOX_FOLDER_ID: "",
    });

    expect(result).toEqual(["GDRIVE_TALENOX_FOLDER_ID"]);
  });

  it("returns empty array when both vars are present", () => {
    const result = getMissingGoogleDriveEnvVars({
      GDRIVE_SERVICE_ACCOUNT_KEY: "/tmp/service-account.json",
      GDRIVE_TALENOX_FOLDER_ID: "folder-id",
    });

    expect(result).toEqual([]);
  });
});

describe("expandHomeDirPath", () => {
  it("expands Unix-style home prefix", () => {
    const expanded = expandHomeDirPath("~/.secrets/key.json");

    expect(expanded).not.toBe("~/.secrets/key.json");
    expect(expanded.replaceAll("\\", "/").endsWith(".secrets/key.json")).toBe(
      true,
    );
  });

  it("expands Windows-style home prefix", () => {
    const expanded = expandHomeDirPath("~\\.secrets\\key.json");

    expect(expanded).not.toBe("~\\.secrets\\key.json");
    expect(expanded.replaceAll("\\", "/").endsWith(".secrets/key.json")).toBe(
      true,
    );
  });

  it("leaves non-home paths untouched", () => {
    const asIs = "C:\\secrets\\key.json";

    expect(expandHomeDirPath(asIs)).toBe(asIs);
  });
});

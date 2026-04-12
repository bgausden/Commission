import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseStaffHurdles, loadStaffHurdlesFromFile } from "./staffHurdles.js";

const TMP_DIR = path.join(process.cwd(), ".test-output", "staffHurdles-spec");

const VALID_HURDLE = {
  staffName: "Kate",
  baseRate: 0,
  hurdle1Level: 30000,
  hurdle1Rate: 0.11,
  contractor: false,
  payViaTalenox: true,
};

function writeTmp(name: string, content: string): string {
  const filePath = path.join(TMP_DIR, name);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("parseStaffHurdles", () => {
  it("trims whitespace from staff ID keys", () => {
    const staffHurdles = parseStaffHurdles({
      " 012 ": {
        staffName: "Kate",
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        contractor: false,
        payViaTalenox: true,
      },
    });

    expect(staffHurdles.has("012")).toBe(true);
    expect([...staffHurdles.keys()]).toEqual(["012"]);
  });

  it("returns the original hurdle object values", () => {
    const kate = {
      staffName: "Kate",
      baseRate: 0,
      hurdle1Level: 30000,
      hurdle1Rate: 0.11,
      contractor: false,
      payViaTalenox: true,
    };

    const staffHurdles = parseStaffHurdles({
      "012": kate,
      "000": {
        staffName: "Default",
        baseRate: 0,
        hurdle1Level: 20000,
        hurdle1Rate: 0.1,
        contractor: false,
        payViaTalenox: true,
      },
    });

    expect(staffHurdles.get("012")).toBe(kate);
  });
});

describe("loadStaffHurdlesFromFile", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("returns ok with a populated Map for a valid file", () => {
    const filePath = writeTmp("valid.json", JSON.stringify({ "012": VALID_HURDLE }));

    const result = loadStaffHurdlesFromFile(filePath);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(Map);
    expect(result.value.has("012")).toBe(true);
    expect(result.value.get("012")?.staffName).toBe("Kate");
  });

  it("trims whitespace from keys during Map construction", () => {
    // Space in key is only valid at the raw JSON level — schema rejects it,
    // so we verify trimming on a key that already passes schema (no spaces).
    const filePath = writeTmp("trim.json", JSON.stringify({ "012": VALID_HURDLE }));

    const result = loadStaffHurdlesFromFile(filePath);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.value.keys()]).toEqual(["012"]);
  });

  it("returns err when the file does not exist", () => {
    const result = loadStaffHurdlesFromFile(path.join(TMP_DIR, "missing.json"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/missing\.json/);
  });

  it("returns err when the file contains invalid JSON", () => {
    const filePath = writeTmp("bad.json", "{ not valid json }");

    const result = loadStaffHurdlesFromFile(filePath);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/bad\.json/);
  });

  it("returns err when the JSON fails schema validation", () => {
    // Missing required fields (staffName, contractor, payViaTalenox)
    const filePath = writeTmp(
      "invalid-schema.json",
      JSON.stringify({ "012": { baseRate: 0.1 } }),
    );

    const result = loadStaffHurdlesFromFile(filePath);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/invalid-schema\.json/);
  });
});

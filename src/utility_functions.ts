import { Configuration as l4JSConfiguration } from "log4js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { errorLogger } from "./logging_functions.js";
import type { TStaffHurdles, TStaffID } from "./types.js";
import assert from "node:assert";
import { StaffHurdle } from "./IStaffHurdle.js";
import { Option } from "./option.js";

export interface StaffHurdleLookupResult {
  hurdle: Option<StaffHurdle>;
}

export type StaffHurdleGetter = (
  staffID: TStaffID,
  context: string,
) => Option<StaffHurdle>;

export function checkRate(rate: unknown): boolean {
  if (typeof rate === "number") {
    if (0 <= rate && rate <= 1) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export function stripToNumeric(n: unknown): number {
  const numericOnly = /[^0-9.-]+/g;
  let x = 0;
  if (typeof n === "string") {
    // strip out everything except 0-9, "." and "-"
    x = parseFloat(n.replace(numericOnly, ""));
    if (isNaN(x)) {
      x = 0;
    }
  } else if (typeof n === "number") {
    x = n;
  }
  return x;
}

/**
 * Pure staff hurdle lookup policy.
 * Missing staff IDs are always fatal.
 */
export function lookupStaffHurdle(
  staffHurdles: TStaffHurdles,
  staffID: TStaffID,
  context: string,
): StaffHurdleLookupResult {
  const hurdle = staffHurdles.get(staffID);
  if (hurdle) {
    return { hurdle: Option.some(hurdle) };
  }

  const message = `Staff ID ${staffID} found in ${context} but is missing from staffHurdle.json`;
  throw new Error(message);
}

export function getStaffHurdleFromMap(
  staffHurdles: TStaffHurdles,
  staffID: TStaffID,
  context: string,
): Option<StaffHurdle> {
  try {
    const result = lookupStaffHurdle(staffHurdles, staffID, context);
    return result.hurdle;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorLogger.error(`Fatal: ${message}`);
    throw error;
  }
}

export function isPayViaTalenoxForLookup(
  getStaffHurdleForContext: StaffHurdleGetter,
  staffID: TStaffID,
): boolean {
  const sh = getStaffHurdleForContext(staffID, "payroll Talenox check");
  return sh.fold(
    (sh) => (sh.payViaTalenox ? true : false),
    () => {
      const message = `staffHurdle for staffID ${staffID} is missing. Cannot determine payViaTalenox.`;
      errorLogger.error(message);
      throw new Error(message);
    },
  );
}

export function eqSet(as: unknown[], bs: unknown[]): boolean {
  if (as.length !== bs.length) return false;
  for (const a of as) if (!bs.includes(a)) return false;
  return true;
}

export function isContractorForLookup(
  getStaffHurdleForContext: StaffHurdleGetter,
  staffID: TStaffID,
): boolean {
  const sh = getStaffHurdleForContext(staffID, "contractor status check");
  return sh.fold(
    (sh) => sh.contractor,
    () => {
      const message = `staffHurdle for staffID ${staffID} is missing 'contractor' key. Aborting.`;
      errorLogger.error(message);
      throw new Error(message);
    },
  );
}

export function assertLog4JsConfig(
  config: unknown,
): asserts config is l4JSConfiguration {
  if (
    typeof config === "object" &&
    !!config &&
    ("appenders" in config || "categories" in config)
  ) {
    return;
  } else {
    throw new Error("Failed to validate provided log4JSConfig");
  }
}

/**
 * Checks if the given directory path is valid.
 *
 * This function verifies if the specified path exists and is a directory.
 *
 * @param dir - The directory path to validate.
 * @returns `true` if the path exists and is a directory, otherwise `false`.
 */
export function isValidDirectory(dir: string): boolean {
  return existsSync(dir) && statSync(dir).isDirectory();
}

export function loadJsonFromFile<T>(filepath: string): T {
  const fileContent = readFileSync(filepath, "utf-8");
  return JSON.parse(fileContent) as T;
}

export function isValidStaffID(staffID: unknown): asserts staffID is TStaffID {
  if (typeof staffID !== "string" || !/^[0-9]{3}$/.test(staffID)) {
    throw new assert.AssertionError({
      message: `Invalid staffID: ${staffID}`,
      expected: "string of 3 digits",
      actual: staffID,
    });
  }
}

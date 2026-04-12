import { type TStaffHurdles, type TStaffID, type Result, ok, err } from "./types.js";
import { loadJsonFromFile } from "./utility_functions.js";
import { DEFAULT_STAFF_HURDLES_FILE } from "./constants.js";
import { StaffHurdle } from "./IStaffHurdle.js";
import { staffHurdleSchema } from "./staffHurdleSchema.js";

export function parseStaffHurdles(
  rawData: Record<string, StaffHurdle>,
): TStaffHurdles {
  const staffHurdles = new Map<TStaffID, StaffHurdle>();
  for (const [key, value] of Object.entries(rawData)) {
    const trimmedKey = key.trim() as TStaffID;
    staffHurdles.set(trimmedKey, value);
  }

  return staffHurdles;
}

export function loadStaffHurdlesFromFile(
  filePath = DEFAULT_STAFF_HURDLES_FILE,
): Result<TStaffHurdles> {
  let rawData: unknown;
  try {
    rawData = loadJsonFromFile<unknown>(filePath);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`Failed to read staff hurdle file '${filePath}': ${message}`);
  }

  const parseResult = staffHurdleSchema.safeParse(rawData);
  if (!parseResult.success) {
    return err(
      `Invalid staff hurdle config in '${filePath}': ${parseResult.error.message}`,
    );
  }

  return ok(parseStaffHurdles(parseResult.data as Record<string, StaffHurdle>));
}

import { type TStaffHurdles, type TStaffID } from "./types.js";
import { loadJsonFromFile } from "./utility_functions.js";
import { DEFAULT_STAFF_HURDLES_FILE } from "./constants.js";
import { StaffHurdle } from "./IStaffHurdle.js";

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

export function loadStaffHurdles(
  path = DEFAULT_STAFF_HURDLES_FILE,
): TStaffHurdles {
  const rawData = loadJsonFromFile<Record<string, StaffHurdle>>(path);
  const staffHurdles = parseStaffHurdles(rawData);

  global.staffHurdles = staffHurdles;
  return staffHurdles;
}

import { type TStaffHurdles } from "./types.js";
import { loadJsonFromFile } from "./utility_functions.js";
import { DEFAULT_STAFF_HURDLES_FILE } from "./constants.js";
import "./globals.js"; // Import global type declarations

export function loadStaffHurdles(
  path = DEFAULT_STAFF_HURDLES_FILE,
): TStaffHurdles {
  const loadedStaffHurdles = loadJsonFromFile<TStaffHurdles>(path);
  staffHurdles = loadedStaffHurdles;
  return staffHurdles;
}

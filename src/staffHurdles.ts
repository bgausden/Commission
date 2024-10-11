import { type TStaffHurdles } from './types.js'
import { loadJsonFromFile } from './utility_functions.js'
import { DEFAULT_STAFF_HURDLES_FILE } from './constants.js'

export function loadStaffHurdles(
  path = DEFAULT_STAFF_HURDLES_FILE
): TStaffHurdles {
  const staffHurdles = loadJsonFromFile<TStaffHurdles>(path)
  global.staffHurdles = staffHurdles
  return staffHurdles
}

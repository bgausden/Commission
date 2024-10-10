import { type StaffHurdle } from './IStaffHurdle.js'
import { loadJsonFromFile } from './utility_functions.js'

export function loadStaffHurdle() {
  staffHurdle = loadJsonFromFile<StaffHurdle>('./dist/staffHurdle.json')
}

export declare var staffHurdle: StaffHurdle

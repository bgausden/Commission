

import staffHurdle from "./staffHurdle.json";
import {
    TStaffID,
    TStaffHurdles
} from "./types.js";
import { defaultStaffID } from "./index.js";

export function checkRate(rate: unknown): boolean {
    if (typeof rate === "number") {
        if (0 <= rate && rate <= 1) {
            return true;
        }
        else {
            return false;
        }
    }
    else {
        return false;
    }
}

export function stripToNumeric(n: unknown): number {
    const numericOnly = /[^0-9.-]+/g;
    let x: number;
    if (typeof n === "string") {
        // strip out everything except 0-9, "." and "-"
        x = parseFloat(n.replace(numericOnly, ""));
        if (isNaN(x)) {
            x = 0;
        }
    }
    if (typeof n === "number") {
        x = n;
    }
    else {
        x = 0;
    }
    return x;
}

export function isPayViaTalenox(staffID: TStaffID): boolean {
    return (staffHurdle as TStaffHurdles)[staffID].payViaTalenox ? true : false;
}

export function eqSet(as: unknown[], bs: unknown[]): boolean {
    if (as.length !== bs.length)
        return false;
    for (const a of as)
        if (!bs.includes(a))
            return false;
    return true;
}

export function isContractor(staffID: TStaffID): boolean {
    let isContractor = false
    if (!(staffHurdle as TStaffHurdles)[staffID]) { staffID = defaultStaffID }
    if (Object.keys((staffHurdle as TStaffHurdles)[staffID]).indexOf("contractor")) {
        isContractor = (staffHurdle as TStaffHurdles)[staffID].contractor ? true : false
    }
    return isContractor
}
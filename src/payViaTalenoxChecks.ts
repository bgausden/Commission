import { config } from "node-config-ts";
import { TTalenoxInfoStaffMap } from "./types.js";
import { isPayViaTalenox, isContractor } from "./utility_functions.js";
import { warnLogger, errorLogger } from "./logging_functions.js";
import { STATUS, STATUS_OK, STATUS_ERROR, STATUS_WARN } from "./constants.js";

export function payViaTalenoxChecks(staffID: string, rowIndex: number, staffName: string, talenoxStaff: TTalenoxInfoStaffMap): { status: STATUS; message: string } {
    let text: string;
    const inTalenox = (talenoxStaff.get(staffID) !== undefined);
    if (isPayViaTalenox(staffID) && !inTalenox) {
        text = `${staffID} ${staffName} in MB Payroll Report line ${rowIndex} not in Talenox.`;
        if (config.missingStaffAreFatal) {
            errorLogger.error("Fatal: " + text);
            throw new Error("Fatal: " + text);
        } else {
            warnLogger.warn("Warning: " + text);
            return { status: STATUS_ERROR, message: text };
        }
    }

    if (!isContractor(staffID) && !isPayViaTalenox(staffID)) {
        text = `Warn: ${staffID} ${staffName} is not a contractor, and is not in Talenox.`;
        warnLogger.warn(text);
        return { status: STATUS_WARN, message: text };
    }

    if (isContractor(staffID) && inTalenox) {
        text = `Warn: ${staffID} ${staffName} is a contractor, and is in Talenox.`;
        warnLogger.warn(text);
        return { status: STATUS_WARN, message: text };
    }

    return { status: STATUS_OK, message: "" };
}

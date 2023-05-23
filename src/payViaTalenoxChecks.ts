import { config } from "node-config-ts";
import { Status, STATUS_ERROR, STATUS_OK, STATUS_WARN } from "./constants.js";
import { errorLogger, warnLogger } from "./logging_functions.js";
import { TTalenoxInfoStaffMap } from "./types.js";
import { isContractor, isPayViaTalenox } from "./utility_functions.js";

export function payViaTalenoxChecks(staffID: string, rowIndex: number, staffName: string, talenoxStaff: TTalenoxInfoStaffMap): { status: Status; message: string } {
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

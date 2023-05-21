import { config } from "node-config-ts";
import { TTalenoxInfoStaffMap } from "./types.js";
import { createPayroll, uploadAdHocPayments } from "./talenox_functions.js";
import { errorLogger, debugLogger } from "./logging_functions.js";

export async function pushCommissionToTalenox(talenoxStaff: TTalenoxInfoStaffMap, payments: import("./TalenoxPayment").TalenoxPayment[]) {
    debugLogger.debug(`Requesting new payroll payment creation from Talenox`);
    const createPayrollResult = await createPayroll(talenoxStaff);
    debugLogger.debug(`New payroll payment is created in Talenox.`);
    if (createPayrollResult[1]) {
        debugLogger.debug(`OK: ${createPayrollResult[1].message}`);
    } else {
        if (createPayrollResult[0]) {
            errorLogger.error(`Failed to create payroll payment for ${config.PAYROLL_MONTH}: ${createPayrollResult[0].message}`);
        }

        else
            errorLogger.error(`Failed to create payroll payment for ${config.PAYROLL_MONTH}: no reason given by Talenox API`);
    }
    debugLogger.debug(`Pushing ad-hoc payments into new payroll`);
    const uploadAdHocResult = await uploadAdHocPayments(talenoxStaff, payments);
    debugLogger.debug(`Pushing ad-hoc payments is complete`);
    if (uploadAdHocResult[1]) {
        debugLogger.debug(`OK: ${uploadAdHocResult[1].message}`);
    } else {
        if (uploadAdHocResult[0]) {
            errorLogger.error(`Failed: ${uploadAdHocResult[0].message}`);
        }
        else
            errorLogger.error("Failed: Unknown reason");
    }
}

import { CommComponents } from "./types.js";
import { isContractor } from "./utility_functions.js";
import { contractorLogger, commissionLogger } from "./logging_functions.js";
import { fws32Left, fws12RightHKD, fws12Right } from "./string_functions.js";

export function logCommission(staffID: string, commComponents: CommComponents) {
    if (!isContractor(staffID)) {
        commissionLogger.info(fws32Left("General Service Commission:"), fws12RightHKD(commComponents.generalServiceCommission));
        commissionLogger.info(fws32Left("Custom Rate Service Commission:"), fws12RightHKD(commComponents.customRateCommission));
        commissionLogger.info(fws32Left("Product Commission:"), fws12RightHKD(commComponents.productCommission));
        commissionLogger.info(fws32Left(`Tips:`), fws12RightHKD(commComponents.tips));
        commissionLogger.info(fws32Left(''), fws12Right('------------'));
        commissionLogger.info(
            fws32Left(`Total Payable`),
            fws12RightHKD(commComponents.customRateCommission +
                commComponents.generalServiceCommission +
                commComponents.productCommission +
                commComponents.tips)
        );
    } else {
        contractorLogger.info(fws32Left("General Service Commission:"), fws12RightHKD(commComponents.generalServiceCommission));
        contractorLogger.info(fws32Left("Custom Rate Service Commission:"), fws12RightHKD(commComponents.customRateCommission));
        contractorLogger.info(fws32Left("Product Commission:"), fws12RightHKD(commComponents.productCommission));
        contractorLogger.info(fws32Left(`Tips:`), fws12RightHKD(commComponents.tips));
        contractorLogger.info(fws32Left(''), fws12Right('------------'));
        contractorLogger.info(
            fws32Left(`Total Payable`),
            fws12RightHKD(commComponents.customRateCommission +
                commComponents.generalServiceCommission +
                commComponents.productCommission +
                commComponents.tips)
        );
    }
}

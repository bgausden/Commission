import { CommComponents } from "./types.js";
import { TIPS_FOR, COMM_FOR } from "./constants.js";
import { isNumber } from "./utility_functions.js";

export function getTipsOrProductCommissionAmounts(currentRow: unknown[], payComponent: string, commComponents: CommComponents) {
    const maxRowIndex = currentRow.length - 1; // row is zero indexed
    const value = currentRow[maxRowIndex]
    if (!isNumber(value)) { return commComponents }
    if (payComponent === TIPS_FOR) {
        commComponents.tips = value;
    }
    if (payComponent === COMM_FOR) {
        commComponents.productCommission = value;
    }
    return commComponents
}

import { StaffInfo } from "./IStaffInfo";
import { errorLogger, infoLogger } from "./logging_functions.js";
import { STAFF_ID_HASH } from "./constants.js";
import { isString } from "./utility_functions.js";

/* This function searches the worksheet for a row with a cell that contains "Staff ID#:"
    It then extracts the staff ID and name from that cell.
    The staff ID is added to the serviceCommMap and the commComponents map along with the
    staff's first and last name.
    The first column should contain a string similar to LastName, FirstName Staff ID #: StaffID
    If the staff ID cannot be found or the cell is blank, null is returned
 */
/**
 *
 * @param sheet
 * @param idRow
 * @returns
 */
export function getStaffIDAndName(sheet: unknown[][], idRow: number): StaffInfo | undefined {
    const firstNameIndex = 1;
    const lastNameIndex = 0;
    const staffNameIndex = 0;
    const staffIDIndex = 1;
    const testString = sheet[idRow][staffNameIndex];
    if (!isString(testString)) {
        infoLogger.info(`getStaffIDAndName: First cell of row ${`idRow`} does not contain text`);
        return undefined;
    }
    const regex = new RegExp("^.*,.*" + STAFF_ID_HASH);
    if (!regex.test(testString)) { return undefined; } // if the cell does not contain "Staff ID #:", return null
    const staffInfo = testString.split(STAFF_ID_HASH);
    if (staffInfo[staffIDIndex].trim() === "") {
        errorLogger.error(getMissingStaffIDMessage(staffInfo[staffNameIndex]));
        throw new Error(getMissingStaffIDMessage(staffInfo[staffNameIndex]));
    }
    return {
        firstName: staffInfo[staffNameIndex].split(",")[firstNameIndex].trim(),
        lastName: staffInfo[staffNameIndex].split(",")[lastNameIndex].trim(),
        staffID: staffInfo[staffIDIndex].trim(),
    };
}
// This function takes the name of a staff member and returns a message that includes the name of the staff member that doesn't appear to have an ID in MB
function getMissingStaffIDMessage(staffName: string): string {
    return `${staffName.split(",")[1]} ${staffName.split(",")[0]} does not appear to have a Staff ID in MB`;
}

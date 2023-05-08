import { StaffInfo } from "./IStaffInfo";
import { TTalenoxInfoStaffMap } from "./types.js";

export function setStaffName(talenoxStaff: TTalenoxInfoStaffMap, staffID: string, staffName: string | undefined, wsStaffInfo: StaffInfo | undefined) {
    const talenoxStaffEntry = talenoxStaff.get(staffID);
    if (talenoxStaffEntry !== undefined) {
        // found staffmember in Talenox. Use the staff name from Talenox
        return `${talenoxStaffEntry.last_name ?? "<Last Name>"} ${talenoxStaffEntry.first_name ?? "<First Name>"}`;
    }
    /*
      Even if the staffmember doesn't appear in Talenox, we will need
      a valid staffName. Use the info from the MB Payroll report.
   */
    return `${wsStaffInfo?.lastName ?? "<Last Name>"} ${wsStaffInfo?.firstName ?? "<First Name>"}`;
}

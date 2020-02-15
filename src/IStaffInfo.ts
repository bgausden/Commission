import { TStaffID } from "./types";

export interface IStaffInfo {
    found: boolean;
    staffID?: TStaffID;
    firstName?: string;
    lastName?: string;
}

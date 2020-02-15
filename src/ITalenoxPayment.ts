import { TStaffID, TTalenoxPaymentType } from "./types";

export interface ITalenoxPayment {
    staffID: TStaffID;
    firstName: string;
    lastName: string;
    type: TTalenoxPaymentType | undefined;
    amount: number;
    remarks: string;
}

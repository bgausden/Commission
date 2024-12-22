import { TStaffID } from "./types.js";
import { TTalenoxPaymentType } from "./talenox_types.js";

export interface ITalenoxPayment {
  staffID: TStaffID;
  staffName: string;
  type: TTalenoxPaymentType;
  amount: number;
  remarks: string;
}

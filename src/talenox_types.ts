import {
  TALENOX_COMMISSION_IRREGULAR,
  TALENOX_TIPS,
  TALENOX_OTHERS,
  TALENOX_DEDUCTION,
  TALENOX_DEDUCTION_FROM_NET,
} from "./talenox_constants.js";

export type TTalenox_Commission_Irregular = typeof TALENOX_COMMISSION_IRREGULAR;
export type TTalenox_Commission_Tips = typeof TALENOX_TIPS;
export type TTalenox_Commission_Others = typeof TALENOX_OTHERS;
export type TTalenox_Deduction = typeof TALENOX_DEDUCTION;
export type TTalenox_Deduction_From_Net = typeof TALENOX_DEDUCTION_FROM_NET;

export type TTalenoxPaymentType =
  | TTalenox_Commission_Irregular
  | TTalenox_Commission_Tips
  | TTalenox_Commission_Others
  | TTalenox_Deduction
  | TTalenox_Deduction_From_Net;

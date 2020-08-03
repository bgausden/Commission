/* eslint-disable @typescript-eslint/camelcase */
import { TALENOX_COMMISSION_IRREGULAR, TALENOX_TIPS, TALENOX_OTHERS } from "./talenox_constants";

export type TTalenox_Commission_Irregular = typeof TALENOX_COMMISSION_IRREGULAR
export type TTalenox_Commission_Tips = typeof TALENOX_TIPS
export type TTalenox_Commission_Others = typeof TALENOX_OTHERS

export type TTalenoxPaymentType = TTalenox_Commission_Irregular | TTalenox_Commission_Tips| TTalenox_Commission_Others
import { TALENOX_COMMISSION_IRREGULAR, TALENOX_TIPS, TALENOX_OTHERS } from "./talenox_constants";

export type TalenoxCommissionIrregular = typeof TALENOX_COMMISSION_IRREGULAR
export type TalenoxCommissionTips = typeof TALENOX_TIPS
export type TalenoxCommissionOthers = typeof TALENOX_OTHERS

export type TalenoxPaymentType = TalenoxCommissionIrregular | TalenoxCommissionTips| TalenoxCommissionOthers
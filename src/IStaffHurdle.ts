
// TODO find a way to limit this to the actual services defined in Mindbody (get from Services REST API)
// export type TServiceType = string <-- overlaps with TServiceName?

import { CustomPayRate } from "./types"

export type IndividualStaffHurdle = {
    staffName: string
    mbCommRate?: number // unused
    baseRate: number
    hurdle1Level?: number
    hurdle1Rate?: number
    hurdle2Level?: number
    hurdle2Rate?: number
    hurdle3Level?: number
    hurdle3Rate?: number
    poolsWith?: string[]
    contractor?: boolean
    payViaTalenox?: boolean
    customPayRates?: CustomPayRate[]
}


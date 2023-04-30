
// TODO find a way to limit this to the actual services defined in Mindbody (get from Services REST API)
// export type TServiceType = string <-- overlaps with TServiceName?

import { PayRate } from "./types"

export type CustomPayRate = { [name: string]: PayRate}
export function isCustomPayRate(obj: CustomPayRate): obj is CustomPayRate {
    return typeof Object.keys(obj)[0] === "string" &&  typeof obj[Object.keys(obj)[0]] === "number"
}

export interface StaffHurdle {
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


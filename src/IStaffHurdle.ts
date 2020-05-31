export type customPayRate = { [name:string]:number|undefined}

export interface IStaffHurdle {
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
    customPayRates?: customPayRate[]
}


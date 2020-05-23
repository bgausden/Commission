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
}

export type staffID = string

export type TStaffHurdle = Record<staffID, IStaffHurdle>

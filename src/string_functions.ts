import fws from 'fixed-width-string'


export function fws12Right(s: string | number): string {
    if (typeof s === "number") { s = s.toString() }
    return fws(s, 12, { align: 'right' })
}

export function fws12RightHKD(n: number): string {
    if (typeof n !== "number") { n = 0 }
    return fws(new Intl.NumberFormat('en-HK',{style:'currency',currency:'HKD'}).format(n),12,{align:'right'})
}

export function fws32Left(s: string | number): string {
    if (typeof s === "number") { s = s.toString() }
    return fws(s, 32, { align: 'left' })
}


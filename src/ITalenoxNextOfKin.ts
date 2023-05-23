/* eslint-disable @typescript-eslint/naming-convention */
/* staffInfo.next_of_kins[0]
{id: 22496, employee_id: 123693, name: 'Kin', relationship: 'Husband', contact_number: '999999999', …}
birthdate:null
citizenship:null
contact_number:'999999999'
employee_id:123693
gender:null
id:22496
marriage_date:null
name:'Kin'
relationship:'Husband'
ssn:null */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TalenoxNextOfKin = {
    birthdate?: string // null
    citizenship?: string // null
    contact_number?: string // '999999999'
    employee_id?: number // 123693
    gender?: string // null
    id: number // 22496
    marriage_date?: string // null
    name?: string // 'Kin'
    relationship?: string // 'Husband'
}
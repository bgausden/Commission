/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/member-delimiter-style */
/* eslint-disable camelcase */

import { ITalenoxJob } from "./ITalenoxJob";

export interface ITalenoxStaffInfo {
    id: string
    employee_id: string
    first_name: string
    middle_name: string
    last_name: string
    email: string
    payment_method: string
    hired_date: string
    resign_date: string
    race: string
    religion: string
    blood_group: string
    contact_number: string
    ssn: string
    citizenship: string
    nationality: string
    gender: string
    marital_status: string
    passport_number: string
    passport_date_of_issue: string
    passport_date_of_expiry: string
    passport_place_of_issue: string
    chinese_name: string
    nickname: string
    birthdate: Date
    cost_centre: string
    current_job: string
    jobs: ITalenoxJob[]
    next_of_kins: ITalenoxNextOfKin[]
    bank_account: BankAccount
}

export interface BankAccount {
    id: string
    bank_type: string
    bank_code: string
    branch_code: string
    branch_name: string
    // eslint-disable-next-line id-blacklist
    number: string
    dbs_company_id: string
    swift_code: string
    account_name: string
    payment_code: string
    bnm_code: string
    organization_code: string
    boa_company_id: string
    boa_eft_key: string
}

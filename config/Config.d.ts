/* tslint:disable */
/* eslint-disable */
declare module "node-config-ts" {
  interface IConfig {
    PAYROLL_WB_NAME: string
    PAYROLL_MONTH: string
    PAYROLL_YEAR: string
    PAYMENTS_WB_NAME: string
    PAYMENTS_WS_NAME: string
    missingStaffAreFatal: boolean
    updateTalenox: boolean
  }
  export const config: Config
  export type Config = IConfig
}

/* tslint:disable */
/* eslint-disable */
declare module "node-config-ts" {
  interface IConfig {
    PAYROLL_WB_FILENAME: string
    PAYROLL_MONTH: string
    PAYROLL_YEAR: string
    PAYMENTS_WB_NAME: string
    PAYMENTS_WS_NAME: string
    missingStaffAreFatal: boolean
    updateTalenox: boolean
    PAYMENTS_DIR: string
    LOGS_DIR: string
    DATA_DIR: string
    log4jsConfigFile: string
  }
  export const config: Config
  export type Config = IConfig
}

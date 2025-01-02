/* tslint:disable */
/* eslint-disable */
declare module "node-config-ts" {
  interface IConfig {
    PAYROLL_WB_FILENAME: string
    missingStaffAreFatal: boolean
    updateTalenox: boolean
    log4jsConfigFile: string
  }
  export const config: Config
  export type Config = IConfig
}

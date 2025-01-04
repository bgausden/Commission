declare module "node-config-ts" {
  interface IConfig {
    PAYROLL_WB_FILENAME: string;
    missingStaffAreFatal: boolean;
    updateTalenox: boolean;
  }
  export const config: Config;
  export type Config = IConfig;
}

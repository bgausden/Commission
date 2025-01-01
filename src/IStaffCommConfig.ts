export interface StaffCommConfig {
  staffName: string;
  mbCommRate?: number;
  baseRate: number;
  hurdle1Level: number | undefined;
  hurdle1Rate: number;
  hurdle2Level: number;
  hurdle2Rate: number;
  hurdle3Level: number;
  hurdle3Rate: number;
  poolsWith: string[];
}

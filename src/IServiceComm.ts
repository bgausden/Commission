export interface GeneralServiceComm {
  staffName: string;
  generalServiceComm: number;
  generalServiceRevenue: number;
  base: {
    baseCommRevenue: number;
    baseCommRate: number;
    baseCommAmt: number;
  };
  hurdle1: {
    hurdle1Revenue: number;
    hurdle1Level: number;
    hurdle1Rate: number;
    hurdle1PayOut: number;
  };
  hurdle2: {
    hurdle2Revenue: number;
    hurdle2Level: number;
    hurdle2Rate: number;
    hurdle2Payout: number;
  };
  hurdle3: {
    hurdle3Revenue: number;
    hurdle3Level: number;
    hurdle3Rate: number;
    hurdle3Payout: number;
  };
}

import { config } from "node-config-ts";
import XLSX from "xlsx";
import { TalenoxPayment } from "./TalenoxPayment";

/*
Create a spreadsheet containing one line for each payment to be made for each of the staff.
This spreadsheet can be copied/pasted into Talenox (if pushing directly is not working for any reason) and together with their salary payments will
form the payroll for the month 
*/
export function writePaymentsWorkBook(payments: TalenoxPayment[]): void {
  const paymentsWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    paymentsWB,
    XLSX.utils.json_to_sheet(payments, { skipHeader: true }),
    config.PAYMENTS_WS_NAME
  );
  XLSX.writeFile(paymentsWB, config.PAYMENTS_WB_NAME);
}

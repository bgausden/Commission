import { config } from "node-config-ts";
import XLSX from "xlsx";
import { ITalenoxPayment } from "./ITalenoxPayment";

export function writePaymentsWorkBook(payments: ITalenoxPayment[]): void {
    const paymentsWB = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        paymentsWB,
        XLSX.utils.json_to_sheet(payments, { skipHeader: true }),
        config.PAYMENTS_WS_NAME
    );
    XLSX.writeFile(paymentsWB, config.PAYMENTS_WB_NAME);
}

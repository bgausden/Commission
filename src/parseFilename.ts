import { monthNames } from "./constants.js";
import { monthName } from "./types.js";

function parseFilename(filename: string) {
  /**
   * Extracts the month and year from the filename
   * @param filename - The filename to parse in the format "Payroll Report MM-DD-YYYY - MM-DD-YYYY.xlsx"
   * @returns An object containing the extracted values
   */
  const regex = /Payroll Report (\d+)-(\d+)-(\d+) - (\d+)-(\d+)-(\d+)\.xlsx/;
  const match = filename.match(regex);

  if (!match) {
    throw new Error("Filename format is incorrect");
  }

  const startMonth = parseInt(match[1], 10);
  const startYear = parseInt(match[3], 10);
  // const endMonth = parseInt(match[4], 10);
  //const endYear = match[6];

  const PAYROLL_MONTH: monthName = monthNames[startMonth - 1]; // e.g. "January"
  const PAYROLL_YEAR = startYear; // e.g. "2024"
  const PAYMENTS_WB_NAME = `Talenox Payments ${startYear}${startMonth.toString().padStart(2, "0")}.xlsx`; // e.g. "Talenox Payments 202401.xlsx"
  const PAYMENTS_WS_NAME = `Payments ${monthNames[startMonth - 1]} ${startYear}`; // e.g. "Payments January 2024"

  return {
    PAYROLL_MONTH,
    PAYROLL_YEAR,
    PAYMENTS_WB_NAME,
    PAYMENTS_WS_NAME,
  };
}

export { parseFilename };
export default parseFilename;

/* Example usage
const filename = "Payroll Report 12-1-2024 - 12-31-2024.xlsx";
const parsedValues = parseFilename(filename);
console.log(parsedValues);
 */

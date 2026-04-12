/* TODO add support for hourly wage staff:
Gausden, ElizabethStaff ID #: 048 									
Hourly Pay (38.2775 hours @ HK$&nbsp;40/hr):								1,531.10	
Sales Commission:									36
      # Services	# Clients	# Comps	Base Earnings		Earnings	
Total for Gausden, Elizabeth			0	0	0	HK$ 0		1,567.10	
*/
// TODO consider how custom pay rate services should contribute to achieving hurdles (or make a clear argument as to why not. Add a diagram showing how commissions are calculated across different revenue types).
import "./checkStartup.js";
import { config } from "node-config-ts";
import { TStaffHurdles, TTalenoxInfoStaffMap, monthName } from "./types.js";
import {
  createAdHocPayments,
  getTalenoxEmployees,
  createPayroll,
  uploadAdHocPayments,
} from "./talenox_functions.js";
import {
  moveFilesToOldSubDir,
  isValidDirectory,
  getStaffHurdleFromMap,
  type StaffHurdleGetter,
} from "./utility_functions.js";
import {
  infoLogger,
  warnLogger,
  errorLogger,
  debugLogger,
  shutdownLogging,
  initLogs,
} from "./logging_functions.js";
import {
  buildArtifactList,
  buildFolderHierarchy,
  getMissingGoogleDriveEnvVars,
  uploadRunArtifacts,
} from "./gdrive_functions.js";
import { DEFAULT_OLD_DIR, DEFAULT_STAFF_HURDLES_FILE } from "./constants.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaffHurdles } from "./staffHurdles.js";
import parseFilename from "./parseFilename.js";
import { processEnv } from "./env_functions.js";
import { resolveFromProjectRoot } from "./projectRoot.js";
import { revenueCol } from "./payrollWorksheet.js";
import { doPooling, processPayrollExcelData } from "./payrollShell.js";
import { emitProgress, emitProgressAndInfo } from "./payrollProgress.js";
import {
  readPayrollWorksheetRows,
  writePaymentsWorkbook,
} from "./payrollWorkbook.js";
import assert from "node:assert";
import { existsSync, readdirSync } from "node:fs";
export {
  calculateTieredCommission,
  calculateStaffCommission,
} from "./payrollCommission.js";
export {
  extractStaffPayrollData,
  getServiceRevenues,
} from "./payrollWorksheet.js";
export { doPooling } from "./payrollShell.js";

// Type-safe interface for custom global properties
interface CustomGlobals {
  staffHurdles: TStaffHurdles;
  PAYROLL_MONTH: monthName;
  PAYROLL_YEAR: string;
  PAYMENTS_WB_NAME: string;
  PAYMENTS_WS_NAME: string;
  LOGS_DIR: string;
  PAYMENTS_DIR: string;
  firstDay: Date;
}

// Type-safe global setter - provides type checking for both key and value
const setGlobal = <K extends keyof CustomGlobals>(
  key: K,
  value: CustomGlobals[K],
): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any)[key] = value;
};

const REGRESSION_OFFLINE_MODE = process.env.REGRESSION_OFFLINE === "1";

async function main() {
  emitProgress("Initializing logs");
  const logPaths = await initLogs();

  // Now that log4js is configured, mirror the first progress marker into logs.
  infoLogger.info("Initializing logs");

  emitProgressAndInfo("Parsing payroll filename");
  const parsedFilename = parseFilename(config.PAYROLL_WB_FILENAME);
  const PAYROLL_MONTH = parsedFilename.PAYROLL_MONTH;
  const PAYROLL_YEAR = parsedFilename.PAYROLL_YEAR;
  const PAYMENTS_WB_NAME = parsedFilename.PAYMENTS_WB_NAME;
  const PAYMENTS_WS_NAME = parsedFilename.PAYMENTS_WS_NAME;

  if (REGRESSION_OFFLINE_MODE) {
    if (config.updateTalenox) {
      throw new Error(
        "Regression offline mode requires config.updateTalenox=false.",
      );
    }
    if (config.uploadToGDrive) {
      throw new Error(
        "Regression offline mode requires config.uploadToGDrive=false.",
      );
    }
  }

  // Set global variables for use in other functions
  setGlobal("PAYROLL_MONTH", PAYROLL_MONTH);
  setGlobal("PAYROLL_YEAR", PAYROLL_YEAR);
  setGlobal("PAYMENTS_WB_NAME", PAYMENTS_WB_NAME);
  setGlobal("PAYMENTS_WS_NAME", PAYMENTS_WS_NAME);

  const firstDay = new Date(Date.parse(`01 ${PAYROLL_MONTH} ${PAYROLL_YEAR}`));
  setGlobal("firstDay", firstDay);

  infoLogger.info(`Commission run begins ${firstDay.toDateString()}`);
  if (config.updateTalenox === false) {
    infoLogger.info(`Talenox update is disabled in config.`);
  }
  infoLogger.info(`Payroll Month is ${PAYROLL_MONTH}`);

  emitProgressAndInfo("Loading environment configuration");
  const envConfig = processEnv();
  const DATA_DIR = envConfig.DATA_DIR;
  const LOGS_DIR = envConfig.LOGS_DIR;
  const PAYMENTS_DIR = envConfig.PAYMENTS_DIR;

  // Set global variables for use in other functions
  setGlobal("LOGS_DIR", LOGS_DIR);
  setGlobal("PAYMENTS_DIR", PAYMENTS_DIR);

  assert(isValidDirectory(DATA_DIR));

  /* if (!isValidDirectory(DATA_DIR)) {
    errorLogger.error(`Invalid or missing data directory: ${DATA_DIR}`);
  } */

  const DATA_OLD_DIR = path.join(DATA_DIR, DEFAULT_OLD_DIR);

  if (!isValidDirectory(DATA_OLD_DIR)) {
    warnLogger.warn(
      `Invalid or missing default old data directory: ${DATA_OLD_DIR}`,
    );
  }

  const payrollWorkbookPath = path.join(DATA_DIR, config.PAYROLL_WB_FILENAME);
  if (!existsSync(payrollWorkbookPath)) {
    const candidates = readdirSync(DATA_DIR)
      .filter((f) => f.toLowerCase().endsWith(".xlsx"))
      .slice(0, 10)
      .join(", ");
    throw new Error(
      `Payroll workbook not found at '${payrollWorkbookPath}'. Check config.PAYROLL_WB_FILENAME and/or upload/copy the workbook into DATA_DIR (${DATA_DIR}). Found .xlsx files: ${candidates || "<none>"}`,
    );
  }

  infoLogger.info(
    `Moving (and compressing) files from ${DATA_DIR} to ${DATA_OLD_DIR}`,
  );
  emitProgressAndInfo(
    "Archiving old payroll workbooks",
    `From ${DATA_DIR} to ${DATA_OLD_DIR}`,
  );
  await moveFilesToOldSubDir(DATA_DIR, DEFAULT_OLD_DIR, true, 2, [
    config.PAYROLL_WB_FILENAME,
  ]);

  emitProgressAndInfo("Loading staff hurdle configuration");
  const staffHurdles = loadStaffHurdles(
    process.env.STAFF_HURDLE_FILE ?? DEFAULT_STAFF_HURDLES_FILE,
  );
  const getPayrollStaffHurdle: StaffHurdleGetter = (staffID, context) =>
    getStaffHurdleFromMap(
      staffHurdles,
      config.missingStaffAreFatal,
      staffID,
      context,
    );

  let talenoxStaff: TTalenoxInfoStaffMap;
  if (REGRESSION_OFFLINE_MODE) {
    emitProgressAndInfo(
      "Using offline staff mode",
      "Skipping Talenox employee fetch for regression replay",
    );
    talenoxStaff = new Map();
  } else {
    infoLogger.info(`Requesting employees from Talenox`);
    emitProgressAndInfo("Fetching employees from Talenox");
    talenoxStaff = await getTalenoxEmployees();
    infoLogger.info(`Requesting employees complete`);
  }

  emitProgressAndInfo(
    "Reading Mindbody payroll workbook",
    config.PAYROLL_WB_FILENAME,
  );
  const wsaa = readPayrollWorksheetRows(payrollWorkbookPath);

  emitProgressAndInfo("Locating revenue column");
  const revCol = revenueCol(wsaa);

  // Process all staff payroll data from Excel
  emitProgressAndInfo("Parsing payroll rows and calculating commissions");
  const commMap = processPayrollExcelData(wsaa, revCol, talenoxStaff, {
    getStaffHurdleForContext: getPayrollStaffHurdle,
    missingStaffAreFatal: config.missingStaffAreFatal,
    regressionOfflineMode: REGRESSION_OFFLINE_MODE,
  });

  // Apply pooling logic to commission map
  emitProgressAndInfo("Applying pooling rules");
  const pooledCommMap = doPooling(commMap, staffHurdles, talenoxStaff);

  // Create payment spreadsheet and upload to Talenox
  emitProgressAndInfo("Creating Talenox payment entries");
  const payments = createAdHocPayments(pooledCommMap, talenoxStaff);

  emitProgressAndInfo("Archiving old payment spreadsheets");
  await moveFilesToOldSubDir(PAYMENTS_DIR, undefined, true, 2);

  emitProgressAndInfo("Writing payment spreadsheet");
  writePaymentsWorkbook({
    payments,
    workbookPath: path.join(PAYMENTS_DIR, PAYMENTS_WB_NAME),
    worksheetName: PAYMENTS_WS_NAME,
  });

  if (config.uploadToGDrive) {
    const missingEnvVars = getMissingGoogleDriveEnvVars();
    if (missingEnvVars.length > 0) {
      const detail = `Missing environment variable(s): ${missingEnvVars.join(", ")}`;
      warnLogger.warn(
        `Google Drive upload is enabled but cannot run. ${detail}.`,
      );
      emitProgressAndInfo("Skipping Google Drive upload", detail);
    } else {
      emitProgressAndInfo("Uploading artifacts to Google Drive");
      const hierarchy = buildFolderHierarchy(PAYROLL_YEAR, PAYROLL_MONTH);
      const artifacts = buildArtifactList(
        payrollWorkbookPath,
        path.join(PAYMENTS_DIR, PAYMENTS_WB_NAME),
        logPaths.commissionLog,
        logPaths.contractorLog,
        logPaths.debugLog,
        resolveFromProjectRoot(DEFAULT_STAFF_HURDLES_FILE),
      );
      const driveResult = await uploadRunArtifacts(artifacts, hierarchy);
      if (!driveResult.ok) {
        warnLogger.warn(`Google Drive upload skipped: ${driveResult.error}`);
        emitProgressAndInfo("Google Drive upload skipped", driveResult.error);
      } else {
        infoLogger.info(
          `Artifacts uploaded to Google Drive: ${hierarchy.year}/${hierarchy.month}`,
        );
      }
    }
  }

  /*
    If configuration permits updating Talenox, create a new payroll and push into it the adhoc payments for service commission, tips and product commission.
    */

  if (!config.updateTalenox) {
    emitProgressAndInfo("Complete (dry run)", "updateTalenox is disabled");
    return;
  }

  debugLogger.debug(`Requesting new payroll payment creation from Talenox`);
  emitProgressAndInfo("Creating payroll in Talenox");
  const payrollContext = { month: PAYROLL_MONTH, year: PAYROLL_YEAR, firstDay };
  const createPayrollResult = await createPayroll(talenoxStaff, payrollContext);
  debugLogger.debug(`New payroll payment is created in Talenox.`);
  if (!createPayrollResult[1]) {
    if (createPayrollResult[0]) {
      errorLogger.error(
        `Failed to create payroll payment for ${PAYROLL_MONTH}: ${createPayrollResult[0].message}`,
      );
    }
    if (!createPayrollResult[0]) {
      errorLogger.error(
        `Failed to create payroll payment for ${PAYROLL_MONTH}: no reason given by Talenox API`,
      );
    }
    throw new Error(
      `Failed to create payroll payment: ${createPayrollResult[0]?.message}`,
    );
  }
  debugLogger.debug(`OK: ${createPayrollResult[1].message}`);

  debugLogger.debug(`Pushing ad-hoc payments into new payroll`);
  emitProgressAndInfo("Uploading ad-hoc payments to Talenox");
  const uploadAdHocResult = await uploadAdHocPayments(
    talenoxStaff,
    payments,
    payrollContext,
  );
  if (!uploadAdHocResult[1]) {
    if (uploadAdHocResult[0]) {
      errorLogger.error(`Failed: ${uploadAdHocResult[0].message}`);
    }
    if (!uploadAdHocResult[0]) {
      errorLogger.error("Failed: Unknown reason");
    }
    throw new Error(
      `Failed to upload ad-hoc payments: ${uploadAdHocResult[0]?.message}`,
    );
  }
  debugLogger.debug(`Pushing ad-hoc payments is complete`);
  if (uploadAdHocResult[1]) {
    debugLogger.debug(`OK: ${uploadAdHocResult[1].message}`);
  }

  emitProgressAndInfo("Complete", "Talenox updated");
} //end of main()

if (process.argv[1] === fileURLToPath(import.meta.url))
  main()
    .then(async () => {
      debugLogger.debug("Done!");
      await shutdownLogging();
    })
    .catch(async (error) => {
      // Important: propagate failure to the process exit code.
      // Otherwise the web runner (and shell scripts) will treat failures as success.
      process.exitCode = 1;

      if (error instanceof Error) {
        errorLogger.error(`${error.message}`);
        // Also write to stderr so the web UI (child process stderr) always surfaces the failure.
        console.error(error.message);
      } else if (typeof error === "string") {
        errorLogger.error(`${error.toString()}`);
        console.error(error.toString());
      } else {
        errorLogger.error(
          `Cannot log caught error. Unknown error type: ${typeof error}. Error: ${error.toString()}`,
        );

        console.error(
          `Cannot log caught error. Unknown error type: ${typeof error}. Error: ${error.toString()}`,
        );
      }
      await shutdownLogging();
    });

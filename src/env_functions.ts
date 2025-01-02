/*
This file contains functions for setting environment variables from .env file
And is potentially unneeded if the script is launched with -r dotenv/config)
*/

/* import dotenv from 'dotenv'
dotenv.config() */

import {
  DEFAULT_PAYMENTS_DIR,
  DEFAULT_DATA_DIR,
  DEFAULT_LOGS_DIR,
} from "./constants.js";

import { infoLogger } from "./logging_functions.js";

export function processEnv() {
  let PAYMENTS_DIR = DEFAULT_PAYMENTS_DIR as string;
  let DATA_DIR = DEFAULT_DATA_DIR as string;
  let LOGS_DIR = DEFAULT_LOGS_DIR as string;

  if (process.env.PAYMENTS_DIR !== undefined) {
    PAYMENTS_DIR = process.env.PAYMENTS_DIR;
    infoLogger.info(
      `PAYMENTS_DIR set in .env, setting value to ${PAYMENTS_DIR}`,
    );
  }

  if (process.env.DATA_DIR !== undefined) {
    DATA_DIR = process.env.DATA_DIR;
    infoLogger.info(`DATA_DIR set in .env, using value ${DATA_DIR}`);
  }

  if (process.env.LOGS_DIR !== undefined) {
    LOGS_DIR = process.env.LOGS_DIR;
    infoLogger.info(`DEFAULT_LOGS_DIR set in .env, using value ${LOGS_DIR}`);
  }

  /* if (!!process.env.PAYMENTS_DIR && !fs.existsSync(process.env.PAYMENTS_DIR)) {
  const message = `DEFAULT_PAYMENTS_DIR '${process.env.DEFAULT_PAYMENTS_DIR}' is not a valid path`;
  errorLogger.error(message);
  throw new Error(message);
}

if (
  process.env.DEFAULT_DATA_DIR &&
  !fs.existsSync(process.env.DEFAULT_DATA_DIR)
) {
  const message = `DEFAULT_DATA_DIR '${process.env.DEFAULT_DATA_DIR}' is not a valid path`;
  errorLogger.error(message);
  throw new Error(message);
}

if (
  process.env.DEFAULT_LOGS_DIR &&
  !fs.existsSync(process.env.DEFAULT_LOGS_DIR)
) {
  const message = `DEFAULT_LOGS_DIR '${process.env.DEFAULT_LOGS_DIR}' is not a valid path`;
  errorLogger.error(message);
  throw new Error(message);
}
*/

  /* const PAYMENTS_DIR = process.env.DEFAULT_PAYMENTS_DIR;
const DATA_DIR = process.env.DEFAULT_DATA_DIR;
const LOGS_DIR = process.env.DEFAULT_LOGS_DIR; */

  return { PAYMENTS_DIR, DATA_DIR, LOGS_DIR };
}

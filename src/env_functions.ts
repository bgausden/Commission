/*
This file contains functions for setting environment variables from .env file
And is potentially unneeded if the script is launched with -r dotenv/config)
*/

/* import dotenv from 'dotenv'
dotenv.config() */

import fs from "fs";

import {
  DEFAULT_PAYMENTS_DIR,
  DEFAULT_DATA_DIR,
  DEFAULT_LOGS_DIR,
} from "./constants.js";

import { errorLogger, warnLogger } from "./logging_functions.js";

if (process.env.DEFAULT_PAYMENTS_DIR === undefined) {
  process.env.DEFAULT_PAYMENTS_DIR = DEFAULT_PAYMENTS_DIR;
  warnLogger.warn("DEFAULT_PAYMENTS_DIR not set in .env, using default value");
}

if (process.env.DEFAULT_DATA_DIR === undefined) {
  process.env.DEFAULT_DATA_DIR = DEFAULT_DATA_DIR;
  warnLogger.warn("DEFAULT_DATA_DIR not set in .env, using default value");
}

if (process.env.DEFAULT_LOGS_DIR === undefined) {
  process.env.DEFAULT_LOGS_DIR = DEFAULT_LOGS_DIR;
  warnLogger.warn("DEFAULT_LOGS_DIR not set in .env, using default value");
}

if (
  process.env.DEFAULT_PAYMENTS_DIR &&
  !fs.existsSync(process.env.DEFAULT_PAYMENTS_DIR)
) {
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

const PAYMENTS_DIR = process.env.DEFAULT_PAYMENTS_DIR;
const DATA_DIR = process.env.DEFAULT_DATA_DIR;
const LOGS_DIR = process.env.DEFAULT_LOGS_DIR;

export { PAYMENTS_DIR, DATA_DIR, LOGS_DIR };

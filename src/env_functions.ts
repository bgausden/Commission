/*
This file contains functions for setting environment variables from .env file
And is potentially unneeded if the script is launched with -r dotenv/config)
*/

import dotenv from "dotenv";
dotenv.config();

import {
  DEFAULT_PAYMENTS_DIR,
  DEFAULT_DATA_DIR,
  DEFAULT_LOGS_DIR,
} from "./constants.js";

import path from "node:path";
import {
  resolveFromProjectRoot,
  resolveFromProjectRootIfRelative,
} from "./projectRoot.js";

export function processEnv() {
  // Always resolve defaults from project root, regardless of cwd.
  let PAYMENTS_DIR = resolveFromProjectRoot(DEFAULT_PAYMENTS_DIR);
  let DATA_DIR = resolveFromProjectRoot(DEFAULT_DATA_DIR);
  let LOGS_DIR = resolveFromProjectRoot(DEFAULT_LOGS_DIR);

  if (process.env.PAYMENTS_DIR !== undefined) {
    PAYMENTS_DIR = resolveFromProjectRootIfRelative(process.env.PAYMENTS_DIR);
  }

  if (process.env.DATA_DIR !== undefined) {
    DATA_DIR = resolveFromProjectRootIfRelative(process.env.DATA_DIR);
  }

  if (process.env.LOGS_DIR !== undefined) {
    LOGS_DIR = resolveFromProjectRootIfRelative(process.env.LOGS_DIR);
  }

  // Normalize for consistency on Windows.
  PAYMENTS_DIR = path.resolve(PAYMENTS_DIR);
  DATA_DIR = path.resolve(DATA_DIR);
  LOGS_DIR = path.resolve(LOGS_DIR);

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

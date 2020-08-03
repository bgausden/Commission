#!/usr/bin/env node

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { promisify } from "util";
import { exec as noPromiseExec } from "child_process";
import fs from "fs";
import ncpPkg from "ncp";
const { ncp } = ncpPkg;
const DIST = "./dist";

const isExecutable = (s) => {
  return new Promise((r) => {
    fs.access(s, fs.constants.X_OK, (e) => r(!e));
  });
};

const exec = promisify(noPromiseExec);

isExecutable("./node_modules/.bin/tsc").then((executable) => {
  if (executable) {
    exec("./node_modules/.bin/tsc -p tsconfig.json")
      .then((result) => {
        if (result.stdout) console.log(result.stdout);
        if (result.stderr) console.log(result.stderr);
        ncp("./src/staffHurdle.json", "./dist/", (error) => {
          error ? console.error(error.Message) : console.log(`Copied staffHurdle.json to ${DIST}`);
        });
      })
      .catch((err) => {
        console.error(err);
        process.abort();
      });
  } else {
    console.error("Not executable");
    process.abort();
  }
});

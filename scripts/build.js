#!/usr/bin/env node

import {promisify} from "util";
import {exec as noPromiseExec} from "child_process";
import {mkdir, copyFile} from "node:fs/promises";
import path from "node:path";
const DIST = "./dist";

const exec = promisify(noPromiseExec);

async function copyBuildArtifacts() {
  await mkdir(DIST, {recursive: true});

  await copyFile("./config/staffHurdle.json", path.join(DIST, "staffHurdle.json"));
  console.log(`Copied staffHurdle.json to ${DIST}`);

  await copyFile("./log4js.json", path.join(DIST, "log4js.json"));
  console.log(`Copied logging config template to ${DIST}`);
}

exec("node ./node_modules/typescript/bin/tsc -p tsconfig.json")
  .then((result) => {
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.log(result.stderr);
    return copyBuildArtifacts();
  })
  .catch((err) => {
    console.error(err);
    process.abort();
  });

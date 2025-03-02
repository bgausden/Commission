import express, { Request, Response } from "express";
import fileUpload, { UploadedFile } from "express-fileupload";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import { DEFAULT_STAFF_HURDLES_FILE } from "./constants.js";
import { TStaffHurdles } from "./types.js";
import { IConfig } from "node-config-ts";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE_PATH = path.join(__dirname, "../config/default.json");
const STAFF_HURDLE_FILE_PATH = path.join(
  __dirname,
  "..",
  DEFAULT_STAFF_HURDLES_FILE,
);
const STAFF_HURDLE_SCHEMA_PATH = path.join(
  __dirname,
  "./staffHurdleSchema.json",
);
const DATA_DIR_PATH = path.join(__dirname, "../data");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/config", (_req: Request, res: Response) => {
  const config = loadConfig();
  res.json(config);
});

app.post("/upload", (req: Request, res: Response) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const file = req.files.file as UploadedFile;
  const config = loadConfig();
  config.PAYROLL_WB_FILENAME = file.name;
  saveConfig(config);

  const savePath = path.join(DATA_DIR_PATH, file.name);
  file.mv(savePath, (err) => {
    if (err) {
      return res.status(500).json({ message: "Failed to save file." });
    }
    res.status(200).json({ message: "File uploaded and saved successfully" });
  });
});

app.post("/update-config", (req: Request, res: Response) => {
  const config = loadConfig();
  config.missingStaffAreFatal = Boolean(req.body.missingStaffAreFatal);
  config.updateTalenox = Boolean(req.body.updateTalenox);
  saveConfig(config);

  res.status(200).json({ message: "Config updated successfully" });
});

app.get("/staff-hurdle-config", (_req: Request, res: Response) => {
  const staffHurdleConfig = loadStaffHurdles();
  res.json(staffHurdleConfig);
});

app.post("/update-staff-hurdle", (req: Request, res: Response) => {
  const ajv = new Ajv();
  const schema = JSON.parse(fs.readFileSync(STAFF_HURDLE_SCHEMA_PATH, "utf8"));
  const validate = ajv.compile(schema);
  const staffHurdleConfig = req.body;

  if (!validate(staffHurdleConfig)) {
    return res.status(400).json({
      message: "Invalid staff hurdle config",
      errors: validate.errors,
    });
  }

  saveStaffHurdles(staffHurdleConfig);
  res.status(200).json({ message: "Staff hurdle config updated successfully" });
});

function loadConfig(): IConfig {
  const data = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
  return JSON.parse(data);
}

function saveConfig(config: IConfig): void {
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 4));
}

function loadStaffHurdles(): TStaffHurdles {
  const data = fs.readFileSync(STAFF_HURDLE_FILE_PATH, "utf8");
  return JSON.parse(data);
}

function saveStaffHurdles(config: TStaffHurdles): void {
  fs.writeFileSync(STAFF_HURDLE_FILE_PATH, JSON.stringify(config, null, 4));
}

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

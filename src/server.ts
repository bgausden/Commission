import express, { Request, Response } from "express";
import fileUpload, { UploadedFile } from "express-fileupload";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import Ajv from "ajv";
import { DEFAULT_STAFF_HURDLES_FILE } from "./constants.js";
import { TStaffHurdles } from "./types.js";
import { IConfig } from "node-config-ts";
import { debugLogger } from "./logging_functions.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE_PATH = path.join(__dirname, "../config/default.json");
const STAFF_HURDLE_FILE_PATH = path.join(__dirname, "..", DEFAULT_STAFF_HURDLES_FILE);
const STAFF_HURDLE_SCHEMA_PATH = path.join(__dirname, "./staffHurdleSchema.json");
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
  try {
    const config = loadConfig();
    config.missingStaffAreFatal = Boolean(req.body.missingStaffAreFatal);
    config.updateTalenox = Boolean(req.body.updateTalenox);
    saveConfig(config);
    res.status(200).json({ message: "Config updated successfully skipper" });
  } catch (error) {
    if (error instanceof Error) {
      debugLogger.error(`Failed to update config. Error: ${error.message}`);
      return res.status(500).json({ message: "Failed to update config" });
    }
    debugLogger.error(`Failed to update config. Error: ${error}`);
    return res.status(500).json({ message: "Failed to update config" });
  }
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
  try {
    const data = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      debugLogger.debug(`Failed to load config file. Will return default. Error: ${error.message}`);
      return {
        // return some safe default values
        PAYROLL_WB_FILENAME: "payroll.xlsx",
        missingStaffAreFatal: true,
        updateTalenox: false,
      };
    }
    if (error instanceof Error) {
      debugLogger.error(`Failed to load config file. Error: ${error.message}`);
      throw error;
    }
    debugLogger.error(`Failed to load config file. Error: ${error}`);
    throw error;
  }
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

app.post("/run-commission", (_req: Request, res: Response) => {
  try {
    const indexPath = path.join(__dirname, "index.js");

    // Check if the compiled index.js exists
    if (!fs.existsSync(indexPath)) {
      return res.status(500).json({
        success: false,
        message: "Commission script not found. Please build the project first.",
      });
    }

    // Spawn the commission calculation process
    const child = spawn("node", [indexPath], {
      cwd: __dirname,
      env: { ...process.env },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
      debugLogger.debug(`Commission stdout: ${data}`);
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
      debugLogger.error(`Commission stderr: ${data}`);
    });

    child.on("close", (code) => {
      if (code === 0) {
        debugLogger.info("Commission calculation completed successfully");
      } else {
        debugLogger.error(`Commission calculation exited with code ${code}`);
      }
    });

    // Send immediate response that the process has started
    res.status(200).json({
      success: true,
      message: "Commission calculation started successfully. Check logs for details.",
    });
  } catch (error) {
    if (error instanceof Error) {
      debugLogger.error(`Failed to run commission calculation. Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "Failed to run commission calculation: " + error.message,
      });
    }
    debugLogger.error(`Failed to run commission calculation. Error: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to run commission calculation",
    });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

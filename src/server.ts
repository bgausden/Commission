import express, { Request, Response } from "express";
import fileUpload, { UploadedFile } from "express-fileupload";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE_PATH = path.join(__dirname, "../config/default.json");
const DATA_DIR_PATH = path.join(__dirname, "../data");

app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "../public")));

interface Config {
  PAYROLL_WB_FILENAME: string;
  missingStaffAreFatal: boolean;
  updateTalenox: boolean;
}

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
  config.missingStaffAreFatal = req.body.missingStaffAreFatal === "on";
  config.updateTalenox = req.body.updateTalenox === "on";
  saveConfig(config);

  res.status(200).json({ message: "Config updated successfully" });
});

function loadConfig(): Config {
  const data = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
  return JSON.parse(data);
}

function saveConfig(config: Config): void {
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 4));
}

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

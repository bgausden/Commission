import express, { Request, Response } from "express";
import fileUpload, { UploadedFile } from "express-fileupload";
import fs from "fs";
import path from "path";
import {
  getProjectRoot,
  resolveFromProjectRoot,
  resolveFromProjectRootIfRelative,
} from "./projectRoot.js";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_COMMISSION_LOGFILE,
  DEFAULT_CONTRACTOR_LOGFILE,
} from "./constants.js";
import { staffHurdleSchema } from "./staffHurdleSchema.js";
import { DEFAULT_STAFF_HURDLES_FILE } from "./constants.js";
import { TStaffHurdles } from "./types.js";
import { IConfig } from "node-config-ts";
import { debugLogger, webEchoLogger } from "./logging_functions.js";

type CommissionJobStatus = "queued" | "running" | "success" | "failed";

type CommissionJobLogLevel = "stdout" | "stderr" | "info" | "debug";

interface CommissionJobLogLine {
  ts: string;
  level: CommissionJobLogLevel;
  message: string;
}

interface CommissionJobStep {
  ts: string;
  step: string;
  detail?: string;
}

interface CommissionJob {
  id: string;
  status: CommissionJobStatus;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  message?: string;
  logFiles?: {
    commission?: string;
    contractor?: string;
  };
  steps: CommissionJobStep[];
  logs: CommissionJobLogLine[];
  clients: Set<Response>;
}

const PROGRESS_PREFIX = "__PROGRESS__ ";

function tryParseProgressLine(line: string): CommissionJobStep | null {
  if (!line.startsWith(PROGRESS_PREFIX)) return null;
  const json = line.slice(PROGRESS_PREFIX.length).trim();
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<CommissionJobStep>;
    if (!parsed.step || typeof parsed.step !== "string") return null;
    return {
      ts: typeof parsed.ts === "string" ? parsed.ts : nowIso(),
      step: parsed.step,
      detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
    };
  } catch {
    return null;
  }
}

function safeUUID(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function shouldEchoChildToServerConsole(): boolean {
  const value = (process.env.WEB_RUN_ECHO_CHILD ?? "").trim().toLowerCase();
  return value !== "" && !["0", "false", "off", "no"].includes(value);
}

function stripAnsi(input: string): string {
  // Matches ANSI escape sequences like "\u001b[32m" (colors), cursor controls, etc.
  // Keeps the textual content for clean display in the web UI.
  // eslint-disable-next-line no-control-regex
  return input.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function getLogsDir(currentModuleDir: string): string {
  // Prefer explicit env var, else default to repo's ./logs relative to src/ or dist/.
  if (process.env.LOGS_DIR) {
    return resolveFromProjectRootIfRelative(process.env.LOGS_DIR);
  }
  return path.join(currentModuleDir, "../logs");
}

function getDebugLogPath(logsDir: string): string {
  // log4js.json debugLog appender filename.
  return path.join(logsDir, "commission.debug");
}

function toTimestampedPrefix(defaultFilename: string): {
  prefix: string;
  ext: string;
} {
  const ext = path.extname(defaultFilename);
  const base = path.basename(defaultFilename, ext);
  // logging_functions.ts uses `${base}-${timestamp}${ext}`
  return { prefix: `${base}-`, ext };
}

function findLatestFile(
  dir: string,
  predicate: (name: string) => boolean,
): string | undefined {
  try {
    const entries = fs.readdirSync(dir);
    let best: { name: string; mtimeMs: number } | undefined;
    for (const name of entries) {
      if (!predicate(name)) continue;
      const full = path.join(dir, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const mtimeMs = st.mtimeMs;
      if (!best || mtimeMs > best.mtimeMs) {
        best = { name, mtimeMs };
      }
    }
    return best?.name;
  } catch {
    return undefined;
  }
}

function getLatestCommissionLogFiles(logsDir: string): {
  commission?: string;
  contractor?: string;
} {
  const { prefix: commPrefix, ext: commExt } = toTimestampedPrefix(
    DEFAULT_COMMISSION_LOGFILE,
  );
  const { prefix: contractorPrefix, ext: contractorExt } = toTimestampedPrefix(
    DEFAULT_CONTRACTOR_LOGFILE,
  );

  const commission = findLatestFile(
    logsDir,
    (name) =>
      name.startsWith(commPrefix) &&
      name.endsWith(commExt) &&
      !name.endsWith(".gz"),
  );
  const contractor = findLatestFile(
    logsDir,
    (name) =>
      name.startsWith(contractorPrefix) &&
      name.endsWith(contractorExt) &&
      !name.endsWith(".gz"),
  );
  return { commission, contractor };
}

export function createApp() {
  const app = express();

  const projectRoot = getProjectRoot();

  const commissionJobs = new Map<string, CommissionJob>();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const CONFIG_FILE_PATH = path.join(__dirname, "../config/default.json");
  const STAFF_HURDLE_FILE_PATH = path.join(
    __dirname,
    "..",
    DEFAULT_STAFF_HURDLES_FILE,
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
    const result = staffHurdleSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid staff hurdle config",
        errors: result.error.issues,
      });
    }

    saveStaffHurdles(result.data);
    res
      .status(200)
      .json({ message: "Staff hurdle config updated successfully" });
  });

  app.get("/run-commission/status/:jobId", (req: Request, res: Response) => {
    const job = commissionJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    return res.status(200).json({
      id: job.id,
      status: job.status,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      exitCode: job.exitCode,
      message: job.message,
      logFiles: job.logFiles,
      currentStep: job.steps.at(-1) ?? null,
      stepCount: job.steps.length,
      // Keep status payload light; logs are streamed via SSE.
      logCount: job.logs.length,
    });
  });

  app.get("/run-commission/stream/:jobId", (req: Request, res: Response) => {
    const job = commissionJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Help intermediaries/proxies start the stream immediately.
    if (
      typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders ===
      "function"
    ) {
      (res as unknown as { flushHeaders: () => void }).flushHeaders();
    }
    res.write(`: connected ${nowIso()}\n\n`);

    // Send initial status + buffered logs.
    writeSse(res, "status", {
      id: job.id,
      status: job.status,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      exitCode: job.exitCode,
      message: job.message,
      logFiles: job.logFiles,
      currentStep: job.steps.at(-1) ?? null,
    });

    for (const step of job.steps) {
      writeSse(res, "step", step);
    }
    for (const line of job.logs) {
      writeSse(res, "log", line);
    }

    // Register client for future updates.
    job.clients.add(res);

    req.on("close", () => {
      job.clients.delete(res);
    });
  });

  app.post("/run-commission", (_req: Request, res: Response) => {
    try {
      // When running the server via tsx, __dirname points at src/ (so src/index.js won't exist).
      // Always resolve the built entrypoint from the repo root.
      const indexPathCandidates = [
        resolveFromProjectRoot("dist", "index.js"),
        resolveFromProjectRoot("dist", "src", "index.js"),
      ];
      const indexPath = indexPathCandidates.find((p) => fs.existsSync(p));

      // Check if the compiled index.js exists
      if (!indexPath) {
        return res.status(500).json({
          success: false,
          message:
            "Commission script not found. Please build the project first.",
        });
      }

      // Prevent accidental concurrent runs.
      const runningJob = [...commissionJobs.values()].find(
        (j) => j.status === "running" || j.status === "queued",
      );
      if (runningJob) {
        return res.status(409).json({
          success: false,
          message: "Commission calculation is already running.",
          jobId: runningJob.id,
        });
      }

      const jobId = safeUUID();
      const job: CommissionJob = {
        id: jobId,
        status: "queued",
        startedAt: nowIso(),
        steps: [],
        logs: [],
        clients: new Set<Response>(),
      };
      commissionJobs.set(jobId, job);

      const pushLog = (level: CommissionJobLogLevel, message: string) => {
        const sanitized = stripAnsi(message);
        const trimmed = sanitized.replace(/\r?\n$/, "");
        if (!trimmed) return;

        const entry: CommissionJobLogLine = {
          ts: nowIso(),
          level,
          message: trimmed,
        };
        job.logs.push(entry);
        // Cap memory usage.
        const MAX_LOG_LINES = 2000;
        if (job.logs.length > MAX_LOG_LINES) {
          job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
        }
        for (const client of job.clients) {
          writeSse(client, "log", entry);
        }

        // Optional: echo streamed child output to the server console for local debugging.
        // Uses a console-only logger so we don't pollute commission.debug.
        if (shouldEchoChildToServerConsole()) {
          webEchoLogger.info(`[${level}] ${trimmed}`);
        }
      };

      const pushStatus = () => {
        const payload = {
          id: job.id,
          status: job.status,
          startedAt: job.startedAt,
          endedAt: job.endedAt,
          exitCode: job.exitCode,
          message: job.message,
          logFiles: job.logFiles,
          currentStep: job.steps.at(-1) ?? null,
        };
        for (const client of job.clients) {
          writeSse(client, "status", payload);
        }
      };

      const pushStep = (step: CommissionJobStep) => {
        job.steps.push(step);
        const MAX_STEPS = 200;
        if (job.steps.length > MAX_STEPS) {
          job.steps.splice(0, job.steps.length - MAX_STEPS);
        }
        for (const client of job.clients) {
          writeSse(client, "step", step);
        }

        if (shouldEchoChildToServerConsole()) {
          webEchoLogger.info(
            step.detail
              ? `[step] ${step.step}: ${step.detail}`
              : `[step] ${step.step}`,
          );
        }
      };

      // Spawn the commission calculation process
      job.status = "running";
      job.message = "Commission calculation started";
      pushStatus();
      pushLog("info", `Starting: node ${indexPath}`);

      // Prefer streaming debugLogger output via its file appender (commission.debug), rather than whatever lands on stderr.
      const logsDir = getLogsDir(__dirname);
      const debugLogPath = getDebugLogPath(logsDir);
      let lastDebugSize = 0;
      const debugTailInterval = setInterval(() => {
        try {
          const st = fs.statSync(debugLogPath);
          if (!st.isFile()) return;
          if (st.size < lastDebugSize) {
            // Log rotated/truncated
            lastDebugSize = 0;
          }
          if (st.size === lastDebugSize) return;
          const content = fs.readFileSync(debugLogPath, "utf8");
          const delta = content.slice(lastDebugSize);
          lastDebugSize = Buffer.byteLength(content, "utf8");
          const lines = delta.split(/\r?\n/);
          for (const line of lines) {
            if (!line.trim()) continue;
            pushLog("debug", line);
          }
        } catch {
          // File may not exist yet; ignore.
        }
      }, 500);

      const child = spawn("node", [indexPath], {
        cwd: projectRoot,
        // For web UI runs, we want rich logs to stream back to the browser.
        // Force the child process to emit log4js console output to stdout/stderr,
        // regardless of the server's own LOG4JS_CONSOLE setting.
        env: { ...process.env, LOG4JS_CONSOLE: "on" },
        stdio: "pipe",
      });

      let stdoutBuf = "";
      let stderrBuf = "";

      child.stdout.on("data", (data) => {
        const text = stripAnsi(data.toString());
        // Avoid logging the entire child stdout into the server debug log file;
        // it can be very large and is already streamed to the UI.
        stdoutBuf += text;
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() ?? "";
        for (const line of lines) {
          const step = tryParseProgressLine(stripAnsi(line));
          if (step) {
            pushStep(step);
            continue;
          }
          pushLog("stdout", line);
        }
      });

      child.stderr.on("data", (data) => {
        const text = stripAnsi(data.toString());
        // Avoid duplicating child stderr into the server debug log file.
        stderrBuf += text;
        const lines = stderrBuf.split(/\r?\n/);
        stderrBuf = lines.pop() ?? "";
        for (const line of lines) pushLog("stderr", line);
      });

      child.on("error", (err) => {
        clearInterval(debugTailInterval);
        job.status = "failed";
        job.endedAt = nowIso();
        job.exitCode = null;
        job.message = `Failed to start: ${err.message}`;
        pushLog("stderr", job.message);
        pushStatus();
        for (const client of job.clients) {
          writeSse(client, "done", {
            id: job.id,
            status: job.status,
            startedAt: job.startedAt,
            endedAt: job.endedAt,
            exitCode: job.exitCode,
            message: job.message,
            logFiles: job.logFiles,
            currentStep: job.steps.at(-1) ?? null,
          });
          client.end();
        }
        job.clients.clear();
      });

      child.on("close", (code) => {
        clearInterval(debugTailInterval);
        if (stdoutBuf) pushLog("stdout", stdoutBuf);
        if (stderrBuf) pushLog("stderr", stderrBuf);

        job.exitCode = code;
        job.endedAt = nowIso();

        // Best-effort: locate the most recently written commission/contractor logs.
        job.logFiles = getLatestCommissionLogFiles(logsDir);

        if (code === 0) {
          job.status = "success";
          job.message = "Commission calculation completed successfully";
          debugLogger.info(job.message);
          pushLog("info", job.message);
        } else {
          job.status = "failed";
          job.message = `Commission calculation exited with code ${code}`;
          debugLogger.error(job.message);
          pushLog("stderr", job.message);
        }

        // Always add a final step so the UI has a clear end marker.
        pushStep({
          ts: nowIso(),
          step: code === 0 ? "Complete" : "Failed",
          detail: job.message,
        });

        pushStatus();
        for (const client of job.clients) {
          writeSse(client, "done", {
            id: job.id,
            status: job.status,
            startedAt: job.startedAt,
            endedAt: job.endedAt,
            exitCode: job.exitCode,
            message: job.message,
            logFiles: job.logFiles,
            currentStep: job.steps.at(-1) ?? null,
          });
          client.end();
        }
        job.clients.clear();
      });

      // Respond immediately with a jobId so the UI can stream progress.
      return res.status(202).json({
        success: true,
        jobId,
        message: "Commission calculation started.",
        streamUrl: `/run-commission/stream/${jobId}`,
        statusUrl: `/run-commission/status/${jobId}`,
      });
    } catch (error) {
      if (error instanceof Error) {
        debugLogger.error(
          `Failed to run commission calculation. Error: ${error.message}`,
        );
        return res.status(500).json({
          success: false,
          message: "Failed to run commission calculation: " + error.message,
        });
      }
      debugLogger.error(
        `Failed to run commission calculation. Error: ${error}`,
      );
      return res.status(500).json({
        success: false,
        message: "Failed to run commission calculation",
      });
    }
  });

  function loadConfig(): IConfig {
    try {
      const data = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        debugLogger.debug(
          `Failed to load config file. Will return default. Error: ${error.message}`,
        );
        return {
          // return some safe default values
          PAYROLL_WB_FILENAME: "payroll.xlsx",
          missingStaffAreFatal: true,
          updateTalenox: false,
        };
      }
      if (error instanceof Error) {
        debugLogger.error(
          `Failed to load config file. Error: ${error.message}`,
        );
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

  return app;
}

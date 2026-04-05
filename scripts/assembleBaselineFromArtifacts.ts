#!/usr/bin/env node
/**
 * Assemble a regression baseline from saved artifacts (archived .gz or plain files).
 *
 * Usage examples:
 *   npm run assemble-baseline -- --name 2025-12 --month 12 --year 2025
 *   npm run assemble-baseline -- --name 2025-12 --month 12 --year 2025 --run-id 20260101T110030 --config-commit b450868
 */

import { gunzipSync } from "zlib";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import type { BaselineMetadata } from "../src/regression.types.js";
import {
  computeChecksum,
  copyFile,
  ensureDir,
  readJSON,
  writeJSON,
  fileExists,
} from "./utils/fileUtils.js";
import { getCommitSHA, getShortCommitSHA } from "./utils/gitUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

type CliOptions = {
  baselineName: string;
  month: number;
  year: number;
  preflight?: boolean;
  force?: boolean;
  confirmForce?: boolean;
  runId?: string;
  configCommit?: string;
  commitSHA?: string;
  createdDate?: string;
  description?: string;
  sourceFile?: string;
  paymentsFile?: string;
  commissionLog?: string;
  contractorLog?: string;
};

type ArtifactSelection = {
  sourcePath: string;
  sourceName: string;
  paymentsPath: string;
  paymentsName: string;
  commissionLogPath: string;
  commissionLogName: string;
  contractorLogPath: string;
  contractorLogName: string;
  selectedRunId: string;
};

type StaffHurdleConfig = Record<string, unknown>;

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--name":
        options.baselineName = next;
        i += 1;
        break;
      case "--month":
        options.month = parseInt(next, 10);
        i += 1;
        break;
      case "--year":
        options.year = parseInt(next, 10);
        i += 1;
        break;
      case "--run-id":
        options.runId = next;
        i += 1;
        break;
      case "--preflight":
        options.preflight = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--confirm-force":
        options.confirmForce = true;
        break;
      case "--config-commit":
        options.configCommit = next;
        i += 1;
        break;
      case "--commit-sha":
        options.commitSHA = next;
        i += 1;
        break;
      case "--created-date":
        options.createdDate = next;
        i += 1;
        break;
      case "--description":
        options.description = next;
        i += 1;
        break;
      case "--source-file":
        options.sourceFile = next;
        i += 1;
        break;
      case "--payments-file":
        options.paymentsFile = next;
        i += 1;
        break;
      case "--commission-log":
        options.commissionLog = next;
        i += 1;
        break;
      case "--contractor-log":
        options.contractorLog = next;
        i += 1;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
    }
  }

  if (!options.baselineName) {
    throw new Error("Missing required --name");
  }
  if (!options.month || options.month < 1 || options.month > 12) {
    throw new Error("Missing/invalid --month (1-12)");
  }
  if (!options.year || options.year < 2000 || options.year > 2100) {
    throw new Error("Missing/invalid --year");
  }

  return options as CliOptions;
}

async function listFiles(dirPath: string): Promise<string[]> {
  if (!(await fileExists(dirPath))) {
    return [];
  }
  const dirents = await readdir(dirPath, { withFileTypes: true });
  return dirents.filter((d) => d.isFile()).map((d) => join(dirPath, d.name));
}

function isArchivedGzip(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".gz");
}

function stripGzipSuffix(fileName: string): string {
  return fileName.toLowerCase().endsWith(".gz")
    ? fileName.substring(0, fileName.length - 3)
    : fileName;
}

function getRunKeyFromLogName(
  fileName: string,
  prefix: "commission-" | "contractor-",
): string | null {
  const plain = stripGzipSuffix(fileName);
  if (!plain.startsWith(prefix) || !plain.endsWith(".log")) {
    return null;
  }
  return plain.substring(prefix.length, plain.length - 4);
}

function parseRunKeyToDate(runKey: string): Date | null {
  const compact = runKey.match(/^(\d{8}T\d{6})$/);
  if (compact) {
    const raw = compact[1];
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(runKey);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function pickLatestFileByMtime(paths: string[]): Promise<string> {
  if (paths.length === 0) {
    throw new Error("No candidate files found");
  }

  const withStats = await Promise.all(
    paths.map(async (p) => ({ path: p, mtimeMs: (await stat(p)).mtimeMs })),
  );
  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0].path;
}

async function findSourceArtifact(
  month: number,
  year: number,
  explicitPath?: string,
): Promise<string> {
  if (explicitPath) {
    return join(PROJECT_ROOT, explicitPath);
  }

  const roots = [join(PROJECT_ROOT, "data", "old"), join(PROJECT_ROOT, "data")];
  const files = (
    await Promise.all(roots.map((root) => listFiles(root)))
  ).flat();

  const candidates = files.filter((filePath) => {
    const name = basename(filePath);
    const match = name.match(
      /^Payroll Report (\d+)-\d+-(\d{4}) - (\d+)-\d+-(\d{4})\.xlsx(?:\.gz)?$/,
    );
    if (!match) {
      return false;
    }
    return parseInt(match[1], 10) === month && parseInt(match[2], 10) === year;
  });

  if (candidates.length === 0) {
    const expectedPrefix = `Payroll Report ${month}-`;
    throw new Error(
      [
        `No source payroll artifact found for ${year}-${String(month).padStart(2, "0")}.`,
        "Recovery: export/recover the source payroll workbook from Google Drive and place it in one of:",
        "- data/",
        "- data/old/",
        `Expected name pattern: ${expectedPrefix}<start-day>-${year} - ${month}-<end-day>-${year}.xlsx (optionally .gz)`,
      ].join("\n"),
    );
  }

  return pickLatestFileByMtime(candidates);
}

async function findPaymentsArtifact(
  month: number,
  year: number,
  explicitPath?: string,
): Promise<string> {
  if (explicitPath) {
    return join(PROJECT_ROOT, explicitPath);
  }

  const yyyymm = `${year}${String(month).padStart(2, "0")}`;
  const roots = [
    join(PROJECT_ROOT, "payments", "old"),
    join(PROJECT_ROOT, "payments"),
  ];
  const files = (
    await Promise.all(roots.map((root) => listFiles(root)))
  ).flat();

  const candidates = files.filter((filePath) => {
    const name = basename(filePath);
    return new RegExp(
      `^Talenox Payments ${yyyymm}\\.xlsx(?:\\.gz)?$`,
      "i",
    ).test(name);
  });

  if (candidates.length === 0) {
    throw new Error(
      [
        `No payments artifact found for ${yyyymm}.`,
        "Recovery: export/recover the payments workbook from Google Drive and place it in one of:",
        "- payments/",
        "- payments/old/",
        `Expected name: Talenox Payments ${yyyymm}.xlsx (optionally .gz)`,
      ].join("\n"),
    );
  }

  return pickLatestFileByMtime(candidates);
}

async function findLogArtifacts(
  runId?: string,
  explicitCommission?: string,
  explicitContractor?: string,
): Promise<{
  commissionPath: string;
  contractorPath: string;
  selectedRunId: string;
}> {
  if (explicitCommission && explicitContractor) {
    const commissionName = basename(explicitCommission);
    const contractorName = basename(explicitContractor);
    const commissionKey = getRunKeyFromLogName(commissionName, "commission-");
    const contractorKey = getRunKeyFromLogName(contractorName, "contractor-");
    if (!commissionKey || !contractorKey || commissionKey !== contractorKey) {
      throw new Error(
        "Explicit --commission-log and --contractor-log must share the same run timestamp key",
      );
    }
    return {
      commissionPath: join(PROJECT_ROOT, explicitCommission),
      contractorPath: join(PROJECT_ROOT, explicitContractor),
      selectedRunId: commissionKey,
    };
  }

  if (
    (explicitCommission && !explicitContractor) ||
    (!explicitCommission && explicitContractor)
  ) {
    throw new Error(
      "Provide both --commission-log and --contractor-log together, or neither",
    );
  }

  const roots = [join(PROJECT_ROOT, "logs", "old"), join(PROJECT_ROOT, "logs")];
  const files = (
    await Promise.all(roots.map((root) => listFiles(root)))
  ).flat();

  const commissionByKey = new Map<string, string[]>();
  const contractorByKey = new Map<string, string[]>();

  for (const filePath of files) {
    const name = basename(filePath);
    const commissionKey = getRunKeyFromLogName(name, "commission-");
    if (commissionKey) {
      const list = commissionByKey.get(commissionKey) || [];
      list.push(filePath);
      commissionByKey.set(commissionKey, list);
      continue;
    }

    const contractorKey = getRunKeyFromLogName(name, "contractor-");
    if (contractorKey) {
      const list = contractorByKey.get(contractorKey) || [];
      list.push(filePath);
      contractorByKey.set(contractorKey, list);
    }
  }

  const sharedKeys = [...commissionByKey.keys()].filter((key) =>
    contractorByKey.has(key),
  );
  if (sharedKeys.length === 0) {
    throw new Error(
      [
        "Could not find matching commission/contractor log pairs in logs archives.",
        "Recovery: restore both log files from the same payroll run timestamp from Google Drive and place them in:",
        "- logs/",
        "- logs/old/",
        "Expected pair:",
        "- commission-<run-id>.log (or .log.gz)",
        "- contractor-<run-id>.log (or .log.gz)",
      ].join("\n"),
    );
  }

  let selectedKey: string;
  if (runId) {
    const exact = sharedKeys.find((key) => key === runId);
    const partial = sharedKeys.find((key) => key.includes(runId));
    selectedKey = exact || partial || "";
    if (!selectedKey) {
      throw new Error(
        [
          `No matching commission/contractor pair found for --run-id ${runId}.`,
          `Available examples: ${sharedKeys.slice(0, 8).join(", ")}`,
          "Recovery: restore commission/contractor logs for that run-id from Google Drive into logs/ or logs/old/.",
        ].join("\n"),
      );
    }
  } else {
    sharedKeys.sort((a, b) => {
      const aDate = parseRunKeyToDate(a);
      const bDate = parseRunKeyToDate(b);
      if (aDate && bDate) {
        return bDate.getTime() - aDate.getTime();
      }
      if (aDate) return -1;
      if (bDate) return 1;
      return b.localeCompare(a);
    });
    selectedKey = sharedKeys[0];
  }

  const commissionPath = await pickLatestFileByMtime(
    commissionByKey.get(selectedKey) || [],
  );
  const contractorPath = await pickLatestFileByMtime(
    contractorByKey.get(selectedKey) || [],
  );

  return {
    commissionPath,
    contractorPath,
    selectedRunId: selectedKey,
  };
}

async function materializeArtifact(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  await ensureDir(dirname(destinationPath));
  if (isArchivedGzip(sourcePath)) {
    const compressed = await readFile(sourcePath);
    const uncompressed = gunzipSync(compressed);
    await writeFile(destinationPath, uncompressed);
    return;
  }
  await copyFile(sourcePath, destinationPath);
}

function toMaterializedName(filePath: string): string {
  return stripGzipSuffix(basename(filePath));
}

function parsePayrollFromSourceFileName(sourceName: string): {
  payrollMonth: number;
  payrollYear: number;
} {
  const match = sourceName.match(
    /^Payroll Report (\d+)-\d+-(\d{4}) - (\d+)-\d+-(\d{4})\.xlsx$/,
  );
  if (!match) {
    throw new Error(
      `Could not parse payroll month/year from source filename: ${sourceName}`,
    );
  }

  return {
    payrollMonth: parseInt(match[1], 10),
    payrollYear: parseInt(match[2], 10),
  };
}

async function writeConfigSnapshots(
  baselineConfigDir: string,
  sourceFileName: string,
  configCommit?: string,
): Promise<{
  staffHurdleChecksum: string;
  defaultChecksum: string;
  staffIds: string[];
}> {
  const staffHurdleOut = join(baselineConfigDir, "staffHurdle.json");
  const defaultOut = join(baselineConfigDir, "default.json");

  if (configCommit) {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    let staffHurdleJson: string | undefined;
    const staffHurdleCandidates = [
      "config/staffHurdle.json",
      "config/staffhurdle.json",
    ];

    for (const candidate of staffHurdleCandidates) {
      try {
        const { stdout } = await execFileAsync(
          "git",
          ["show", `${configCommit}:${candidate}`],
          { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 },
        );
        staffHurdleJson = stdout;
        break;
      } catch {
        // Try next candidate path in older commit layouts.
      }
    }

    const { stdout: defaultJson } = await execFileAsync(
      "git",
      ["show", `${configCommit}:config/default.json`],
      { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 },
    );

    if (staffHurdleJson) {
      await writeFile(staffHurdleOut, staffHurdleJson, "utf-8");
    } else {
      console.warn(
        `Warning: no staffHurdle.json found in commit ${configCommit}; using working tree config/staffHurdle.json`,
      );
      await copyFile(
        join(PROJECT_ROOT, "config", "staffHurdle.json"),
        staffHurdleOut,
      );
    }

    await writeFile(defaultOut, defaultJson, "utf-8");
  } else {
    await copyFile(
      join(PROJECT_ROOT, "config", "staffHurdle.json"),
      staffHurdleOut,
    );
    await copyFile(join(PROJECT_ROOT, "config", "default.json"), defaultOut);
  }

  const defaultConfig = await readJSON<Record<string, unknown>>(defaultOut);
  defaultConfig.PAYROLL_WB_FILENAME = sourceFileName;
  await writeJSON(defaultOut, defaultConfig);

  const staffHurdle = await readJSON<StaffHurdleConfig>(staffHurdleOut);
  const staffIds = Object.keys(staffHurdle)
    .filter((id) => id !== "000")
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  return {
    staffHurdleChecksum: await computeChecksum(staffHurdleOut),
    defaultChecksum: await computeChecksum(defaultOut),
    staffIds,
  };
}

async function assembleBaselineFromArtifacts(
  options: CliOptions,
): Promise<void> {
  console.log(`Assembling baseline from artifacts: ${options.baselineName}`);
  console.log("=".repeat(72));

  const baselineDir = join(
    PROJECT_ROOT,
    "test-baselines",
    options.baselineName,
  );
  if (await fileExists(baselineDir)) {
    if (!options.force) {
      throw new Error(
        `Baseline directory already exists: ${options.baselineName}. Re-run with --force to overwrite it.`,
      );
    }
    console.log(
      `Overwriting existing baseline directory: test-baselines/${options.baselineName}`,
    );
    await rm(baselineDir, { recursive: true, force: true });
  }

  await ensureDir(join(baselineDir, "source"));
  await ensureDir(join(baselineDir, "config"));
  await ensureDir(join(baselineDir, "outputs"));

  const sourcePath = await findSourceArtifact(
    options.month,
    options.year,
    options.sourceFile,
  );
  const paymentsPath = await findPaymentsArtifact(
    options.month,
    options.year,
    options.paymentsFile,
  );
  const logPair = await findLogArtifacts(
    options.runId,
    options.commissionLog,
    options.contractorLog,
  );

  const selection: ArtifactSelection = {
    sourcePath,
    sourceName: toMaterializedName(sourcePath),
    paymentsPath,
    paymentsName: toMaterializedName(paymentsPath),
    commissionLogPath: logPair.commissionPath,
    commissionLogName: toMaterializedName(logPair.commissionPath),
    contractorLogPath: logPair.contractorPath,
    contractorLogName: toMaterializedName(logPair.contractorPath),
    selectedRunId: logPair.selectedRunId,
  };

  console.log(`Source artifact:      ${basename(selection.sourcePath)}`);
  console.log(`Payments artifact:    ${basename(selection.paymentsPath)}`);
  console.log(`Commission artifact:  ${basename(selection.commissionLogPath)}`);
  console.log(`Contractor artifact:  ${basename(selection.contractorLogPath)}`);
  console.log(`Selected run key:     ${selection.selectedRunId}`);

  const sourceOut = join(baselineDir, "source", selection.sourceName);
  const paymentsOut = join(baselineDir, "outputs", selection.paymentsName);
  const commissionOut = join(
    baselineDir,
    "outputs",
    selection.commissionLogName,
  );
  const contractorOut = join(
    baselineDir,
    "outputs",
    selection.contractorLogName,
  );

  await materializeArtifact(selection.sourcePath, sourceOut);
  await materializeArtifact(selection.paymentsPath, paymentsOut);
  await materializeArtifact(selection.commissionLogPath, commissionOut);
  await materializeArtifact(selection.contractorLogPath, contractorOut);

  const { payrollMonth, payrollYear } = parsePayrollFromSourceFileName(
    selection.sourceName,
  );
  if (payrollMonth !== options.month || payrollYear !== options.year) {
    throw new Error(
      `Source artifact payroll period (${payrollYear}-${String(payrollMonth).padStart(2, "0")}) does not match requested --year/--month (${options.year}-${String(options.month).padStart(2, "0")})`,
    );
  }

  const sourceChecksum = await computeChecksum(sourceOut);
  const { staffHurdleChecksum, defaultChecksum, staffIds } =
    await writeConfigSnapshots(
      join(baselineDir, "config"),
      selection.sourceName,
      options.configCommit,
    );

  const currentCommit = options.commitSHA || (await getCommitSHA());
  const currentShortCommit = options.commitSHA
    ? options.commitSHA.slice(0, 7)
    : await getShortCommitSHA();

  const createdDate =
    options.createdDate ||
    parseRunKeyToDate(selection.selectedRunId)?.toISOString() ||
    new Date().toISOString();

  const metadata: BaselineMetadata = {
    baselineName: options.baselineName,
    commitSHA: currentCommit,
    createdDate,
    sourceFile: selection.sourceName,
    sourceFileChecksum: sourceChecksum,
    payrollMonth,
    payrollYear,
    configChecksums: {
      staffHurdle: staffHurdleChecksum,
      default: defaultChecksum,
    },
    staffCount: staffIds.length,
    staffIds,
    description:
      options.description ||
      `Baseline assembled from archived artifacts for ${String(payrollMonth).padStart(2, "0")}/${payrollYear} (run ${selection.selectedRunId}).`,
  };

  await writeJSON(join(baselineDir, "metadata.json"), metadata);

  const readme = `# Baseline: ${options.baselineName}

## Summary
- **Created**: ${new Date().toISOString()}
- **Baseline date**: ${createdDate}
- **Commit**: ${currentShortCommit} (${currentCommit})
- **Config snapshot source**: ${options.configCommit ? `git ${options.configCommit}` : "working tree config/"}
- **Source**: ${selection.sourceName}
- **Payroll Period**: ${payrollMonth}/${payrollYear}
- **Staff Count**: ${staffIds.length}
- **Run Key**: ${selection.selectedRunId}

## Description
${metadata.description}

## Files
- \`metadata.json\`
- \`source/${selection.sourceName}\`
- \`config/staffHurdle.json\`
- \`config/default.json\`
- \`outputs/${selection.paymentsName}\`
- \`outputs/${selection.commissionLogName}\`
- \`outputs/${selection.contractorLogName}\`

## Artifact Inputs
- Source: \`${selection.sourcePath.replace(`${PROJECT_ROOT}/`, "")}\`
- Payments: \`${selection.paymentsPath.replace(`${PROJECT_ROOT}/`, "")}\`
- Commission log: \`${selection.commissionLogPath.replace(`${PROJECT_ROOT}/`, "")}\`
- Contractor log: \`${selection.contractorLogPath.replace(`${PROJECT_ROOT}/`, "")}\`

## Usage
\`\`\`bash
BASELINE_NAME=${options.baselineName} npm run test:regression
\`\`\`
`;

  await writeFile(join(baselineDir, "README.md"), readme, "utf-8");

  console.log("\n" + "=".repeat(72));
  console.log(`✅ Baseline assembled: ${options.baselineName}`);
  console.log(`   Location: test-baselines/${options.baselineName}`);
  console.log("=".repeat(72));
}

function renderRelativePath(filePath: string): string {
  return filePath.replace(`${PROJECT_ROOT}/`, "");
}

async function validateConfigSnapshotSources(
  configCommit?: string,
): Promise<string[]> {
  const issues: string[] = [];

  if (!configCommit) {
    if (!(await fileExists(join(PROJECT_ROOT, "config", "default.json")))) {
      issues.push("Missing local config/default.json");
    }
    if (!(await fileExists(join(PROJECT_ROOT, "config", "staffHurdle.json")))) {
      issues.push("Missing local config/staffHurdle.json");
    }
    return issues;
  }

  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  try {
    await execFileAsync(
      "git",
      ["show", `${configCommit}:config/default.json`],
      {
        cwd: PROJECT_ROOT,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
  } catch {
    issues.push(
      `Missing config/default.json in commit ${configCommit}. Recovery: use a commit that contains that file or omit --config-commit to use working tree config/ files.`,
    );
  }

  let hasStaffHurdleInCommit = false;
  for (const candidate of [
    "config/staffHurdle.json",
    "config/staffhurdle.json",
  ]) {
    try {
      await execFileAsync("git", ["show", `${configCommit}:${candidate}`], {
        cwd: PROJECT_ROOT,
        maxBuffer: 10 * 1024 * 1024,
      });
      hasStaffHurdleInCommit = true;
      break;
    } catch {
      // Try next candidate path.
    }
  }

  if (
    !hasStaffHurdleInCommit &&
    !(await fileExists(join(PROJECT_ROOT, "config", "staffHurdle.json")))
  ) {
    issues.push(
      `No staff hurdle config found in commit ${configCommit}, and local config/staffHurdle.json is also missing. Recovery: restore local config/staffHurdle.json or use a commit that contains it.`,
    );
  }

  return issues;
}

async function runPreflight(options: CliOptions): Promise<void> {
  console.log(`Preflight baseline artifacts: ${options.baselineName}`);
  console.log("=".repeat(72));

  const issues: string[] = [];

  const baselineDir = join(
    PROJECT_ROOT,
    "test-baselines",
    options.baselineName,
  );
  if (await fileExists(join(baselineDir, "metadata.json"))) {
    if (options.force) {
      console.log(
        `Info: baseline metadata exists at ${renderRelativePath(join(baselineDir, "metadata.json"))} and would be overwritten in assemble mode because --force is set.`,
      );
    } else {
      console.log(
        `Warning: baseline metadata already exists at ${renderRelativePath(join(baselineDir, "metadata.json"))}`,
      );
    }
  }

  let sourcePath: string | undefined;
  let paymentsPath: string | undefined;
  let logPair:
    | {
        commissionPath: string;
        contractorPath: string;
        selectedRunId: string;
      }
    | undefined;

  try {
    sourcePath = await findSourceArtifact(
      options.month,
      options.year,
      options.sourceFile,
    );
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  try {
    paymentsPath = await findPaymentsArtifact(
      options.month,
      options.year,
      options.paymentsFile,
    );
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  try {
    logPair = await findLogArtifacts(
      options.runId,
      options.commissionLog,
      options.contractorLog,
    );
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  issues.push(...(await validateConfigSnapshotSources(options.configCommit)));

  if (sourcePath) {
    const sourceName = toMaterializedName(sourcePath);
    const parsed = parsePayrollFromSourceFileName(sourceName);
    if (
      parsed.payrollMonth !== options.month ||
      parsed.payrollYear !== options.year
    ) {
      issues.push(
        `Resolved source artifact period ${parsed.payrollYear}-${String(parsed.payrollMonth).padStart(2, "0")} does not match requested ${options.year}-${String(options.month).padStart(2, "0")}.`,
      );
    }
  }

  if (sourcePath) {
    console.log(`Source artifact:      ${renderRelativePath(sourcePath)}`);
  }
  if (paymentsPath) {
    console.log(`Payments artifact:    ${renderRelativePath(paymentsPath)}`);
  }
  if (logPair) {
    console.log(
      `Commission artifact:  ${renderRelativePath(logPair.commissionPath)}`,
    );
    console.log(
      `Contractor artifact:  ${renderRelativePath(logPair.contractorPath)}`,
    );
    console.log(`Selected run key:     ${logPair.selectedRunId}`);
  }
  if (options.configCommit) {
    console.log(`Config snapshot:      git ${options.configCommit}`);
  } else {
    console.log("Config snapshot:      working tree config/");
  }

  if (issues.length > 0) {
    console.log("\nPreflight failed. Resolve the following:");
    for (const issue of issues) {
      console.log(`\n- ${issue}`);
    }
    throw new Error("Preflight checks failed");
  }

  console.log("\n" + "=".repeat(72));
  console.log("✅ Preflight passed. Required artifacts/config are available.");
  console.log("   No files were created or modified.");
  console.log("=".repeat(72));
}

async function requireConfirmation(options: CliOptions): Promise<void> {
  if (!options.force) {
    return;
  }

  if (options.confirmForce) {
    return;
  }

  const isInteractiveTerminal = Boolean(input.isTTY && output.isTTY);
  if (!isInteractiveTerminal) {
    throw new Error(
      "Cannot run without confirmation in a non-interactive terminal. Re-run with --confirm-force to auto-confirm.",
    );
  }

  const baselineDir = join(
    PROJECT_ROOT,
    "test-baselines",
    options.baselineName,
  );
  const baselineExists = await fileExists(baselineDir);

  let prompt: string;
  if (baselineExists) {
    prompt = `Are you sure you want to overwrite the existing ${options.baselineName} baseline? [y/N] `;
  } else if (options.preflight) {
    prompt = `Are you sure you want to run preflight for baseline '${options.baselineName}' (${options.year}-${String(options.month).padStart(2, "0")})? [y/N] `;
  } else {
    prompt = `Are you sure you want to proceed with --force for baseline '${options.baselineName}' (${options.year}-${String(options.month).padStart(2, "0")})? [y/N] `;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    const accepted = answer === "y" || answer === "yes";
    if (!accepted) {
      throw new Error("Cancelled by user.");
    }
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    console.log("Assemble a baseline from archived artifacts");
    console.log("");
    console.log("Required:");
    console.log("  --name <baseline-name>");
    console.log("  --month <1-12>");
    console.log("  --year <yyyy>");
    console.log("");
    console.log("Optional:");
    console.log(
      "  --preflight                   Validate required artifacts and config only (no file writes)",
    );
    console.log(
      "  --force                       Overwrite an existing baseline directory",
    );
    console.log(
      "  --confirm-force               Auto-confirm and skip interactive prompt",
    );
    console.log(
      "  --run-id <YYYYMMDDTHHMMSS>    Pick specific commission/contractor pair",
    );
    console.log(
      "  --config-commit <sha>         Snapshot config/*.json from git commit",
    );
    console.log(
      "  --commit-sha <sha>            Value stored in metadata.commitSHA",
    );
    console.log(
      "  --created-date <iso-date>     Value stored in metadata.createdDate",
    );
    console.log(
      "  --description <text>          Metadata description override",
    );
    console.log(
      "  --source-file <path>          Explicit source artifact path (relative to repo)",
    );
    console.log(
      "  --payments-file <path>        Explicit payments artifact path (relative to repo)",
    );
    console.log(
      "  --commission-log <path>       Explicit commission log path (relative to repo)",
    );
    console.log(
      "  --contractor-log <path>       Explicit contractor log path (relative to repo)",
    );
    process.exit(0);
  }

  try {
    const options = parseArgs(args);
    await requireConfirmation(options);
    const execution = options.preflight
      ? runPreflight(options)
      : assembleBaselineFromArtifacts(options);

    execution
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export { assembleBaselineFromArtifacts };

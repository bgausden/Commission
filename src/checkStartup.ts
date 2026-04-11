import fs from "node:fs";
import path from "node:path";

/**
 * Mirrors the path resolution in node-config-ts/src/configPaths.js.
 * node-config-ts uses process.cwd() to locate the config directory, so it
 * fails silently when the script is not started from the project root.
 * This check aborts early with a clear error rather than letting the process
 * start with empty/missing config.
 */
const configDir = process.env["NODE_CONFIG_TS_DIR"] ?? "config";
const configPath = path.resolve(process.cwd(), configDir, "default.json");

if (!fs.existsSync(configPath)) {
  console.error(`Startup error: config not found at ${configPath}`);
  console.error(
    `Run the script from the project root, or set NODE_CONFIG_TS_DIR to the absolute path of the config directory.`,
  );
  process.exit(1);
}

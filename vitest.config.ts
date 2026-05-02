import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "scripts/**/*.spec.ts"],
    globals: true,
    environment: "node",
  },
});

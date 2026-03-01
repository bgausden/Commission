import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      xlsx: resolve(__dirname, "src/vendor-xlsx.mjs"),
    },
  },
  test: {
    include: ["src/**/*.spec.ts"],
    globals: true,
    environment: "node",
  },
});

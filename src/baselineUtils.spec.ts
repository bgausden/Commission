/**
 * Tests for baseline discovery utilities
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { findOldestBaseline } from "../scripts/utils/baselineUtils.js";

describe("findOldestBaseline", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `baseline-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns error when baselines directory does not exist", async () => {
    const result = await findOldestBaseline(
      "/nonexistent/path/xyz-12345-does-not-exist",
    );
    expect(result.ok).toBe(false);
  });

  it("returns error when no valid baselines exist", async () => {
    const result = await findOldestBaseline(tempDir);
    expect(result.ok).toBe(false);
  });

  it("returns the only baseline when one exists", async () => {
    await writeBaseline(
      tempDir,
      "jan-2025-baseline",
      "2025-01-15T10:00:00.000Z",
    );

    const result = await findOldestBaseline(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("jan-2025-baseline");
  });

  it("returns the oldest baseline when multiple exist", async () => {
    await writeBaseline(
      tempDir,
      "dec-2025-baseline",
      "2025-12-01T10:00:00.000Z",
    );
    await writeBaseline(
      tempDir,
      "jan-2025-baseline",
      "2025-01-15T10:00:00.000Z",
    );
    await writeBaseline(
      tempDir,
      "jun-2025-baseline",
      "2025-06-01T10:00:00.000Z",
    );

    const result = await findOldestBaseline(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("jan-2025-baseline");
  });

  it("skips directories without valid metadata", async () => {
    await mkdir(join(tempDir, "no-metadata"), { recursive: true });
    await writeBaseline(
      tempDir,
      "jan-2025-baseline",
      "2025-01-15T10:00:00.000Z",
    );

    const result = await findOldestBaseline(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("jan-2025-baseline");
  });
});

async function writeBaseline(
  root: string,
  name: string,
  createdDate: string,
): Promise<void> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "metadata.json"),
    JSON.stringify({ baselineName: name, createdDate }),
    "utf-8",
  );
}

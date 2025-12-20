import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fs, vol } from "memfs";
import path from "path";
import zlib from "zlib";
import { moveFilesToOldSubDir } from "./utility_functions.js";

vi.mock("node:fs");
vi.mock("node:fs/promises");

const LOGS_DIR = "/test/logs";
const OLD_DIR = "old";

describe("Log cleanup functionality", () => {
  beforeEach(() => {
    // Create a test logs directory with sample log files
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twoDaysAgo = now - 2 * 24 * 3600000;
    const threeDaysAgo = now - 3 * 24 * 3600000;
    const fourDaysAgo = now - 4 * 24 * 3600000;

    vol.fromJSON(
      {
        "./commission-20241210.log": "old commission log content",
        "./contractor-20241210.log": "old contractor log content",
        "./commission-20241212.log": "older commission log",
        "./contractor-20241212.log": "older contractor log",
        "./commission-20241215.log": "recent commission log",
        "./contractor-20241215.log": "recent contractor log",
        "./commission.debug": "debug log content",
        "./old/.gitkeep": "",
      },
      LOGS_DIR,
    );

    // Set modification times to simulate different ages
    const nowDate = new Date(now);
    fs.utimesSync(
      path.join(LOGS_DIR, "commission-20241210.log"),
      nowDate,
      new Date(fourDaysAgo),
    );
    fs.utimesSync(
      path.join(LOGS_DIR, "contractor-20241210.log"),
      nowDate,
      new Date(fourDaysAgo),
    );
    fs.utimesSync(
      path.join(LOGS_DIR, "commission-20241212.log"),
      nowDate,
      new Date(twoDaysAgo),
    );
    fs.utimesSync(
      path.join(LOGS_DIR, "contractor-20241212.log"),
      nowDate,
      new Date(twoDaysAgo),
    );
    fs.utimesSync(
      path.join(LOGS_DIR, "commission-20241215.log"),
      nowDate,
      new Date(oneHourAgo),
    );
    fs.utimesSync(
      path.join(LOGS_DIR, "contractor-20241215.log"),
      nowDate,
      new Date(oneHourAgo),
    );
    fs.utimesSync(
      path.join(LOGS_DIR, "commission.debug"),
      nowDate,
      new Date(threeDaysAgo),
    );
  });

  afterEach(() => {
    vol.reset();
  });

  describe("Current implementation (no compression, no retention)", () => {
    it("should move all files to old directory without compression", async () => {
      await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, false, 0);

      const mainDirFiles = fs.readdirSync(LOGS_DIR);
      const oldDirFiles = fs.readdirSync(path.join(LOGS_DIR, OLD_DIR));

      // All files should be moved to old directory
      expect(mainDirFiles).toEqual([OLD_DIR]);
      expect(oldDirFiles.sort()).toEqual([
        ".gitkeep",
        "commission-20241210.log",
        "commission-20241212.log",
        "commission-20241215.log",
        "commission.debug",
        "contractor-20241210.log",
        "contractor-20241212.log",
        "contractor-20241215.log",
      ]);

      // Files should not be compressed
      expect(oldDirFiles.filter((f) => String(f).endsWith(".gz"))).toHaveLength(
        0,
      );
    });
  });

  describe("Proposed implementation (compression + keep 2 recent)", () => {
    it("should compress old files and retain 2 most recent in main directory", async () => {
      await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, true, 2);

      const mainDirFiles = fs.readdirSync(LOGS_DIR).sort();
      const oldDirFiles = fs.readdirSync(path.join(LOGS_DIR, OLD_DIR)).sort();

      // Should keep 2 most recent files in main directory
      expect(mainDirFiles).toEqual([
        "commission-20241215.log",
        "contractor-20241215.log",
        OLD_DIR,
      ]);

      // Older files should be moved and compressed
      expect(oldDirFiles).toContain("commission-20241210.log.gz");
      expect(oldDirFiles).toContain("contractor-20241210.log.gz");
      expect(oldDirFiles).toContain("commission-20241212.log.gz");
      expect(oldDirFiles).toContain("contractor-20241212.log.gz");
      expect(oldDirFiles).toContain("commission.debug.gz");
    });

    it("should correctly decompress the compressed files", async () => {
      await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, true, 2);

      const compressedFilePath = path.join(
        LOGS_DIR,
        OLD_DIR,
        "commission-20241210.log.gz",
      );
      const compressedContent = fs.readFileSync(compressedFilePath);
      const decompressed = zlib.gunzipSync(compressedContent).toString();

      expect(decompressed).toBe("old commission log content");
    });

    it("should handle empty logs directory gracefully", async () => {
      vol.reset();
      vol.fromJSON({ "./old/.gitkeep": "" }, LOGS_DIR);

      await expect(async () => {
        await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, true, 2);
      }).not.toThrow();

      const mainDirFiles = fs.readdirSync(LOGS_DIR);
      expect(mainDirFiles).toEqual([OLD_DIR]);
    });

    it("should handle case where fewer files exist than retention count", async () => {
      vol.reset();
      vol.fromJSON(
        {
          "./commission-20241215.log": "only log",
          "./old/.gitkeep": "",
        },
        LOGS_DIR,
      );

      await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, true, 2);

      const mainDirFiles = fs.readdirSync(LOGS_DIR).sort();
      expect(mainDirFiles).toEqual(["commission-20241215.log", OLD_DIR]);

      const oldDirFiles = fs.readdirSync(path.join(LOGS_DIR, OLD_DIR));
      // Only .gitkeep should be in old directory
      expect(
        oldDirFiles.filter((f) => !String(f).startsWith(".")),
      ).toHaveLength(0);
    });

    it("should not move files that are in the retention count", async () => {
      vol.reset();
      const now = Date.now();
      vol.fromJSON(
        {
          "./commission-20241214.log": "older log",
          "./commission-20241215.log": "recent log",
          "./commission-20241216.log": "newest log",
          "./old/.gitkeep": "",
        },
        LOGS_DIR,
      );

      const nowDate = new Date(now);
      fs.utimesSync(
        path.join(LOGS_DIR, "commission-20241214.log"),
        nowDate,
        new Date(now - 3 * 24 * 3600000),
      );
      fs.utimesSync(
        path.join(LOGS_DIR, "commission-20241215.log"),
        nowDate,
        new Date(now - 2 * 24 * 3600000),
      );
      fs.utimesSync(
        path.join(LOGS_DIR, "commission-20241216.log"),
        nowDate,
        new Date(now - 1 * 24 * 3600000),
      );

      await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, true, 2);

      const mainDirFiles = fs.readdirSync(LOGS_DIR).sort();
      const oldDirFiles = fs.readdirSync(path.join(LOGS_DIR, OLD_DIR)).sort();

      // Two most recent should remain
      expect(mainDirFiles).toEqual([
        "commission-20241215.log",
        "commission-20241216.log",
        OLD_DIR,
      ]);

      // Oldest should be compressed and moved
      expect(oldDirFiles).toContain("commission-20241214.log.gz");
    });

    it("should not move explicitly retained files even if old", async () => {
      vol.reset();
      const now = Date.now();
      vol.fromJSON(
        {
          "./keepme.log": "important",
          "./other.log": "other",
          "./old/.gitkeep": "",
        },
        LOGS_DIR,
      );

      const nowDate = new Date(now);
      // Make keepme.log very old so it would be moved without explicit retain.
      fs.utimesSync(
        path.join(LOGS_DIR, "keepme.log"),
        nowDate,
        new Date(now - 10 * 24 * 3600000),
      );
      fs.utimesSync(
        path.join(LOGS_DIR, "other.log"),
        nowDate,
        new Date(now - 1 * 24 * 3600000),
      );

      await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, true, 0, ["keepme.log"]);

      const mainDirFiles = fs.readdirSync(LOGS_DIR).sort();
      const oldDirFiles = fs.readdirSync(path.join(LOGS_DIR, OLD_DIR)).sort();

      expect(mainDirFiles).toEqual(["keepme.log", OLD_DIR]);
      expect(oldDirFiles).toContain("other.log.gz");
    });
  });

  describe("Edge cases", () => {
    it("should handle compression with retention count of 0", async () => {
      await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, true, 0);

      const mainDirFiles = fs.readdirSync(LOGS_DIR);
      const oldDirFiles = fs.readdirSync(path.join(LOGS_DIR, OLD_DIR));

      // All files moved to old directory
      expect(mainDirFiles).toEqual([OLD_DIR]);

      // All files should be compressed
      expect(
        oldDirFiles.filter((f) => String(f).endsWith(".gz")).length,
      ).toBeGreaterThan(0);
    });

    it("should not compress with retention but without compression flag", async () => {
      await moveFilesToOldSubDir(LOGS_DIR, OLD_DIR, false, 2);

      const oldDirFiles = fs.readdirSync(path.join(LOGS_DIR, OLD_DIR));

      // Files should not be compressed even with retention
      expect(oldDirFiles.filter((f) => String(f).endsWith(".gz"))).toHaveLength(
        0,
      );
    });
  });
});

import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OUTPUT_STYLE_KEY,
  readPersistedStyleName,
  resolveStartupStyle,
  writePersistedStyleName,
} from "../lib/settings.js";
import { DEFAULT_STYLE, type StyleDefinition } from "../lib/types.js";

function style(name: string): StyleDefinition {
  return { name, description: `${name} style.`, mode: "append", instructions: `${name} text.`, source: "user" };
}

const STYLES = [DEFAULT_STYLE, style("brief"), style("terse")];

describe("resolveStartupStyle", () => {
  it("uses the flag value over persisted values", () => {
    const resolution = resolveStartupStyle({
      flagValue: "brief",
      projectValue: "terse",
      globalValue: "terse",
      styles: STYLES,
    });

    expect(resolution.style.name).toBe("brief");
    expect(resolution.unknown).toEqual([]);
  });

  it("uses the project value over the global value without a flag", () => {
    const resolution = resolveStartupStyle({ projectValue: "brief", globalValue: "terse", styles: STYLES });

    expect(resolution.style.name).toBe("brief");
    expect(resolution.unknown).toEqual([]);
  });

  it("uses the global value without a flag and a project value", () => {
    const resolution = resolveStartupStyle({ globalValue: "terse", styles: STYLES });

    expect(resolution.style.name).toBe("terse");
    expect(resolution.unknown).toEqual([]);
  });

  it("falls back to the default style without any value", () => {
    const resolution = resolveStartupStyle({ styles: STYLES });

    expect(resolution.style).toBe(DEFAULT_STYLE);
    expect(resolution.unknown).toEqual([]);
  });

  it("skips an unknown value, records it, and continues the resolution", () => {
    const resolution = resolveStartupStyle({
      flagValue: "missing-flag",
      projectValue: "missing-project",
      globalValue: "terse",
      styles: STYLES,
    });

    expect(resolution.style.name).toBe("terse");
    expect(resolution.unknown).toEqual([
      { origin: "flag", name: "missing-flag" },
      { origin: "project", name: "missing-project" },
    ]);
  });

  it("records only consulted values, so a shadowed global value stays unreported", () => {
    const resolution = resolveStartupStyle({ projectValue: "brief", globalValue: "missing", styles: STYLES });

    expect(resolution.style.name).toBe("brief");
    expect(resolution.unknown).toEqual([]);
  });

  it("treats the empty flag value as a selection attempt", () => {
    const resolution = resolveStartupStyle({ flagValue: "", globalValue: "brief", styles: STYLES });

    expect(resolution.style.name).toBe("brief");
    expect(resolution.unknown).toEqual([{ origin: "flag", name: "" }]);
  });

  it("matches names case-sensitively", () => {
    const resolution = resolveStartupStyle({ globalValue: "Brief", styles: STYLES });

    expect(resolution.style).toBe(DEFAULT_STYLE);
    expect(resolution.unknown).toEqual([{ origin: "global", name: "Brief" }]);
  });
});

describe("settings file access", () => {
  let root: string;
  let path: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "output-styles-settings-"));
    path = join(root, "config", "settings.json");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("readPersistedStyleName", () => {
    it("returns the persisted style name", async () => {
      await mkdir(join(root, "config"));
      await writeFile(path, JSON.stringify({ [OUTPUT_STYLE_KEY]: "brief" }), "utf8");

      expect(await readPersistedStyleName(path)).toBe("brief");
    });

    it.each([
      ["a missing key", "{}"],
      ["an empty string value", '{"outputStyle": ""}'],
      ["a non-string value", '{"outputStyle": 7}'],
      ["malformed JSON", "{nope"],
      ["a non-object root", '["outputStyle"]'],
    ])("reads %s as no persisted selection", async (_case, content) => {
      await mkdir(join(root, "config"));
      await writeFile(path, content, "utf8");

      expect(await readPersistedStyleName(path)).toBeUndefined();
    });

    it("reads a missing file as no persisted selection", async () => {
      expect(await readPersistedStyleName(path)).toBeUndefined();
    });
  });

  describe("writePersistedStyleName", () => {
    it("creates the settings file and its directory", async () => {
      await writePersistedStyleName(path, "brief");

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ [OUTPUT_STYLE_KEY]: "brief" });
    });

    it("changes only the outputStyle key and keeps every other key, nested objects included", async () => {
      const existing = {
        theme: "dark",
        compaction: { enabled: true, threshold: 0.8 },
        warnings: { muted: ["tool-output"] },
        unknownToEveryone: [1, 2, 3],
        [OUTPUT_STYLE_KEY]: "terse",
      };
      await mkdir(join(root, "config"));
      await writeFile(path, JSON.stringify(existing, null, 2), "utf8");

      await writePersistedStyleName(path, "brief");

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ ...existing, [OUTPUT_STYLE_KEY]: "brief" });
    });

    it("writes Pi's file format: two-space indentation and no trailing newline", async () => {
      await writePersistedStyleName(path, "brief");

      expect(await readFile(path, "utf8")).toBe(JSON.stringify({ [OUTPUT_STYLE_KEY]: "brief" }, null, 2));
    });

    it("rewrites the same value without an error", async () => {
      await writePersistedStyleName(path, "brief");
      await writePersistedStyleName(path, "brief");

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ [OUTPUT_STYLE_KEY]: "brief" });
    });

    it.each([
      ["malformed JSON", "{nope"],
      ["a non-object root", '"just a string"'],
    ])("throws on %s and leaves the file unchanged", async (_case, content) => {
      await mkdir(join(root, "config"));
      await writeFile(path, content, "utf8");

      await expect(writePersistedStyleName(path, "brief")).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe(content);
    });

    it("keeps the permissions of the replaced settings file", async () => {
      await mkdir(join(root, "config"));
      await writeFile(path, "{}", "utf8");
      await chmod(path, 0o600);

      await writePersistedStyleName(path, "brief");

      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ [OUTPUT_STYLE_KEY]: "brief" });
    });

    it("serializes concurrent writes into a valid file with the last value", async () => {
      const names = Array.from({ length: 20 }, (_, index) => `style-${index}`);

      await Promise.all(names.map((name) => writePersistedStyleName(path, name)));

      const content = await readFile(path, "utf8");
      expect(JSON.parse(content)).toEqual({ [OUTPUT_STYLE_KEY]: "style-19" });
      expect(await readdir(join(root, "config"))).toEqual(["settings.json"]);
    });

    it("waits for a concurrently held settings lock instead of interleaving", async () => {
      await writePersistedStyleName(path, "brief");
      const release = await lockfile.lock(path, { realpath: false });
      const releaseTimer = setTimeout(() => void release(), 150);

      try {
        await writePersistedStyleName(path, "terse");
      } finally {
        clearTimeout(releaseTimer);
      }

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ [OUTPUT_STYLE_KEY]: "terse" });
    });

    it("fails instead of writing when the settings lock stays held", async () => {
      await writePersistedStyleName(path, "brief");
      const release = await lockfile.lock(path, { realpath: false });

      try {
        await expect(writePersistedStyleName(path, "terse")).rejects.toThrow();
      } finally {
        await release();
      }

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ [OUTPUT_STYLE_KEY]: "brief" });
    });

    it("leaves no temporary file behind, a failed write included", async () => {
      await writePersistedStyleName(path, "brief");
      // A directory at the target path fails the read step of the next write.
      await rm(path);
      await mkdir(path);
      await expect(writePersistedStyleName(path, "terse")).rejects.toThrow();

      expect(await readdir(join(root, "config"))).toEqual(["settings.json"]);
    });
  });
});

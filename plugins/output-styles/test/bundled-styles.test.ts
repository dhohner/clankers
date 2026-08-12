import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverStyles } from "../lib/discovery.js";
import { applyStyle } from "../lib/prompt.js";
import { parseStyleFile } from "../lib/style-file.js";
import { DEFAULT_STYLE_NAME } from "../lib/types.js";

/** The style directory this plugin ships, the same one index.ts hands to the extension. */
const BUNDLED_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "styles");

/** A style whose frontmatter declares a name carries that name, not the file base name. */
const BUNDLED_STYLES = [
  { file: "asd-ste100", name: "ASD-STE100" },
  { file: "explanatory", name: "explanatory" },
  { file: "learning", name: "learning" },
];

let userDir: string;

beforeEach(async () => {
  userDir = await mkdtemp(join(tmpdir(), "output-styles-bundled-"));
});

afterEach(async () => {
  await rm(userDir, { recursive: true, force: true });
});

describe("bundled style files", () => {
  it("ships exactly the expected style files", async () => {
    const entries = await readdir(BUNDLED_DIR);
    expect(entries.sort()).toEqual(BUNDLED_STYLES.map((style) => `${style.file}.md`).sort());
  });

  it.each(BUNDLED_STYLES)("$file parses with a non-empty description, a body, and append mode", async ({
    file,
    name,
  }) => {
    const path = join(BUNDLED_DIR, `${file}.md`);
    const result = parseStyleFile(path, await readFile(path, "utf8"), "bundled");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.style.name).toBe(name);
    expect(result.style.description).not.toBe("");
    expect(result.style.instructions).not.toBe("");
    expect(result.style.mode).toBe("append");
  });

  it("offers default, ASD-STE100, explanatory, and learning on a fresh installation", async () => {
    const discovery = await discoverStyles({ bundledDir: BUNDLED_DIR });

    expect(discovery.styles.map((style) => style.name)).toEqual([
      DEFAULT_STYLE_NAME,
      "ASD-STE100",
      "explanatory",
      "learning",
    ]);
    expect(discovery.styles.every((style) => style.description !== "")).toBe(true);
    expect(discovery.problems).toEqual([]);
  });

  it("keeps default first and leaves the system prompt unchanged under it", async () => {
    const discovery = await discoverStyles({ bundledDir: BUNDLED_DIR });
    const first = discovery.styles[0];

    expect(first?.name).toBe(DEFAULT_STYLE_NAME);
    const prompt = "You are an expert coding assistant operating inside pi.";
    expect(applyStyle(prompt, first, { cwd: "/work/project" })).toBe(prompt);
  });

  it("lets a user style shadow a bundled style of the same name", async () => {
    await writeFile(
      join(userDir, "explanatory.md"),
      "---\ndescription: User override.\n---\nUser instruction text.\n",
      "utf8",
    );

    const discovery = await discoverStyles({ bundledDir: BUNDLED_DIR, userDir });

    const offered = discovery.styles.filter((style) => style.name === "explanatory");
    expect(offered).toHaveLength(1);
    expect(offered[0]?.source).toBe("user");
    expect(offered[0]?.instructions).toBe("User instruction text.");
  });
});

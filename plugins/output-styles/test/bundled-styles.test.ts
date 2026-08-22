import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverStyles } from "../lib/discovery.js";
import { applyStyle } from "../lib/prompt.js";
import { parseStyleFile } from "../lib/style-file.js";
import { DEFAULT_STYLE_NAME } from "../lib/types.js";

const PLUGIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The style directory this plugin ships, the same one index.ts hands to the extension. */
const BUNDLED_DIR = join(PLUGIN_DIR, "styles");

const README_PATH = join(PLUGIN_DIR, "README.md");

/**
 * The single list of shipped styles this file asserts against. A style whose frontmatter declares a
 * name carries that name, not the file base name, so both are stated here.
 */
const BUNDLED_STYLES = [
  { file: "tl-dr-uncle", name: "tl-dr-uncle" },
  { file: "explanatory", name: "explanatory" },
  { file: "learning", name: "learning" },
];

const BUNDLED_NAMES = BUNDLED_STYLES.map((style) => style.name);

/** The style names of the README's "Bundled Styles" table, which documents the shipped list. */
function documentedStyleNames(readme: string): string[] {
  const section = readme.split(/^## /m).find((part) => part.startsWith("Bundled Styles"));
  if (!section) throw new Error('the README has no "Bundled Styles" section');
  return [...section.matchAll(/^\| *`([^`]+)`/gm)].map((row) => row[1]);
}

let userDir: string;

beforeEach(async () => {
  userDir = await mkdtemp(join(tmpdir(), "output-styles-bundled-"));
});

afterEach(async () => {
  await rm(userDir, { recursive: true, force: true });
});

describe("bundled style files", () => {
  it("ships exactly the expected style files", async () => {
    expect(await readdir(BUNDLED_DIR)).toEqualUnordered(BUNDLED_STYLES.map((style) => `${style.file}.md`));
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

  it("offers the built-in default style and every bundled style on a fresh installation", async () => {
    const discovery = await discoverStyles({ bundledDir: BUNDLED_DIR });

    expect(discovery.styles.map((style) => style.name)).toEqualUnordered([DEFAULT_STYLE_NAME, ...BUNDLED_NAMES]);
    expect(discovery.styles.every((style) => style.description !== "")).toBe(true);
    expect(discovery.problems).toEqual([]);
  });

  it("orders that list with default first and the remaining styles by name", async () => {
    const names = (await discoverStyles({ bundledDir: BUNDLED_DIR })).styles.map((style) => style.name);

    expect(names[0]).toBe(DEFAULT_STYLE_NAME);
    expect(names.slice(1)).toEqual([...names.slice(1)].sort((left, right) => left.localeCompare(right, "en")));
  });

  it("documents every bundled style in the README table", async () => {
    const documented = documentedStyleNames(await readFile(README_PATH, "utf8"));

    expect(documented).toEqualUnordered([DEFAULT_STYLE_NAME, ...BUNDLED_NAMES]);
  });

  it("leaves the system prompt unchanged under the built-in default style", async () => {
    const discovery = await discoverStyles({ bundledDir: BUNDLED_DIR });
    const builtIn = discovery.styles.find((style) => style.name === DEFAULT_STYLE_NAME);

    expect(builtIn).toBeDefined();
    const prompt = "You are an expert coding assistant operating inside pi.";
    expect(applyStyle(prompt, builtIn, { cwd: "/work/project" })).toBe(prompt);
  });

  it("lets a user style shadow a bundled style of the same name", async () => {
    const shadowed = BUNDLED_STYLES[0];
    await writeFile(
      join(userDir, `${shadowed.file}.md`),
      `---\nname: ${shadowed.name}\ndescription: User override.\n---\nUser instruction text.\n`,
      "utf8",
    );

    const discovery = await discoverStyles({ bundledDir: BUNDLED_DIR, userDir });

    const offered = discovery.styles.filter((style) => style.name === shadowed.name);
    expect(offered).toHaveLength(1);
    expect(offered[0]?.source).toBe("user");
    expect(offered[0]?.instructions).toBe("User instruction text.");
  });
});

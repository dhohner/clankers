import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverStyles, readStyleDirectory } from "../lib/discovery.js";
import { DEFAULT_STYLE_NAME } from "../lib/types.js";

// File modes do not deny reads reliably on every OS or for a privileged user, so the read failure and
// the listing failure are injected instead of provoked through the filesystem.
const failures = vi.hoisted(() => ({
  readPath: undefined as string | undefined,
  listPath: undefined as string | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (path: Parameters<typeof actual.readFile>[0], ...rest: unknown[]) =>
      String(path) === failures.readPath
        ? Promise.reject(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }))
        : (actual.readFile as (...args: unknown[]) => unknown)(path, ...rest),
    readdir: (path: Parameters<typeof actual.readdir>[0], ...rest: unknown[]) =>
      String(path) === failures.listPath
        ? Promise.reject(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }))
        : (actual.readdir as (...args: unknown[]) => unknown)(path, ...rest),
  };
});

function styleFile(description: string, instructions: string, extra = ""): string {
  return `---\ndescription: ${description}\n${extra}---\n${instructions}\n`;
}

let root: string;
let bundledDir: string;
let userDir: string;
let projectDir: string;

async function write(directory: string, file: string, content: string): Promise<string> {
  const path = join(directory, file);
  await mkdir(directory, { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "output-styles-"));
  bundledDir = join(root, "bundled");
  userDir = join(root, "user");
  projectDir = join(root, "project");
});

afterEach(async () => {
  failures.readPath = undefined;
  failures.listPath = undefined;
  await rm(root, { recursive: true, force: true });
});

describe("readStyleDirectory", () => {
  it("reads only markdown files at the top level", async () => {
    await write(userDir, "terse.md", styleFile("Answer briefly.", "Be brief."));
    await write(userDir, "notes.txt", "not a style");
    await write(join(userDir, "nested"), "deep.md", styleFile("Nested.", "Nested text."));

    const discovery = await readStyleDirectory(userDir, "user");

    expect(discovery.styles.map((style) => style.name)).toEqual(["terse"]);
    expect(discovery.problems).toEqual([]);
  });

  it("resolves a same-directory name collision in filename order and reports the loser", async () => {
    await write(userDir, "a.md", styleFile("First file.", "First text.", "name: shared\n"));
    const losing = await write(userDir, "b.md", styleFile("Second file.", "Second text.", "name: shared\n"));

    const discovery = await readStyleDirectory(userDir, "user");

    expect(discovery.styles.map((style) => style.description)).toEqual(["First file."]);
    expect(discovery.problems).toEqual([
      { path: losing, reason: `style name "shared" is already defined by ${join(userDir, "a.md")}` },
    ]);
  });

  it("returns nothing for a missing directory", async () => {
    expect(await readStyleDirectory(join(root, "absent"), "project")).toEqual({
      styles: [],
      problems: [],
      unlistableDirectories: [],
    });
  });

  it("reports an unreadable file and keeps the readable ones", async () => {
    await write(userDir, "good.md", styleFile("Valid.", "Valid text."));
    failures.readPath = await write(userDir, "locked.md", styleFile("Locked.", "Locked text."));

    const discovery = await readStyleDirectory(userDir, "user");

    expect(discovery.styles.map((style) => style.name)).toEqual(["good"]);
    expect(discovery.problems).toEqual([
      { path: failures.readPath, reason: "cannot read file: EACCES: permission denied" },
    ]);
  });

  it("reports an unlistable directory and names it in the discovery result", async () => {
    failures.listPath = userDir;

    const discovery = await readStyleDirectory(userDir, "user");

    expect(discovery.styles).toEqual([]);
    expect(discovery.problems).toEqual([
      { path: userDir, reason: "cannot list directory: EACCES: permission denied" },
    ]);
    expect(discovery.unlistableDirectories).toEqual([userDir]);
  });
});

describe("discoverStyles", () => {
  it("offers the built-in default style first and orders the rest by name", async () => {
    await write(bundledDir, "zebra.md", styleFile("Last by name.", "Zebra text."));
    await write(userDir, "alpha.md", styleFile("First by name.", "Alpha text."));

    const discovery = await discoverStyles({ bundledDir, userDir, projectDir });

    expect(discovery.styles.map((style) => style.name)).toEqual([DEFAULT_STYLE_NAME, "alpha", "zebra"]);
    expect(discovery.problems).toEqual([]);
    expect(discovery.unlistableDirectories).toEqual([]);
  });

  it("orders names by the locale rule, not by code point, so case does not group them", async () => {
    await write(userDir, "alpha.md", styleFile("Lowercase.", "Alpha text."));
    await write(userDir, "Beta.md", styleFile("Uppercase.", "Beta text."));

    const discovery = await discoverStyles({ bundledDir, userDir });

    expect(discovery.styles.map((style) => style.name)).toEqual([DEFAULT_STYLE_NAME, "alpha", "Beta"]);
  });

  it("names an unlistable directory but not a missing one", async () => {
    await write(bundledDir, "plain.md", styleFile("Bundled.", "Bundled text."));
    failures.listPath = userDir;

    const discovery = await discoverStyles({ bundledDir, userDir, projectDir });

    expect(discovery.unlistableDirectories).toEqual([userDir]);
    expect(discovery.styles.map((style) => style.name)).toEqualUnordered([DEFAULT_STYLE_NAME, "plain"]);
    expect(discovery.problems).toEqual([
      { path: userDir, reason: "cannot list directory: EACCES: permission denied" },
    ]);
  });

  it("lets a project style win over a user style and a bundled style", async () => {
    await write(bundledDir, "terse.md", styleFile("Bundled.", "Bundled text."));
    await write(userDir, "terse.md", styleFile("User.", "User text."));
    await write(projectDir, "terse.md", styleFile("Project.", "Project text."));

    const discovery = await discoverStyles({ bundledDir, userDir, projectDir });

    const offered = discovery.styles.filter((style) => style.name === "terse");
    expect(offered).toHaveLength(1);
    expect(offered[0]?.source).toBe("project");
    expect(offered[0]?.instructions).toBe("Project text.");
    expect(discovery.problems).toEqual([]);
  });

  it("lets a user style win over a bundled style", async () => {
    await write(bundledDir, "terse.md", styleFile("Bundled.", "Bundled text."));
    await write(userDir, "terse.md", styleFile("User.", "User text."));

    const discovery = await discoverStyles({ bundledDir, userDir });

    expect(discovery.styles.find((style) => style.name === "terse")?.source).toBe("user");
  });

  it("ignores project styles when no project directory is given", async () => {
    await write(bundledDir, "bundled-style.md", styleFile("Bundled.", "Bundled text."));
    await write(userDir, "user-style.md", styleFile("User.", "User text."));
    await write(projectDir, "project-style.md", styleFile("Project.", "Project text."));

    const discovery = await discoverStyles({ bundledDir, userDir });

    expect(discovery.styles.map((style) => style.name)).toEqualUnordered([
      DEFAULT_STYLE_NAME,
      "bundled-style",
      "user-style",
    ]);
  });

  it("skips a malformed file, keeps the valid one, and reports the reason once", async () => {
    await write(userDir, "good.md", styleFile("Valid.", "Valid text."));
    const malformed = await write(userDir, "bad.md", "---\ndescription: Empty body.\n---\n\n");

    const discovery = await discoverStyles({ bundledDir, userDir });

    expect(discovery.styles.map((style) => style.name)).toEqualUnordered([DEFAULT_STYLE_NAME, "good"]);
    expect(discovery.problems).toEqual([{ path: malformed, reason: "style instruction text is empty" }]);
  });

  it("keeps the built-in default style and reports a file claiming that name", async () => {
    const byFilename = await write(userDir, "default.md", styleFile("Mine.", "My text."));
    const byField = await write(projectDir, "mine.md", styleFile("Mine.", "Project text.", `name: ${DEFAULT_STYLE_NAME}\n`));

    const discovery = await discoverStyles({ bundledDir, userDir, projectDir });

    const offered = discovery.styles.filter((style) => style.name === DEFAULT_STYLE_NAME);
    expect(offered).toHaveLength(1);
    expect(offered[0]?.instructions).toBe("");
    expect(discovery.problems).toEqualUnordered([
      { path: byFilename, reason: `style name "${DEFAULT_STYLE_NAME}" is reserved for the built-in style` },
      { path: byField, reason: `style name "${DEFAULT_STYLE_NAME}" is reserved for the built-in style` },
    ]);
  });

  it('skips a file claiming the reserved name "new" and keeps other styles selectable', async () => {
    const byFilename = await write(userDir, "new.md", styleFile("Mine.", "My text."));
    const byField = await write(projectDir, "other.md", styleFile("Mine.", "Project text.", "name: new\n"));
    await write(userDir, "terse.md", styleFile("Terse.", "Terse text."));

    const discovery = await discoverStyles({ bundledDir, userDir, projectDir });

    expect(discovery.styles.map((style) => style.name)).toEqualUnordered([DEFAULT_STYLE_NAME, "terse"]);
    expect(discovery.problems).toEqualUnordered([
      { path: byFilename, reason: 'style name "new" is reserved for the /output-style new subcommand' },
      { path: byField, reason: 'style name "new" is reserved for the /output-style new subcommand' },
    ]);
  });

  it("offers the bundled styles when no user or project directory exists", async () => {
    await write(bundledDir, "bundled-style.md", styleFile("Bundled.", "Bundled text."));

    const discovery = await discoverStyles({ bundledDir, userDir, projectDir });

    expect(discovery.styles.map((style) => style.name)).toEqualUnordered([DEFAULT_STYLE_NAME, "bundled-style"]);
    expect(discovery.problems).toEqual([]);
  });
});

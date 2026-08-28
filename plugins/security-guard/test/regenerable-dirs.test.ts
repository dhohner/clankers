import { link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allInsideRegenerableDirectory,
  isInsideRegenerableDirectory,
  REGENERABLE_DIRECTORY_NAMES,
} from "../src/infrastructure/node/regenerable-directory.js";
import { isInsideTemporaryRoot } from "../src/infrastructure/node/temporary-root.js";

// `stat` stays the real one; the wrapper only counts calls, for the memoization test below.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, stat: vi.fn(actual.stat) };
});

// Under the package, never under `/tmp` or `os.tmpdir()`: a fixture inside a temporary root would make the
// temporary-root proof accept every target, and these tests would pass without the regenerable rule doing
// anything. `.gitignore` covers the prefix.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => Promise<unknown>> = [];

function cleanupLater(path: string): string {
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

/** A project directory holding the regenerable entries the acceptance criteria name, plus `src`. */
async function makeProject(): Promise<string> {
  const project = cleanupLater(await mkdtemp(join(PACKAGE_ROOT, ".corpus-workspace-")));
  for (const directory of ["node_modules", "dist/cache", "packages/a/node_modules", "src", "dist-backup"]) {
    await mkdir(join(project, directory), { recursive: true });
  }
  await writeFile(join(project, "dist/app.js"), "");
  await writeFile(join(project, "src/a.ts"), "");
  return project;
}

/** A second project beside the first, so `../other/...` names a real directory in another tree. */
async function makeSibling(project: string, name: string): Promise<string> {
  const sibling = join(dirname(project), `${name}-${project.split("-").at(-1)}`);
  cleanupLater(sibling);
  await mkdir(join(sibling, "node_modules"), { recursive: true });
  await writeFile(join(sibling, "node_modules/secret"), "");
  return sibling;
}

const literal = (path: string) => ({ path, insideMktempDirectory: false, followsLinks: false });

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("regenerable directory targets", () => {
  it("is not decided by the temporary-root proof", async () => {
    const project = await makeProject();
    await expect(isInsideTemporaryRoot("dist", project)).resolves.toBe(false);
  });

  it("lists exactly the agreed directory names", () => {
    expect(new Set(REGENERABLE_DIRECTORY_NAMES)).toEqual(
      new Set([".next", "build", "coverage", "dist", "node_modules", "out", "target"]),
    );
  });

  it("accepts an exempt directory, an entry inside one, and a file inside one", async () => {
    const project = await makeProject();

    await expect(isInsideRegenerableDirectory("node_modules", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("dist", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("dist/", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("./dist/cache", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("dist/app.js", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("packages/a/node_modules", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory(join(project, "dist/cache"), "/")).resolves.toBe(true);
    // A file that does not exist yet is still confined to the directory it would be created in.
    await expect(isInsideRegenerableDirectory("dist/missing.js", project)).resolves.toBe(true);
  });

  it("rejects the source tree, the working directory, and its ancestors", async () => {
    const project = await makeProject();

    await expect(isInsideRegenerableDirectory("src", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("src/a.ts", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory(".", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("..", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("/", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("~", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("/etc/hosts", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist", undefined)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist", "relative")).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist", join(project, "missing"))).resolves.toBe(false);
  });

  it("rejects an exempt name that is not an existing directory", async () => {
    const project = await makeProject();
    await writeFile(join(project, "build"), "");
    await writeFile(join(project, "src/out"), "");
    await symlink(join(project, "missing"), join(project, "coverage"));

    // A source file named after build output is still source.
    await expect(isInsideRegenerableDirectory("build", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("build/*", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("src/out", project)).resolves.toBe(false);
    // Nothing exists at the name, so nothing there is build output either.
    await expect(isInsideRegenerableDirectory("target", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("target/x", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("coverage", project)).resolves.toBe(false);
  });

  it("matches a whole path component, never a prefix", async () => {
    const project = await makeProject();

    await expect(isInsideRegenerableDirectory("dist-backup", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist-backup/x", project)).resolves.toBe(false);
  });

  it("rejects an exempt directory in another project, however it is spelled", async () => {
    const project = await makeProject();
    const sibling = await makeSibling(project, "other");
    const relative = `../${sibling.split("/").at(-1)}/node_modules`;

    await expect(isInsideRegenerableDirectory(relative, project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory(join(sibling, "node_modules"), project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory(`dist/${relative}`, project)).resolves.toBe(false);
    // The package's own `node_modules` is another project's too, from a working directory inside it.
    await expect(isInsideRegenerableDirectory(join(PACKAGE_ROOT, "node_modules"), project)).resolves.toBe(false);
  });

  it("exempts nothing when the working directory is itself an exempt directory", async () => {
    const project = await makeProject();
    const inside = join(project, "node_modules/pkg");
    await mkdir(inside);
    await writeFile(join(inside, "index.js"), "");

    await expect(isInsideRegenerableDirectory("index.js", inside)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory(".", join(project, "node_modules"))).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("..", inside)).resolves.toBe(false);
  });

  it("resolves parent traversal the way the kernel does", async () => {
    const project = await makeProject();
    const sibling = await makeSibling(project, "linked");
    await symlink(sibling, join(project, "dist/link"));

    await expect(isInsideRegenerableDirectory("dist/../src", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/../dist/cache", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("src/../dist", project)).resolves.toBe(true);
    // `path.resolve` would read `dist/link/..` as `dist`; the kernel reads it as the sibling's parent.
    await expect(isInsideRegenerableDirectory("dist/link/../node_modules", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/link/..", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/missing/../cache", project)).resolves.toBe(false);
  });

  it("rejects an exempt entry that is a symlink out of the working directory", async () => {
    const project = await makeProject();
    const sibling = await makeSibling(project, "store");
    await rm(join(project, "node_modules"), { recursive: true });
    await symlink(join(sibling, "node_modules"), join(project, "node_modules"));

    await expect(isInsideRegenerableDirectory("node_modules", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("node_modules/", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("node_modules/secret", project)).resolves.toBe(false);
  });

  it("rejects an exempt entry that is a symlink to the source tree", async () => {
    const project = await makeProject();
    await symlink(join(project, "src"), join(project, "build"));

    await expect(isInsideRegenerableDirectory("build", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("build/a.ts", project)).resolves.toBe(false);
  });

  it("still accepts an exempt directory that contains a symlink out of the tree", async () => {
    const project = await makeProject();
    const sibling = await makeSibling(project, "elsewhere");
    await symlink(sibling, join(project, "dist/escape"));
    await symlink("/", join(project, "dist/root"));

    // The operand's own entry and target both resolve inside the working directory; `rm -rf dist` removes
    // the link entries below it without following them.
    await expect(isInsideRegenerableDirectory("dist", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("dist/escape", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/escape/node_modules", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/root/etc", project)).resolves.toBe(false);
  });

  it("rejects a link outside the exempt directory that points into it", async () => {
    const project = await makeProject();
    await symlink(join(project, "dist"), join(project, "src/to-dist"));
    await symlink(join(project, "dist/app.js"), join(project, "src/to-app"));

    // `rm -rf src/to-dist` removes the link entry, which lives in the source tree.
    await expect(isInsideRegenerableDirectory("src/to-dist", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("src/to-app", project)).resolves.toBe(false);
    // Reaching through the link to an entry inside `dist` is the kernel's resolution of the path.
    await expect(isInsideRegenerableDirectory("src/to-dist/app.js", project)).resolves.toBe(true);
  });

  it("reduces a wildcard to its literal directory prefix", async () => {
    const project = await makeProject();
    await symlink(join(project, "src"), join(project, "dist/to-src"));

    await expect(isInsideRegenerableDirectory("dist/*.js", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("dist/*", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("dist/cache/*", project)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory(join(project, "dist/*"), "/")).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("*", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("./*", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("src/*", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist-backup/*", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/to-src/*", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/*/..", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/*/*", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/**", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/**/*.js", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("*/node_modules", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/missing/*", project)).resolves.toBe(false);
  });

  it("keeps the temporary-root rules for hard links and ownership", async () => {
    const project = await makeProject();
    await writeFile(join(project, "src/original"), "secret");
    await link(join(project, "src/original"), join(project, "dist/linked"));

    await expect(isInsideRegenerableDirectory("dist/linked", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/app.js", project)).resolves.toBe(true);

    const uid = process.getuid?.() ?? 0;
    vi.spyOn(process, "getuid").mockReturnValue(uid + 1);
    await expect(isInsideRegenerableDirectory("dist/app.js", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist", project)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/*", project)).resolves.toBe(false);
  });

  it("checks the target of a symlink for a command that follows it", async () => {
    const project = await makeProject();
    await symlink(join(project, "src/a.ts"), join(project, "dist/to-source"));
    await symlink(join(project, "dist/app.js"), join(project, "dist/to-app"));
    await symlink(join(project, "src/absent"), join(project, "dist/dangling"));

    await expect(isInsideRegenerableDirectory("dist/to-source", project, true)).resolves.toBe(false);
    await expect(isInsideRegenerableDirectory("dist/to-app", project, true)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("dist/dangling", project, true)).resolves.toBe(false);
  });

  it("requires every target to be inside a regenerable directory", async () => {
    const project = await makeProject();
    const mktemp = (path: string) => ({ path, insideMktempDirectory: true, followsLinks: false });

    await expect(allInsideRegenerableDirectory([literal("dist"), literal("node_modules")], project)).resolves.toBe(
      true,
    );
    await expect(allInsideRegenerableDirectory([literal("dist"), literal("src")], project)).resolves.toBe(false);
    await expect(allInsideRegenerableDirectory([literal("dist"), literal("/tmp")], project)).resolves.toBe(false);
    await expect(allInsideRegenerableDirectory([], project)).resolves.toBe(false);
    await expect(allInsideRegenerableDirectory([mktemp("")], project)).resolves.toBe(false);
    await expect(allInsideRegenerableDirectory([literal("dist"), mktemp("/x")], project)).resolves.toBe(false);
  });

  it("stats each exempt directory once per call", async () => {
    const project = await makeProject();
    const files = Array.from({ length: 20 }, (_, index) => `dist/${index}.js`);
    await Promise.all(files.map((file) => writeFile(join(project, file), "")));
    const dist = join(await realpath(project), "dist");
    const { stat } = await import("node:fs/promises");
    vi.mocked(stat).mockClear();

    await expect(allInsideRegenerableDirectory(files.map(literal), project)).resolves.toBe(true);
    expect(vi.mocked(stat).mock.calls.filter(([path]) => path === dist)).toHaveLength(1);
  });

  it("resolves a working directory reached through a symlink", async () => {
    const project = await makeProject();
    const alias = cleanupLater(join(dirname(project), `.corpus-workspace-alias-${project.split("-").at(-1)}`));
    await symlink(project, alias);

    await expect(isInsideRegenerableDirectory("dist", alias)).resolves.toBe(true);
    await expect(isInsideRegenerableDirectory("src", alias)).resolves.toBe(false);
    await expect(realpath(alias)).resolves.toBe(await realpath(project));
  });
});

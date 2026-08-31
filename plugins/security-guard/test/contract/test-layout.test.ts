import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_ROOT = join(PACKAGE_ROOT, "src");
const TEST_ROOT = join(PACKAGE_ROOT, "test");

// A unit test is named for the module it covers and sits at the module's path, so a reader who opens a source
// file can predict its test. These directories are the exceptions, because what they assert belongs to no
// single module: `integration` drives the whole extension, `contract` asserts rules across all of `src`.
const UNMIRRORED_DIRECTORIES = new Set(["contract", "fixtures", "integration", "support"]);

async function testFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return testFiles(path);
      return entry.name.endsWith(".test.ts") ? [path] : [];
    }),
  );
  return nested.flat();
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (entry) => entry.isFile(),
    () => false,
  );
}

describe("test layout", () => {
  it("names every unit test after the source module it covers, at the module's path", async () => {
    const entries = await readdir(TEST_ROOT, { withFileTypes: true });
    const mirrored = entries.filter((entry) => entry.isDirectory() && !UNMIRRORED_DIRECTORIES.has(entry.name));
    // A rename that empties the mirror would otherwise satisfy every assertion below.
    expect(mirrored.length, "no test directory mirrors src").toBeGreaterThan(0);

    for (const directory of mirrored) {
      for (const file of await testFiles(join(TEST_ROOT, directory.name))) {
        const module = join(SOURCE_ROOT, relative(TEST_ROOT, file).replace(/\.test\.ts$/, ".ts"));
        expect(
          await isFile(module),
          `${relative(PACKAGE_ROOT, file)} covers no module at ${relative(PACKAGE_ROOT, module)}`,
        ).toBe(true);
      }
    }
  });

  it("keeps every test file inside a mirrored or exempt directory", async () => {
    const entries = await readdir(TEST_ROOT, { withFileTypes: true });
    const looseTests = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"));
    expect(
      looseTests.map((entry) => entry.name),
      "a test at the test root claims no module and no exemption",
    ).toEqual([]);
  });
});

import { mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTemporaryDirectoryTracker } from "../lib/temp-dirs.js";

const cleanups: Array<() => Promise<unknown>> = [];

function cleanupLater(path: string): string {
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function makeTemporaryDirectory(): Promise<string> {
  return cleanupLater(await mkdtemp(join(tmpdir(), "security-guard-test-")));
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("temporary directory tracker", () => {
  it("tracks a directory under a temporary root and consumes it once", async () => {
    const tracker = createTemporaryDirectoryTracker();
    const directory = await makeTemporaryDirectory();

    await tracker.track(directory);
    expect(tracker.has(directory)).toBe(true);

    await expect(tracker.consume([directory])).resolves.toBe(true);
    expect(tracker.has(directory)).toBe(false);
    await expect(tracker.consume([directory])).resolves.toBe(false);
  });

  it("refuses a symlink that points at a tracked directory", async () => {
    const tracker = createTemporaryDirectoryTracker();
    const directory = await makeTemporaryDirectory();
    const link = cleanupLater(`${directory}-link`);
    await symlink(directory, link);

    await tracker.track(link);

    expect(tracker.has(link)).toBe(false);
    await expect(tracker.consume([link])).resolves.toBe(false);
  });

  it("refuses a symlink swapped in after tracking", async () => {
    const tracker = createTemporaryDirectoryTracker();
    const directory = await makeTemporaryDirectory();
    const replacement = await makeTemporaryDirectory();

    await tracker.track(directory);
    await rm(directory, { recursive: true });
    await symlink(replacement, directory);

    await expect(tracker.consume([directory])).resolves.toBe(false);
  });

  it("refuses a directory recreated at the same path", async () => {
    const tracker = createTemporaryDirectoryTracker();
    const directory = await makeTemporaryDirectory();

    await tracker.track(directory);
    await rename(directory, cleanupLater(`${directory}-moved`));
    await mkdtemp(directory);

    await expect(tracker.consume([directory])).resolves.toBe(false);
  });

  it("refuses a directory owned by another user", async () => {
    const tracker = createTemporaryDirectoryTracker();
    const directory = await makeTemporaryDirectory();
    const getuid = vi.spyOn(process, "getuid").mockReturnValue(((process.getuid?.() ?? 0) + 1) % 65535);

    try {
      await tracker.track(directory);
    } finally {
      getuid.mockRestore();
    }

    expect(tracker.has(directory)).toBe(false);
  });

  it("refuses every directory when ownership cannot be verified", async () => {
    const tracker = createTemporaryDirectoryTracker();
    const directory = await makeTemporaryDirectory();
    const { getuid } = process;
    // Stands in for a platform without getuid, where the owner of a shared temporary root is unknowable.
    delete (process as { getuid?: typeof getuid }).getuid;

    try {
      await tracker.track(directory);
    } finally {
      process.getuid = getuid;
    }

    expect(tracker.has(directory)).toBe(false);
  });

  it("refuses paths that are not directories", async () => {
    const tracker = createTemporaryDirectoryTracker();
    const file = cleanupLater(join(await makeTemporaryDirectory(), "file.txt"));
    await writeFile(file, "");

    await tracker.track(file);

    expect(tracker.has(file)).toBe(false);
  });

  it("refuses directories outside a temporary root", async () => {
    const tracker = createTemporaryDirectoryTracker();
    const directory = cleanupLater(await mkdtemp(join(process.cwd(), "security-guard-outside-")));

    await tracker.track(directory);

    expect(tracker.has(directory)).toBe(false);
  });

  it("refuses a temporary root itself", async () => {
    const tracker = createTemporaryDirectoryTracker();

    await tracker.track(tmpdir());

    expect(tracker.has(tmpdir())).toBe(false);
  });

  it("evicts the oldest entry once the bound is exceeded", async () => {
    const tracker = createTemporaryDirectoryTracker(2);
    const [first, second, third] = await Promise.all([
      makeTemporaryDirectory(),
      makeTemporaryDirectory(),
      makeTemporaryDirectory(),
    ]);

    await tracker.track(first);
    await tracker.track(second);
    await tracker.track(third);

    expect([tracker.has(first), tracker.has(second), tracker.has(third)]).toEqual([false, true, true]);
  });

  it("refreshes insertion order when a path is tracked again", async () => {
    const tracker = createTemporaryDirectoryTracker(2);
    const [first, second, third] = await Promise.all([
      makeTemporaryDirectory(),
      makeTemporaryDirectory(),
      makeTemporaryDirectory(),
    ]);

    await tracker.track(first);
    await tracker.track(second);
    await tracker.track(first);
    await tracker.track(third);

    expect([tracker.has(first), tracker.has(second), tracker.has(third)]).toEqual([true, false, true]);
  });
});

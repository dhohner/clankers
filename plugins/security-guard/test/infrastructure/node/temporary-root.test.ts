import { link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allInsideTemporaryRoot, isInsideTemporaryRoot } from "../../../src/infrastructure/node/temporary-root.js";

// `os.tmpdir()` reads TMPDIR, which this module deliberately does not trust, so a run whose TMPDIR sits
// outside the platform roots would build these fixtures where none of the assertions below hold.
const TEMPORARY_ROOT = "/tmp";

const cleanups: Array<() => Promise<unknown>> = [];

function cleanupLater(path: string): string {
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function makeTemporaryDirectory(): Promise<string> {
  return cleanupLater(await mkdtemp(join(TEMPORARY_ROOT, "security-guard-test-")));
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("temporary root targets", () => {
  it("accepts absolute and relative targets that resolve inside a temporary root", async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, "file.txt"), "");
    await mkdir(join(directory, "nested"));

    await expect(isInsideTemporaryRoot(directory, "/")).resolves.toBe(true);
    await expect(isInsideTemporaryRoot(join(directory, "file.txt"), "/")).resolves.toBe(true);
    await expect(isInsideTemporaryRoot("file.txt", directory)).resolves.toBe(true);
    // `..` is resolved through the directory it follows, exactly as the kernel resolves it.
    await expect(isInsideTemporaryRoot("./nested/../file.txt", directory)).resolves.toBe(true);
    await expect(isInsideTemporaryRoot("./missing/../file.txt", directory)).resolves.toBe(false);
  });

  // `path.resolve` collapses `link/..` to the link's own parent; the kernel resolves it to the parent of the
  // link's target, so a target checked lexically is not the path the removal reaches.
  it("resolves parent traversal through a symlink, not around it", async () => {
    const directory = await makeTemporaryDirectory();
    const outside = await realpath("/etc");
    await symlink(outside, join(directory, "link"));

    await expect(isInsideTemporaryRoot("link/../hosts", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("link/..", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("link/../*", directory)).resolves.toBe(false);
  });

  it("accepts a target that does not exist yet inside an existing temporary directory", async () => {
    const directory = await makeTemporaryDirectory();

    await expect(isInsideTemporaryRoot("missing.txt", directory)).resolves.toBe(true);
    await expect(isInsideTemporaryRoot(join(directory, "missing"), "/")).resolves.toBe(true);
  });

  it("rejects a target whose parent does not exist", async () => {
    const directory = await makeTemporaryDirectory();

    await expect(isInsideTemporaryRoot("missing/child.txt", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("/nonexistent/security-guard-probe", directory)).resolves.toBe(false);
  });

  it("rejects the temporary root itself and anything outside it", async () => {
    const directory = await makeTemporaryDirectory();

    await expect(isInsideTemporaryRoot(TEMPORARY_ROOT, directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot(".", TEMPORARY_ROOT)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("/", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("/etc/hosts", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("file.txt", "/")).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("file.txt", "relative")).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("file.txt", undefined)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("", directory)).resolves.toBe(false);
  });

  it("rejects parent traversal that leaves the temporary root", async () => {
    const directory = await makeTemporaryDirectory();
    const depth = TEMPORARY_ROOT.split("/").filter(Boolean).length + 2;

    await expect(isInsideTemporaryRoot(`${"../".repeat(depth)}etc/hosts`, directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("..", directory)).resolves.toBe(false);
  });

  it("follows symlinks and rejects links that point outside a temporary root", async () => {
    const directory = await makeTemporaryDirectory();
    const inside = join(directory, "inside");
    await mkdir(inside);
    await symlink("/", join(directory, "escape"));
    await symlink(inside, join(directory, "stay"));

    await expect(isInsideTemporaryRoot("escape", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("escape/etc/hosts", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("stay", directory)).resolves.toBe(true);
  });

  it("reduces a wildcard to its literal directory prefix", async () => {
    const directory = await makeTemporaryDirectory();
    await mkdir(join(directory, "build"));
    await symlink("/", join(directory, "escape"));

    await expect(isInsideTemporaryRoot("*", directory)).resolves.toBe(true);
    await expect(isInsideTemporaryRoot("build/*.o", directory)).resolves.toBe(true);
    await expect(isInsideTemporaryRoot(join(directory, "*"), "/")).resolves.toBe(true);
    // The shared root itself holds every user's workspaces, so a wildcard directly in it does not qualify.
    await expect(isInsideTemporaryRoot(join(TEMPORARY_ROOT, "security-guard-*"), "/")).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("escape/*", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("*/../../etc", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("build/*/..", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("*/*", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("**", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("build/**/*.o", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("/*", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("/etc/*", directory)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("missing/*", directory)).resolves.toBe(false);
  });

  it("rejects a link outside the temporary root that points into it", async () => {
    const directory = await makeTemporaryDirectory();
    const outside = cleanupLater(await mkdtemp(join(await realpath(homedir()), ".security-guard-test-")));
    await symlink(directory, join(outside, "link"));

    // `rm -rf link` removes the link entry, which lives outside any temporary root.
    await expect(isInsideTemporaryRoot(join(outside, "link"), "/")).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("link", outside)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot("link/", outside)).resolves.toBe(false);
    // Reaching through the link to an entry inside the root is the kernel's resolution of the path.
    await writeFile(join(directory, "file.txt"), "");
    await expect(isInsideTemporaryRoot("link/file.txt", outside)).resolves.toBe(true);
  });

  it("rejects a hard-linked file, whose other name may lie outside the temporary root", async () => {
    const directory = await makeTemporaryDirectory();
    const outside = cleanupLater(await mkdtemp(join(await realpath(homedir()), ".security-guard-test-")));
    await writeFile(join(outside, "original"), "secret");
    await link(join(outside, "original"), join(directory, "linked"));
    await writeFile(join(directory, "plain"), "");

    await expect(isInsideTemporaryRoot(join(directory, "linked"), "/")).resolves.toBe(false);
    await expect(isInsideTemporaryRoot(join(directory, "plain"), "/")).resolves.toBe(true);
  });

  // `truncate`, `chmod`, `chown`, and a redirection act on what a link points to. A dangling link inside the
  // root would make them create the file it names, wherever that is, and a link to a hard-linked file would
  // reach the inode its other name shares.
  it("checks the target of a symlink for a command that follows it", async () => {
    const directory = await makeTemporaryDirectory();
    const outside = cleanupLater(await mkdtemp(join(await realpath(homedir()), ".security-guard-test-")));
    await symlink(join(outside, "absent"), join(directory, "dangling"));
    await writeFile(join(outside, "original"), "secret");
    await link(join(outside, "original"), join(directory, "linked"));
    await symlink(join(directory, "linked"), join(directory, "to-linked"));
    await writeFile(join(directory, "plain"), "");
    await symlink(join(directory, "plain"), join(directory, "to-plain"));
    await symlink(join(outside, "original"), join(directory, "to-outside"));

    await expect(isInsideTemporaryRoot(join(directory, "dangling"), "/", true)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot(join(directory, "to-linked"), "/", true)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot(join(directory, "to-outside"), "/", true)).resolves.toBe(false);
    await expect(isInsideTemporaryRoot(join(directory, "to-plain"), "/", true)).resolves.toBe(true);
    await expect(isInsideTemporaryRoot(join(directory, "plain"), "/", true)).resolves.toBe(true);
    await expect(isInsideTemporaryRoot(join(directory, "missing"), "/", true)).resolves.toBe(true);
    // `rm` removes the link entry itself, so the dangling link and the link to the hard-linked file qualify.
    await expect(isInsideTemporaryRoot(join(directory, "dangling"), "/")).resolves.toBe(true);
    await expect(isInsideTemporaryRoot(join(directory, "to-linked"), "/")).resolves.toBe(true);

    const follows = (path: string) => ({ path, insideMktempDirectory: false, followsLinks: true });
    await expect(allInsideTemporaryRoot([follows("dangling")], directory)).resolves.toBe(false);
    await expect(allInsideTemporaryRoot([follows("plain")], directory)).resolves.toBe(true);
  });

  it("rejects an existing entry the current user does not own", async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, "file.txt"), "");
    const uid = process.getuid?.() ?? 0;
    vi.spyOn(process, "getuid").mockReturnValue(uid + 1);

    await expect(isInsideTemporaryRoot(join(directory, "file.txt"), "/")).resolves.toBe(false);
    await expect(isInsideTemporaryRoot(join(directory, "*"), "/")).resolves.toBe(false);
    // An entry that does not exist yet has no owner, and creating it affects nobody else.
    await expect(isInsideTemporaryRoot(join(directory, "missing"), "/")).resolves.toBe(true);
  });

  it("requires every target to be inside a temporary root", async () => {
    const directory = await makeTemporaryDirectory();
    const literal = (path: string) => ({ path, insideMktempDirectory: false, followsLinks: false });

    await expect(allInsideTemporaryRoot([literal("a"), literal("b/")], directory)).resolves.toBe(true);
    await expect(allInsideTemporaryRoot([literal("a"), literal("/etc/hosts")], directory)).resolves.toBe(false);
    await expect(allInsideTemporaryRoot([], directory)).resolves.toBe(false);
  });

  // TMPDIR, TMP, and TEMP reach os.tmpdir(); a host launched with one pointing at a project or home
  // directory would otherwise make that whole directory removable without approval. `/etc` stands in for
  // such a directory because it exists on every supported platform and is never a temporary root, unlike
  // the checkout, which may itself sit under `/tmp`.
  it("ignores a temporary root inherited from the environment", async () => {
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = "/etc";
    vi.resetModules();

    try {
      const { isInsideTemporaryRoot: isolated } = await import("../../../src/infrastructure/node/temporary-root.js");
      await expect(isolated("/etc/hosts", "/")).resolves.toBe(false);
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
      vi.resetModules();
    }
  });

  it("accepts a mktemp-derived target only when its suffix is also harmless on an empty variable", async () => {
    const mktemp = (path: string) => ({ path, insideMktempDirectory: true, followsLinks: false });

    await expect(allInsideTemporaryRoot([mktemp("")], "/")).resolves.toBe(true);
    // A failed substitution leaves the suffix itself as the operand, read from the filesystem root.
    await expect(allInsideTemporaryRoot([mktemp("/security-guard-absent-probe")], "/")).resolves.toBe(true);
    await expect(allInsideTemporaryRoot([mktemp("/etc")], "/")).resolves.toBe(false);
    await expect(allInsideTemporaryRoot([mktemp("/build/*")], undefined)).resolves.toBe(false);
    await expect(allInsideTemporaryRoot([mktemp("/..")], "/")).resolves.toBe(false);
    await expect(allInsideTemporaryRoot([mktemp("/build/../../etc")], "/")).resolves.toBe(false);
  });
});

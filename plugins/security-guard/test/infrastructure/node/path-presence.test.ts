import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectPath } from "../../../src/infrastructure/node/path-presence.js";

let workspace: string;

beforeAll(async () => {
  workspace = await mkdtemp("/tmp/security-guard-path-presence-");
  await mkdir(join(workspace, "src"));
  await writeFile(join(workspace, "README.md"), "");
  await symlink("src", join(workspace, "src-link"));
  await symlink("README.md", join(workspace, "file-link"));
  await symlink("missing", join(workspace, "dangling"));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("inspectPath", () => {
  it.each([
    ["main", "absent"],
    ["HEAD~1", "absent"],
    ["feature/x", "absent"],
    ["README.md", "other"],
    ["src", "directory"],
    ["src/", "directory"],
    ["./src", "directory"],
    ["src-link", "directory"],
    ["src-link/", "directory"],
    ["file-link", "other"],
    // Git and `mv` both see the link entry, so a dangling link is present and never a directory.
    ["dangling", "other"],
    // A file used as a directory names nothing, and nothing that is a directory.
    ["README.md/", "other"],
    ["README.md/x", "other"],
    ["..", "directory"],
  ])("answers %s with %s", async (path, presence) => {
    await expect(inspectPath(path, workspace)).resolves.toBe(presence);
  });

  it("resolves an absolute path as itself", async () => {
    await expect(inspectPath(join(workspace, "src"), "/nowhere")).resolves.toBe("directory");
  });

  it.each(["", "relative/dir"])("rejects the working directory %j", async (cwd) => {
    await expect(inspectPath("main", cwd)).rejects.toThrow("working directory is not absolute");
  });

  it("rejects an empty path", async () => {
    await expect(inspectPath("", workspace)).rejects.toThrow("path is empty");
  });
});

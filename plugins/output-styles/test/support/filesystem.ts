import { styleFileSystem, type StyleFileSystem } from "../../src/storage/filesystem.js";
import { createHarness as createBaseHarness } from "./extension-harness.js";

export type ListFailures = { path?: string; errors?: Array<{ message: string; code: string }> };

/** Modes cannot reliably deny access under privileged users, so inject failures by path. */
export function failingFileSystem(
  listFailures: ListFailures,
  accessFailures: { path?: string } = {},
  writeFailures: { path?: string } = {},
): StyleFileSystem {
  return {
    ...styleFileSystem,
    async list(path) {
      if (path !== listFailures.path) return styleFileSystem.list(path);

      const spec = listFailures.errors?.shift() ?? { message: "EACCES: permission denied", code: "EACCES" };
      throw Object.assign(new Error(spec.message), { code: spec.code });
    },
    async access(path) {
      if (path === accessFailures.path) {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      }

      await styleFileSystem.access(path);
    },
    async createFile(path, content) {
      if (path === writeFailures.path) {
        await styleFileSystem.createFile(path, "partial content");
        throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
      }

      await styleFileSystem.createFile(path, content);
    },
  };
}

export function harnessWithFileSystem(filesystem: StyleFileSystem): typeof createBaseHarness {
  return (options = {}) => createBaseHarness({ ...options, filesystem });
}

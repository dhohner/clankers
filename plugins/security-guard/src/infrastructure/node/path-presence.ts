import { lstat, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { PathPresence } from "../../application/ports.ts";
import { absolutePath } from "./temporary-root.ts";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

/**
 * Reports what `path`, resolved against `cwd` the way the command will resolve it, names. The entry itself
 * decides between absent and present, so a dangling symlink is present, the way Git and `mv` see it; what
 * a present symlink points to decides whether it is a directory, the way `mv` treats a destination. A
 * missing intermediate directory is absent, and a file used as one is neither absent nor a directory. A
 * working directory that is not absolute, an empty path, and any other filesystem error throw, so the
 * caller fails closed instead of reading a guess.
 */
export async function inspectPath(path: string, cwd: string): Promise<PathPresence> {
  if (!isAbsolute(cwd)) throw new Error(`working directory is not absolute: ${JSON.stringify(cwd)}`);
  if (path === "") throw new Error("path is empty");
  const absolute = absolutePath(cwd, path);
  let entry;
  try {
    entry = await lstat(absolute);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT") return "absent";
    if (code === "ENOTDIR") return "other";
    throw new Error(
      `cannot inspect ${JSON.stringify(absolute)}: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }
  if (!entry.isSymbolicLink()) return entry.isDirectory() ? "directory" : "other";
  const target = await stat(absolute).catch(() => undefined);
  return target?.isDirectory() ? "directory" : "other";
}

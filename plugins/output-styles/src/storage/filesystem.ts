import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";

/** The filesystem operations used to discover and create style files. */
export interface StyleFileSystem {
  list(directory: string): Promise<Dirent[]>;
  read(path: string): Promise<string>;
  access(path: string): Promise<void>;
  createDirectory(directory: string): Promise<void>;
  createFile(path: string, content: string): Promise<void>;
}

export const styleFileSystem: StyleFileSystem = {
  list: (directory) => readdir(directory, { withFileTypes: true }),
  read: (path) => readFile(path, "utf8"),
  access,
  createDirectory: async (directory) => {
    await mkdir(directory, { recursive: true });
  },
  createFile: (path, content) => writeFile(path, content, { encoding: "utf8", flag: "wx" }),
};

/** Node filesystem failures carry an optional error code. Other rejection values have none. */
export function fileErrorCode(cause: unknown): string | undefined {
  if (!(cause instanceof Error) || !("code" in cause)) return undefined;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Decode Node's optional errno code at the filesystem boundary.
  return typeof cause.code === "string" ? cause.code : undefined;
}

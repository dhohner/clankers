import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { promisify } from "node:util";
import { dirname } from "node:path";
import * as filesystem from "node:fs/promises";

export type PreferenceFileSystem = Pick<
  typeof filesystem,
  "readFile" | "writeFile" | "rename" | "rm" | "stat" | "chmod" | "chown" | "open"
> & {
  mkdir: (path: string, options: { recursive: true }) => Promise<string | undefined>;
};

export type PreferenceRead =
  | { status: "absent" }
  | { status: "saved"; value: boolean }
  | { status: "failed"; error: Error };

const execute = promisify(execFile);

async function assertNoMacOSACL(path: string): Promise<void> {
  if (process.platform !== "darwin") return;

  // Node cannot copy ACLs. Numeric owners and masked control characters keep the listing to
  // one line unless ls appends ACL entries; checking only the mode marker would miss ACLs with xattrs.
  const { stdout } = await execute("/bin/ls", ["-Ldenq", "--color=never", "--", path], {
    env: { ...process.env, LC_ALL: "C" },
  }).catch((error) => {
    throw new Error(`Inspect macOS ACL for ${path} failed`, { cause: error });
  });

  if (!/^[bcdlps-][rwxstST-]{9}[@+ ]/.test(stdout) || stdout.trimEnd().split("\n").length !== 1) {
    throw new Error("Cannot safely replace a notification preference with a macOS ACL");
  }
}

export class NotificationPreference {
  readonly path: string;
  private readonly io: PreferenceFileSystem;

  constructor(path: string, io: PreferenceFileSystem = filesystem) {
    this.path = path;
    this.io = io;
  }

  async read(): Promise<PreferenceRead> {
    try {
      const value: unknown = JSON.parse(await this.io.readFile(this.path, "utf8"));

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the persisted JSON boolean at the filesystem boundary.
      if (typeof value !== "boolean") throw new Error("expected a JSON boolean");

      return { status: "saved", value };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return { status: "absent" };

      return {
        status: "failed",
        error: new Error(`Read notification preference ${this.path} failed`, { cause: error }),
      };
    }
  }

  async write(value: boolean): Promise<{ warning?: Error }> {
    try {
      return await this.replace(value);
    } catch (error) {
      throw new Error(`Write notification preference ${this.path} failed: ${String(error)}`, { cause: error });
    }
  }

  private async replace(value: boolean): Promise<{ warning?: Error }> {
    await this.io.mkdir(dirname(this.path), { recursive: true });
    let previous: Stats | undefined;

    try {
      previous = await this.io.stat(this.path);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }

    const mode = previous ? previous.mode & 0o777 : 0o600;

    if (previous) await assertNoMacOSACL(this.path);

    const temporary = `${this.path}.${randomUUID()}.tmp`;

    try {
      // Check inherited ACLs while the new file is empty, before exposing the assigned value.
      await this.io.writeFile(temporary, "", { mode: 0o600, flag: "wx" });
      await assertNoMacOSACL(temporary);

      if (previous) await this.io.chown(temporary, previous.uid, previous.gid);
      await this.io.writeFile(temporary, JSON.stringify(value), { flag: "r+" });
      await this.io.chmod(temporary, mode);
      const file = await this.io.open(temporary, "r");

      try {
        await file.sync();
      } finally {
        await file.close();
      }

      await this.io.rename(temporary, this.path);
    } catch (error) {
      try {
        await this.io.rm(temporary, { force: true });
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          `${String(error)}; temporary file cleanup failed: ${String(cleanup)}`,
          { cause: cleanup },
        );
      }

      throw error;
    }

    // Replacement is committed: later directory sync or cleanup failures must not undo publication.
    try {
      const directory = await this.io.open(dirname(this.path), "r");

      try {
        await directory.sync();
      } finally {
        await directory.close();
      }

      return {};
    } catch (error) {
      return {
        warning: new Error(`Notification preference ${this.path} committed; ${String(error)}`, { cause: error }),
      };
    }
  }
}

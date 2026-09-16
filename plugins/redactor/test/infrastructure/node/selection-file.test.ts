import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SelectionConfigError } from "../../../src/domain/credential-selection.ts";
import { SelectionFile, SelectionWriteFailure } from "../../../src/infrastructure/node/selection-file.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "redactor-selection-"));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

const ONE = { version: 1 as const, selections: [{ name: "GITHUB_TOKEN", label: "GitHub" }] };
const TWO = { version: 1 as const, selections: [...ONE.selections, { name: "NPM_TOKEN", label: "npm" }] };
const THIRD = { name: "SLACK_TOKEN", label: "Slack" };

const SELECTION_FILE_SOURCE = fileURLToPath(
  new URL("../../../src/infrastructure/node/selection-file.ts", import.meta.url),
);

// Holds the lock in another process the way `SelectionFile` does, writes the file while holding it, then releases it.
const LOCK_HOLDER = `
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [path, lock, text, holdMs] = process.argv.slice(2);
mkdirSync(lock);
writeFileSync(join(lock, "owner-" + process.pid + "-aa"), "");
process.stdout.write("locked\\n");
await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
writeFileSync(path, text);
rmSync(lock, { recursive: true });
`;

// Runs one update in another process, so a lock that never times out cannot freeze this worker.
const UPDATER = `
import { SelectionFile } from ${JSON.stringify(SELECTION_FILE_SOURCE)};
const [path, timeout] = process.argv.slice(2);
try {
  await new SelectionFile(path, { lockTimeoutMs: Number(timeout) }).update(() => ({ version: 1, selections: [] }));
  process.stdout.write("updated");
} catch (error) {
  process.stdout.write(String(error.code));
}
`;

async function lockedByAlivePid(lock: string): Promise<void> {
  await mkdir(lock);
  await writeFile(join(lock, `owner-${process.pid}-bb`), "");
}

async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  const pid = child.pid!;
  await once(child, "exit");
  return pid;
}

function spawnHolder(script: string, path: string, text: string, holdMs: number) {
  return spawn(process.execPath, [script, path, `${path}.lock`, text, String(holdMs)], {
    stdio: ["ignore", "pipe", "inherit"],
  });
}

async function output(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<string> {
  let text = "";
  child.stdout!.on("data", (chunk: Buffer) => {
    text += chunk.toString();
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  const [code, signal] = await once(child, "exit");
  clearTimeout(timer);
  return signal ? `killed:${String(signal)}` : `${text}:${String(code)}`;
}

describe("selection file", () => {
  it("loads an empty selection when the file is missing", async () => {
    const file = new SelectionFile(join(await directory(), "missing", "credentials.json"));

    expect(file.load()).toEqual({ version: 1, selections: [] });
  });

  it("writes, creates parent directories, and reads back names and labels only", async () => {
    const path = join(await directory(), "nested", "credentials.json");
    const file = new SelectionFile(path);

    await file.update(() => ONE);

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(ONE);
    expect(file.load()).toEqual(ONE);
    expect(await readdir(join(path, ".."))).toEqual(["credentials.json"]);
  });

  it("reports a failed write with fixed wording and leaves the previous file intact", async () => {
    const root = await directory();
    const path = join(root, "credentials.json");
    const file = new SelectionFile(path);
    await file.update(() => ONE);
    await chmod(root, 0o500);
    cleanups.push(() => chmod(root, 0o700));

    let error: unknown;
    try {
      await file.update(() => ({ version: 1, selections: [] }));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SelectionWriteFailure);
    expect((error as SelectionWriteFailure).message).toBe(
      "redactor: writing the credential configuration failed; the selection was not changed",
    );
    expect((error as SelectionWriteFailure).code).toBe("EACCES");
    expect((error as Error).message).not.toContain(root);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(ONE);
    expect(await readdir(root)).toEqual(["credentials.json"]);
  });

  it("rejects an invalid selection before touching the file", async () => {
    const root = await directory();
    const path = join(root, "credentials.json");
    const file = new SelectionFile(path);

    await expect(file.update(() => ({ version: 1, selections: [{ name: "1BAD", label: "x" }] }))).rejects.toThrow(
      SelectionConfigError,
    );
    expect(await readdir(root)).toEqual([]);
  });

  describe("update", () => {
    it("applies the change to the file as another process left it after releasing the lock", async () => {
      const root = await directory();
      const configDir = join(root, "config");
      const path = join(configDir, "credentials.json");
      const script = join(root, "hold-lock.mjs");
      await writeFile(script, LOCK_HOLDER);
      const file = new SelectionFile(path);
      await file.update(() => ONE);
      const holder = spawnHolder(script, path, JSON.stringify(TWO), 200);
      const exited = once(holder, "exit");
      await once(holder.stdout, "data");

      const result = await file.update((current) => ({ version: 1, selections: [...current.selections, THIRD] }));

      const [code] = await exited;
      expect(code).toBe(0);
      expect(result).toEqual({ version: 1, selections: [...TWO.selections, THIRD] });
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(result);
      expect(await readdir(configDir)).toEqual(["credentials.json"]);
    });

    it("reports a lock that stays held with fixed wording and leaves the file and the lock alone", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const file = new SelectionFile(path, { lockTimeoutMs: 50 });
      await file.update(() => ONE);
      await lockedByAlivePid(`${path}.lock`);

      let error: unknown;
      try {
        await file.update(() => TWO);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(SelectionWriteFailure);
      expect((error as SelectionWriteFailure).code).toBe("ELOCKED");
      expect((error as Error).message).not.toContain(root);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(ONE);
      expect(new Set(await readdir(root))).toEqual(new Set(["credentials.json", "credentials.json.lock"]));
    });

    it("keeps the event loop running while it waits for a held lock", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const file = new SelectionFile(path, { lockTimeoutMs: 200 });
      await lockedByAlivePid(`${path}.lock`);
      let ticks = 0;
      const timer = setInterval(() => {
        ticks += 1;
      }, 10);

      const error = await (async () => file.update(() => ONE))().catch((caught: unknown) => caught);

      clearInterval(timer);
      expect((error as SelectionWriteFailure).code).toBe("ELOCKED");
      expect(ticks).toBeGreaterThan(5);
    });

    it("keeps waiting on a lock whose owner is alive, however old the lock is", async () => {
      const root = await directory();
      const configDir = join(root, "config");
      const path = join(configDir, "credentials.json");
      const script = join(root, "hold-lock.mjs");
      await writeFile(script, LOCK_HOLDER);
      const file = new SelectionFile(path, { lockTimeoutMs: 50 });
      await file.update(() => ONE);
      const holder = spawnHolder(script, path, JSON.stringify(TWO), 400);
      await once(holder.stdout, "data");
      const past = new Date(Date.now() - 60_000);
      await utimes(`${path}.lock`, past, past);

      let error: unknown;
      try {
        await file.update(() => ({ version: 1, selections: [THIRD] }));
      } catch (caught) {
        error = caught;
      }

      const [code] = await once(holder, "exit");
      expect(code).toBe(0);
      expect((error as SelectionWriteFailure).code).toBe("ELOCKED");
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(TWO);
      expect(await readdir(configDir)).toEqual(["credentials.json"]);
    });

    it("replaces a lock whose owner process is dead", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const file = new SelectionFile(path, { lockTimeoutMs: 50 });
      await file.update(() => ONE);
      await mkdir(`${path}.lock`);
      await writeFile(join(`${path}.lock`, `owner-${await deadPid()}-cc`), "");

      await file.update(() => TWO);

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(TWO);
      expect(await readdir(root)).toEqual(["credentials.json"]);
    });

    it("removes only a dead owner and keeps waiting while a live owner shares the lock", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const lock = `${path}.lock`;
      const file = new SelectionFile(path, { lockTimeoutMs: 50 });
      await file.update(() => ONE);
      await mkdir(lock);
      const dead = `owner-${await deadPid()}-cc`;
      await writeFile(join(lock, dead), "");
      await writeFile(join(lock, `owner-${process.pid}-bb`), "");

      let error: unknown;
      try {
        await file.update(() => TWO);
      } catch (caught) {
        error = caught;
      }

      expect((error as SelectionWriteFailure).code).toBe("ELOCKED");
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(ONE);
      expect(await readdir(lock)).toEqual([`owner-${process.pid}-bb`]);
    });

    it("finishes an update whose lock another process replaced during release", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const lock = `${path}.lock`;
      const foreign = join(root, "foreign-staging");
      const file = new SelectionFile(path);
      await file.update(() => ONE);

      const result = await file.update(() => {
        for (const entry of readdirSync(lock)) rmSync(join(lock, entry));
        mkdirSync(foreign);
        writeFileSync(join(foreign, `owner-${process.pid}-dd`), "");
        renameSync(foreign, lock);
        return TWO;
      });

      expect(result).toEqual(TWO);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(TWO);
      expect(await readdir(lock)).toEqual([`owner-${process.pid}-dd`]);
    });

    it("releases only the lock it acquired", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const lock = `${path}.lock`;
      const file = new SelectionFile(path);
      await file.update(() => ONE);

      await file.update(() => {
        writeFileSync(join(lock, `owner-${process.pid}-dd`), "");
        return TWO;
      });

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(TWO);
      expect(await readdir(lock)).toEqual([`owner-${process.pid}-dd`]);
    });

    it("gives up at the deadline when the lock path is a dangling symlink", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const script = join(root, "update.mjs");
      await writeFile(script, UPDATER);
      await new SelectionFile(path).update(() => ONE);
      await symlink(join(root, "missing"), `${path}.lock`);
      const updater = spawn(process.execPath, [script, path, "50"], { stdio: ["ignore", "pipe", "ignore"] });

      const result = await output(updater, 2000);

      expect(result).toBe("ELOCKED:0");
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(ONE);
    });

    it("writes nothing and keeps no lock when the change keeps the current selection", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const file = new SelectionFile(path);
      await file.update(() => ONE);
      const before = await stat(path);

      expect(await file.update(() => undefined)).toEqual(ONE);

      expect((await stat(path)).mtimeMs).toBe(before.mtimeMs);
      expect(await readdir(root)).toEqual(["credentials.json"]);
    });

    it("releases the lock and writes nothing when the change throws", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const file = new SelectionFile(path);
      await file.update(() => ONE);

      await expect(
        file.update(() => {
          throw new Error("change failed");
        }),
      ).rejects.toThrow("change failed");

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(ONE);
      expect(await readdir(root)).toEqual(["credentials.json"]);
    });

    it("reports a malformed file as a configuration error and writes nothing", async () => {
      const root = await directory();
      const path = join(root, "credentials.json");
      const file = new SelectionFile(path);
      await writeFile(path, "{ not json");

      await expect(file.update(() => TWO)).rejects.toThrow(SelectionConfigError);

      expect(await readFile(path, "utf8")).toBe("{ not json");
      expect(await readdir(root)).toEqual(["credentials.json"]);
    });
  });

  it("reads a directory path as a load failure without throwing raw errors", async () => {
    const root = await directory();
    await mkdir(join(root, "credentials.json"));
    const file = new SelectionFile(join(root, "credentials.json"));

    expect(() => file.load()).toThrow(SelectionConfigError);
  });
});

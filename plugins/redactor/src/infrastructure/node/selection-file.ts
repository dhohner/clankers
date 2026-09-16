import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  parseSelectionConfig,
  type SelectionConfig,
  SelectionConfigError,
  serializeSelectionConfig,
} from "../../domain/credential-selection.ts";

/** Fixed wording keeps paths out of diagnostics; `code` carries the file system error code or `ELOCKED`. */
export class SelectionWriteFailure extends Error {
  readonly code: string | undefined;

  constructor(cause: unknown) {
    super("redactor: writing the credential configuration failed; the selection was not changed");
    this.name = "SelectionWriteFailure";
    this.code = errorCode(cause);
  }
}

export interface SelectionFileOptions {
  /** Upper bound on waiting for another process to release the lock before a change fails with `ELOCKED`. */
  lockTimeoutMs?: number;
}

const DEFAULT_LOCK_TIMEOUT_MS = 2000;
const LOCK_RETRY_MS = 20;
/** The owner is the entry name, so a reclaimer removes exactly the dead owner it judged and nothing else. */
const LOCK_OWNER_ENTRY = /^owner-(\d+)-([0-9a-f]+)$/;
/** Rename errors that mean another lock occupies the path; every other error is a failed write. */
const LOCK_HELD_CODES = new Set(["EEXIST", "ENOTEMPTY", "ENOTDIR", "EISDIR"]);

interface LockOwner {
  pid: number;
  token: string;
}

/**
 * Persist selection names and labels.
 * Validate before writing, write a sibling file, then rename it, so a failed write leaves the previous file whole.
 * Refuse to replace a malformed file, so a hand-edited file survives until the user repairs it.
 * Every write happens under a lock directory next to the file, so concurrent Pi processes cannot lose each other's change.
 * The lock records its owner process; it is reclaimed only when that process is dead, never for its age, so a
 * suspended writer keeps its exclusion until it finishes.
 * A lock directory without an owner entry is free: `rename` replaces an empty directory atomically and fails on a
 * non-empty one, so neither reclaim nor release ever moves or deletes another process's lock.
 */
export class SelectionFile {
  readonly path: string;
  readonly #lockPath: string;
  readonly #lockTimeoutMs: number;

  constructor(path: string, options: SelectionFileOptions = {}) {
    this.path = path;
    this.#lockPath = `${path}.lock`;
    this.#lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  }

  /** Throws `SelectionConfigError` for an unreadable or malformed file; a missing file is an empty selection. */
  load(): SelectionConfig {
    let text: string;
    try {
      text = readFileSync(this.path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") return parseSelectionConfig("");
      throw new SelectionConfigError("the file could not be read");
    }
    return parseSelectionConfig(text);
  }

  /**
   * Read, change, and write under the lock, so the change applies to what other processes have written.
   * `change` returns the next selection, or `undefined` to keep the current one without a write.
   * Throws `SelectionConfigError` for a malformed file or an invalid result and `SelectionWriteFailure` for a
   * failed write or a lock that stays held.
   * Waiting for the lock yields to the event loop, so a held lock never freezes the host.
   */
  update(change: (current: SelectionConfig) => SelectionConfig | undefined): Promise<SelectionConfig> {
    return this.#locked(() => {
      const current = this.load();
      const next = change(current);
      if (next === undefined) return current;
      const text = serializeSelectionConfig(next);
      parseSelectionConfig(text);
      this.#write(text);
      return next;
    });
  }

  #write(text: string): void {
    const temporary = join(dirname(this.path), `.${process.pid}-${Date.now()}.credentials.tmp`);
    try {
      writeFileSync(temporary, text, { mode: 0o600 });
      renameSync(temporary, this.path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw new SelectionWriteFailure(error);
    }
  }

  async #locked<T>(operation: () => T): Promise<T> {
    const owner = { pid: process.pid, token: randomBytes(8).toString("hex") };
    await this.#acquireLock(owner);
    try {
      return operation();
    } finally {
      this.#releaseLock(owner);
    }
  }

  /**
   * The lock is a directory that already holds its owner entry when it appears, because it is staged beside the
   * file and moved into place with `rename`, which fails atomically while another lock occupies the path.
   * The deadline is checked on every attempt, so a lock path that can never be taken still ends in `ELOCKED`.
   */
  async #acquireLock(owner: LockOwner): Promise<void> {
    const deadline = Date.now() + this.#lockTimeoutMs;
    for (;;) {
      if (this.#tryAcquire(owner)) return;
      if (Date.now() >= deadline) throw new SelectionWriteFailure(lockHeldError());
      if (!this.#reclaimDeadLock()) await sleep(LOCK_RETRY_MS);
    }
  }

  #tryAcquire(owner: LockOwner): boolean {
    const staging = this.#siblingPath(owner, "staging");
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      rmSync(staging, { recursive: true, force: true });
      mkdirSync(staging);
      writeFileSync(join(staging, ownerEntry(owner)), "");
      renameSync(staging, this.#lockPath);
      return true;
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      if (LOCK_HELD_CODES.has(errorCode(error) ?? "")) return false;
      throw new SelectionWriteFailure(error);
    }
  }

  /**
   * Only dead owners are removed, each by its own entry name, so a lock that changed hands since the directory
   * was listed is left alone; the emptied directory is then taken through the ordinary `rename`.
   * A directory with no owner entry or an unreadable one counts as held, so an unfinished release is never
   * mistaken for a dead lock.
   */
  #reclaimDeadLock(): boolean {
    const owners = readOwners(this.#lockPath);
    if (owners.length === 0) return false;
    const dead = owners.filter((owner) => !isAlive(owner.pid));
    for (const owner of dead) rmSync(join(this.#lockPath, ownerEntry(owner)), { force: true });
    return dead.length === owners.length;
  }

  /**
   * Release removes this operation's own entry and then the directory only while it is empty.
   * Another process may take the emptied directory before that removal; its lock is then left untouched.
   * The write has already persisted, so a failed release changes nothing and is ignored.
   */
  #releaseLock(owner: LockOwner): void {
    try {
      rmSync(join(this.#lockPath, ownerEntry(owner)), { force: true });
      rmdirSync(this.#lockPath);
    } catch {
      return;
    }
  }

  #siblingPath(owner: LockOwner, purpose: string): string {
    return join(dirname(this.path), `.${owner.pid}-${owner.token}.${purpose}.lock.tmp`);
  }
}

function ownerEntry(owner: LockOwner): string {
  return `owner-${owner.pid}-${owner.token}`;
}

function readOwners(lockPath: string): LockOwner[] {
  let entries: string[];
  try {
    entries = readdirSync(lockPath);
  } catch {
    return [];
  }
  const owners: LockOwner[] = [];
  for (const entry of entries) {
    const match = LOCK_OWNER_ENTRY.exec(entry);
    if (match) owners.push({ pid: Number(match[1]), token: match[2]! });
  }
  return owners;
}

/** `EPERM` means the process exists under another user, so only `ESRCH` counts as dead. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

function lockHeldError(): Error & { code: string } {
  return Object.assign(new Error("another process holds the credential configuration lock"), { code: "ELOCKED" });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : undefined;
}

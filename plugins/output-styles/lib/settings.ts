import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { describeError } from "./discovery.ts";
import { DEFAULT_STYLE, DEFAULT_STYLE_NAME, type StyleDefinition } from "./types.ts";

/** File name Pi uses for both the global and the project settings file. */
export const SETTINGS_FILE_NAME = "settings.json";

/** Settings key holding the persisted style name. Unknown to Pi, which preserves it on its own writes. */
export const OUTPUT_STYLE_KEY = "outputStyle";

/** Where a startup style value came from. Also the resolution order, flag first. */
export type StartupOrigin = "flag" | "project" | "global";

export type StartupResolution = {
  style: StyleDefinition;
  /** Values that were consulted but named no known style, in resolution order, for one report each. */
  unknown: Array<{ origin: StartupOrigin; name: string }>;
};

export type StartupValues = {
  /** The `--output-style` flag value. Present means the flag was given, the empty string included. */
  flagValue?: string;
  /** Persisted project value. Only pass it for a trusted project. */
  projectValue?: string;
  /** Persisted global value. */
  globalValue?: string;
  styles: StyleDefinition[];
};

/**
 * Resolves the starting style: the flag, then the project value, then the global value, each only
 * when it names a known style, and the built-in default otherwise. A consulted value that names no
 * known style is recorded once and resolution moves on, so a temporarily unavailable style is
 * skipped rather than blocking the fallback chain.
 */
export function resolveStartupStyle(values: StartupValues): StartupResolution {
  const unknown: StartupResolution["unknown"] = [];

  const candidates: Array<[StartupOrigin, string | undefined]> = [
    ["flag", values.flagValue],
    ["project", values.projectValue],
    ["global", values.globalValue],
  ];

  for (const [origin, name] of candidates) {
    if (name === undefined) continue;
    const match = values.styles.find((style) => style.name === name);
    if (match) return { style: match, unknown };
    unknown.push({ origin, name });
  }

  const fallback = values.styles.find((style) => style.name === DEFAULT_STYLE_NAME) ?? DEFAULT_STYLE;
  return { style: fallback, unknown };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The same lock Pi's own settings storage takes, so a plugin write never interleaves with a
 * concurrent Pi settings write. `realpath: false` matches Pi and lets the path be locked before
 * the file exists. The retry window is sized like Pi's ten 20ms attempts, with backoff.
 */
const LOCK_OPTIONS = { realpath: false, retries: { retries: 10, minTimeout: 20, maxTimeout: 100 } } as const;

async function withSettingsLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  const release = await lockfile.lock(path, LOCK_OPTIONS);
  try {
    return await action();
  } finally {
    await release();
  }
}

/**
 * ENOENT and ENOTDIR both prove no file sits at the path. Any other failure, EACCES for example,
 * leaves existence unknown, so it is thrown and reported as a failed read rather than read as
 * absence, which would silently drop a stored selection.
 */
async function settingsFileExistsOrThrowOnUnknown(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

/**
 * One write chain per settings path, because Pi runs command and shortcut handlers unserialized:
 * two rapid switches would otherwise read, write, and rename concurrently and could interleave
 * into a torn file. A failed write never blocks the writes queued behind it.
 */
const writeQueues = new Map<string, Promise<void>>();

function enqueueSettingsWrite<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const result = previous.then(task);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  writeQueues.set(path, tail);
  void tail.then(() => {
    if (writeQueues.get(path) === tail) writeQueues.delete(path);
  });
  return result;
}

/** Reads a settings file into an object. A missing file is an empty object; anything else invalid throws. */
async function readSettingsObject(path: string): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`settings file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainObject(parsed)) throw new Error("settings file does not hold a JSON object");
  return parsed;
}

/**
 * The three outcomes of a settings read, kept mutually exclusive by the `status` tag: a persisted
 * name, no persisted selection, or a failure the caller reports. A value and a failure can never
 * accompany each other, so a caller cannot read one while the other holds the real outcome.
 */
export type PersistedStyleRead =
  | { status: "selected"; value: string }
  | { status: "none" }
  | { status: "failed"; failure: string };

/**
 * Reads the persisted style name from a settings file. A missing file, a missing key, and the empty
 * string are no persisted selection and no failure. An unreadable file, malformed content, and a
 * value of another type are a failure the caller reports: they carry a selection the user made and
 * would otherwise be indistinguishable from a fresh installation. The read never throws and never
 * touches the file, so a broken settings file degrades the startup style instead of failing the
 * session.
 */
export async function readPersistedStyleName(path: string): Promise<PersistedStyleRead> {
  try {
    // Like Pi's storage, a missing file is not locked: locking would create the lock directory and
    // thereby write into a directory a plain read must leave untouched.
    if (!(await settingsFileExistsOrThrowOnUnknown(path))) return { status: "none" };
    return await withSettingsLock(path, async (): Promise<PersistedStyleRead> => {
      const settings = await readSettingsObject(path);
      const value = settings[OUTPUT_STYLE_KEY];
      // Only an absent key and the empty string are documented as "no selection". Any other
      // non-string value is content this plugin did not write, so it is malformed, not empty.
      if (value === undefined || value === "") return { status: "none" };
      if (typeof value !== "string") {
        return { status: "failed", failure: `settings key "${OUTPUT_STYLE_KEY}" does not hold a string` };
      }
      return { status: "selected", value };
    });
  } catch (error) {
    return { status: "failed", failure: describeError(error) };
  }
}

/**
 * Writes the style name into a settings file, changing only the `outputStyle` key and keeping every
 * other key byte-identical in value. The whole read-modify-write runs inside the in-process queue
 * and under Pi's settings lock, so neither a rapid double switch nor a concurrent Pi settings write
 * can interleave with it. The write goes through a uniquely named temporary file and a rename, so a
 * crash mid-write can never leave a torn settings file for Pi to choke on. A file that exists but
 * cannot be read as a JSON object makes this throw instead of clobbering the content.
 */
export async function writePersistedStyleName(path: string, name: string): Promise<void> {
  return enqueueSettingsWrite(path, async () => {
    // The parent directory must exist before locking, because the lock directory lives next to the
    // settings file.
    await mkdir(dirname(path), { recursive: true });
    await withSettingsLock(path, async () => {
      const settings = await readSettingsObject(path);
      settings[OUTPUT_STYLE_KEY] = name;

      // The rename replaces the inode, so the replaced file's permissions must be carried over
      // explicitly; chmod, unlike a writeFile mode, is not narrowed by the umask. A missing file
      // keeps the process default for the newly created one.
      let mode: number | undefined;
      try {
        mode = (await stat(path)).mode & 0o777;
      } catch {
        mode = undefined;
      }

      const temporaryPath = `${path}.${randomUUID()}.tmp`;
      try {
        // The same format Pi writes: two-space indentation, no trailing newline.
        await writeFile(temporaryPath, JSON.stringify(settings, null, 2), "utf8");
        if (mode !== undefined) await chmod(temporaryPath, mode);
        await rename(temporaryPath, path);
      } catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
      }
    });
  });
}

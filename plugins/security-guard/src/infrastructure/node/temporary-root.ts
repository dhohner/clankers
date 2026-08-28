import { execFile } from "node:child_process";
import type { Stats } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { promisify } from "node:util";
import type { DestructiveTarget } from "../../proof/types.ts";

let canonicalTemporaryRoots: Promise<string[]> | undefined;

const execFileAsync = promisify(execFile);

const GLOB_CHARACTERS = /[*?[]/;

async function getDarwinUserTemporaryRoot(): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;

  try {
    const { stdout } = await execFileAsync("/usr/bin/getconf", ["DARWIN_USER_TEMP_DIR"], { encoding: "utf8" });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getCanonicalTemporaryRoots(): Promise<string[]> {
  canonicalTemporaryRoots ??= (async () => {
    // Platform-defined roots only. `os.tmpdir()` reads TMPDIR, TMP, and TEMP from the environment, so a host
    // launched with TMPDIR pointing at a home or project directory would make that directory removable
    // without approval.
    const candidates = ["/tmp", "/private/tmp", await getDarwinUserTemporaryRoot()].filter(
      (root): root is string => root !== undefined,
    );
    const roots = await Promise.all(candidates.map((root) => realpath(root).catch(() => undefined)));
    const existingRoots = roots.filter((root): root is string => root !== undefined);
    // A filesystem root is its own parent; treating one as a temporary root would allow removing anything.
    return [...new Set(existingRoots.filter((root) => dirname(root) !== root))];
  })();
  return canonicalTemporaryRoots;
}

/**
 * Joins a target to the working directory without normalizing it. `path.resolve` and `path.join` collapse a
 * `..` textually, which steps over a symlink instead of through it: to them `link/..` is the link's own
 * parent, to the kernel it is the parent of whatever the link points at. Only `realpath`, given the path as
 * written, resolves it the way the removal will.
 */
export function absolutePath(cwd: string, target: string): string {
  if (isAbsolute(target)) return target;
  return cwd.endsWith("/") ? `${cwd}${target}` : `${cwd}/${target}`;
}

function isWithinRoot(path: string, root: string): boolean {
  const childPath = relative(root, path);
  return childPath !== "" && !childPath.startsWith("..") && !isAbsolute(childPath);
}

function isInsideAnyRoot(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => isWithinRoot(path, root));
}

/**
 * Where the directory entry the command acts on lives, and what it resolves to. `rm`, `mv`, and `chmod -h`
 * act on the entry itself, so a link elsewhere that points into a temporary root must not qualify; the other
 * commands follow the link, so an entry inside a root that points elsewhere must not qualify either. Both
 * places therefore have to be inside a root. A target that does not exist yet (an `mv` destination, an
 * already removed file) has only its entry location.
 */
async function canonicalEntryAndTarget(path: string): Promise<{ entry: string; target: string } | undefined> {
  let entry: string;
  try {
    entry = join(await realpath(dirname(path)), basename(path));
  } catch {
    return undefined;
  }
  const target = await realpath(path).catch(() => entry);
  return { entry, target };
}

/**
 * Whether the current user owns an existing entry. Temporary roots are shared between users, and an entry of
 * another user is not this session's workspace, so it fails closed; so does a host where the user cannot be
 * determined. A hard-linked regular file fails too: `truncate`, `chmod`, and `chown` change the inode, which
 * the file's other name, possibly far outside any temporary root, shares.
 */
function isOwnedUnsharedEntry(stats: Stats): boolean {
  const uid = process.getuid?.();
  if (uid === undefined || stats.uid !== uid) return false;
  return !(stats.isFile() && stats.nlink > 1);
}

/**
 * Whether the entry at `absolute`, already known to lie inside a temporary root, is one the command may act
 * on. A missing entry is about to be created, so it has no owner yet. A symlink is checked as the link itself
 * for a command that acts on the entry, and as its target for one that follows it: a dangling link then
 * fails, because `truncate` or a redirection would create the file the link names, wherever that is, and a
 * link to a hard-linked file fails for the same reason the file itself does.
 */
async function isActionableEntry(absolute: string, followsLinks: boolean): Promise<boolean> {
  const entry = await lstat(absolute).catch(() => undefined);
  if (entry === undefined) return true;
  if (!followsLinks || !entry.isSymbolicLink()) return isOwnedUnsharedEntry(entry);
  const target = await stat(absolute).catch(() => undefined);
  return target !== undefined && isOwnedUnsharedEntry(target);
}

/**
 * Reports whether a command target, resolved against `cwd`, can only affect paths strictly inside a system
 * temporary root that the current user owns. `followsLinks` says whether the command acts on what a symlink
 * operand points to rather than on the link entry. A wildcard is reduced to its literal directory prefix,
 * which must itself be strictly inside a root, so `rm -rf /tmp/*` cannot clear the shared root unapproved;
 * the wildcard part must stay in one path component so no matched symlink is traversed. Anything that cannot
 * be proven fails closed.
 */
export async function isInsideTemporaryRoot(
  target: string,
  cwd: string | undefined,
  followsLinks = false,
): Promise<boolean> {
  if (cwd === undefined || !isAbsolute(cwd) || target === "") return false;
  const roots = await getCanonicalTemporaryRoots();

  const globStart = target.search(GLOB_CHARACTERS);
  if (globStart < 0) {
    const absolute = absolutePath(cwd, target);
    const canonical = await canonicalEntryAndTarget(absolute);
    if (!canonical || !isInsideAnyRoot(canonical.entry, roots) || !isInsideAnyRoot(canonical.target, roots)) {
      return false;
    }
    return isActionableEntry(absolute, followsLinks);
  }

  const directoryEnd = target.lastIndexOf("/", globStart) + 1;
  // `pattern` is a string and the two checks below are substring checks. oxlint reads any `.slice()` as
  // an array clone, and its fix builds a Set of single characters where `has("**")` can never match,
  // letting a recursive glob through.
  // oxlint-disable-next-line unicorn/prefer-set-has
  const pattern = target.slice(directoryEnd);
  if (pattern.includes("/") || pattern.includes("**")) return false;

  const directory = absolutePath(cwd, target.slice(0, directoryEnd) || ".");
  const canonical = await realpath(directory).catch(() => undefined);
  if (canonical === undefined || !isInsideAnyRoot(canonical, roots)) return false;
  const stats = await lstat(canonical).catch(() => undefined);
  return stats !== undefined && isOwnedUnsharedEntry(stats);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    // A dangling symlink is still an entry `rm -rf` would remove, so the link itself counts.
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * A directory created by `mktemp -d` in the same call does not exist yet, so the suffix appended to it is all
 * there is to check. It must stay inside that directory, and it must also be harmless if the substitution
 * failed and left the variable empty: bash then passes the suffix on its own, as an absolute path from the
 * filesystem root, so a wildcard or an existing path there would let the command act far outside. An empty
 * suffix needs no check, because every command rejects an empty operand.
 */
async function isSafeMktempSuffix(suffix: string): Promise<boolean> {
  if (suffix === "") return true;
  if (!suffix.startsWith("/") || suffix.split("/").includes("..") || GLOB_CHARACTERS.test(suffix)) return false;
  return !(await pathExists(suffix));
}

export async function allInsideTemporaryRoot(
  targets: readonly DestructiveTarget[],
  cwd: string | undefined,
): Promise<boolean> {
  if (targets.length === 0) return false;
  const results = await Promise.all(
    targets.map((target) =>
      target.insideMktempDirectory
        ? isSafeMktempSuffix(target.path)
        : isInsideTemporaryRoot(target.path, cwd, target.followsLinks),
    ),
  );
  return results.every(Boolean);
}

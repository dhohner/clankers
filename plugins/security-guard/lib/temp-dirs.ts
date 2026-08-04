import { lstat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative } from "node:path";

// Identifies a directory by filesystem identity rather than by path, so a directory that is removed and
// recreated (or swapped for another one) at the same path is not mistaken for the one we tracked.
type TemporaryDirectoryIdentity = { device: bigint; inode: bigint };

// Directories created but never removed would otherwise accumulate for the whole session. Evicting the
// oldest entry only costs the agent an approval prompt, so the bound stays well above realistic use.
const DEFAULT_MAX_TRACKED = 128;

let canonicalTemporaryRoots: Promise<string[]> | undefined;

function getCanonicalTemporaryRoots(): Promise<string[]> {
  canonicalTemporaryRoots ??= (async () => {
    const roots = await Promise.all(
      [tmpdir(), "/tmp", "/private/tmp"].map((root) => realpath(root).catch(() => undefined)),
    );
    const existingRoots = roots.filter((root): root is string => root !== undefined);
    // A filesystem root is its own parent; treating one as a temporary root would allow removing anything.
    return [...new Set(existingRoots.filter((root) => dirname(root) !== root))];
  })();
  return canonicalTemporaryRoots;
}

function isWithinRoot(path: string, root: string): boolean {
  const childPath = relative(root, path);
  return childPath !== "" && !childPath.startsWith("..") && !isAbsolute(childPath);
}

async function getIdentity(path: string): Promise<TemporaryDirectoryIdentity | undefined> {
  try {
    const canonicalRoots = await getCanonicalTemporaryRoots();
    const canonicalPath = await realpath(path);
    if (!canonicalRoots.some((root) => isWithinRoot(canonicalPath, root))) return undefined;

    // lstat, not stat: a symlink pointing into a temporary root would otherwise pass the check above while
    // `rm` removes the link and leaves the target, or a later swap of the link redirects the removal.
    const stats = await lstat(path, { bigint: true });
    if (!stats.isDirectory()) return undefined;

    // Temporary roots are shared between users, so an unverifiable owner has to fail closed: without getuid
    // (Windows) the exception simply never applies and removals fall back to explicit approval.
    const uid = process.getuid?.();
    if (uid === undefined || stats.uid !== BigInt(uid)) return undefined;

    return { device: stats.dev, inode: stats.ino };
  } catch {
    return undefined;
  }
}

export type TemporaryDirectoryTracker = {
  /** Path membership only; identity is re-verified in `consume`. Satisfies the shape `removedTrackedTemporaryDirectories` expects. */
  has(path: string): boolean;
  /** Records `path` if it is a current-user directory under a system temporary root. */
  track(path: string): Promise<void>;
  /** Approves removal of `paths` and forgets them, or returns false to fall back to explicit approval. */
  consume(paths: readonly string[]): Promise<boolean>;
};

export function createTemporaryDirectoryTracker(maxTracked: number = DEFAULT_MAX_TRACKED): TemporaryDirectoryTracker {
  const tracked = new Map<string, TemporaryDirectoryIdentity>();

  return {
    has: (path) => tracked.has(path),

    async track(path) {
      const identity = await getIdentity(path);
      if (!identity) return;

      // Re-inserting refreshes insertion order, which is what the eviction below consumes.
      tracked.delete(path);
      tracked.set(path, identity);

      while (tracked.size > maxTracked) {
        const oldest = tracked.keys().next();
        if (oldest.done) break;
        tracked.delete(oldest.value);
      }
    },

    async consume(paths) {
      // Unavoidable TOCTOU window: identity is verified here, but the host runs `rm` after this returns, so a
      // directory swapped in between is removed instead. Closing it would require removing by file descriptor,
      // which the host does not expose. The window is bounded by these checks, by requiring an exact tracked
      // path, and by one-shot consumption; the exception is a convenience, so it must never widen beyond that.
      const identities = await Promise.all(paths.map((path) => getIdentity(path)));
      const unchanged = paths.every((path, index) => {
        const previous = tracked.get(path);
        const current = identities[index];
        return previous && current && previous.device === current.device && previous.inode === current.inode;
      });
      if (!unchanged) return false;

      for (const path of paths) tracked.delete(path);
      return true;
    },
  };
}

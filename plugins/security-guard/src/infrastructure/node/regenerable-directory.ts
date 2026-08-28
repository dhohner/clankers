import { realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute } from "node:path";
import type { DestructiveTarget } from "../../proof/types.ts";
import { isWithinRoot, resolvesInsideQualifiedRoot } from "./temporary-root.ts";

/**
 * Directory names whose contents a build or install step recreates. Matched as a whole path component, so
 * `dist-backup` is not `dist`.
 */
export const REGENERABLE_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "build",
  "target",
  ".next",
  "out",
  "coverage",
]);

/**
 * The nearest component of `canonical`, itself included, that carries an exempt name and lies strictly
 * inside the canonical working directory. The name alone would accept `../other-project/node_modules`, and
 * the working directory alone would accept `src`; both have to hold. The walk stops at the working
 * directory, so a working directory that is itself named `dist` exempts nothing.
 */
function regenerableAncestor(canonical: string, canonicalCwd: string): string | undefined {
  for (let path = canonical; isWithinRoot(path, canonicalCwd); path = dirname(path)) {
    if (REGENERABLE_DIRECTORY_NAMES.has(basename(path))) return path;
  }
  return undefined;
}

/**
 * The working directory of one verification call, with the answer for each exempt directory it has already
 * looked at. Every target under `dist` asks about the same `dist` twice, once for its entry and once for
 * its link target, so the answer is kept for the duration of the call and no longer: a later call must see
 * the filesystem as it is then.
 */
type VerificationScope = { canonicalCwd: string; directoryChecks: Map<string, Promise<boolean>> };

async function isExistingDirectory(path: string): Promise<boolean> {
  const stats = await stat(path).catch(() => undefined);
  return stats?.isDirectory() ?? false;
}

/**
 * Whether `canonical` is a regenerable directory, or lies inside one. The exempt component has to be an
 * existing directory: a source file that happens to be named `dist`, or a name nothing exists at yet, is not
 * build output. The `stat` follows a link named after an exempt directory; where such a link points is
 * checked separately as the target.
 */
function isRegenerable(canonical: string, scope: VerificationScope): Promise<boolean> {
  const exempt = regenerableAncestor(canonical, scope.canonicalCwd);
  if (exempt === undefined) return Promise.resolve(false);
  let check = scope.directoryChecks.get(exempt);
  if (check === undefined) {
    check = isExistingDirectory(exempt);
    scope.directoryChecks.set(exempt, check);
  }
  return check;
}

function isInsideResolvedRegenerableDirectory(
  target: string,
  cwd: string,
  scope: VerificationScope,
  followsLinks: boolean,
): Promise<boolean> {
  return resolvesInsideQualifiedRoot(target, cwd, followsLinks, (canonical) => isRegenerable(canonical, scope));
}

async function verificationScope(cwd: string | undefined): Promise<VerificationScope | undefined> {
  if (cwd === undefined || !isAbsolute(cwd)) return undefined;
  const canonicalCwd = await realpath(cwd).catch(() => undefined);
  return canonicalCwd === undefined ? undefined : { canonicalCwd, directoryChecks: new Map() };
}

/**
 * Reports whether a target, resolved against `cwd` the way the removal will resolve it, can only affect a
 * regenerable directory inside the working directory. Entry location, link target, wildcard directory, and
 * ownership are resolved by the same rules as the temporary-root proof. A working directory that cannot be
 * resolved fails closed.
 */
export async function isInsideRegenerableDirectory(
  target: string,
  cwd: string | undefined,
  followsLinks = false,
): Promise<boolean> {
  const scope = await verificationScope(cwd);
  if (cwd === undefined || scope === undefined) return false;
  return isInsideResolvedRegenerableDirectory(target, cwd, scope, followsLinks);
}

/**
 * Whether every target of a call is inside a regenerable directory. A target derived from `mktemp -d` is the
 * temporary-root proof's business, so it does not qualify here.
 */
export async function allInsideRegenerableDirectory(
  targets: readonly DestructiveTarget[],
  cwd: string | undefined,
): Promise<boolean> {
  if (targets.length === 0 || targets.some((target) => target.insideMktempDirectory)) return false;
  const scope = await verificationScope(cwd);
  if (cwd === undefined || scope === undefined) return false;
  const results = await Promise.all(
    targets.map((target) => isInsideResolvedRegenerableDirectory(target.path, cwd, scope, target.followsLinks)),
  );
  return results.every(Boolean);
}

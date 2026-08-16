import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseStyleFile, STYLE_FILE_SUFFIX } from "./style-file.ts";
import {
  DEFAULT_STYLE,
  DEFAULT_STYLE_NAME,
  NEW_STYLE_NAME,
  type StyleDefinition,
  type StyleDiscovery,
  type StyleProblem,
  type StyleSource,
} from "./types.ts";

export type StyleDirectories = {
  bundledDir?: string;
  userDir?: string;
  /** Omit for an untrusted project, so no project-local style file is read. */
  projectDir?: string;
};

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function listStyleFiles(
  directory: string,
): Promise<{ files: string[]; problems: StyleProblem[]; unlistable: boolean }> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries
      // Discovery is non-recursive, matching Pi's rule for prompt templates.
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith(STYLE_FILE_SUFFIX))
      .map((entry) => entry.name)
      // Sorting by filename makes a same-directory name collision resolve the same way on every
      // filesystem, instead of following enumeration order.
      .sort();
    return { files, problems: [], unlistable: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { files: [], problems: [], unlistable: false };
    return {
      files: [],
      problems: [{ path: directory, reason: `cannot list directory: ${describeError(error)}` }],
      unlistable: true,
    };
  }
}

type StyleFileRead = { path: string; content: string } | { path: string; failure: string };

/**
 * Upper bound of concurrent reads inside one directory. An unbounded fan-out would open every file
 * at once, and a large directory could then hit the descriptor limit and report valid files as
 * unreadable, so the bound sits far below any realistic limit.
 */
export const MAX_CONCURRENT_FILE_READS = 8;

/** Reads one style directory. A missing directory yields no styles and no problem. */
export async function readStyleDirectory(directory: string, source: StyleSource): Promise<StyleDiscovery> {
  const { files, problems, unlistable } = await listStyleFiles(directory);

  // A bounded worker pool overlaps the file reads, and each result lands at its sorted filename
  // index, so the collision winner and the problem order never depend on which read completes
  // first. A read failure is a value here, not a rejection, so one unreadable file cannot cancel
  // the other reads.
  const reads = new Array<StyleFileRead>(files.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_FILE_READS, files.length) }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        const file = files[index];
        if (file === undefined) return;
        const path = join(directory, file);
        try {
          reads[index] = { path, content: await readFile(path, "utf8") };
        } catch (error) {
          reads[index] = { path, failure: `cannot read file: ${describeError(error)}` };
        }
      }
    }),
  );

  const styles = new Map<string, StyleDefinition>();
  for (const read of reads) {
    const { path } = read;
    if ("failure" in read) {
      problems.push({ path, reason: read.failure });
      continue;
    }

    const result = parseStyleFile(path, read.content, source);
    if (!result.ok) {
      problems.push({ path, reason: result.reason });
      continue;
    }

    // `default` names the built-in no-op style, which every session without the flag keeps. A file
    // claiming that name would either break that invariant or make one name resolve to two different
    // styles, so the name is reserved.
    if (result.style.name === DEFAULT_STYLE_NAME) {
      problems.push({ path, reason: `style name "${DEFAULT_STYLE_NAME}" is reserved for the built-in style` });
      continue;
    }

    // `new` names the `/output-style new` create subcommand. A style with that name would
    // shadow the subcommand or make `/output-style new` ambiguous, so the name is reserved.
    if (result.style.name === NEW_STYLE_NAME) {
      problems.push({
        path,
        reason: `style name "${NEW_STYLE_NAME}" is reserved for the /output-style new subcommand`,
      });
      continue;
    }

    const winner = styles.get(result.style.name);
    if (winner) {
      problems.push({
        path,
        reason: `style name "${result.style.name}" is already defined by ${winner.path}`,
      });
      continue;
    }

    styles.set(result.style.name, result.style);
  }

  return { styles: [...styles.values()], problems, unlistableDirectories: unlistable ? [directory] : [] };
}

function byListOrder(left: StyleDefinition, right: StyleDefinition): number {
  // The list always starts with the built-in default, and a file claiming that name is refused
  // above, so exactly one entry carries it and it never moves. V8 compares an element against the
  // ones before it, so the default is always the right operand and this guard never runs. It stays
  // as a guard against a future caller that sorts a differently built list.
  /* istanbul ignore next -- unreachable through discoverStyles, see the comment above */
  if (left.name === DEFAULT_STYLE_NAME) return right.name === DEFAULT_STYLE_NAME ? 0 : -1;
  if (right.name === DEFAULT_STYLE_NAME) return 1;
  return left.name.localeCompare(right.name, "en");
}

/**
 * Collects every offered style. A later source shadows an earlier one under the same name without a
 * message, so the returned list holds exactly the selectable definitions.
 */
export async function discoverStyles(directories: StyleDirectories): Promise<StyleDiscovery> {
  const sources: Array<[StyleSource, string | undefined]> = [
    ["bundled", directories.bundledDir],
    ["user", directories.userDir],
    ["project", directories.projectDir],
  ];

  const styles = new Map<string, StyleDefinition>([[DEFAULT_STYLE.name, DEFAULT_STYLE]]);
  const problems: StyleProblem[] = [];
  const unlistableDirectories: string[] = [];

  for (const [source, directory] of sources) {
    if (!directory) continue;
    const found = await readStyleDirectory(directory, source);
    for (const style of found.styles) styles.set(style.name, style);
    problems.push(...found.problems);
    unlistableDirectories.push(...found.unlistableDirectories);
  }

  return { styles: [...styles.values()].sort(byListOrder), problems, unlistableDirectories };
}

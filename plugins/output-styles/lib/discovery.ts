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

/** Reads one style directory. A missing directory yields no styles and no problem. */
export async function readStyleDirectory(directory: string, source: StyleSource): Promise<StyleDiscovery> {
  const { files, problems, unlistable } = await listStyleFiles(directory);
  const styles = new Map<string, StyleDefinition>();

  for (const file of files) {
    const path = join(directory, file);
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch (error) {
      problems.push({ path, reason: `cannot read file: ${describeError(error)}` });
      continue;
    }

    const result = parseStyleFile(path, content, source);
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

    // `new` names the planned `/output-style new` create subcommand. A style with that name would
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

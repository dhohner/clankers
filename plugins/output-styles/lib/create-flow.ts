import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serializeStyleFile, styleNameProblem } from "./create-style.ts";
import { describeError } from "./discovery.ts";
import { STYLE_FILE_SUFFIX } from "./style-file.ts";
import type { NotifyLevel, StyleDefinition } from "./types.ts";

/**
 * The dialog surface the flow needs. The extension context's `ui` is built from this type, so the
 * flow sees the dialogs and nothing else: it can neither write the footer nor reach the theme.
 */
export type CreateFlowUi = {
  select(title: string, options: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  editor(title: string, prefill?: string): Promise<string | undefined>;
};

/** The directories a new style file may go into. */
export type CreateFlowTargets = {
  userDir: string;
  /** The project style directory, absent for an untrusted project, which offers no choice. */
  projectDir?: string;
};

/** Everything the flow needs from the extension. The flow keeps no state of its own between calls. */
export type CreateFlowDependencies = {
  ui: CreateFlowUi;
  /** Read when the flow needs the targets, so the answer follows the trust state of that moment. */
  targetDirectories(): CreateFlowTargets;
  notify(message: string, level: NotifyLevel): void;
  /** Rescans the style directories and returns whether the fresh list was adopted. */
  rescanStyles(): Promise<boolean>;
  /** The definition the current style list holds for a name, or undefined for a name it lacks. */
  findStyle(name: string): StyleDefinition | undefined;
  /** The one switch path that the selector, the named argument, and the cycle shortcut also use. */
  activateStyle(style: StyleDefinition): Promise<void>;
};

/**
 * The create-flow dialogs share cancel and refusal semantics: a cancel resolves to undefined,
 * ends the flow silently like a cancelled selector, and changes nothing; a refused value is
 * reported with its reason and the same dialog opens again, so a typo does not restart the flow.
 */
async function collectStyleName(deps: CreateFlowDependencies): Promise<string | undefined> {
  for (;;) {
    const name = await deps.ui.input("Name of the new style", "letters, digits, dash, underscore");
    if (name === undefined) return undefined;
    const problem = styleNameProblem(name);
    if (problem === undefined) return name;
    deps.notify(`Style name refused: ${problem}.`, "warning");
  }
}

/**
 * The parser strips outer whitespace on every read, so only a value without it parses back to
 * exactly what was entered; anything else is refused instead of silently changed, keeping the
 * round-trip contract exact for every accepted value.
 */
async function collectStyleDescription(deps: CreateFlowDependencies): Promise<string | undefined> {
  for (;;) {
    const description = await deps.ui.input("Description of the new style", "shown in the style selector");
    if (description === undefined) return undefined;
    if (description.trim() === "") {
      deps.notify("Style description refused: the description is empty.", "warning");
      continue;
    }
    if (description !== description.trim()) {
      deps.notify(
        "Style description refused: remove the leading and trailing whitespace, which does not survive a reread of the file.",
        "warning",
      );
      continue;
    }
    return description;
  }
}

/**
 * The editor result arrives exactly as Pi returned it: Pi already strips the terminating
 * newline of its external editor, so a trailing newline in the result is entered content, not
 * an editor artifact, and stripping it here would silently change the value. All outer
 * whitespace is refused under the same round-trip rule as the description, and the editor
 * re-opens prefilled with the trimmed text, so one confirmation fixes the input.
 */
async function collectStyleInstructions(deps: CreateFlowDependencies): Promise<string | undefined> {
  let prefill: string | undefined;
  for (;;) {
    const instructions = await deps.ui.editor("Instruction text of the new style", prefill);
    if (instructions === undefined) return undefined;
    if (instructions.trim() === "") {
      deps.notify("Style instructions refused: the instruction text is empty.", "warning");
      prefill = undefined;
      continue;
    }
    if (instructions !== instructions.trim()) {
      deps.notify(
        "Style instructions refused: remove the leading and trailing whitespace, which does not survive a reread of the file. The editor re-opens with the trimmed text.",
        "warning",
      );
      prefill = instructions.trim();
      continue;
    }
    return instructions;
  }
}

/** Offers the project directory only in a trusted project; with one candidate no dialog opens. */
async function selectTargetDirectory(deps: CreateFlowDependencies): Promise<string | undefined> {
  const { userDir, projectDir } = deps.targetDirectories();
  if (projectDir === undefined) return userDir;
  const labels = [`user - ${userDir}`, `project - ${projectDir}`];
  const choice = await deps.ui.select("Directory for the new style", labels);
  if (choice === undefined) return undefined;
  return choice === labels[1] ? projectDir : userDir;
}

/**
 * ENOENT and ENOTDIR both prove no file sits at the path. Any other failure, EACCES for
 * example, leaves existence unknown, so it is thrown for the caller to report instead of
 * being read as absence and risking a write where a file may sit.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

/**
 * Collection and validation are side-effect free; the filesystem is touched only after every
 * input is collected and valid, so a cancelled or refused flow leaves the disk exactly as it
 * was, directory creation included.
 */
export async function runCreateStyleFlow(deps: CreateFlowDependencies): Promise<void> {
  const name = await collectStyleName(deps);
  if (name === undefined) return;
  const description = await collectStyleDescription(deps);
  if (description === undefined) return;
  const directory = await selectTargetDirectory(deps);
  if (directory === undefined) return;

  // The collision check runs as soon as the target is known, before the instruction editor
  // opens, so nobody types a body for a name that cannot be written. Only a same-directory file
  // is a collision; a name that merely shadows a style from another source stays allowed, per
  // the documented precedence rules.
  const path = join(directory, `${name}${STYLE_FILE_SUFFIX}`);
  try {
    if (await fileExists(path)) {
      deps.notify(`Style "${name}" was not created: ${path} already exists. Choose a different name.`, "warning");
      return;
    }
  } catch (error) {
    deps.notify(`Style "${name}" was not created: cannot check ${path}: ${describeError(error)}`, "error");
    return;
  }

  const instructions = await collectStyleInstructions(deps);
  if (instructions === undefined) return;

  // The task boundary permits creating the directory and the one style file, nothing else, so
  // the content goes straight to the final path instead of through a temporary file.
  try {
    await mkdir(directory, { recursive: true });
    try {
      // "wx" refuses an existing file, so a file that appeared between the check above and this
      // write is reported instead of overwritten.
      await writeFile(path, serializeStyleFile(description, instructions), { encoding: "utf8", flag: "wx" });
    } catch (error) {
      // On EEXIST nothing was created and the file belongs to someone else. Every other failure
      // may have left a partial file this flow created; it is reported, never removed: another
      // process may have replaced the file between the failure and a removal, and a path-based
      // rm cannot tell such a replacement from this flow's leftover.
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        deps.notify(`An incomplete file may remain at ${path}. Remove it before the name is retried.`, "warning");
      }
      throw error;
    }
  } catch (error) {
    deps.notify(`Style "${name}" was not created: ${describeError(error)}`, "error");
    return;
  }

  // Activation is by name against the freshly adopted list and goes through the one switch path
  // every other switch uses. When a higher-precedence source already defines the name, that
  // winning definition activates and the written file is shadowed, consistent with the
  // precedence rules. A scan that kept the previous list activates nothing: a same-name entry
  // in the stale list proves nothing about the file just written.
  const adopted = await deps.rescanStyles();
  const created = adopted ? deps.findStyle(name) : undefined;
  if (created) {
    await deps.activateStyle(created);
    return;
  }
  // Reachable only when the rescan kept the previous list, for example a directory regressed to
  // unlistable between the write and the scan; the file exists, so the next adopted scan offers it.
  deps.notify(`The style file was written to ${path}, but the current style list does not offer "${name}".`, "warning");
}

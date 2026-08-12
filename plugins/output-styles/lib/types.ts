/** How a style's instruction text relates to the chained system prompt. */
export type StyleMode = "append" | "replace";

/** Where a style definition came from. Also the precedence order: project beats user beats bundled. */
export type StyleSource = "bundled" | "user" | "project";

export type StyleDefinition = {
  name: string;
  description: string;
  mode: StyleMode;
  /** Style instruction text. Empty only for the built-in `default` style, which changes nothing. */
  instructions: string;
  source: StyleSource;
  /** Absolute path of the style file, absent for the built-in `default` style. */
  path?: string;
};

/** A style file that was excluded from the style list, reported once per session. */
export type StyleProblem = {
  path: string;
  reason: string;
};

export type StyleParseResult = { ok: true; style: StyleDefinition } | { ok: false; reason: string };

export type StyleDiscovery = {
  /** Ordered by name with `default` first, so the list is stable across runs. */
  styles: StyleDefinition[];
  problems: StyleProblem[];
  /**
   * Directories that failed to list with a non-ENOENT error. A missing directory is not one of
   * them: discovery treats it as empty. The listing failure itself is also in `problems`.
   */
  unlistableDirectories: string[];
};

export const STYLE_MODES: readonly StyleMode[] = ["append", "replace"];

export const DEFAULT_STYLE_NAME = "default";

/** Reserved for the planned `/output-style new` create subcommand, so no style may claim it. */
export const NEW_STYLE_NAME = "new";

export const DEFAULT_STYLE: StyleDefinition = {
  name: DEFAULT_STYLE_NAME,
  description: "Pi's standard behavior, with no added style instructions.",
  mode: "append",
  instructions: "",
  source: "bundled",
};

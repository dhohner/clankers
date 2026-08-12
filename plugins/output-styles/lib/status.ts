import { DEFAULT_STYLE_NAME, type StyleDefinition } from "./types.ts";

/**
 * The theme members the status text needs, a structural subset of Pi's `Theme`. Colors are looked
 * up by name, so the entry follows whichever theme the session runs, light or dark.
 */
export type StatusTheme = {
  fg(color: "accent" | "dim", text: string): string;
};

/** Names the entry on the shared status line, where several extensions write next to each other. */
export const STATUS_LABEL = "style";

/**
 * Renders the footer entry for the active style, or nothing for the built-in default style: that
 * style adds no instructions, so an entry for it would occupy the shared status line without
 * carrying information. The label stays dim and only the style name takes the accent color, so a
 * session under a non-default style is recognizable at a glance.
 *
 * Pi bakes the colors into the string at call time, so a theme switch leaves an already set entry
 * with the previous colors until the caller renders it again.
 */
export function formatStatusText(style: StyleDefinition, theme: StatusTheme): string | undefined {
  if (style.name === DEFAULT_STYLE_NAME) return undefined;
  return `${theme.fg("dim", STATUS_LABEL)} ${theme.fg("accent", style.name)}`;
}

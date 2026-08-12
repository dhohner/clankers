import { stringify } from "yaml";
import { DEFAULT_STYLE_NAME, NEW_STYLE_NAME } from "./types.ts";

/**
 * Keeps the filename inside the chosen directory (no separators, no `..`) and shell-friendly.
 * Stricter than what the parser accepts, deliberately: the flow writes files, hand-written files
 * may use any name.
 */
const STYLE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Returns the reason a name cannot be created, or `undefined` for a usable name. */
export function styleNameProblem(name: string): string | undefined {
  if (name.trim() === "") return "the name is empty";
  if (name === DEFAULT_STYLE_NAME || name === NEW_STYLE_NAME) return `the name "${name}" is reserved`;
  if (!STYLE_NAME_PATTERN.test(name)) return "the name may only contain letters, digits, dash, and underscore";
  return undefined;
}

/**
 * Renders a style file that parseStyleFile reads back as the given description and instructions,
 * with the name derived from the filename and the default `append` mode. The YAML serializer
 * quotes or block-formats the description as needed, so YAML-significant text such as `mode: no`
 * survives the round trip; its continuation lines are always indented, so no frontmatter line can
 * match the column-zero `---` delimiter.
 */
export function serializeStyleFile(description: string, instructions: string): string {
  return `---\n${stringify({ description })}---\n\n${instructions}\n`;
}

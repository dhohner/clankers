import { basename } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";
import type { StyleParseResult, StyleSource } from "./types.ts";

export const STYLE_FILE_SUFFIX = ".md";

/** The style name a file carries when its frontmatter omits `name`. */
export function styleNameFromPath(path: string): string {
  return basename(path, STYLE_FILE_SUFFIX);
}

export function parseStyleFile(path: string, content: string, source: StyleSource): StyleParseResult {
  const parsed = parseFrontmatter(content);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const frontmatter = parsed.frontmatter;

  const description = frontmatter.fields.get("description") ?? "";
  if (description.trim() === "") return { ok: false, reason: 'frontmatter needs a non-empty "description"' };

  const declaredName = frontmatter.fields.get("name");
  if (declaredName !== undefined && declaredName.trim() === "") {
    return { ok: false, reason: 'frontmatter "name" is empty' };
  }

  const declaredMode = frontmatter.fields.get("mode");
  if (declaredMode === "replace") {
    return {
      ok: false,
      reason:
        'frontmatter "mode: replace" is no longer supported; remove the mode field or use "mode: append" to append these instructions',
    };
  }
  if (declaredMode !== undefined && declaredMode !== "append") {
    return { ok: false, reason: 'frontmatter "mode" must be append' };
  }

  const instructions = frontmatter.body.trim();
  if (instructions === "") return { ok: false, reason: "style instruction text is empty" };

  return {
    ok: true,
    style: {
      name: declaredName?.trim() ?? styleNameFromPath(path),
      description: description.trim(),
      instructions,
      source,
      path,
    },
  };
}

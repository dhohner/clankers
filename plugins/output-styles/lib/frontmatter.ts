import { parseDocument } from "yaml";

export type Frontmatter = {
  /** Scalar fields keyed by their frontmatter key, with an empty value for a key holding nothing. */
  fields: Map<string, string>;
  body: string;
};

export type FrontmatterResult = { ok: true; frontmatter: Frontmatter } | { ok: false; reason: string };

export const NO_FRONTMATTER_REASON = "no readable YAML frontmatter block";

/**
 * A delimiter line holds `---` at column zero. Indentation is what separates it from block scalar
 * content, which is always indented, so an indented `---` stays part of a field value.
 */
const DELIMITER_LINE = /^---[ \t]*$/;

const PARSE_OPTIONS = {
  // The core schema keeps `mode: replace` a string instead of resolving YAML 1.1 oddities such as
  // `no` to a boolean, and a duplicate key is an error rather than a silent last-one-wins.
  schema: "core",
  version: "1.2",
  uniqueKeys: true,
  merge: false,
} as const;

/** Renders a parsed scalar as text. Returns `undefined` for anything that is not a single scalar. */
function scalarText(value: unknown): string | undefined {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return undefined;
}

function unreadableYaml(message: string): FrontmatterResult {
  return { ok: false, reason: `frontmatter is not readable YAML: ${message}` };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the leading `---` delimited block of a style file as YAML.
 *
 * The style file contract is a mapping of scalar fields, so every YAML spelling of a scalar is
 * accepted, including block and folded scalars, quoted forms, and escapes. A field holding a mapping
 * or a sequence is refused with a reason, which keeps a file using richer YAML a reported skip rather
 * than a silent misreading.
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!DELIMITER_LINE.test(lines[0] ?? "")) return { ok: false, reason: NO_FRONTMATTER_REASON };

  const closingIndex = lines.findIndex((line, index) => index > 0 && DELIMITER_LINE.test(line));
  if (closingIndex === -1) return { ok: false, reason: NO_FRONTMATTER_REASON };

  const document = parseDocument(lines.slice(1, closingIndex).join("\n"), PARSE_OPTIONS);
  const failure = document.errors[0];
  if (failure) return unreadableYaml(failure.message);

  let parsed: unknown;
  try {
    // A style file has nothing to reference, so an alias is a reported skip instead of an expansion.
    parsed = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    // Building the plain value can still fail, an alias being the usual cause, since alias resolution is
    // refused rather than counted.
    return unreadableYaml(error instanceof Error ? error.message : String(error));
  }

  // An empty block parses to null. Its missing required fields are reported by the caller.
  if (parsed !== null && !isPlainObject(parsed)) {
    return { ok: false, reason: "frontmatter is not a mapping of fields" };
  }

  const fields = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed ?? {})) {
    const text = scalarText(value);
    if (text === undefined) return { ok: false, reason: `frontmatter field "${key}" must be a single scalar value` };
    fields.set(key, text);
  }

  return { ok: true, frontmatter: { fields, body: lines.slice(closingIndex + 1).join("\n") } };
}

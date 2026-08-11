import { describe, expect, it } from "vitest";
import { NO_FRONTMATTER_REASON, parseFrontmatter } from "../lib/frontmatter.js";

function fields(content: string): Map<string, string> {
  const result = parseFrontmatter(content);
  if (!result.ok) throw new Error(`expected readable frontmatter, got: ${result.reason}`);
  return result.frontmatter.fields;
}

function reason(content: string): string {
  const result = parseFrontmatter(content);
  if (result.ok) throw new Error("expected the frontmatter to be refused");
  return result.reason;
}

describe("parseFrontmatter", () => {
  it("reads scalar fields and returns the body", () => {
    const result = parseFrontmatter('---\ndescription: "Speak plainly."\nmode: append\n---\nBody text\n');

    expect(result.ok && result.frontmatter.fields.get("description")).toBe("Speak plainly.");
    expect(result.ok && result.frontmatter.fields.get("mode")).toBe("append");
    expect(result.ok && result.frontmatter.body.trim()).toBe("Body text");
  });

  it("accepts CRLF line endings, comments, and blank lines", () => {
    const result = parseFrontmatter("---\r\n# a comment\r\n\r\ndescription: Terse.\r\n---\r\nBody\r\n");

    expect(result.ok && result.frontmatter.fields.get("description")).toBe("Terse.");
    expect(result.ok && result.frontmatter.body.trim()).toBe("Body");
  });

  it("reads a comment-only value as empty and drops a trailing comment", () => {
    const parsed = fields("---\nname: # nothing here\ndescription: Terse. # why\n---\nBody\n");

    expect(parsed.get("name")).toBe("");
    expect(parsed.get("description")).toBe("Terse.");
  });

  it("keeps a `#` that is part of a plain or quoted scalar", () => {
    const parsed = fields('---\nname: c#\ndescription: "Answer #1 only. # not a comment"\n---\nBody\n');

    expect(parsed.get("name")).toBe("c#");
    expect(parsed.get("description")).toBe("Answer #1 only. # not a comment");
  });

  it("reads a folded scalar as one line and a literal scalar with its breaks", () => {
    const parsed = fields("---\ndescription: >-\n  Answers briefly,\n  in few words.\nname: |-\n  a\n  b\n---\nBody\n");

    expect(parsed.get("description")).toBe("Answers briefly, in few words.");
    expect(parsed.get("name")).toBe("a\nb");
  });

  it("reads quoted escapes, including a unicode escape", () => {
    const parsed = fields("---\ndescription: \"Dash \\u2014 kept\\nand a \\\" quote\"\nname: 'Pi''s voice'\n---\nBody\n");

    expect(parsed.get("description")).toBe('Dash — kept\nand a " quote');
    expect(parsed.get("name")).toBe("Pi's voice");
  });

  it("keeps an indented `---` inside a block scalar as content", () => {
    const parsed = fields("---\ndescription: |-\n  ---\n  separator\nname: terse\n---\nBody\n");

    expect(parsed.get("description")).toBe("---\nseparator");
    expect(parsed.get("name")).toBe("terse");
  });

  it("closes on a delimiter line with trailing whitespace", () => {
    const result = parseFrontmatter("---\ndescription: Terse.\n--- \nBody\n");

    expect(result.ok && result.frontmatter.fields.get("description")).toBe("Terse.");
    expect(result.ok && result.frontmatter.body.trim()).toBe("Body");
  });

  it("renders a non-string scalar as text", () => {
    const parsed = fields("---\nname: 2\ndescription: true\nmode: append\n---\nBody\n");

    expect(parsed.get("name")).toBe("2");
    expect(parsed.get("description")).toBe("true");
  });

  it("keeps `mode: no` a string instead of a YAML 1.1 boolean", () => {
    expect(fields("---\ndescription: Terse.\nmode: no\n---\nBody\n").get("mode")).toBe("no");
  });

  it.each([
    ["no opening delimiter", "description: Terse.\n---\nBody\n"],
    ["no closing delimiter", "---\ndescription: Terse.\nBody\n"],
  ])("reports %s as a missing block", (_case, content) => {
    expect(reason(content)).toBe(NO_FRONTMATTER_REASON);
  });

  it.each([
    ["a mapping field", "---\ndescription: Terse.\ntools:\n  read: true\n---\nBody\n", 'field "tools"'],
    ["a sequence field", "---\ndescription: Terse.\ntools:\n  - read\n---\nBody\n", 'field "tools"'],
    ["an inline sequence field", "---\ndescription: [Terse.]\n---\nBody\n", 'field "description"'],
  ])("refuses %s as not a scalar", (_case, content, mention) => {
    expect(reason(content)).toContain(`${mention} must be a single scalar value`);
  });

  it("refuses a block that is not a mapping", () => {
    expect(reason("---\n- terse\n---\nBody\n")).toBe("frontmatter is not a mapping of fields");
  });

  it.each([
    ["a duplicate key", "---\ndescription: Terse.\ndescription: Verbose.\n---\nBody\n"],
    ["an unterminated quoted value", '---\ndescription: "Terse.\n---\nBody\n'],
    ["text after a closing quote", '---\ndescription: "Terse." and more\n---\nBody\n'],
    ["an alias", "---\ndescription: &a Terse.\nname: *a\n---\nBody\n"],
    ["a value that is not YAML", "---\ndescription: - brief\n---\nBody\n"],
  ])("reports %s as unreadable YAML", (_case, content) => {
    expect(reason(content)).toMatch(/^frontmatter is not readable YAML: /);
  });
});

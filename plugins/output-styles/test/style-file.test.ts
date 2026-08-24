import { describe, expect, it } from "vitest";
import { parseStyleFile } from "../lib/style-file.js";

const PATH = "/styles/terse.md";

function parse(content: string) {
  return parseStyleFile(PATH, content, "user");
}

describe("parseStyleFile", () => {
  it("defaults the name to the filename stem and the mode to append", () => {
    const result = parse("---\ndescription: Answer briefly.\n---\nBe brief.\n");

    expect(result).toEqual({
      ok: true,
      style: {
        name: "terse",
        description: "Answer briefly.",
        mode: "append",
        instructions: "Be brief.",
        source: "user",
        path: PATH,
      },
    });
  });

  it("reads a folded description", () => {
    const result = parse("---\ndescription: >-\n  Answers briefly,\n  in few words.\n---\nBe brief.\n");

    expect(result.ok && result.style.description).toBe("Answers briefly, in few words.");
  });

  it("keeps a declared name and mode", () => {
    const result = parse("---\nname: short\ndescription: Answer briefly.\nmode: replace\n---\nBe brief.\n");

    expect(result.ok && result.style.name).toBe("short");
    expect(result.ok && result.style.mode).toBe("replace");
  });

  it.each([
    ["missing frontmatter", "Be brief.\n", "no readable YAML frontmatter block"],
    ["missing description", "---\nmode: append\n---\nBe brief.\n", 'frontmatter needs a non-empty "description"'],
    ["empty description", '---\ndescription: "  "\n---\nBe brief.\n', 'frontmatter needs a non-empty "description"'],
    [
      "a comment-only description",
      "---\ndescription: # Answer briefly.\n---\nBe brief.\n",
      'frontmatter needs a non-empty "description"',
    ],
    [
      "a non-scalar description",
      "---\ndescription:\n  - Answer briefly.\n---\nBe brief.\n",
      'frontmatter field "description" must be a single scalar value',
    ],
    ["empty name", "---\nname:\ndescription: Answer briefly.\n---\nBe brief.\n", 'frontmatter "name" is empty'],
    [
      "unknown mode",
      "---\ndescription: Answer briefly.\nmode: prepend\n---\nBe brief.\n",
      'frontmatter "mode" must be append or replace',
    ],
    ["empty body", "---\ndescription: Answer briefly.\n---\n\n   \n", "style instruction text is empty"],
  ])("rejects %s", (_case, content, reason) => {
    expect(parse(content)).toEqual({ ok: false, reason });
  });
});

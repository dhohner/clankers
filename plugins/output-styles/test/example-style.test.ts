import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStyleFile } from "../lib/style-file.js";

/** The commented example the README tells a user to copy into a style directory. */
const EXAMPLE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "terse.md");

describe("example style file", () => {
  it("parses as a valid append-mode style with a description and a body", async () => {
    const result = parseStyleFile(EXAMPLE_PATH, await readFile(EXAMPLE_PATH, "utf8"), "user");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.style.name).toBe("terse");
    expect(result.style.description).not.toBe("");
    expect(result.style.instructions).not.toBe("");
    expect(result.style.mode).toBe("append");
  });
});

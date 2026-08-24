import type { BuildSystemPromptOptions, Skill } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { applyStyle } from "../lib/prompt.js";
import { DEFAULT_STYLE, type StyleDefinition } from "../lib/types.js";

const PI_GUIDANCE = "You are an expert coding assistant operating inside pi.\n\nBe concise in your responses.";
const CHAINED_PROMPT = `${PI_GUIDANCE}\n\nAdded by an earlier extension.`;

function style(overrides: Partial<StyleDefinition> = {}): StyleDefinition {
  return {
    name: "terse",
    description: "Answer briefly.",
    mode: "append",
    instructions: "Be brief.",
    source: "user",
    ...overrides,
  };
}

function skill(name: string): Skill {
  return {
    name,
    description: `${name} description`,
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    sourceInfo: { path: `/skills/${name}/SKILL.md`, source: "user", scope: "user", origin: "top-level" },
    disableModelInvocation: false,
  };
}

function promptOptions(overrides: Partial<BuildSystemPromptOptions> = {}): BuildSystemPromptOptions {
  return {
    selectedTools: ["read", "bash"],
    toolSnippets: { read: "Read file contents", bash: "Execute shell commands" },
    promptGuidelines: ["Prefer ripgrep over grep"],
    cwd: "/work/project",
    contextFiles: [{ path: "/work/project/AGENTS.md", content: "Always run the linter." }],
    skills: [skill("changelog")],
    ...overrides,
  };
}

describe("applyStyle in append mode", () => {
  it("appends the instruction text to the end of the chained prompt", () => {
    expect(applyStyle(CHAINED_PROMPT, style(), promptOptions())).toBe(`${CHAINED_PROMPT}\n\nBe brief.`);
  });

  it("returns the chained prompt unchanged for the default style", () => {
    expect(applyStyle(CHAINED_PROMPT, DEFAULT_STYLE, promptOptions())).toBe(CHAINED_PROMPT);
  });

  it("returns the chained prompt unchanged when no style is active", () => {
    expect(applyStyle(CHAINED_PROMPT, undefined, promptOptions())).toBe(CHAINED_PROMPT);
  });
});

describe("applyStyle in replace mode", () => {
  const replaced = () => applyStyle(CHAINED_PROMPT, style({ mode: "replace" }), promptOptions());

  it("contains the style instruction text and drops Pi's response guidance", () => {
    const prompt = replaced();
    expect(prompt).toContain("Be brief.");
    expect(prompt).not.toContain("expert coding assistant");
    expect(prompt).not.toContain("Be concise in your responses");
    expect(prompt).not.toContain("Added by an earlier extension.");
  });

  it("keeps the tool list", () => {
    const prompt = replaced();
    expect(prompt).toContain("Available tools:");
    expect(prompt).toContain("- read: Read file contents");
    expect(prompt).toContain("- bash: Execute shell commands");
  });

  it("keeps the tool guidelines", () => {
    expect(replaced()).toContain("- Prefer ripgrep over grep");
  });

  it("derives the bash file-operations guideline like Pi when bash lacks the file tools", () => {
    expect(replaced()).toContain("- Use bash for file operations like ls, rg, find");
  });

  it("omits the bash file-operations guideline when a file tool is selected, like Pi", () => {
    const prompt = applyStyle(
      CHAINED_PROMPT,
      style({ mode: "replace" }),
      promptOptions({ selectedTools: ["read", "bash", "grep"] }),
    );
    expect(prompt).not.toContain("Use bash for file operations");
  });

  it("deduplicates guidelines like Pi", () => {
    const prompt = applyStyle(
      CHAINED_PROMPT,
      style({ mode: "replace" }),
      promptOptions({
        promptGuidelines: ["Use bash for file operations like ls, rg, find", "Same twice", "Same twice"],
      }),
    );
    expect(prompt.match(/Use bash for file operations/g)).toHaveLength(1);
    expect(prompt.match(/Same twice/g)).toHaveLength(1);
  });

  it("keeps the working directory", () => {
    expect(replaced()).toContain("Current working directory: /work/project");
  });

  it("keeps the loaded context files", () => {
    const prompt = replaced();
    expect(prompt).toContain('<project_instructions path="/work/project/AGENTS.md">');
    expect(prompt).toContain("Always run the linter.");
  });

  it("keeps the loaded skills", () => {
    const prompt = replaced();
    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("<name>changelog</name>");
    expect(prompt).toContain("<location>/skills/changelog/SKILL.md</location>");
  });

  it("lists a tool only when it has a snippet, like Pi", () => {
    const prompt = applyStyle(
      CHAINED_PROMPT,
      style({ mode: "replace" }),
      promptOptions({ toolSnippets: { read: "Read file contents" } }),
    );
    expect(prompt).toContain("- read: Read file contents");
    expect(prompt).not.toContain("- bash:");
  });

  it("marks an empty tool list as (none)", () => {
    const prompt = applyStyle(CHAINED_PROMPT, style({ mode: "replace" }), promptOptions({ toolSnippets: {} }));
    expect(prompt).toContain("Available tools:\n(none)");
  });

  it("omits the skills section without the read tool, like Pi", () => {
    const prompt = applyStyle(
      CHAINED_PROMPT,
      style({ mode: "replace" }),
      promptOptions({ selectedTools: ["bash"], toolSnippets: { bash: "Execute shell commands" } }),
    );
    expect(prompt).not.toContain("<available_skills>");
  });

  it("skips a guideline that holds only whitespace", () => {
    const prompt = applyStyle(
      CHAINED_PROMPT,
      style({ mode: "replace" }),
      promptOptions({ promptGuidelines: ["   ", "Prefer ripgrep over grep"] }),
    );
    expect(prompt).toContain("- Prefer ripgrep over grep");
    expect(prompt).not.toContain("- \n");
    expect(prompt).not.toContain("-   \n");
  });

  it("omits the guidelines and context sections when they are empty", () => {
    const prompt = applyStyle(
      CHAINED_PROMPT,
      style({ mode: "replace" }),
      promptOptions({
        selectedTools: ["read"],
        toolSnippets: { read: "Read file contents" },
        promptGuidelines: [],
        contextFiles: [],
      }),
    );
    expect(prompt).not.toContain("Guidelines:");
    expect(prompt).not.toContain("<project_context>");
  });
});

// Pi may call the hook with only the required fields, so every optional list falls back to its
// documented default rather than reaching an undefined value.
describe("applyStyle in replace mode with the optional options omitted", () => {
  const prompt = () => applyStyle(CHAINED_PROMPT, style({ mode: "replace" }), { cwd: "/work/project" });

  it("falls back to Pi's default tool set, which has no snippets to list", () => {
    expect(prompt()).toContain("Available tools:\n(none)");
  });

  it("still derives the bash guideline from the default tool set", () => {
    expect(prompt()).toContain("Guidelines:\n- Use bash for file operations like ls, rg, find");
  });

  it("omits the context and skills sections", () => {
    expect(prompt()).not.toContain("<project_context>");
    expect(prompt()).not.toContain("<available_skills>");
  });

  it("ends with the working directory line and Pi's closing newline", () => {
    expect(prompt()).toMatch(/\nCurrent working directory: \/work\/project\n$/);
  });
});

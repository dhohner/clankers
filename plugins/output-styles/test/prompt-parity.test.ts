import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BuildSystemPromptOptions, Skill } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { applyStyle } from "../lib/prompt.js";
import type { StyleDefinition } from "../lib/types.js";

/**
 * Proves the replace-mode prompt against Pi's own prompt builder instead of against copied strings,
 * so a Pi upgrade that changes the rendering stops this suite.
 *
 * Pi's `exports` map allows the package root, `./rpc-entry`, and `./client` only, so the builder is
 * imported through the absolute file URL of the internal module. Replace that import with a root
 * export as soon as Pi exports `buildSystemPrompt` from its package root.
 */
type BuildSystemPrompt = (options: BuildSystemPromptOptions) => string;

const PI_ENTRY = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const SYSTEM_PROMPT_MODULE = join(dirname(PI_ENTRY), "core", "system-prompt.js");
const PI_PACKAGE_JSON = join(dirname(PI_ENTRY), "..", "package.json");

function readPiVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(PI_PACKAGE_JSON, "utf8"));
  const version = (raw as { version?: unknown }).version;
  if (typeof version !== "string" || version === "") {
    throw new Error(`The installed Pi package has no version field in ${PI_PACKAGE_JSON}.`);
  }
  return version;
}

/**
 * Loads Pi's prompt builder, or throws with the expected path and the installed version. The test
 * never skips itself: a skip would keep the suite green and hide the upgrade this test exists to
 * catch.
 */
async function loadBuildSystemPrompt(modulePath = SYSTEM_PROMPT_MODULE): Promise<BuildSystemPrompt> {
  let version: string;
  try {
    version = readPiVersion();
  } catch (error) {
    throw new Error(`Cannot read the installed Pi version from ${PI_PACKAGE_JSON}.`, { cause: error });
  }

  const where = `expected module ${modulePath}, installed Pi version ${version}`;
  let loaded: Record<string, unknown>;
  try {
    loaded = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Pi's prompt builder module cannot be imported: ${where}.`, { cause: error });
  }
  if (typeof loaded.buildSystemPrompt !== "function") {
    throw new Error(`Pi's prompt builder module exports no buildSystemPrompt function: ${where}.`);
  }
  return loaded.buildSystemPrompt as BuildSystemPrompt;
}

const buildSystemPrompt = await loadBuildSystemPrompt();

const INSTRUCTIONS = "Be brief.";
const CHAINED_PROMPT = "You are an expert coding assistant operating inside pi.\n\nAdded by an earlier extension.";

const REPLACE_STYLE: StyleDefinition = {
  name: "terse",
  description: "Answer briefly.",
  mode: "replace",
  instructions: INSTRUCTIONS,
  source: "user",
};

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

/** Cuts the text between two structural anchors of Pi's default prompt, or fails loudly. */
function section(prompt: string, startAnchor: string, endAnchor: string): string {
  const start = prompt.indexOf(startAnchor);
  const end = prompt.indexOf(endAnchor, start + startAnchor.length);
  if (start === -1 || end === -1) {
    throw new Error(`Pi's default prompt no longer holds the section between "${startAnchor}" and "${endAnchor}".`);
  }
  return prompt.slice(start, end);
}

/** The tool list block of Pi's default prompt, rendered for the given options. */
function piToolsBlock(options: BuildSystemPromptOptions): string {
  return section(buildSystemPrompt(options), "Available tools:", "\n\nGuidelines:");
}

/**
 * The guidelines Pi adds to every default prompt. The replace mode drops exactly these two, because
 * they are response guidance that the style instruction takes over. The list is written out instead
 * of derived from Pi, so a Pi release that adds or changes an unconditional guideline fails the
 * parity comparison and the baseline test below instead of passing unnoticed.
 */
const PI_RESPONSE_GUIDELINES = ["Be concise in your responses", "Show file paths clearly when working with files"];

/** Pi's guideline block for a prompt that adds no guideline of its own. */
function piBaselineGuidelinesBlock(cwd: string): string {
  return section(
    buildSystemPrompt({ cwd, selectedTools: ["read"], promptGuidelines: [] }),
    "Guidelines:",
    "\n\nPi documentation",
  );
}

/**
 * The guideline block of Pi's default prompt, without the two response guidelines the plugin drops.
 * A guideline the caller supplies stays even when it matches one of those two, because the plugin
 * honors every supplied guideline. The block is empty when nothing else remains, and the plugin then
 * renders no guideline section at all.
 */
function piGuidelinesBlock(options: BuildSystemPromptOptions): string {
  const block = section(buildSystemPrompt(options), "Guidelines:", "\n\nPi documentation");
  const supplied = new Set((options.promptGuidelines ?? []).map((guideline) => guideline.trim()));
  const kept = block.split("\n").filter((line, index) => {
    if (index === 0) return true;
    if (!line.startsWith("- ")) {
      throw new Error(`Pi no longer renders its guideline list as "- " lines: ${line}`);
    }
    const guideline = line.slice("- ".length);
    return supplied.has(guideline) || !PI_RESPONSE_GUIDELINES.includes(guideline);
  });
  return kept.length === 1 ? "" : kept.join("\n");
}

/**
 * The prompt the plugin must produce, assembled from Pi's own renderings: Pi's custom-prompt branch
 * renders the appended text, the project context block, the skills block and the working directory
 * line, and Pi's default branch renders the tool list and the guideline list that the replace mode
 * keeps.
 */
function expectedPrompt(options: BuildSystemPromptOptions): string {
  const head = [INSTRUCTIONS, piToolsBlock(options), piGuidelinesBlock(options)]
    .filter((part) => !!part)
    .join("\n\n");
  return buildSystemPrompt({ ...options, customPrompt: head });
}

const CASES: ReadonlyArray<{ name: string; options: BuildSystemPromptOptions }> = [
  { name: "no context file and no skill", options: promptOptions({ contextFiles: [], skills: [] }) },
  { name: "exactly one context file", options: promptOptions({ skills: [] }) },
  {
    name: "several context files",
    options: promptOptions({
      skills: [],
      contextFiles: [
        { path: "/work/project/AGENTS.md", content: "Always run the linter." },
        { path: "/work/project/docs/STYLE.md", content: "Write short sentences." },
      ],
    }),
  },
  { name: "a non-empty skill list", options: promptOptions({ skills: [skill("changelog"), skill("release")] }) },
  { name: "an empty skill list", options: promptOptions({ skills: [] }) },
  {
    name: "a tool list whose entries all have a snippet",
    options: promptOptions({
      selectedTools: ["read", "bash", "edit"],
      toolSnippets: { read: "Read file contents", bash: "Execute shell commands", edit: "Edit a file in place" },
    }),
  },
  { name: "a tool list whose entries have no snippet", options: promptOptions({ toolSnippets: {} }) },
  { name: "an empty guideline list", options: promptOptions({ promptGuidelines: [] }) },
  {
    name: "no guideline at all, so the section disappears",
    options: promptOptions({
      selectedTools: ["read", "bash", "grep"],
      toolSnippets: { read: "Read file contents", bash: "Execute shell commands", grep: "Search file contents" },
      promptGuidelines: [],
    }),
  },
  {
    name: "a guideline list that repeats a value",
    options: promptOptions({ promptGuidelines: ["Same twice", "Same twice", "Prefer ripgrep over grep"] }),
  },
  {
    name: "a guideline list that supplies one of Pi's own response guidelines",
    options: promptOptions({ promptGuidelines: ["Be concise in your responses", "Prefer ripgrep over grep"] }),
  },
  { name: "appended system prompt text", options: promptOptions({ appendSystemPrompt: "Sign every answer." }) },
];

describe("the replace-mode prompt against Pi's own builder", () => {
  for (const { name, options } of CASES) {
    it(`renders the shared sections like Pi for ${name}`, () => {
      expect(applyStyle(CHAINED_PROMPT, REPLACE_STYLE, options)).toBe(expectedPrompt(options));
    });
  }

  it("keeps the appended text after the guideline list, where Pi's default branch places it", () => {
    const options = promptOptions({ appendSystemPrompt: "Sign every answer." });
    const prompt = applyStyle(CHAINED_PROMPT, REPLACE_STYLE, options);
    expect(prompt).toContain(`${piGuidelinesBlock(options)}\n\nSign every answer.\n\n<project_context>`);
  });

  it("keeps the capability material that Pi drops in its custom-prompt branch", () => {
    // Intended difference: the replace mode drops Pi's response guidance but keeps the capability
    // material, so the tool list and the guideline list stay although Pi's custom branch omits both.
    const options = promptOptions();
    const prompt = applyStyle(CHAINED_PROMPT, REPLACE_STYLE, options);
    const piCustom = buildSystemPrompt({ ...options, customPrompt: INSTRUCTIONS });

    expect(prompt).toContain(piToolsBlock(options));
    expect(prompt).toContain(piGuidelinesBlock(options));
    expect(piCustom).not.toContain("Available tools:");
    expect(piCustom).not.toContain("Guidelines:");
  });

  it("drops the two guidelines Pi always adds, because they are response guidance", () => {
    // Intended difference: "Be concise in your responses" would compete with the style instruction.
    const prompt = applyStyle(CHAINED_PROMPT, REPLACE_STYLE, promptOptions());
    for (const guideline of PI_RESPONSE_GUIDELINES) {
      expect(prompt).not.toContain(guideline);
    }
  });

  it("stops on a Pi release that adds or changes an unconditional guideline", () => {
    // The parity comparison excludes exactly these two lines, so their list must stay accurate.
    const lines = PI_RESPONSE_GUIDELINES.map((guideline) => `- ${guideline}`).join("\n");
    expect(piBaselineGuidelinesBlock("/work/project")).toBe(`Guidelines:\n${lines}`);
  });

  it("fails with the expected module path and the installed Pi version when the module is absent", async () => {
    const missing = join(dirname(PI_ENTRY), "core", "system-prompt-moved.js");
    await expect(loadBuildSystemPrompt(missing)).rejects.toThrow(
      `Pi's prompt builder module cannot be imported: expected module ${missing}, ` +
        `installed Pi version ${readPiVersion()}.`,
    );
  });

  it("fails with the expected module path and the installed Pi version when the export is absent", async () => {
    const withoutBuilder = fileURLToPath(import.meta.resolve("./support/module-without-build-system-prompt.js"));
    await expect(loadBuildSystemPrompt(withoutBuilder)).rejects.toThrow(
      `Pi's prompt builder module exports no buildSystemPrompt function: expected module ${withoutBuilder}, ` +
        `installed Pi version ${readPiVersion()}.`,
    );
  });
});

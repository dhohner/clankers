import { type BuildSystemPromptOptions, formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import type { StyleDefinition } from "./types.ts";

/**
 * Builds the system prompt for one agent turn.
 *
 * In `append` mode the style text goes last so it stays the final instruction, after the project
 * instruction files and context files Pi already loaded.
 *
 * In `replace` mode the style text takes the place of Pi's response and behavior guidance, and the
 * prompt is rebuilt from the structured options Pi assembled instead of the chained prompt text.
 * The environment and capability material stays: the tool list, the tool guidelines, the appended
 * system prompt text, the loaded context files, the loaded skills, and the working directory.
 * Rendering mirrors Pi's own so the model sees the familiar shapes; `test/prompt-parity.test.ts`
 * compares the shared sections against Pi's own prompt builder.
 *
 * The options can carry full context file contents, so they are sensitive: they are used only to
 * assemble the returned prompt and must never reach logs, notifications, or other metadata.
 */
export function applyStyle(
  systemPrompt: string,
  style: StyleDefinition | undefined,
  options: BuildSystemPromptOptions,
): string {
  const instructions = style?.instructions.trim() ?? "";
  if (instructions === "") return systemPrompt;
  if (style?.mode === "replace") return buildReplacePrompt(instructions, options);
  return `${systemPrompt}\n\n${instructions}`;
}

function buildReplacePrompt(instructions: string, options: BuildSystemPromptOptions): string {
  // Same default tool set and visibility rule as Pi: a tool is listed only with a one-line snippet.
  const tools = options.selectedTools ?? ["read", "bash", "edit", "write"];
  const visibleTools = tools.filter((name) => !!options.toolSnippets?.[name]);
  const toolsList =
    visibleTools.length > 0
      ? visibleTools.map((name) => `- ${name}: ${options.toolSnippets?.[name]}`).join("\n")
      : "(none)";

  const sections = [
    instructions,
    `Available tools:\n${toolsList}\n\nIn addition to the tools above, you may have access to other custom tools depending on the project.`,
  ];

  // Same derived guideline and deduplication as Pi: bash stands in for the missing file tools.
  const guidelines: string[] = [];
  const seenGuidelines = new Set<string>();
  const addGuideline = (guideline: string) => {
    if (seenGuidelines.has(guideline)) return;
    seenGuidelines.add(guideline);
    guidelines.push(guideline);
  };
  if (tools.includes("bash") && !tools.includes("grep") && !tools.includes("find") && !tools.includes("ls")) {
    addGuideline("Use bash for file operations like ls, rg, find");
  }
  for (const guideline of options.promptGuidelines ?? []) {
    const normalized = guideline.trim();
    if (normalized.length > 0) addGuideline(normalized);
  }
  if (guidelines.length > 0) {
    sections.push(`Guidelines:\n${guidelines.map((g) => `- ${g}`).join("\n")}`);
  }

  let prompt = sections.join("\n\n");

  // Pi's default branch appends this text after the guideline list and before the project context,
  // and the replace-mode prompt mirrors that branch.
  if (options.appendSystemPrompt) prompt += `\n\n${options.appendSystemPrompt}`;

  // The context block, the skills block, and the working directory line are concatenated exactly as
  // Pi concatenates them, down to the line breaks between them.
  const contextFiles = options.contextFiles ?? [];
  if (contextFiles.length > 0) {
    prompt += "\n\n<project_context>\n\n";
    prompt += "Project-specific instructions and guidelines:\n\n";
    for (const { path, content } of contextFiles) {
      prompt += `<project_instructions path="${path}">\n${content}\n</project_instructions>\n\n`;
    }
    prompt += "</project_context>\n";
  }

  // Like Pi, skills are listed only when the read tool is available to load them.
  const skills = options.skills ?? [];
  if (tools.includes("read") && skills.length > 0) {
    prompt += formatSkillsForPrompt(skills);
  }

  // Pi's custom-prompt branch closes the working directory line with a newline; the default branch
  // does not. The replace mode mirrors the custom-prompt branch.
  return `${prompt}\nCurrent working directory: ${options.cwd.replace(/\\/g, "/")}\n`;
}

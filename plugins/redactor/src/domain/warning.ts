export const WARNING_SENTENCES: readonly string[] = [
  "Redactor replaces registered credential text with references in prompts, tool output, finalized messages, model requests, and session files.",
  "It protects registered text values only, not unknown secrets, images, deliberate encoding, or deliberate extraction.",
  "Normal editor history and the live assistant display are not protected.",
  "Use private entry instead of normal chat when that entry capability is available.",
  "User-entered `!` commands and third-party extensions are outside the protected paths.",
  "It makes no claim about program files, process arguments, or remote logs, and it is not a sandbox.",
  "It supports macOS only.",
];

export const UNSUPPORTED_PLATFORM_MESSAGE =
  "Redactor supports macOS only; protection is not active on this platform and no credential paths are guarded.";

export const DEFAULT_WARNING_WIDTH = 80;
const MINIMUM_WARNING_WIDTH = 20;
/** Reserve two columns for the host's notification padding. */
export const HOST_HORIZONTAL_PADDING = 2;

export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter((candidate) => candidate.length > 0)) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Subtract host padding to prevent an extra wrap and a lone word on the next row. */
export function formatWarning(terminalWidth: number | undefined): string {
  const width = Math.max(
    MINIMUM_WARNING_WIDTH,
    Math.min(terminalWidth ?? DEFAULT_WARNING_WIDTH, DEFAULT_WARNING_WIDTH) - HOST_HORIZONTAL_PADDING,
  );
  return wrapText(WARNING_SENTENCES.join(" "), width).join("\n");
}

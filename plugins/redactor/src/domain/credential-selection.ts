/**
 * A selection names an environment variable and the service label shown to the user and the model.
 * It never carries the variable's value.
 */
export interface Selection {
  name: string;
  label: string;
}

export interface SelectionConfig {
  version: 1;
  selections: Selection[];
}

/** Fixed wording only: a malformed document may contain anything, so messages name positions, never text. */
export class SelectionConfigError extends Error {
  constructor(message: string) {
    super(`credential configuration is invalid: ${message}`);
    this.name = "SelectionConfigError";
  }
}

// POSIX portable names; the length bound keeps command output and configuration readable.
const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_VARIABLE_NAME_LENGTH = 256;
const MAX_LABEL_LENGTH = 80;
// Reject control, format, and line separator characters so a label is one printable line in dialogs,
// notifications, and guidance, and so no bidirectional override or zero-width character can disguise it.
const NON_PRINTING_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

export function validateVariableName(name: string): string | undefined {
  if (name.length === 0) return "variable name is empty";
  if (name.length > MAX_VARIABLE_NAME_LENGTH)
    return `variable name is longer than ${MAX_VARIABLE_NAME_LENGTH} characters`;
  if (!VARIABLE_NAME_PATTERN.test(name))
    return "variable name must start with a letter or underscore and use letters, digits, and underscores";
  return undefined;
}

export function validateLabel(label: string): string | undefined {
  if (label.trim().length === 0) return "service label is empty";
  if (label.length > MAX_LABEL_LENGTH) return `service label is longer than ${MAX_LABEL_LENGTH} characters`;
  if (NON_PRINTING_CHARACTERS.test(label)) return "service label must be one line without control or format characters";
  return undefined;
}

export function emptySelectionConfig(): SelectionConfig {
  return { version: 1, selections: [] };
}

export function parseSelectionConfig(text: string): SelectionConfig {
  if (text.trim().length === 0) return emptySelectionConfig();
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new SelectionConfigError("the document is not valid JSON");
  }
  if (!isRecord(document)) throw new SelectionConfigError("the document must be a JSON object");
  if (document.version !== 1) throw new SelectionConfigError("version must be 1");
  const { selections } = document;
  if (!Array.isArray(selections)) throw new SelectionConfigError("selections must be an array");
  const parsed: Selection[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of selections.entries()) {
    const selection = parseSelection(entry, index);
    if (seen.has(selection.name)) throw new SelectionConfigError(`selections[${index}].name is selected twice`);
    seen.add(selection.name);
    parsed.push(selection);
  }
  return { version: 1, selections: parsed };
}

export function serializeSelectionConfig(config: SelectionConfig): string {
  const selections = config.selections.map(({ name, label }) => ({ name, label }));
  return `${JSON.stringify({ version: 1, selections }, null, 2)}\n`;
}

function parseSelection(entry: unknown, index: number): Selection {
  if (!isRecord(entry)) throw new SelectionConfigError(`selections[${index}] must be an object`);
  const { name, label } = entry;
  if (typeof name !== "string") throw new SelectionConfigError(`selections[${index}].name must be a string`);
  const nameProblem = validateVariableName(name);
  if (nameProblem) throw new SelectionConfigError(`selections[${index}].name is invalid: ${nameProblem}`);
  if (typeof label !== "string") throw new SelectionConfigError(`selections[${index}].label must be a string`);
  const labelProblem = validateLabel(label);
  if (labelProblem) throw new SelectionConfigError(`selections[${index}].label is invalid: ${labelProblem}`);
  return { name, label };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

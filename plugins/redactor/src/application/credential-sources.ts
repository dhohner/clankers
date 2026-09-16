import type { CredentialRegistry } from "../domain/credential-registry.ts";
import {
  type Selection,
  type SelectionConfig,
  SelectionConfigError,
  emptySelectionConfig,
  validateLabel,
  validateVariableName,
} from "../domain/credential-selection.ts";
import type { SelectionFile } from "../infrastructure/node/selection-file.ts";
import { type Binding, CredentialBindings } from "./credential-bindings.ts";
import type { RedactionEngine } from "./redaction-engine.ts";

export type SelectionOrigin = "user" | "project";

/** A published binding carries its origin, so a reader never looks it up by a name redaction may have rewritten. */
export interface SelectedBinding extends Binding {
  origin: SelectionOrigin;
}

export type AddOutcome =
  | { kind: "added"; binding: Binding }
  | { kind: "unchanged"; binding: Binding }
  | { kind: "relabeled"; binding: Binding };

export type RemoveOutcome =
  | { kind: "removed"; name: string; retainedValue: boolean }
  | { kind: "not-selected"; name: string };

/** Shown in place of a loaded label that contains its own credential value. */
export const WITHHELD_LABEL = "(label withheld: it contains the credential value)";

export interface LoadReport {
  /**
   * Sanitized messages for the user; each names a selection or the file, never a value or document text.
   * Each is redacted against every registered value, because a loaded name is checked only against its own value.
   */
  problems: string[];
}

export interface CredentialSourcesOptions {
  file: SelectionFile;
  registry: CredentialRegistry;
  engine: RedactionEngine;
  /** Reads the running process environment; shell startup files are never consulted. */
  readVariable: (name: string) => string | undefined;
  generateReference?: () => string;
}

/**
 * The user file is authoritative for automatic collection.
 * A project file only proposes selections; each approval binds until the process exits and persists nothing.
 * Every change reads, edits, and writes the file under its lock, so a malformed, externally changed, or
 * concurrently changed file is never replaced blindly.
 * Every change binds after the file write, so a failed write activates nothing.
 * Every value is registered before its binding is published, so no reference appears before its redaction.
 * Names and labels are checked against the value they would select before any write or echo, so a pasted value
 * never reaches the file, the notification, or the model.
 * A loaded entry gets the same check: a name that contains its value is skipped, and a label that contains its
 * value is withheld, because the file was written outside the command path.
 * Published names, labels, and load problems are redacted against every registered value, so a value registered
 * after a name or label was checked still never appears in a listing, in guidance, or in a startup notice.
 */
export class CredentialSources {
  readonly #file: SelectionFile;
  readonly #engine: RedactionEngine;
  readonly #readVariable: (name: string) => string | undefined;
  readonly #bindings: CredentialBindings;
  readonly #origins = new Map<string, SelectionOrigin>();
  readonly #declined = new Set<string>();
  #config: SelectionConfig = emptySelectionConfig();

  constructor(options: CredentialSourcesOptions) {
    this.#file = options.file;
    this.#engine = options.engine;
    this.#readVariable = options.readVariable;
    this.#bindings = new CredentialBindings(options.registry, options.generateReference);
  }

  /**
   * Reads the user file and binds every selection; a malformed file keeps the last valid selection.
   * A user selection the file no longer holds is unbound, so another process's removal takes effect here.
   */
  load(): LoadReport {
    return { problems: this.#load().map((problem) => this.#engine.redactText(problem)) };
  }

  /** Problems are redacted only after every entry is bound, so an entry's name is covered by a later entry's value. */
  #load(): string[] {
    const problems: string[] = [];
    try {
      this.#config = this.#file.load();
    } catch (error) {
      problems.push(
        error instanceof SelectionConfigError ? error.message : "credential configuration could not be loaded",
      );
      return problems;
    }
    const stored = new Set(this.#config.selections.map((selection) => selection.name));
    for (const [name, origin] of this.#origins) {
      if (origin === "user" && !stored.has(name)) this.#unbind(name);
    }
    this.#config.selections.forEach((selection, index) => {
      const value = this.#readVariable(selection.name);
      if (value !== undefined && value.length > 0 && selection.name.includes(value)) {
        problems.push(
          entryProblem(index, "variable name contains the selected credential value; the entry was skipped"),
        );
        return;
      }
      const withheld = value !== undefined && value.length > 0 && selection.label.includes(value);
      if (withheld) {
        problems.push(
          entryProblem(
            index,
            "service label contains the selected credential value; the label is withheld until the file is repaired",
          ),
        );
      }
      const binding = this.#bind(withheld ? { name: selection.name, label: WITHHELD_LABEL } : selection, "user");
      if (binding.state === "refused") problems.push(refusalMessage(binding.name));
    });
    return problems;
  }

  /**
   * Throws `SelectionConfigError` or `SelectionWriteFailure`; the file changes only before a binding.
   * The file is written only when its entry differs, and the outcome describes this process's binding.
   * The name is always bound as a user selection afterwards, so a persisted project approval changes owner.
   */
  async add(name: string, label: string): Promise<AddOutcome> {
    this.assertSelection(name, label);
    const current = this.#bindings.list().find((binding) => binding.name === name);
    this.#config = await this.#file.update((stored) => {
      const existing = stored.selections.find((selection) => selection.name === name);
      if (existing?.label === label) return undefined;
      return { version: 1, selections: withSelection(stored.selections, { name, label }) };
    });
    const binding = this.#bind({ name, label }, "user");
    if (current === undefined) return { kind: "added", binding };
    return { kind: current.label === label ? "unchanged" : "relabeled", binding };
  }

  /**
   * The value stays registered for redaction; the name leaves the selection and Bash stripping.
   * The file is edited under its lock even for a project approval, because another process may have stored the
   * name meanwhile; only a malformed file is tolerated then, since nothing can rebind from it until it is repaired.
   */
  async remove(name: string): Promise<RemoveOutcome> {
    this.assertName(name);
    const origin = this.#origins.get(name);
    const stored = await this.#removeStored(name, origin === "project");
    if (!stored && origin === undefined) return { kind: "not-selected", name };
    const retainedValue = this.#bindings.list().some((binding) => binding.name === name && binding.state === "active");
    this.#unbind(name);
    return { kind: "removed", name, retainedValue };
  }

  /** Whether the file held the name; a malformed file is reported unless `tolerateMalformed` is set. */
  async #removeStored(name: string, tolerateMalformed: boolean): Promise<boolean> {
    let stored = false;
    try {
      this.#config = await this.#file.update((current) => {
        stored = current.selections.some((selection) => selection.name === name);
        if (!stored) return undefined;
        return { version: 1, selections: current.selections.filter((selection) => selection.name !== name) };
      });
    } catch (error) {
      if (!(tolerateMalformed && error instanceof SelectionConfigError)) throw error;
    }
    return stored;
  }

  /**
   * Proposals whose names the active selection does not contain and the user has not declined;
   * throws `SelectionConfigError` for a malformed file.
   */
  proposalsFrom(projectFile: SelectionFile): Selection[] {
    const selected = new Set(this.#bindings.selectedNames());
    return projectFile
      .load()
      .selections.filter((selection) => !selected.has(selection.name) && !this.#declined.has(selection.name));
  }

  /** Keeps a proposal for this name out of later offers until the process exits. */
  decline(name: string): void {
    this.#declined.add(name);
  }

  /** Binds an approved proposal until the process exits, without persisting it. Throws `SelectionConfigError`. */
  approve(selection: Selection): Binding {
    this.assertSelection(selection.name, selection.label);
    return this.#bind(selection, "project");
  }

  /** Names and labels are redacted on every read, so a listing never carries a value registered after the check. */
  list(): SelectedBinding[] {
    // Every bound name has an origin because `#bind` is the only binding path.
    return this.#bindings.list().map(({ name, label, reference, state }) => ({
      name: this.#engine.redactText(name),
      label: this.#engine.redactText(label),
      reference,
      state,
      origin: this.#origins.get(name)!,
    }));
  }

  selectedNames(): string[] {
    return this.#bindings.selectedNames();
  }

  origin(name: string): SelectionOrigin | undefined {
    return this.#origins.get(name);
  }

  /** Whether this process holds a non-empty value for the name; a selection without one binds as unavailable. */
  hasValue(name: string): boolean {
    const value = this.#readVariable(name);
    return value !== undefined && value.length > 0;
  }

  /**
   * Throws `SelectionConfigError` with fixed wording, so callers can reject input before echoing it.
   * The value this selection would load is checked as well, because it is registered only after the write.
   * Reading that value is a credential lookup, so a project proposal calls `assertNameAndLabel` until approved.
   */
  assertSelection(name: string, label: string): void {
    this.assertNameAndLabel(name, label);
    const value = this.#readVariable(name);
    if (value === undefined || value.length === 0) return;
    if (name.includes(value)) throw new SelectionConfigError("variable name contains the selected credential value");
    if (label.includes(value)) throw new SelectionConfigError("service label contains the selected credential value");
  }

  /** Checks the selection text against registered values only, without reading the selected variable. */
  assertNameAndLabel(name: string, label: string): void {
    this.assertName(name);
    const labelProblem = validateLabel(label);
    if (labelProblem) throw new SelectionConfigError(labelProblem);
    if (this.#engine.redactText(label) !== label) {
      throw new SelectionConfigError("service label contains a registered credential value");
    }
  }

  /** Throws `SelectionConfigError` with fixed wording, so callers can reject input before echoing it. */
  assertName(name: string): void {
    const nameProblem = validateVariableName(name);
    if (nameProblem) throw new SelectionConfigError(nameProblem);
    if (this.#engine.redactText(name) !== name) {
      throw new SelectionConfigError("variable name contains a registered credential value");
    }
  }

  #bind(selection: Selection, origin: SelectionOrigin): Binding {
    const binding = this.#bindings.bind(selection, this.#readVariable(selection.name));
    if (origin === "user" || !this.#origins.has(selection.name)) this.#origins.set(selection.name, origin);
    return binding;
  }

  #unbind(name: string): void {
    this.#bindings.unbind(name);
    this.#origins.delete(name);
  }
}

function withSelection(selections: readonly Selection[], selection: Selection): Selection[] {
  if (!selections.some((stored) => stored.name === selection.name)) return [...selections, selection];
  return selections.map((stored) => (stored.name === selection.name ? selection : stored));
}

function entryProblem(index: number, problem: string): string {
  return `credential configuration entry ${index + 1}: ${problem}`;
}

export function refusalMessage(name: string): string {
  return `credential ${name} cannot be protected: no safe reference exists for its value, so it is unusable and not redacted`;
}

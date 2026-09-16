import { randomBytes } from "node:crypto";
import { type CredentialRegistry, RegistrationRefusal } from "../domain/credential-registry.ts";
import type { Selection } from "../domain/credential-selection.ts";

/**
 * `unavailable`: the process holds no value for the name.
 * `refused`: the process holds a value, but no safe reference exists for it: no random reference excludes it,
 * or registering it would move a reference the registry already assigned.
 * A refused value is neither usable nor redacted; the selection stays listed and stripped from Bash.
 */
export type BindingState = "active" | "unavailable" | "refused";

/**
 * A binding publishes a source name, a service label, and a random reference.
 * The exact value stays in the registry, so a binding can be shown to the user and the model.
 */
export interface Binding extends Selection {
  /** The registry id redaction writes; absent unless the binding is active. */
  reference: string | undefined;
  state: BindingState;
}

/** The registry id is private state: the published reference is resolved from it on every read. */
type StoredBinding = Selection & ({ state: "active"; id: string } | { state: "unavailable" | "refused" });

export const REFERENCE_PREFIX = "cred-";
const REFERENCE_RANDOM_BYTES = 5;
const MAX_REFERENCE_ATTEMPTS = 32;

export function randomReference(): string {
  return `${REFERENCE_PREFIX}${randomBytes(REFERENCE_RANDOM_BYTES).toString("hex")}`;
}

/**
 * Bindings register a value before they publish its binding, so redaction always covers a published reference.
 * References are random, so no reference derives from a value; a value that a generated reference would contain gets
 * another random reference, never the registry's numbered or opaque fallback, and is refused when none excludes it.
 * An existing active binding keeps its registry id, so repeating a selection never rotates references.
 * An unbound name remembers its retained id, and binding the name again re-activates that id, so redacted text
 * and the published reference stay equal after a removal; the retained value is not registered a second time.
 * The registry is asked to preserve every assigned reference, including retained ones, so a value that would move
 * any of them is refused and every published reference stays stable for the session.
 * The published reference is still read from the registry, so listings always match redacted text.
 * Equal values get separate references; redaction writes the reference of the earliest bound value.
 */
export class CredentialBindings {
  readonly #registry: CredentialRegistry;
  readonly #generateReference: () => string;
  readonly #bindings = new Map<string, StoredBinding>();
  readonly #retainedIds = new Map<string, string>();

  constructor(registry: CredentialRegistry, generateReference: () => string = randomReference) {
    this.#registry = registry;
    this.#generateReference = generateReference;
  }

  /** A value the registry refuses publishes a `refused` binding, so the selection stays visible without protection. */
  bind(selection: Selection, value: string | undefined): Binding {
    const existing = this.#bindings.get(selection.name);
    if (existing?.state === "active") return this.#publish({ ...existing, label: selection.label });
    const { name, label } = selection;
    if (value === undefined || value.length === 0) return this.#publish({ name, label, state: "unavailable" });
    const id = this.#reactivateRetained(name, value) ?? this.#registerUnderRandomReference(value);
    if (id === undefined) return this.#publish({ name, label, state: "refused" });
    this.#retainedIds.delete(name);
    return this.#publish({ name, label, state: "active", id });
  }

  /** The value stays registered for redaction because published text may still contain it. */
  unbind(name: string): void {
    const existing = this.#bindings.get(name);
    if (!existing) return;
    if (existing.state === "active") {
      this.#registry.retainForRedaction(existing.id);
      this.#retainedIds.set(name, existing.id);
    }
    this.#bindings.delete(name);
  }

  list(): Binding[] {
    return [...this.#bindings.values()].map((binding) => this.#view(binding));
  }

  selectedNames(): string[] {
    return [...this.#bindings.keys()];
  }

  toJSON(): { bindings: Binding[] } {
    return { bindings: this.list() };
  }

  #publish(binding: StoredBinding): Binding {
    this.#bindings.set(binding.name, binding);
    return this.#view(binding);
  }

  #view(binding: StoredBinding): Binding {
    const { name, label, state } = binding;
    if (binding.state !== "active") return { name, label, reference: undefined, state };
    return { name, label, reference: this.#referenceOf(binding.id), state };
  }

  #referenceOf(id: string): string {
    return this.#registry.referenceOf(id) ?? id;
  }

  /**
   * Re-registering the retained id with its unchanged value re-activates it without a registry change.
   * A changed value keeps the id only when the registry can do so without moving or replacing any reference;
   * otherwise the name gets a fresh random reference like a new selection.
   */
  #reactivateRetained(name: string, value: string): string | undefined {
    const id = this.#retainedIds.get(name);
    if (id === undefined) return undefined;
    try {
      this.#registry.register(id, value, { preserveReferences: true, exactReference: true });
      return id;
    } catch (error) {
      if (!(error instanceof RegistrationRefusal)) throw error;
      return undefined;
    }
  }

  /**
   * Tries another generated id only while the registry would substitute a fallback reference for the current one;
   * any other refusal depends on the value alone, so another id cannot help.
   */
  #registerUnderRandomReference(value: string): string | undefined {
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
      const candidate = this.#generateReference();
      if (!this.#isUnused(candidate)) continue;
      try {
        this.#registry.register(candidate, value, { preserveReferences: true, exactReference: true });
        return candidate;
      } catch (error) {
        if (!(error instanceof RegistrationRefusal) || error.reason !== "fallback-reference") return undefined;
      }
    }
    return undefined;
  }

  #isUnused(candidate: string): boolean {
    if (this.#registry.stateOf(candidate).kind !== "unavailable") return false;
    for (const binding of this.#bindings.values()) {
      if (binding.state === "active" && binding.id === candidate) return false;
    }
    return true;
  }
}

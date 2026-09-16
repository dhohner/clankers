import { MAX_REFERENCE_ID_LENGTH, REFERENCE_ID_PATTERN, referenceFor } from "./text-redaction.ts";

export type CredentialState =
  | { kind: "unavailable"; id: string }
  | { kind: "active"; id: string }
  | { kind: "retained"; id: string };

export interface RedactionEntry {
  id: string;
  value: string;
}

/** `version` lets persistent consumers refresh only after redaction entries change. */
export interface RedactionEntrySource {
  readonly version: number;
  redactionEntries(): RedactionEntry[];
}

export function staticEntrySource(entries: readonly RedactionEntry[]): RedactionEntrySource {
  return { version: 0, redactionEntries: () => [...entries] };
}

interface StoredCredential {
  kind: "active" | "retained";
  value: string;
  /** Earlier values remain here because existing text may still contain them. */
  previous: Set<string>;
  /** This id may differ from the credential id to keep generated references safe. See `assignReferences`. */
  reference: string;
}

interface CredentialValues {
  id: string;
  values: string[];
}

const MAX_ID_SUFFIX = 9;
const MAX_OPAQUE_REFERENCES = 999;

export interface RegisterOptions {
  /** Refuse the registration instead of moving any reference that is already assigned. */
  preserveReferences?: boolean;
  /** Refuse the registration instead of assigning the new id a numbered or opaque fallback reference. */
  exactReference?: boolean;
}

export type RegistrationRefusalReason = "no-safe-reference" | "moves-reference" | "fallback-reference";

/** A refused registration leaves the registry unchanged; `reason` lets a caller decide whether another id could succeed. */
export class RegistrationRefusal extends Error {
  readonly reason: RegistrationRefusalReason;

  constructor(reason: RegistrationRefusalReason, message: string) {
    super(message);
    this.name = "RegistrationRefusal";
    this.reason = reason;
  }
}

/**
 * Only `redactionEntries()` exposes credential values, and only to the redaction engine.
 * Other accessors expose state without values.
 *
 * Later capabilities may use active credentials.
 * Retained values remain redacted but cannot be used.
 * Unavailable ids produce no replacement because they have no value.
 *
 * New registrations retain earlier values because existing text may still contain them.
 */
export class CredentialRegistry implements RedactionEntrySource {
  readonly #entries = new Map<string, StoredCredential>();
  #version = 0;

  /** State changes preserve this version unless they change the redaction entries. */
  get version(): number {
    return this.#version;
  }

  /**
   * Registration throws `RegistrationRefusal` after failed reference generation and leaves the registry unchanged.
   * With `preserveReferences`, it also throws when the new value would move an existing reference, including a
   * retained one, so a published reference keeps resolving.
   * With `exactReference`, it also throws when the new id itself would need a fallback reference, so a caller can
   * try another generated id instead of publishing a predictable one.
   */
  register(id: string, value: string | undefined | null, options: RegisterOptions = {}): CredentialState {
    assertValidId(id);
    if (value === undefined || value === null || value.length === 0) {
      const existing = this.#entries.get(id);
      if (existing) {
        existing.kind = "retained";
        return { kind: "retained", id };
      }
      return { kind: "unavailable", id };
    }
    const existing = this.#entries.get(id);
    if (existing?.value === value) {
      existing.kind = "active";
      return { kind: "active", id };
    }
    const credentials = this.#valuesWith(id, value);
    const references = assignReferences(credentials);
    if (!references) {
      throw new RegistrationRefusal(
        "no-safe-reference",
        `credential ${JSON.stringify(id)} cannot be registered: no generated reference excludes every registered value`,
      );
    }
    if (options.preserveReferences && this.#movesReference(references, id)) {
      throw new RegistrationRefusal(
        "moves-reference",
        `credential ${JSON.stringify(id)} cannot be registered: its value would move an existing reference`,
      );
    }
    if (options.exactReference && references.get(id) !== id) {
      throw new RegistrationRefusal(
        "fallback-reference",
        `credential ${JSON.stringify(id)} cannot be registered: its id would need a fallback reference`,
      );
    }
    this.#commit(credentials, references, id);
    this.#version += 1;
    return { kind: "active", id };
  }

  retainForRedaction(id: string): CredentialState {
    const existing = this.#entries.get(id);
    if (!existing) return { kind: "unavailable", id };
    existing.kind = "retained";
    return { kind: "retained", id };
  }

  stateOf(id: string): CredentialState {
    const existing = this.#entries.get(id);
    if (!existing) return { kind: "unavailable", id };
    return { kind: existing.kind, id };
  }

  /** The reference id redaction writes for this credential, which differs from `id` only when `id` would expose a value. */
  referenceOf(id: string): string | undefined {
    return this.#entries.get(id)?.reference;
  }

  redactionEntries(): RedactionEntry[] {
    const entries: RedactionEntry[] = [];
    for (const entry of this.#entries.values()) {
      entries.push({ id: entry.reference, value: entry.value });
      for (const value of entry.previous) entries.push({ id: entry.reference, value });
    }
    return entries;
  }

  toJSON(): { ids: string[] } {
    return { ids: [...this.#entries.keys()] };
  }

  toString(): string {
    return `CredentialRegistry(${this.#entries.size} ids)`;
  }

  #valuesWith(id: string, value: string): CredentialValues[] {
    const credentials: CredentialValues[] = [];
    for (const [key, entry] of this.#entries) {
      if (key !== id) {
        credentials.push({ id: key, values: [entry.value, ...entry.previous] });
        continue;
      }
      const previous = new Set(entry.previous);
      previous.add(entry.value);
      previous.delete(value);
      credentials.push({ id: key, values: [value, ...previous] });
    }
    if (!this.#entries.has(id)) credentials.push({ id, values: [value] });
    return credentials;
  }

  #movesReference(references: ReadonlyMap<string, string>, newId: string): boolean {
    for (const [id, entry] of this.#entries) {
      if (id !== newId && references.get(id) !== entry.reference) return true;
    }
    return false;
  }

  #commit(credentials: readonly CredentialValues[], references: ReadonlyMap<string, string>, activeId: string): void {
    for (const credential of credentials) {
      const existing = this.#entries.get(credential.id);
      const [value, ...previous] = credential.values;
      this.#entries.set(credential.id, {
        kind: credential.id === activeId || !existing ? "active" : existing.kind,
        value: value!,
        previous: new Set(previous),
        reference: references.get(credential.id)!,
      });
    }
  }
}

/**
 * Generated references must contain no registered value.
 * This prevents one replacement from inserting another credential.
 * It also preserves references across later passes.
 *
 * Use the credential id when safe, then numbered variants, then opaque ids.
 * These alternatives move conflicting references instead of leaving values exposed.
 * Values contained in the fixed reference syntax have no safe reference, so their registration fails.
 */
function assignReferences(credentials: readonly CredentialValues[]): Map<string, string> | undefined {
  const values = credentials.flatMap((credential) => credential.values);
  const assigned = new Map<string, string>();
  const used = new Set<string>();
  for (const credential of credentials) {
    const reference = firstSafeReference(credential.id, values, used);
    if (reference === undefined) return undefined;
    used.add(reference);
    assigned.set(credential.id, reference);
  }
  return assigned;
}

function firstSafeReference(id: string, values: readonly string[], used: ReadonlySet<string>): string | undefined {
  for (const candidate of candidateReferenceIds(id)) {
    if (used.has(candidate)) continue;
    const reference = referenceFor(candidate);
    if (values.every((value) => !reference.includes(value))) return candidate;
  }
  return undefined;
}

function* candidateReferenceIds(id: string): Generator<string> {
  yield id;
  for (let suffix = 2; suffix <= MAX_ID_SUFFIX; suffix += 1) yield withSuffix(id, `.${suffix}`);
  for (let index = 1; index <= MAX_OPAQUE_REFERENCES; index += 1) yield `redacted-${index}`;
}

function withSuffix(id: string, suffix: string): string {
  return id.slice(0, MAX_REFERENCE_ID_LENGTH - suffix.length) + suffix;
}

function assertValidId(id: string): void {
  if (!REFERENCE_ID_PATTERN.test(id)) {
    throw new Error(`credential id must match ${REFERENCE_ID_PATTERN}: received ${JSON.stringify(id)}`);
  }
}

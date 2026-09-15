import type { CredentialRegistry, RedactionEntry, RedactionEntrySource } from "../domain/credential-registry.ts";
import { redactDeep } from "../domain/deep-redaction.ts";
import { ByteStreamRedactor } from "../domain/stream-redactor.ts";
import {
  redactCutsWithMatcher,
  redactText,
  type RedactionTextOptions,
  redactWithMatcher,
  ValueMatcher,
} from "../domain/text-redaction.ts";

export type RedactionOperation = "text" | "structure" | "stream-open" | "stream-push" | "stream-finish";

/**
 * `RedactionFailure` is the only error the engine exposes.
 * Its fixed message can enter host diagnostics without exposing protected content.
 * It omits `cause` because consoles and `util.inspect` can print the original message.
 */
export class RedactionFailure extends Error {
  readonly operation: RedactionOperation;
  /** Approved cause name, such as `TypeError`, without the original message. */
  readonly causeName: string;

  constructor(operation: RedactionOperation, cause: unknown) {
    super(`redaction failed during ${operation}; the affected content was withheld`);
    this.name = "RedactionFailure";
    this.operation = operation;
    this.causeName = describeCause(cause);
  }
}

const KNOWN_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
  "AbortError",
  "RedactionFailure",
  "OutputStorageFailure",
]);

/**
 * `Error.name` is writable and may contain protected content.
 * Preserve fixed names and report every other error as `Error`.
 */
export function describeCause(cause: unknown): string {
  if (cause instanceof Error) return KNOWN_ERROR_NAMES.has(cause.name) ? cause.name : "Error";
  return typeof cause;
}

/** Tests inject algorithm failures through this interface. */
export interface RedactionAlgorithms {
  redactText: (text: string, entries: readonly RedactionEntry[], options?: RedactionTextOptions) => string;
  /** A live registry lets open streams follow later registrations. */
  createByteStream: (source: RedactionEntrySource) => ByteStreamRedactor;
}

const DEFAULT_ALGORITHMS: RedactionAlgorithms = {
  redactText,
  createByteStream: (source) => new ByteStreamRedactor(source),
};

export type DeepRedactor = <V>(value: V) => V;

export type CutRedactor = (text: string, cuts: readonly number[]) => string;

export interface RedactionStream {
  push(bytes: Uint8Array): string;
  finish(): string;
  discard(): void;
}

export class RedactionEngine {
  readonly #registry: CredentialRegistry;
  readonly #algorithms: RedactionAlgorithms;

  constructor(registry: CredentialRegistry, algorithms: Partial<RedactionAlgorithms> = {}) {
    this.#registry = registry;
    this.#algorithms = { ...DEFAULT_ALGORITHMS, ...algorithms };
  }

  redactText(text: string, options?: RedactionTextOptions): string {
    return guard("text", () => this.#algorithms.redactText(text, this.#registry.redactionEntries(), options));
  }

  redactDeep<T>(value: T): T {
    return this.redactWith((redactValue) => redactValue(value));
  }

  /**
   * One registry snapshot builds the value index once for the full operation.
   * Errors from algorithms or `operate` become failures of the `structure` operation.
   */
  redactWith<T>(operate: (redactValue: DeepRedactor, redactCuts: CutRedactor) => T): T {
    return guard("structure", () => {
      const entries = this.#registry.redactionEntries();
      const matcher = new ValueMatcher(entries);
      const redactString =
        this.#algorithms.redactText === redactText
          ? (text: string) => redactWithMatcher(text, matcher)
          : (text: string) => this.#algorithms.redactText(text, entries);
      return operate(
        (value) => redactDeep(value, redactString),
        (text, cuts) => redactCutsWithMatcher(text, cuts, matcher),
      );
    });
  }

  /** Separate pending buffers prevent concurrent tools from sharing stream state. */
  openByteStream(): RedactionStream {
    const stream = guard("stream-open", () => this.#algorithms.createByteStream(this.#registry));
    return {
      push: (bytes) => guard("stream-push", () => stream.push(bytes)),
      finish: () => guard("stream-finish", () => stream.finish()),
      discard: () => {
        try {
          stream.discard();
        } catch {
          // Discard already abandons the buffer, so its failure must not reach host stream handling.
        }
      },
    };
  }
}

function guard<T>(operation: RedactionOperation, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw new RedactionFailure(operation, error);
  }
}

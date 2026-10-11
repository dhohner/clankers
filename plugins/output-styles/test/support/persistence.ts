import type { PersistedStyleRead } from "../../src/storage/settings.ts";
import type { StylePersistence } from "../../src/storage/style-persistence.ts";
import { deferred } from "./deferred.ts";

/** Preserve per-path write ordering while tests control failures and completion. */
export class MemoryStylePersistence implements StylePersistence {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: Array<{ path: string; name: string }> = [];
  readonly readFailures = new Map<string, string>();
  readonly writeFailures = new Map<string, Error>();
  readonly writeGates = new Map<string, Promise<void>>();
  readonly writeStarted = new Map<string, ReturnType<typeof deferred<void>>>();
  private readonly queues = new Map<string, Promise<void>>();

  async read(path: string): Promise<PersistedStyleRead> {
    this.reads.push(path);
    const failure = this.readFailures.get(path);

    if (failure !== undefined) return { status: "failed", failure };

    const value = this.values.get(path);

    return value === undefined || value === "" ? { status: "none" } : { status: "selected", value };
  }

  write(path: string, name: string): Promise<void> {
    this.writes.push({ path, name });
    this.writeStarted.get(name)?.resolve();
    const previous = this.queues.get(path) ?? Promise.resolve();

    const result = previous.then(async () => {
      await this.writeGates.get(name);
      const failure = this.writeFailures.get(name);

      if (failure) throw failure;

      this.values.set(path, name);
    });

    this.queues.set(
      path,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );

    return result;
  }
}

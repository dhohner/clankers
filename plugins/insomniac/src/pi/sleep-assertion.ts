import { spawn, type SpawnOptions } from "node:child_process";

export interface AssertionProcess {
  once(event: "spawn" | "exit", listener: () => void): this;
  on(event: "error", listener: () => void): this;
  kill(): boolean;
}

export interface SleepDependencies {
  platform?: NodeJS.Platform;
  spawn?: (command: string, args: string[], options: SpawnOptions) => AssertionProcess;
}

/** One session's handle. No process lookup or persisted ownership is involved. */
export class SleepAssertion {
  private child: AssertionProcess | undefined;
  private disposed = false;
  private active = false;

  private readonly changed: (owned: boolean) => void;
  private readonly dependencies: SleepDependencies;

  constructor(changed: (owned: boolean) => void, dependencies: SleepDependencies) {
    this.changed = changed;
    this.dependencies = dependencies;
  }

  acquire(): void {
    if (this.disposed || this.active || (this.dependencies.platform ?? process.platform) !== "darwin") return;
    this.active = true;
    let child: AssertionProcess;

    try {
      child = (this.dependencies.spawn ?? spawn)("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], {
        stdio: "ignore",
      });
    } catch {
      this.changed(false);

      return;
    }

    this.child = child;
    child.once("spawn", () => {
      if (this.child === child && !this.disposed) this.changed(true);
    });

    const lost = () => {
      if (this.child !== child) return;
      this.child = undefined;
      this.changed(false);
    };

    child.once("exit", lost);
    child.on("error", () => {
      if (this.child !== child) return;
      lost();
      this.terminate(child);
    });
  }

  release(): void {
    this.active = false;
    const child = this.child;
    this.child = undefined;

    if (child) this.terminate(child);
    this.changed(false);
  }

  private terminate(child: AssertionProcess): void {
    try {
      child.kill();
    } catch {
      // Process failures must not escape Pi lifecycle handlers. -w still bounds parent lifetime.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
  }
}

import { EventEmitter } from "node:events";
import type { SpawnOptions } from "node:child_process";
import { vi } from "vitest";
import type { AssertionProcess } from "../../src/pi/sleep-assertion.ts";

export class AssertionChild extends EventEmitter implements AssertionProcess {
  readonly kill = vi.fn(() => true);
  pid = 123;
}

export function createAssertionProcess(denied = false) {
  const children: AssertionChild[] = [];
  const launches: { command: string; args: string[]; options: SpawnOptions }[] = [];

  const spawn = (command: string, args: string[], options: SpawnOptions) => {
    launches.push({ command, args, options });

    if (denied) throw new Error("EACCES");
    const child = new AssertionChild();
    children.push(child);

    return child;
  };

  return { children, launches, spawn };
}

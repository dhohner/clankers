import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { SleepAssertion } from "../../src/pi/sleep-assertion.ts";
import { createProcessFixture } from "../support/process-fixture.ts";

let directory: string;

let executable: string;

let dispose: () => void;

const processes: ChildProcess[] = [];

const pids: number[] = [];

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met within 3 seconds");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(() => {
  ({ directory, executable, dispose } = createProcessFixture());
});

afterEach(() => {
  for (const child of processes.splice(0)) child.kill("SIGKILL");

  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already terminated by the session.
    }
  }
});

afterAll(() => dispose?.());

// Omitting -w leaves an orphan after SIGKILL; a changed footer label cannot satisfy this check.
it("terminates its owned assertion process after forced parent exit", async () => {
  const log = join(directory, "parent.log");
  const moduleURL = new URL("../../src/pi/sleep-assertion.ts", import.meta.url).href;

  const script = `import { spawn } from "node:child_process";
    import { SleepAssertion } from ${JSON.stringify(moduleURL)};
    const assertion = new SleepAssertion(() => {}, {
      platform: "darwin",
      spawn: (_command, args, options) => spawn(${JSON.stringify(executable)}, args, options),
    });
    assertion.acquire();
    setInterval(() => {}, 1000);`;

  const parent = spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, INSOMNIAC_TEST_LOG: log },
  });

  let stderr = "";
  parent.stderr!.on("data", (data) => {
    stderr += data;
  });
  processes.push(parent);
  await waitFor(() => {
    if (parent.exitCode !== null) throw new Error(`parent exited: ${stderr}`);

    return existsSync(log);
  });
  const pid = Number(readFileSync(log, "utf8").trim());
  pids.push(pid);
  expect(alive(pid)).toBe(true);
  const exited = once(parent, "exit");
  parent.kill("SIGKILL");
  await exited;
  await waitFor(() => !alive(pid));
  expect(alive(pid)).toBe(false);
});

// Global process searches or missing kill leak/terminate another session's independent handle.
it("releases only its own process and leaves a second session and unrelated assertion alive", async () => {
  const log = join(directory, "sessions.log");

  const start = (_command: string, args: string[], options: SpawnOptions) => {
    const child = spawn(executable, args, { ...options, env: { ...process.env, INSOMNIAC_TEST_LOG: log } });
    processes.push(child);

    return child;
  };

  let firstOwned = false;
  let secondOwned = false;

  const first = new SleepAssertion(
    (owned) => {
      firstOwned = owned;
    },
    { platform: "darwin", spawn: start },
  );

  const second = new SleepAssertion(
    (owned) => {
      secondOwned = owned;
    },
    { platform: "darwin", spawn: start },
  );

  const unrelated = start("", ["-i", "-w", String(process.pid)], {});
  first.acquire();
  second.acquire();
  await waitFor(() => firstOwned && secondOwned);
  await waitFor(() => existsSync(log) && readFileSync(log, "utf8").trim().split("\n").length === 3);
  first.release();
  expect(firstOwned).toBe(false);
  await waitFor(() => !alive(processes[1].pid!));
  expect(secondOwned).toBe(true);
  expect(alive(processes[2].pid!)).toBe(true);
  expect(alive(unrelated.pid!)).toBe(true);
  first.dispose();
  second.dispose();
  await waitFor(() => !alive(processes[2].pid!));
  expect(alive(unrelated.pid!)).toBe(true);
});

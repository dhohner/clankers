import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { SleepAssertion } from "../src/sleep.ts";

// This fixture obeys caffeinate's -w lifetime option but never creates a power assertion.
const source = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
int main(int argc, char **argv) {
  int parent = 0;
  for (int i = 1; i + 1 < argc; i++) if (!strcmp(argv[i], "-w")) parent = atoi(argv[++i]);
  FILE *log = fopen(getenv("INSOMNIAC_TEST_LOG"), "a");
  fprintf(log, "%d\\n", getpid());
  fclose(log);
  while (!parent || kill(parent, 0) == 0) usleep(10000);
  return 0;
}
`;
let directory: string;
let executable: string;
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
  directory = mkdtempSync(join(process.cwd(), ".sleep-fixture-"));
  executable = join(directory, "fake-caffeinate");
  writeFileSync(`${executable}.c`, source);
  const build = spawnSync("cc", ["-o", executable, `${executable}.c`], { encoding: "utf8" });
  if (build.status !== 0) throw new Error(build.stderr);
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
afterAll(() => rmSync(directory, { recursive: true, force: true }));

// Omitting -w leaves an orphan after SIGKILL; a changed footer label cannot satisfy this check.
it("terminates its owned assertion process after forced parent exit", async () => {
  const log = join(directory, "parent.log");
  const moduleURL = new URL("../src/sleep.ts", import.meta.url).href;
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
  const start = (_command: string, args: string[], options: object) => {
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

// The host loader/runner must understand the default factory and final-settlement registration.
it("loads the default extension with Pi 1.0.4 and releases fake processes through host lifecycle events", async () => {
  const agentDir = join(directory, "agent");
  const script = new URL("./fixtures/pi-integration.mjs", import.meta.url);
  const child = spawn(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDir,
      INSOMNIAC_TEST_EXECUTABLE: executable,
      INSOMNIAC_TEST_LOG: join(directory, "integration.log"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.push(child);
  let output = "";
  child.stdout!.on("data", (data) => {
    output += data;
  });
  child.stderr!.on("data", (data) => {
    output += data;
  });
  const [code] = await once(child, "exit");
  expect({ code, output }).toMatchObject({ code: 0 });
  expect(output).toContain("Pi lifecycle integration passed");
}, 10000);

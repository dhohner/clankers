import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createProcessFixture } from "../support/process-fixture.ts";

let fixture: ReturnType<typeof createProcessFixture>;

let child: ChildProcess | undefined;

beforeAll(() => {
  fixture = createProcessFixture();
});

afterEach(() => child?.kill("SIGKILL"));

afterAll(() => fixture?.dispose());

it("loads the default extension with Pi 1.0.4 and releases fake processes through host lifecycle events", async () => {
  const script = new URL("../fixtures/pi-integration.mjs", import.meta.url);
  child = spawn(process.execPath, [fileURLToPath(script)], {
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: join(fixture.directory, "agent"),
      INSOMNIAC_TEST_EXECUTABLE: fixture.executable,
      INSOMNIAC_TEST_LOG: join(fixture.directory, "integration.log"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
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

import { expect, it, vi } from "vitest";
import { SleepAssertion } from "../../src/pi/sleep-assertion.ts";
import { createAssertionProcess } from "../support/assertion-process.ts";

it("publishes ownership only after spawn and clears it before delayed child events", () => {
  const process = createAssertionProcess();
  const changed = vi.fn();
  const assertion = new SleepAssertion(changed, { platform: "darwin", spawn: process.spawn });
  assertion.acquire();
  assertion.acquire();
  expect(process.launches).toHaveLength(1);
  expect(changed).not.toHaveBeenCalled();
  const child = process.children[0];
  child.emit("spawn");
  expect(changed).toHaveBeenLastCalledWith(true);
  assertion.release();
  expect(child.kill).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenLastCalledWith(false);
  changed.mockClear();
  child.emit("exit", 0, null);
  child.emit("error", new Error("late error"));
  expect(changed).not.toHaveBeenCalled();
});

it("never reacquires after disposal and disposes only once", () => {
  const process = createAssertionProcess();
  const changed = vi.fn();
  const assertion = new SleepAssertion(changed, { platform: "darwin", spawn: process.spawn });
  assertion.acquire();
  assertion.dispose();
  assertion.dispose();
  assertion.acquire();
  process.children[0].emit("spawn");
  expect(process.launches).toHaveLength(1);
  expect(process.children[0].kill).toHaveBeenCalledOnce();
  expect(changed.mock.calls).toEqual([[false]]);
});

it.each(["throw", "error", "exit"] as const)("retries %s acquisition only after release", (failure) => {
  const process = createAssertionProcess(failure === "throw");
  const changed = vi.fn();
  const assertion = new SleepAssertion(changed, { platform: "darwin", spawn: process.spawn });
  assertion.acquire();

  if (failure === "error") process.children[0].emit("error", new Error("ENOENT"));

  if (failure === "exit") process.children[0].emit("exit", 1, null);
  expect(changed).toHaveBeenLastCalledWith(false);
  assertion.acquire();
  expect(process.launches).toHaveLength(1);
  assertion.release();
  assertion.acquire();
  expect(process.launches).toHaveLength(2);
  assertion.dispose();
});

it.each(["linux", "win32"] as const)("creates no assertion on %s", (platform) => {
  const process = createAssertionProcess();
  const assertion = new SleepAssertion(vi.fn(), { platform, spawn: process.spawn });
  assertion.acquire();
  expect(process.launches).toHaveLength(0);
});

import { expect, it, vi } from "vitest";
import { createPiHost } from "./pi-host.ts";

it("dispatches every registration in order and unsubscribes only its own handler", () => {
  const host = createPiHost();
  const calls: string[] = [];

  const first = vi.fn(() => {
    calls.push("first");
  });

  const second = vi.fn(() => {
    calls.push("second");
  });

  const unsubscribe = host.pi.on("session_start", first);
  host.pi.on("session_start", second);
  host.emit("session_start");
  expect(calls).toEqual(["first", "second"]);
  expect(first).toHaveBeenCalledWith({ type: "session_start" }, host.ctx);
  unsubscribe();
  unsubscribe();
  calls.length = 0;
  host.emit("session_start");
  expect(calls).toEqual(["second"]);
});

it("keeps the current dispatch stable when a handler unsubscribes another registration", () => {
  const host = createPiHost();
  const second = vi.fn();
  let unsubscribe: (() => void) | undefined;
  host.pi.on("session_start", () => {
    unsubscribe?.();
  });
  unsubscribe = host.pi.on("session_start", second);
  host.emit("session_start");
  expect(second).toHaveBeenCalledOnce();
  host.emit("session_start");
  expect(second).toHaveBeenCalledOnce();
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: { label: "insomniac", color: "magenta" },
    allowOnly: false,
    expect: { requireAssertions: true },
    // Each test starts and stops a few local processes and finishes well below this limit.
    // A test that needs more time is waiting on a hook that did not detach.
    testTimeout: 5000,
    // Random order exposes dependencies between tests and test files.
    sequence: { shuffle: { files: true, tests: true } },
  },
});

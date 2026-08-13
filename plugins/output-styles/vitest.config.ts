import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    expect: { requireAssertions: true },
    // Every test works on local files only, and the slowest one stays far below this limit.
    // A test that needs more time waits for something it must not wait for.
    testTimeout: 5000,
    setupFiles: ["./test/support/matchers.ts", "./test/support/offline-guard.ts"],
    // Random order exposes dependencies between tests and test files.
    sequence: { shuffle: { files: true, tests: true } },
    // Vitest runs these before each test to isolate process state created through vi.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});

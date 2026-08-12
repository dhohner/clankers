import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    expect: { requireAssertions: true },
    setupFiles: ["./test/support/matchers.ts"],
    // Random order exposes dependencies between tests and test files.
    sequence: { shuffle: { files: true, tests: true } },
    // Vitest runs these before each test to isolate process state created through vi.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});

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
    coverage: {
      // Istanbul instruments the sources before the run. The v8 provider merges native
      // coverage across workers and reported counts here that contradicted each other,
      // so its numbers cannot carry a gate.
      provider: "istanbul",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      // The gate measures the plugin sources only. Build output, tests, and the
      // entry point never raise or lower the measured value.
      include: ["lib/**"],
      // Vitest matches these with picomatch `contains`, so a bare `styles/**` would also
      // match the package directory `output-styles/`. The leading slash anchors each
      // pattern to a whole path segment.
      exclude: ["/test/**", "/dist/**", "/node_modules/**", "/styles/**", "/examples/**", "/index.ts"],
      all: true,
      // The gate reads the whole suite in one run. `perFile` makes a shortfall name the file that
      // caused it, not only the metric.
      thresholds: { perFile: true, lines: 90, branches: 90 },
    },
  },
});

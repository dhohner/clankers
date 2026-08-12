import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A test that only passes in its declared position hides a dependency on another test, so both
    // the file order and the order inside a file are randomized on every run.
    sequence: { shuffle: { files: true, tests: true } },
    // Restores every vi.spyOn after each test, so a spy cannot outlive the test that installed it.
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});

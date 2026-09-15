import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: { label: "redactor", color: "magenta" },
    sequence: { shuffle: { files: true, tests: true } },
    restoreMocks: true,
    globalSetup: ["./test/support/global-setup.ts"],
    setupFiles: ["./test/support/setup.ts"],
    isolate: false
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});

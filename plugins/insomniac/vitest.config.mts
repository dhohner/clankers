import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: { label: "insomniac", color: "magenta" },
    allowOnly: false,
    expect: { requireAssertions: true },
    sequence: { shuffle: { files: true, tests: true } },
  },
});

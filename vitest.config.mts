import { defineConfig } from "vitest/config";

// Each plugin keeps its own vitest.config.ts, which Vitest loads as a project. One run
// then reports every suite in one place instead of pnpm framing three separate runs.
export default defineConfig({
  test: {
    projects: ["plugins/*"],
    reporters: ["dot"],
  },
});

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    redactorTestRoot: string;
  }
}

// Share one isolated agent directory, `HOME`, and temporary root across all workers.
// This protects the developer's Pi configuration, credentials, and sessions.
// One root also lets cleanup remove output files created through `os.tmpdir()`.
//
// The root travels through `provide` because this function runs in the main process, which the
// other workspace projects share when the root config runs every plugin at once. Setting
// `process.env` here would leak into their workers, so `setup.ts` applies it per worker instead.
export default function setup(project: TestProject): () => void {
  const root = mkdtempSync(join("/tmp", "redactor-test-"));
  mkdirSync(join(root, "tmp"));
  project.provide("redactorTestRoot", root);
  return () => rmSync(root, { recursive: true, force: true });
}

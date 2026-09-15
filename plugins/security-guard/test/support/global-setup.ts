import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    securityGuardAgentDirectory: string;
  }
}

// One agent directory for the whole run, so every worker resolves the same Pi `bin` directory and the run
// leaves nothing behind in /tmp. `os.tmpdir()` is avoided for the reason given in
// src/infrastructure/node/temporary-root.ts: TMPDIR is not trusted.
//
// The path travels through `provide` because this function runs in the main process, which the other
// workspace projects share when the root config runs every plugin at once. Setting `process.env` here
// would leak into their workers, so `setup.ts` applies it per worker instead.
export default function setup(project: TestProject): () => void {
  const agentDirectory = mkdtempSync(join("/tmp", "security-guard-test-agent-"));
  project.provide("securityGuardAgentDirectory", agentDirectory);
  return () => rmSync(agentDirectory, { recursive: true, force: true });
}

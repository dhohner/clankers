import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

// One agent directory for the whole run, so every worker resolves the same Pi `bin` directory and the run
// leaves nothing behind in /tmp. `os.tmpdir()` is avoided for the reason given in
// src/infrastructure/node/temporary-root.ts: TMPDIR is not trusted. Vitest forwards `process.env` set here
// to its workers.
export default function setup(): () => void {
  const agentDirectory = mkdtempSync(join("/tmp", "security-guard-test-agent-"));
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  return () => rmSync(agentDirectory, { recursive: true, force: true });
}

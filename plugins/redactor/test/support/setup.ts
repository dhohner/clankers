import { join } from "node:path";
import { inject } from "vitest";

// Reset inherited shell hooks and command resolution because host tests run real commands.
// This prevents `BASH_ENV` or earlier lookalike executables in `PATH` from changing test results.
// `global-setup.ts` provides the root that holds the agent directory, `HOME`, and `TMPDIR`.
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

delete process.env.BASH_ENV;
delete process.env.ENV;
for (const name of Object.keys(process.env)) {
  if (name.startsWith("BASH_FUNC_")) delete process.env[name];
}
process.env.PATH = [SYSTEM_PATH, process.env.PATH ?? ""].filter(Boolean).join(":");

const root = inject("redactorTestRoot");
process.env.HOME = join(root, "home");
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.TMPDIR = join(root, "tmp");

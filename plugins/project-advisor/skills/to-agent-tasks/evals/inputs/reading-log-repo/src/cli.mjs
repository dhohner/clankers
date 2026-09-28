#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const USAGE = "Usage: reading-log <command>\n\nCommands:\n  help  Show this message\n";

// Returns the process exit code: 0 on success, 2 on a usage error.
export async function run(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  const [command] = argv;
  switch (command) {
    case undefined:
    case "help":
      stdout.write(USAGE);
      return 0;
    default:
      stderr.write(`unknown command: ${command}\n${USAGE}`);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2));
}

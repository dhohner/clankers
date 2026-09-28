import { homedir } from "node:os";
import { join } from "node:path";

export function logFilePath(env = process.env) {
  return env.READING_LOG_FILE ?? join(homedir(), ".reading-log.json");
}

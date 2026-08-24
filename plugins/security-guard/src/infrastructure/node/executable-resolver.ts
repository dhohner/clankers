import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { SYSTEM_EXECUTABLE_DIRECTORIES } from "../../shell/command-parser.ts";

/**
 * The PATH the host gives the command. Pi spawns bash with its own environment and its agent `bin` directory
 * in front, and a non-interactive bash reads no startup file, so this is the search order the command gets.
 */
function spawnSearchPath(): string | undefined {
  const path = process.env.PATH;
  if (path === undefined) return undefined;
  const agentDirectory =
    process.env.PI_CODING_AGENT_DIR?.replace(/^~(?=\/|$)/, homedir()) || join(homedir(), ".pi", "agent");
  const binDirectory = join(agentDirectory, "bin");
  const entries = path.split(delimiter).filter(Boolean);
  return entries.includes(binDirectory) ? path : [binDirectory, path].join(delimiter);
}

/**
 * Whether the environment the host spawns bash with can run code before the command, or replace a command
 * name with a function. A non-interactive bash sources the file `BASH_ENV` names, and `ENV` when it runs as
 * `sh` or in POSIX mode; either can define `rm`, `set`, or `mktemp` as a function that shadows what PATH
 * resolution found. Bash also imports a function from any `BASH_FUNC_name%%` variable an earlier shell
 * exported, with the same effect.
 */
export function inheritedShellStartupIsInert(): boolean {
  const env = process.env;
  if (env.BASH_ENV !== undefined || env.ENV !== undefined) return false;
  return !Object.keys(env).some((name) => name.startsWith("BASH_FUNC_"));
}

// Bash skips a directory and a file it cannot execute, and keeps searching.
async function isExecutableFile(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reports whether bash, searching the host's PATH from `cwd`, runs `name` from a system directory. The first
 * executable file found wins, as it does for bash, so a look-alike in an earlier entry, or a name no entry
 * provides, fails the check. A relative or empty entry is searched from `cwd`, which bash does as well. An
 * environment that can define shell functions before the command runs fails the check for every name.
 */
export async function resolvesToSystemExecutable(name: string, cwd: string | undefined): Promise<boolean> {
  if (!inheritedShellStartupIsInert()) return false;
  const path = spawnSearchPath();
  if (path === undefined || cwd === undefined || !isAbsolute(cwd) || name === "" || name.includes("/")) return false;

  for (const entry of path.split(delimiter)) {
    const candidate = join(resolve(cwd, entry), name);
    if (!(await isExecutableFile(candidate))) continue;
    const canonical = await realpath(candidate).catch(() => undefined);
    return canonical !== undefined && SYSTEM_EXECUTABLE_DIRECTORIES.has(dirname(canonical));
  }
  return false;
}

/**
 * Whether every name in `names` runs the system executable. Fails when the inherited environment can define
 * shell functions before the command, even for an empty list, because those run before any command in the
 * call, builtins such as `set` included. Pi's `shellCommandPrefix` and `shellPath` settings are not checked;
 * see the README's known limitations.
 */
export async function allSystemExecutables(names: readonly string[], cwd: string | undefined): Promise<boolean> {
  if (cwd === undefined || !inheritedShellStartupIsInert()) return false;
  const results = await Promise.all(names.map((name) => resolvesToSystemExecutable(name, cwd)));
  return results.every(Boolean);
}

import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { DesktopNotice } from "./notifications.ts";

export type NotificationExecutor = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<void>;

// Display data stays in argv; no label becomes JavaScript or shell source.
const script = `function run(argv) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.displayNotification(argv[1], { withTitle: argv[0] });
}`;

const executeFile: NotificationExecutor = async (file, args, options) => {
  await promisify(execFile)(file, args, options);
};

async function executable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);

    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export function createNotifierDiscovery(
  options: {
    searchPath?: string;
    isExecutable?: (file: string) => Promise<boolean>;
  } = {},
): () => Promise<string | undefined> {
  return async () => {
    const paths = (options.searchPath ?? process.env.PATH ?? "").split(":").filter(isAbsolute);
    const candidates = paths.map((path) => join(path, "terminal-notifier"));

    for (const file of candidates) {
      if (await (options.isExecutable ?? executable)(file)) return file;
    }

    return undefined;
  };
}

export function createDesktopDelivery(
  execute: NotificationExecutor = executeFile,
  discover: () => Promise<string | undefined> = createNotifierDiscovery(),
): (notice: DesktopNotice, isCurrent?: () => boolean) => Promise<void> {
  return async (notice, isCurrent = () => true) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let file: string | undefined;

    try {
      file = await Promise.race([
        Promise.resolve().then(() => discover()),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Notification tool discovery timed out")), 1_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }

    if (!isCurrent()) return;

    // NSUserDefaults parses options and property lists; terminal-notifier removes one leading backslash.
    const args = file
      ? ["-title", `\\${notice.title}`, "-message", `\\${notice.body}`]
      : ["-l", "JavaScript", "-e", script, "--", notice.title, notice.body];

    if (file && notice.activationTarget) args.push("-activate", notice.activationTarget);

    await execute(file ?? "/usr/bin/osascript", args, {
      timeout: 10_000,
      maxBuffer: 16_384,
    });
  };
}

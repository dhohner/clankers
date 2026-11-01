import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { basename, join } from "node:path";
import { createDesktopDelivery, type NotificationExecutor } from "./desktop-notification.ts";
import { NotificationPreference, type PreferenceFileSystem } from "./notification-preference.ts";
import { resolveSourceApp, type SourceApp } from "./notification-source.ts";

interface NotificationSession {
  source: SourceApp;
  enabled: boolean;
  store: NotificationPreference;
  tail: Promise<void>;
  started?: number;
  warned?: boolean;
}

export interface DesktopNotice {
  title: string;
  body: string;
  activationTarget?: string;
}

export interface NotificationDependencies {
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  now?: () => number;
  discover?: () => Promise<string | undefined>;
  execute?: NotificationExecutor;
  deliver?: (notice: DesktopNotice) => Promise<void>;
}

function displayLabel(value: string): string {
  return stripTerminalSequences(value)
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .trim();
}

export function installNotifications(
  pi: ExtensionAPI,
  filesystem?: PreferenceFileSystem,
  dependencies: NotificationDependencies = {},
): void {
  const now = dependencies.now ?? (() => performance.now());
  const deliver = createDesktopDelivery(dependencies.execute, dependencies.discover);
  let current: NotificationSession | undefined;
  pi.on("session_start", async (_event, ctx) => {
    const session: NotificationSession = {
      source: resolveSourceApp(dependencies.environment ?? process.env),
      enabled: true,
      store: new NotificationPreference(join(getAgentDir(), "insomniac-notifications.json"), filesystem),
      tail: Promise.resolve(),
    };

    current = session;
    session.tail = session.store.read().then(async (value) => {
      if (current !== session) return;
      session.enabled = value.status === "absent" || (value.status === "saved" && value.value);

      if (value.status === "failed") {
        ctx.ui.notify(`${value.error.message}; notifications disabled.`, "error");

        try {
          const { warning } = await session.store.write(false);

          if (current === session && warning) ctx.ui.notify(warning.message, "warning");
        } catch (error) {
          if (current === session) ctx.ui.notify(`Could not reset Insomniac notifications: ${String(error)}`, "error");
        }
      }

      return undefined;
    });
    await session.tail;
  });
  pi.on("agent_start", () => {
    if (current && current.started === undefined) current.started = now();
  });
  pi.on("agent_settled", (event, ctx) => {
    const session = current;

    if (!session || session.started === undefined) return;
    const started = session.started;
    session.started = undefined;

    if (
      (dependencies.platform ?? process.platform) !== "darwin" ||
      ctx.mode !== "tui" ||
      event.aborted !== false ||
      !session.enabled ||
      now() - started < 30_000
    )
      return;
    const name = ctx.sessionManager.getSessionName();

    const labels = [basename(ctx.cwd), name].flatMap((value) => {
      const label = value === undefined ? "" : displayLabel(value);

      return label ? [label] : [];
    });

    const notice: DesktopNotice = { title: "Pi run ended", body: labels.join(" · ") };

    if (session.source.bundleIdentifier) notice.activationTarget = session.source.bundleIdentifier;
    setImmediate(() => {
      void Promise.resolve()
        .then(() => {
          if (current !== session) return;

          return dependencies.deliver ? dependencies.deliver(notice) : deliver(notice, () => current === session);
        })
        .catch(() => {
          if (current !== session || session.warned) return;
          session.warned = true;
          ctx.ui.notify("Could not submit Insomniac notification.", "warning");
        });
    });
  });
  pi.on("session_shutdown", () => {
    current = undefined;
  });
  pi.registerCommand("insomniac-notifications", {
    description: "Inspect or change notifications: status, enable, disable",
    handler: (input, ctx) => {
      const args = input.trim();
      const session = current;

      if (!session) return Promise.resolve();

      const result = session.tail.then(async () => {
        if (current !== session) return;

        if (!["", "status", "enable", "disable"].includes(args)) {
          ctx.ui.notify("Usage: /insomniac-notifications [status|enable|disable]", "error");

          return;
        }

        if (args === "enable" || args === "disable") {
          const value = args === "enable";

          try {
            const { warning } = await session.store.write(value);

            if (current !== session) return;
            session.enabled = value;

            if (warning) ctx.ui.notify(warning.message, "warning");
          } catch (error) {
            if (current === session) ctx.ui.notify(`Could not save Insomniac notifications: ${String(error)}`, "error");

            return;
          }
        }

        ctx.ui.notify(`Insomniac notifications: ${session.enabled ? "enabled" : "disabled"}.`, "info");

        return undefined;
      });

      session.tail = result.catch(() => undefined);

      return result;
    },
  });
}

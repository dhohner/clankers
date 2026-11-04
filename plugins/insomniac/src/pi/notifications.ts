import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { basename, join } from "node:path";
import { createDesktopDelivery, type NotificationExecutor } from "./desktop-notification.ts";
import { NotificationPreference, type PreferenceFileSystem } from "./notification-preference.ts";
import { resolveSourceApp, type SourceApp } from "./notification-source.ts";

interface Confirmation {
  state: "waiting" | "attempted" | "canceled";
  timer?: ReturnType<typeof setTimeout>;
}

function cancelConfirmation(session: NotificationSession | undefined) {
  const confirmation = session?.confirmation;

  if (!confirmation) return;
  confirmation.state = "canceled";
  clearTimeout(confirmation.timer);
}

interface NotificationSession {
  source: SourceApp;
  enabled: boolean;
  store: NotificationPreference;
  tail: Promise<void>;
  started?: number;
  confirmation?: Confirmation;
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

  function submit(
    session: NotificationSession,
    ctx: ExtensionContext,
    title: string,
    isCurrent: () => boolean,
    defer = false,
  ) {
    const name = ctx.sessionManager.getSessionName();

    const labels = [basename(ctx.cwd), name].flatMap((value) => {
      const label = value === undefined ? "" : displayLabel(value);

      return label ? [label] : [];
    });

    const notice: DesktopNotice = { title, body: labels.join(" · ") };

    if (session.source.bundleIdentifier) notice.activationTarget = session.source.bundleIdentifier;

    const dispatch = () =>
      void Promise.resolve()
        .then(() => {
          if (!isCurrent()) return;

          return dependencies.deliver ? dependencies.deliver(notice) : deliver(notice, isCurrent);
        })
        .catch(() => {
          if (!isCurrent() || session.warned) return;
          session.warned = true;
          ctx.ui.notify("Could not submit Insomniac notification.", "warning");
        });

    if (defer) setImmediate(dispatch);
    else dispatch();
  }

  pi.on("ui_prompt_start", (event, ctx) => {
    const session = current;

    if (
      !session ||
      session.started === undefined ||
      !session.enabled ||
      event.kind !== "confirm" ||
      (dependencies.platform ?? process.platform) !== "darwin" ||
      ctx.mode !== "tui" ||
      session.confirmation
    )
      return;
    const confirmation: Confirmation = { state: "waiting" };
    session.confirmation = confirmation;

    const isCurrent = () =>
      current === session &&
      session.confirmation === confirmation &&
      session.started !== undefined &&
      session.enabled &&
      confirmation.state !== "canceled";

    const opened = now();

    const attempt = () => {
      if (!isCurrent() || confirmation.state !== "waiting") return;
      const remaining = 10_000 - (now() - opened);

      if (remaining > 0) {
        confirmation.timer = setTimeout(attempt, remaining);

        return;
      }

      confirmation.state = "attempted";
      submit(session, ctx, "Pi needs your attention", isCurrent);
    };

    confirmation.timer = setTimeout(attempt, 10_000);
  });
  pi.on("ui_prompt_end", (event) => {
    if (event.kind !== "confirm" || !current) return;
    cancelConfirmation(current);
    current.confirmation = undefined;
  });
  pi.on("session_start", async (_event, ctx) => {
    cancelConfirmation(current);

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
    cancelConfirmation(session);
    session.confirmation = undefined;

    if (
      (dependencies.platform ?? process.platform) !== "darwin" ||
      ctx.mode !== "tui" ||
      event.aborted !== false ||
      !session.enabled ||
      now() - started < 30_000
    )
      return;
    submit(session, ctx, "Pi run ended", () => current === session, true);
  });
  pi.on("session_shutdown", () => {
    cancelConfirmation(current);
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

            if (!value) cancelConfirmation(session);

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

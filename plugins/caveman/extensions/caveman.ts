import { readFileSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

const STATE_ENTRY_TYPE = "caveman-state";
const STATUS_KEY = "caveman";
const STATUS_LABEL = "caveman:ultra";
const INSTRUCTIONS_PATH = new URL("./caveman-instructions.md", import.meta.url);

type ModeAction = "toggle" | "on" | "off" | "status";

type CustomEntry = {
  type?: string;
  customType?: string;
  data?: {
    enabled?: boolean;
  };
};

function loadInstructions(): string {
  return readFileSync(INSTRUCTIONS_PATH, "utf8").trim();
}

const sessionInstructions = loadInstructions();

function parseAction(args: string): ModeAction | undefined {
  const value = args.trim().toLowerCase();
  if (!value) return "toggle";
  if (value === "toggle") return "toggle";
  if (value === "status") return "status";
  if (value === "on" || value === "ultra") return "on";
  if (value === "off" || value === "normal") return "off";
  return undefined;
}

function setStatus(ctx: ExtensionContext, enabled: boolean) {
  ctx.ui.setStatus(
    STATUS_KEY,
    enabled ? ctx.ui.theme.fg("accent", STATUS_LABEL) : undefined,
  );
}

function restoreEnabled(ctx: ExtensionContext): boolean {
  const entries = ctx.sessionManager.getBranch() as CustomEntry[];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE) {
      return entry.data?.enabled === true;
    }
  }
  return false;
}

export default function caveman(pi: ExtensionAPI) {
  let enabled = false;

  function persistState() {
    pi.appendEntry(STATE_ENTRY_TYPE, { enabled });
  }

  function syncState(ctx: ExtensionContext) {
    enabled = restoreEnabled(ctx);
    setStatus(ctx, enabled);
  }

  async function handleCommand(args: string, ctx: ExtensionContext) {
    const action = parseAction(args ?? "");
    if (!action) {
      ctx.ui.notify("Usage: /caveman [on|off|toggle|status]", "warning");
      return;
    }

    if (action === "status") {
      ctx.ui.notify(enabled ? "caveman ultra on" : "caveman off", "info");
      return;
    }

    if (action === "toggle") enabled = !enabled;
    if (action === "on") enabled = true;
    if (action === "off") enabled = false;

    persistState();
    setStatus(ctx, enabled);
    ctx.ui.notify(enabled ? "caveman ultra on" : "caveman off", "info");
  }

  pi.registerCommand("caveman", {
    description: "Toggle caveman response mode for this session",
    handler: handleCommand,
  });

  pi.on("session_start", async (_event, ctx) => {
    syncState(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    syncState(ctx);
  });

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${sessionInstructions}`,
    };
  });
}

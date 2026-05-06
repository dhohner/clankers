import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  handleBeforeAgentStart,
  loadInstructions,
  type BeforeAgentStartEvent,
} from "./lib/instructions.js";
import { handleCavemanCommand, COMMAND_NAME } from "./lib/command.js";
import { createState, restoreState } from "./lib/state.js";
import { updateStatusBar } from "./lib/status-bar.js";
import type { CavemanState } from "./lib/types.js";

export default function caveman(pi: ExtensionAPI): void {
  const instructions = loadInstructions();
  let state: CavemanState = createState();

  const stateRef = {
    get: (): CavemanState => state,
    set: (next: CavemanState) => {
      state = next;
    },
  };

  function syncState(ctx: Parameters<typeof restoreState>[0]): void {
    state = restoreState(ctx);
    updateStatusBar(ctx, state);
  }

  pi.on("session_start", (_event, ctx) => {
    syncState(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    syncState(ctx);
  });

  pi.on("before_agent_start", (event) => {
    return handleBeforeAgentStart(
      event as BeforeAgentStartEvent,
      state.enabled,
      instructions,
    );
  });

  pi.registerCommand(COMMAND_NAME, {
    description: "Toggle caveman response mode for this session",
    handler: (args, ctx) => handleCavemanCommand(args, ctx, stateRef, pi),
  });
}

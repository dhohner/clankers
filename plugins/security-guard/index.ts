import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handlePiToolCall, handlePiUserBash } from "./src/infrastructure/pi/events.ts";

export default function securityGuard(pi: ExtensionAPI) {
  pi.on("tool_call", handlePiToolCall);
  pi.on("user_bash", handlePiUserBash);
}

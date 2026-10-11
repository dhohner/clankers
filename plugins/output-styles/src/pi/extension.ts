import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { StyleExtensionApi } from "./host-contracts.ts";
import { registerOutputStyles } from "./registration.ts";

export { registerOutputStyles } from "./registration.ts";

export default function outputStyles(pi: StyleExtensionApi): void {
  registerOutputStyles(pi, {
    bundledDir: join(dirname(fileURLToPath(import.meta.url)), "../../styles"),
    agentDir: getAgentDir(),
    configDirName: CONFIG_DIR_NAME,
  });
}

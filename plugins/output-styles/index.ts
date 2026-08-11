import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR_NAME, type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { registerOutputStyles } from "./lib/extension.ts";

export default function outputStyles(pi: ExtensionAPI) {
  registerOutputStyles(pi, {
    bundledDir: join(dirname(fileURLToPath(import.meta.url)), "styles"),
    agentDir: getAgentDir(),
    configDirName: CONFIG_DIR_NAME,
  });
}

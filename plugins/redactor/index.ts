import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRedactorExtension } from "./src/extension.ts";

const redactor = createRedactorExtension();

export default function redactorExtension(pi: ExtensionAPI) {
  return redactor(pi);
}

import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import outputStyles, { registerOutputStyles } from "../../index.ts";
import piOutputStyles, { registerOutputStyles as registerPiOutputStyles } from "../../src/pi/extension.ts";
import { parseJsonObject } from "../../src/storage/json.ts";

const pluginRoot = new URL("../../", import.meta.url);

describe("package layout", () => {
  it("exports the Pi implementation through the root entry point", async () => {
    expect(outputStyles).toBe(piOutputStyles);
    expect(registerOutputStyles).toBe(registerPiOutputStyles);
    expect(await readFile(new URL("index.ts", pluginRoot), "utf8")).toBe(
      'export { default, registerOutputStyles } from "./src/pi/extension.ts";\n',
    );
  });

  it("includes source modules and assets in the plugin package", async () => {
    const manifest = parseJsonObject(await readFile(new URL("package.json", pluginRoot), "utf8"));

    expect(manifest.files).toEqual(expect.arrayContaining(["index.ts", "src/**", "styles/**", "examples/**"]));
    expect(manifest.files).not.toContain("lib/**");
  });

  it("includes source modules in the repository package", async () => {
    const manifest = parseJsonObject(await readFile(new URL("../../package.json", pluginRoot), "utf8"));

    expect(manifest.files).toContain("plugins/output-styles/src/**");
    expect(manifest.files).not.toContain("plugins/output-styles/lib/**");
  });

  it.each(["src/pi/extension.ts", "styles/unslop.md", "examples/terse.md"])(
    "resolves the package file %s",
    async (path) => {
      expect((await stat(fileURLToPath(new URL(path, pluginRoot)))).isFile()).toBe(true);
    },
  );
});

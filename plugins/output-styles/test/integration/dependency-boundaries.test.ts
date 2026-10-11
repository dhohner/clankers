import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));

type SourceModule = { path: string; imports: Array<{ target: string; typeOnly: boolean }> };

async function sourceModules(directory = sourceRoot): Promise<SourceModule[]> {
  const modules: SourceModule[] = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      modules.push(...(await sourceModules(path)));
      continue;
    }

    if (!entry.name.endsWith(".ts")) continue;

    const source = await readFile(path, "utf8");
    const imports: SourceModule["imports"] = [];

    for (const match of source.matchAll(/(?:^|\n)import\s+(type\s+)?[^;]*?\sfrom\s+["']([^"']+)["']/g)) {
      imports.push({ target: match[2], typeOnly: match[1] !== undefined });
    }

    modules.push({ path, imports });
  }

  return modules;
}

describe("dependency boundaries", () => {
  it("keeps Pi runtime imports in the bootstrap module", async () => {
    const violations: string[] = [];

    for (const module of await sourceModules()) {
      if (relative(sourceRoot, module.path) === "pi/extension.ts") continue;

      for (const imported of module.imports) {
        if (!imported.typeOnly && imported.target.startsWith("@earendil-works/pi-"))
          violations.push(relative(sourceRoot, module.path));
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps styles, storage, and session modules independent of Pi adapters", async () => {
    const violations: string[] = [];

    for (const module of await sourceModules()) {
      if (relative(sourceRoot, module.path).startsWith("pi/")) continue;

      for (const imported of module.imports) {
        if (!imported.target.startsWith(".")) continue;

        const target = relative(sourceRoot, resolve(dirname(module.path), imported.target));

        if (target.startsWith("pi/")) violations.push(`${relative(sourceRoot, module.path)} -> ${target}`);
      }
    }

    expect(violations).toEqual([]);
  });
});

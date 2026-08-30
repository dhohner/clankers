import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return typescriptFiles(path);
      return entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return nested.flat();
}

function relativeImports(source: string): string[] {
  return [...source.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((match) => match[1] ?? "");
}

// The layers of `src`, innermost first. A module may import from its own directory and from any directory
// before it, never from one after it, which is what keeps the graph acyclic without listing every edge.
const LAYERS = ["commands", "shell", "proof", "policy", "application", "infrastructure"];

describe("dependency boundaries", () => {
  it("keeps application, commands, policy, proof, and shell code independent of Pi and Node hosts", async () => {
    for (const boundary of ["application", "commands", "policy", "proof", "shell"]) {
      for (const file of await typescriptFiles(join(SOURCE_ROOT, boundary))) {
        const source = await readFile(file, "utf8");
        expect(source, relative(SOURCE_ROOT, file)).not.toMatch(/from\s+["'](?:@earendil-works\/pi-|node:)/);
        expect(source, relative(SOURCE_ROOT, file)).not.toMatch(/\bprocess\.(?:env|platform|getuid)/);
      }
    }
  });

  it("keeps application code dependent on host behavior only through ports", async () => {
    for (const file of await typescriptFiles(join(SOURCE_ROOT, "application"))) {
      const source = await readFile(file, "utf8");
      expect(relativeImports(source), relative(SOURCE_ROOT, file)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/infrastructure/)]),
      );
    }
  });

  it("lets each layer import only from the layers before it", async () => {
    for (const [rank, layer] of LAYERS.entries()) {
      const allowed = new Set(LAYERS.slice(0, rank + 1));
      for (const file of await typescriptFiles(join(SOURCE_ROOT, layer))) {
        const source = await readFile(file, "utf8");
        for (const specifier of relativeImports(source)) {
          const target = relative(SOURCE_ROOT, resolve(dirname(file), specifier));
          const targetLayer = target.split(sep)[0] ?? "";
          if (!LAYERS.includes(targetLayer)) continue;
          expect(allowed, `${relative(SOURCE_ROOT, file)} imports ${target}`).toContain(targetLayer);
        }
      }
    }
  });

  it("has no relative-import cycle within src", async () => {
    const files = await typescriptFiles(SOURCE_ROOT);
    const filesByPath = new Map(files.map((file) => [file, file]));
    const graph = new Map<string, string[]>();

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const dependencies = relativeImports(source)
        .map((target) => resolve(dirname(file), target.replace(/\.js$/, ".ts")))
        .filter((target) => filesByPath.has(target));
      graph.set(file, dependencies);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (file: string, chain: readonly string[]): void => {
      if (visiting.has(file)) {
        throw new Error([...chain, file].map((item) => relative(SOURCE_ROOT, item)).join(" -> "));
      }
      if (visited.has(file)) return;
      visiting.add(file);
      for (const dependency of graph.get(file) ?? []) visit(dependency, [...chain, file]);
      visiting.delete(file);
      visited.add(file);
    };

    for (const file of files) visit(file, []);
    expect(visited.size).toBe(files.length);
  });
});

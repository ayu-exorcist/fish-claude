import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Module } from "./types.js";
import { CATEGORY_ORDER } from "./types.js";

export function resolveDependencies(
  selectedKeys: Set<string>,
  allModules: Module[]
): Module[] {
  const keyToModule = new Map(allModules.map((m) => [m.uniqueKey, m]));
  const nameToModule = new Map<string, Module>();
  for (const m of allModules) {
    nameToModule.set(m.name, m);
    nameToModule.set(m.id, m);
  }

  const result = new Set<Module>();
  const queue: Module[] = [];

  for (const key of selectedKeys) {
    const mod = keyToModule.get(key);
    if (mod) {
      result.add(mod);
      queue.push(mod);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const depName of current.dependencies) {
      const depMod = nameToModule.get(depName);
      if (depMod && !result.has(depMod)) {
        result.add(depMod);
        queue.push(depMod);
      }
    }
  }

  return Array.from(result);
}

export function sortModules(modules: Module[]): Module[] {
  return [...modules].sort((a, b) => {
    const aCatIdx = CATEGORY_ORDER.indexOf(a.category);
    const bCatIdx = CATEGORY_ORDER.indexOf(b.category);
    if (aCatIdx !== bCatIdx) return aCatIdx - bCatIdx;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

export function assembleContent(modules: Module[]): string {
  const parts: string[] = [];

  for (const mod of modules) {
    try {
      const content = readFileSync(mod.filePath, "utf8");
      parts.push(content);
      parts.push("\n\n---\n\n");
    } catch (err) {
      throw new Error(
        `无法读取模块文件 ${mod.filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return parts.join("").trim() + "\n";
}

export function backupIfExists(targetPath: string): void {
  if (!existsSync(targetPath)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${targetPath}.bak.${timestamp}`;
  renameSync(targetPath, backupPath);
  console.log(`已备份原文件到: ${backupPath}`);
}

export function buildFinalContent(filePath: string, newContent: string): string {
  if (!existsSync(filePath)) return newContent;
  const existing = readFileSync(filePath, "utf8").trimEnd();
  if (!existing) return newContent;
  return existing + "\n\n---\n\n" + newContent;
}

export function writeOutput(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

export function collectAssets(modules: Module[]): string[] {
  const assets = new Set<string>();
  for (const mod of modules) {
    for (const a of mod.assets) assets.add(a);
  }
  return Array.from(assets);
}

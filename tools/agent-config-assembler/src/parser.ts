import { readFileSync } from "node:fs";
import path from "node:path";
import type { Module } from "./types.js";
import { REPO_ROOT } from "./types.js";

export function parseInstructionsReadme(): Record<string, Module[]> {
  const readmePath = path.join(REPO_ROOT, "agent-instructions", "README.md");
  const content = readFileSync(readmePath, "utf8");
  const lines = content.split("\n");

  const categories: Record<string, Module[]> = {};

  let currentCategory = "";
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 匹配 ## 章节标题
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      currentCategory = sectionMatch[1].trim().toLowerCase();
      if (currentCategory.startsWith("_") || currentCategory.includes("存储位置")) {
        currentCategory = "";
      }
      inTable = false;
      continue;
    }

    if (!currentCategory) continue;

    // 检测表格开始：任何以 | # 开头的行
    if (/^\|\s*#\s*\|?/.test(line)) {
      inTable = true;
      continue;
    }

    // 分隔行
    if (inTable && /^\|[\s\-:|]+\|?$/.test(line)) continue;

    // 表格数据行
    if (inTable && /^\|/.test(line)) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c !== "");

      if (cells.length < 4) continue;

      const id = cells[0];
      const moduleCell = cells[1];
      const description = cells[2];
      const depsCell = cells[3];

      const linkMatch = moduleCell.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (!linkMatch) continue;

      const name = linkMatch[1];
      const relPath = linkMatch[2];

      const deps: string[] = [];
      if (!/^[-—]\s*$/.test(depsCell) && depsCell.trim() !== "") {
        const depMatches = depsCell.matchAll(/\[([^\]]+)\]/g);
        for (const m of depMatches) deps.push(m[1]);
      }

      const fullPath = path.join(REPO_ROOT, "agent-instructions", relPath);
      const safeCategory = currentCategory.replace(/\s+/g, "-");
      const uniqueKey = `${safeCategory}-${id}`;

      const mod: Module = {
        id,
        name,
        filePath: fullPath,
        description,
        dependencies: deps,
        category: currentCategory,
        uniqueKey,
        assets: extractAssetsForModule(lines, i),
      };

      if (!categories[currentCategory]) categories[currentCategory] = [];
      categories[currentCategory].push(mod);
      continue;
    }

    // 非表格行且非空行，退出表格状态
    if (inTable && line.trim() !== "" && !/^\|/.test(line)) {
      inTable = false;
    }
  }

  return categories;
}

function extractAssetsForModule(
  lines: string[],
  startIndex: number
): string[] {
  const assets: string[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // 如果遇到下一个模块行或章节标题，停止
    if (i > startIndex && /^\|/.test(line)) {
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c !== "");
      if (cells.length >= 4 && /^\d/.test(cells[0])) break;
    }
    if (/^##\s/.test(line)) break;

    const skillMatch = line.match(/\[([^\]]+)\]\(\.\.\/skills\/([^)]+)\)/);
    if (skillMatch) assets.push(`skill: ${skillMatch[1]} → skills/${skillMatch[2]}`);

    const packMatch = line.match(/\[([^\]]+)\]\(\.\.\/packs\/([^)]+)\)/);
    if (packMatch) assets.push(`pack: ${packMatch[1]} → packs/${packMatch[2]}`);

    const mcpMatch = line.match(/\[([^\]]+)\]\(\.\.\/mcp\/([^)]+)\)/);
    if (mcpMatch) assets.push(`mcp: ${mcpMatch[1]} → mcp/${mcpMatch[2]}`);
  }

  return [...new Set(assets)];
}

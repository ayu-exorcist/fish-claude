import path from "node:path";
import os from "node:os";

export type StepResult<T> =
  | { action: "next"; value: T }
  | { action: "back" };

export type Module = {
  id: string;
  name: string;
  filePath: string;
  description: string;
  dependencies: string[];
  category: string;
  uniqueKey: string;
  assets: string[];
};

export type CLITarget = {
  name: string;
  outputFile: string;
  outputDir: string;
};

export type Scenario = "minimal" | "full" | "custom";
export type OutputTarget = "project" | "user";

export const REPO_ROOT = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  ".."
);

export const CLI_TARGETS: Record<string, CLITarget> = {
  claude: {
    name: "Claude Code",
    outputFile: "CLAUDE.md",
    outputDir: path.join(os.homedir(), ".claude"),
  },
  codex: {
    name: "Codex",
    outputFile: "AGENTS.md",
    outputDir: path.join(os.homedir(), ".codex"),
  },
  "oh-my-pi": {
    name: "Oh My Pi",
    outputFile: "AGENTS.md",
    outputDir: path.join(os.homedir(), ".omp", "agent"),
  },
  gemini: {
    name: "Gemini CLI",
    outputFile: "GEMINI.md",
    outputDir: path.join(os.homedir(), ".gemini"),
  },
};

export const CATEGORY_ORDER = [
  "general",
  "claude code",
  "codex",
  "oh my pi",
  "gemini",
];

export const CLI_CATEGORY_MAP: Record<string, string> = {
  claude: "claude code",
  codex: "codex",
  "oh-my-pi": "oh my pi",
  gemini: "gemini",
};

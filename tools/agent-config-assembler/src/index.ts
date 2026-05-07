import * as p from "@clack/prompts";
import pc from "picocolors";
import { parseInstructionsReadme } from "./parser.js";
import { runInteractive, runFallback, AbortError } from "./runner.js";

async function main(): Promise<void> {
  const isDryRun = process.argv.slice(2).includes("--dry-run");
  const categories = parseInstructionsReadme();

  if (Object.keys(categories).length === 0) {
    throw new Error("未能从 agent-instructions/README.md 解析到任何模块");
  }

  const isInteractive =
    process.stdin.isTTY === true && process.stdout.isTTY === true;

  if (isInteractive) {
    await runInteractive(categories, isDryRun);
  } else {
    await runFallback(categories, isDryRun);
  }
}

main().catch((err) => {
  if (err instanceof AbortError) {
    if (process.stdout.isTTY) {
      p.cancel(err.message);
    } else {
      console.log(err.message);
    }
  } else {
    console.error(err);
  }
  process.exit(1);
});

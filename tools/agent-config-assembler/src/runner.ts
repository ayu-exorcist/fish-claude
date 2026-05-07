import * as p from "@clack/prompts";
import pc from "picocolors";
import path from "node:path";
import readline from "node:readline";
import { stepSelect, stepMultiSelect } from "./ui.js";
import { resolveDependencies, sortModules, assembleContent, buildFinalContent, backupIfExists, writeOutput, collectAssets } from "./assembler.js";
import type { Module, CLITarget, Scenario, OutputTarget } from "./types.js";
import { CLI_TARGETS, CLI_CATEGORY_MAP, REPO_ROOT } from "./types.js";

type StepId = "cli" | "scenario" | "modules" | "target" | "summary";

interface RunState {
  cliKey: string;
  cliInfo: CLITarget;
  scenario: Scenario;
  generalModules: Module[];
  specificModules: Module[];
  allModules: Module[];
  groupOptions: Record<string, { value: string; label: string; hint?: string }[]>;
  selectedKeys: Set<string>;
  sorted: Module[];
  outputPath: string;
}

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

function buildModuleOptions(modules: Module[]) {
  return modules.map((m) => ({
    value: m.uniqueKey,
    label: `[${m.id}] ${m.name}`,
    hint:
      m.description +
      (m.dependencies.length > 0 ? ` (依赖: ${m.dependencies.join(", ")})` : ""),
  }));
}

function scenarioLabel(s: Scenario): string {
  return s === "minimal" ? "最小配置" : s === "full" ? "完整配置" : "自定义挑选";
}

function formatSummary(state: RunState): string {
  const lines = [
    `${pc.cyan("CLI Agent:")}  ${state.cliInfo.name}`,
    `${pc.cyan("场景预设:")}  ${scenarioLabel(state.scenario)}`,
    `${pc.cyan("模块数量:")}  ${state.sorted.length} 个`,
    "",
    ...state.sorted.map((m) => {
      const depMark = m.dependencies.length > 0 ? pc.dim(` [依赖:${m.dependencies.join(",")}]`) : "";
      return `  ${pc.cyan("•")} ${m.name} ${pc.dim(`(${m.category})`)}${depMark}`;
    }),
  ];
  return lines.join("\n");
}

/* ================================================================== */
/*  Step functions                                                    */
/* ================================================================== */

async function stepCLI(state: RunState): Promise<StepId> {
  const cliList = Object.entries(CLI_TARGETS);
  const result = await stepSelect(
    "选择 CLI Agent",
    cliList.map(([key, info]) => ({ value: key, label: info.name }))
  );

  if (result.action === "back") return "cli"; // 第一步，留在当前

  state.cliKey = result.value;
  state.cliInfo = CLI_TARGETS[result.value];
  state.generalModules = state.allModules.filter((m) => m.category === "general");
  state.specificModules = state.allModules.filter(
    (m) => m.category === CLI_CATEGORY_MAP[result.value]
  );

  return "scenario";
}

async function stepScenario(state: RunState): Promise<StepId> {
  const result = await stepSelect<Scenario>("选择配置场景", [
    { value: "minimal", label: "最小配置", hint: "通用模块 + 基础默认值" },
    { value: "full", label: "完整配置", hint: "全部模块" },
    { value: "custom", label: "自定义挑选", hint: "手动选择模块" },
  ]);

  if (result.action === "back") return "cli";

  state.scenario = result.value;
  state.selectedKeys.clear();

  if (result.value === "minimal") {
    const cat = CLI_CATEGORY_MAP[state.cliKey];
    for (const m of state.allModules) {
      if (m.category === "general" || (m.category === cat && m.id === "01")) {
        state.selectedKeys.add(m.uniqueKey);
      }
    }
  } else if (result.value === "full") {
    for (const m of state.allModules) state.selectedKeys.add(m.uniqueKey);
  }

  // 预计算 groupOptions
  state.groupOptions = {};
  if (state.generalModules.length > 0) {
    state.groupOptions["General"] = buildModuleOptions(state.generalModules);
  }
  if (state.specificModules.length > 0) {
    state.groupOptions[state.cliInfo.name] = buildModuleOptions(state.specificModules);
  }

  return "modules";
}

async function stepModules(state: RunState): Promise<StepId> {
  const result = await stepMultiSelect(
    "选择模块",
    state.groupOptions,
    Array.from(state.selectedKeys)
  );

  if (result.action === "back") return "scenario";

  state.selectedKeys = new Set(result.values);

  if (state.selectedKeys.size === 0) {
    throw new AbortError("未选择任何模块");
  }

  const s = p.spinner();
  s.start("解析模块依赖");
  const withDeps = resolveDependencies(state.selectedKeys, state.allModules);
  state.sorted = sortModules(withDeps);
  s.stop(`已解析 ${state.sorted.length} 个模块`);

  return "target";
}

async function stepTarget(state: RunState): Promise<StepId> {
  const projectPath = path.join(REPO_ROOT, state.cliInfo.outputFile);
  const userPath = path.join(state.cliInfo.outputDir, state.cliInfo.outputFile);

  const result = await stepSelect<OutputTarget>("选择写入目标", [
    { value: "project", label: "项目级配置", hint: projectPath },
    { value: "user", label: "用户级配置", hint: userPath },
  ]);

  if (result.action === "back") return "modules";

  state.outputPath = result.value === "project" ? projectPath : userPath;
  return "summary";
}

async function stepSummary(state: RunState, isDryRun: boolean): Promise<StepId | "done"> {
  p.note(formatSummary(state), "配置汇总");

  const assets = collectAssets(state.sorted);
  if (assets.length > 0) {
    p.note(assets.map((a) => `  ${pc.yellow("•")} ${a}`).join("\n"), "相关资源（需手动安装）");
  }

  const result = await stepSelect(`目标: ${state.outputPath}`, [
    { value: "write", label: "追加写入" },
    { value: "cancel", label: "取消" },
  ]);

  if (result.action === "back") return "target";

  if (result.value === "cancel") throw new AbortError("已取消");

  const newContent = assembleContent(state.sorted);
  const content = buildFinalContent(state.outputPath, newContent);

  if (isDryRun) {
    const preview =
      content.length > 1500
        ? content.slice(0, 1500) + "\n\n... " + pc.dim(`(${content.length - 1500} 字符省略)`) + " ..."
        : content;
    p.note(preview, `预览: ${state.outputPath}`);
    p.outro(pc.yellow("[Dry Run] 未写入文件"));
    return "done";
  }

  backupIfExists(state.outputPath);
  writeOutput(state.outputPath, content);

  p.outro(
    pc.green(`配置已写入 ${state.outputPath}`) + `\n${pc.dim(`共 ${state.sorted.length} 个模块`)}`
  );
  return "done";
}

/* ================================================================== */
/*  Non-interactive (piped) mode                                      */
/* ================================================================== */

let cachedLines: string[] | null = null;
let lineIndex = 0;

async function fallbackPrompt(question: string): Promise<string> {
  process.stdout.write(question);

  if (!process.stdin.isTTY) {
    if (cachedLines === null) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      cachedLines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
      lineIndex = 0;
    }
    return cachedLines[lineIndex++]?.trim() ?? "";
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function fallbackAskYesNo(question: string): Promise<boolean> {
  const answer = (await fallbackPrompt(`${question} (y/n): `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

/* ================================================================== */
/*  Interactive mode                                                  */
/* ================================================================== */

export async function runInteractive(
  categories: Record<string, Module[]>,
  isDryRun: boolean
): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" Agent Config Assembler ")));

  if (isDryRun) {
    p.note("不会实际写入文件", "Dry Run 模式");
  }

  p.note(
    [
      `${pc.cyan("↑↓")} 移动光标  ${pc.cyan("空格")} 切换选择`,
      `${pc.cyan("←")} 返回上一步  ${pc.cyan("→/Enter")} 确认并下一步  ${pc.cyan("Esc/Ctrl+C")} 退出`,
    ].join("\n"),
    "操作说明"
  );

  const allModules = Object.values(categories).flat();
  if (allModules.length === 0) {
    throw new Error("未从 agent-instructions/README.md 解析到任何模块");
  }

  const state: RunState = {
    cliKey: "",
    cliInfo: CLI_TARGETS.claude,
    scenario: "minimal",
    generalModules: [],
    specificModules: [],
    allModules,
    groupOptions: {},
    selectedKeys: new Set(),
    sorted: [],
    outputPath: "",
  };

  // 先选 CLI，后续步骤依赖它
  let step: StepId = await stepCLI(state);

  while (step !== "summary") {
    switch (step) {
      case "cli": step = await stepCLI(state); break;
      case "scenario": step = await stepScenario(state); break;
      case "modules": step = await stepModules(state); break;
      case "target": step = await stepTarget(state); break;
    }
  }

  // summary 页按左箭头回退到 target，确认/取消则完成
  let summaryResult: StepId | "done" = await stepSummary(state, isDryRun);
  while (summaryResult !== "done") {
    step = await stepTarget(state);
    summaryResult = await stepSummary(state, isDryRun);
  }
}

/* ================================================================== */
/*  Fallback mode                                                     */
/* ================================================================== */

export async function runFallback(
  categories: Record<string, Module[]>,
  isDryRun: boolean
): Promise<void> {
  console.log("=== Agent Config Assembler ===");
  if (isDryRun) console.log("[DRY RUN 模式] 不会实际写入文件\n");
  else console.log("");

  const cliList = Object.entries(CLI_TARGETS);
  console.log("支持的 CLI Agent:");
  for (let i = 0; i < cliList.length; i++) {
    console.log(`  ${i + 1}. ${cliList[i][1].name}`);
  }

  const choice = (await fallbackPrompt("\n选择 CLI Agent (输入编号): ")).trim();
  const cliIndex = parseInt(choice, 10) - 1;

  if (isNaN(cliIndex) || cliIndex < 0 || cliIndex >= cliList.length) {
    throw new Error("无效的 CLI Agent 选择");
  }

  const [cliKey, cliInfo] = cliList[cliIndex];

  const modules = [
    ...(categories["general"] ?? []),
    ...(categories[CLI_CATEGORY_MAP[cliKey]] ?? []),
  ];

  if (modules.length === 0) {
    throw new Error(`未找到 ${cliInfo.name} 的可用模块`);
  }

  console.log("\n可用模块:");
  for (const m of modules) {
    console.log(`  [${m.id}] ${m.name}`);
    console.log(`      ${m.description}`);
    if (m.dependencies.length > 0) {
      console.log(`      依赖: ${m.dependencies.join(", ")}`);
    }
  }

  const input = (
    await fallbackPrompt("\n输入要安装的模块编号（空格分隔，如: 01 02 03）: ")
  ).trim();

  const selectedKeys = new Set<string>();
  if (input) {
    for (const id of input.split(/\s+/)) {
      const mod = modules.find((m) => m.id === id);
      if (mod) selectedKeys.add(mod.uniqueKey);
      else console.log(`警告: 未找到编号 ${id} 的模块，已跳过`);
    }
  }

  if (selectedKeys.size === 0) {
    throw new AbortError("未选择任何模块");
  }

  const withDeps = resolveDependencies(selectedKeys, modules);
  const sorted = sortModules(withDeps);

  console.log("\n已选模块（含自动解析的依赖）:");
  for (const m of sorted) {
    const depMark = m.dependencies.length > 0 ? ` [依赖: ${m.dependencies.join(", ")}]` : "";
    console.log(`  - [${m.id}] ${m.name} (${m.category})${depMark}`);
  }

  const assets = collectAssets(sorted);
  if (assets.length > 0) {
    console.log("\n相关资源（可能需要手动安装/配置）:");
    for (const a of assets) console.log(`  - ${a}`);
  }

  const proceed = await fallbackAskYesNo("\n确认生成配置并写入?");
  if (!proceed) {
    throw new AbortError("已取消");
  }

  const outputPath = path.join(cliInfo.outputDir, cliInfo.outputFile);
  console.log(`\n输出路径: ${outputPath}`);

  const newContent = assembleContent(sorted);
  const content = buildFinalContent(outputPath, newContent);

  if (isDryRun) {
    console.log("\n--- 生成的配置内容预览 (前 1500 字符) ---");
    console.log(content.slice(0, 1500));
    if (content.length > 1500) {
      console.log(`\n... (${content.length - 1500} 字符省略) ...`);
    }
    console.log("\n[DRY RUN] 未写入文件");
    return;
  }

  backupIfExists(outputPath);
  writeOutput(outputPath, content);

  console.log(`配置已写入: ${outputPath}`);
  console.log(`共包含 ${sorted.length} 个模块`);
}

/* ================================================================== */
/*  AbortError                                                        */
/* ================================================================== */

export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortError";
  }
}

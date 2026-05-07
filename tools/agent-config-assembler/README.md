# Agent Config Assembler

交互式配置拼装工具。根据所选 CLI Agent 和使用场景，自动挑选、解析依赖、排序并输出规则模块到对应的全局配置目录。

## 用法

```bash
cd tools/agent-config-assembler
bun start
```

**预览模式（不写入文件）：**

```bash
bun run src/index.ts --dry-run
```

## 交互特性

- **选择 CLI Agent**：↑↓ 移动光标，→ / Enter 确认，← 返回
- **场景预设**：最小配置 / 完整配置 / 自定义挑选
- **模块多选**：↑↓ 移动光标，空格切换选择 ◻/◼，→ / Enter 提交，← 返回；按分组展示（General / Claude Code 等）
- **写入目标**：项目级（当前目录）/ 用户级（`~/.claude` 等），显示完整路径
- **依赖解析**：自动包含所选模块的依赖，spinner 动画反馈
- **结果预览**：模块清单 + 写入目标完整路径 + 相关资源提示
- **自动备份**：输出前自动备份已存在的目标文件（带时间戳后缀）
- **汇总确认页**：写入前按 ← 返回上一步修改

## 双模式兼容

| 模式 | 触发条件 | 交互方式 |
|---|---|---|
| TTY 交互 | 直接在终端运行 | @clack/prompts（箭头导航、空格多选） |
| Pipe / CI | `echo "..." \| bun run ...` | 文本行输入（编号空格分隔） |

## 输出路径

| CLI         | 目标文件                        |
| ----------- | ------------------------------- |
| Claude Code | `~/.claude/CLAUDE.md`           |
| Codex       | `~/.codex/AGENTS.md`            |
| Oh My Pi    | `~/.omp/agent/AGENTS.md`        |
| Gemini CLI  | `~/.gemini/GEMINI.md`           |

## 场景预设说明

- **最小配置**：通用模块全选 + 该 CLI 的 `01-defaults` 基础模块
- **完整配置**：该 CLI 下的所有可用模块
- **自定义挑选**：手动勾选需要的模块，依赖自动解析

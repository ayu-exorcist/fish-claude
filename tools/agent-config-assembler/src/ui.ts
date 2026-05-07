import readline from "node:readline";
import { block } from "@clack/core";
import pc from "picocolors";
import type { StepResult } from "./types.js";

type SelectOption<T> = {
  value: T;
  label: string;
  hint?: string;
};

function clearLines(count: number): void {
  if (count <= 0) return;
  process.stdout.write("\x1B[A\x1B[K".repeat(count));
}

export async function stepSelect<T>(
  message: string,
  options: SelectOption<T>[],
  initialIndex = 0
): Promise<StepResult<T>> {
  if (options.length === 0) {
    throw new Error("stepSelect: options cannot be empty");
  }

  let selected = Math.max(0, Math.min(initialIndex, options.length - 1));
  let prevLines = 0;

  const unblock = block({ hideCursor: true });
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  const render = () => {
    clearLines(prevLines);

    const lines: string[] = [
      pc.cyan("◆") + " " + message,
      ...options.map((opt, i) => {
        const isCursor = i === selected;
        const prefix = isCursor ? pc.green("●") : pc.dim("○");
        const label = isCursor ? pc.cyan(pc.bold(opt.label)) : opt.label;
        const hint = opt.hint ? pc.dim(` ${opt.hint}`) : "";
        return `  ${prefix} ${label}${hint}`;
      }),
      "",
      pc.dim("  ↑↓ 移动光标  ← 返回上一步  →/Enter 确认  Esc/Ctrl+C 退出"),
    ];

    for (const line of lines) {
      console.log(line);
    }
    prevLines = lines.length;
  };

  return new Promise((resolve) => {
    const cleanup = () => {
      clearLines(prevLines);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", onKeypress);
      unblock();
    };

    const onKeypress = (str: string, key: readline.Key) => {
      if ((key.ctrl && key.name === "c") || key.name === "escape") {
        cleanup();
        process.exit(0);
      }

      if (key.name === "up") {
        selected = Math.max(0, selected - 1);
        render();
      } else if (key.name === "down") {
        selected = Math.min(options.length - 1, selected + 1);
        render();
      } else if (key.name === "left") {
        cleanup();
        resolve({ action: "back" });
      } else if (key.name === "return" || key.name === "right") {
        cleanup();
        resolve({ action: "next", value: options[selected].value });
      }
    };

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

type MultiSelectGroup = Record<
  string,
  { value: string; label: string; hint?: string }[]
>;

export async function stepMultiSelect(
  message: string,
  groups: MultiSelectGroup,
  initialSelected: string[]
): Promise<{ values: string[]; action: "next" | "back" }> {
  const flat: {
    value: string;
    label: string;
    hint?: string;
    group: string;
  }[] = [];

  for (const [gName, items] of Object.entries(groups)) {
    for (const item of items) {
      flat.push({ ...item, group: gName });
    }
  }

  if (flat.length === 0) {
    throw new Error("stepMultiSelect: no options provided");
  }

  let cursor = 0;
  const selected = new Set(initialSelected);
  let prevLines = 0;

  const unblock = block({ hideCursor: true });
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  const render = () => {
    clearLines(prevLines);

    const lines: string[] = [pc.cyan("◆") + " " + message];
    let flatIdx = 0;

    for (const [gName, items] of Object.entries(groups)) {
      lines.push("");
      lines.push(pc.dim(gName));

      for (const item of items) {
        const isCursor = flatIdx === cursor;
        const isChecked = selected.has(item.value);

        let prefix: string;
        if (isCursor && isChecked) prefix = pc.green("◼");
        else if (isCursor && !isChecked) prefix = pc.cyan("◻");
        else if (!isCursor && isChecked) prefix = pc.green("◼");
        else prefix = pc.dim("◻");

        const label = isCursor
          ? pc.cyan(pc.bold(item.label))
          : pc.dim(item.label);
        const hint = item.hint ? pc.dim(` ${item.hint}`) : "";
        lines.push(`  ${prefix} ${label}${hint}`);
        flatIdx++;
      }
    }

    lines.push("");
    lines.push(
      pc.dim("  ↑↓ 移动光标  空格 切换选择  ← 返回上一步  →/Enter 确认  Ctrl+C 退出")
    );

    for (const line of lines) {
      console.log(line);
    }
    prevLines = lines.length;
  };

  return new Promise((resolve) => {
    const cleanup = () => {
      clearLines(prevLines);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", onKeypress);
      unblock();
    };

    const onKeypress = (str: string, key: readline.Key) => {
      if ((key.ctrl && key.name === "c") || key.name === "escape") {
        cleanup();
        process.exit(0);
      }

      if (key.name === "up") {
        cursor = Math.max(0, cursor - 1);
        render();
      } else if (key.name === "down") {
        cursor = Math.min(flat.length - 1, cursor + 1);
        render();
      } else if (key.name === "space") {
        const v = flat[cursor].value;
        if (selected.has(v)) selected.delete(v);
        else selected.add(v);
        render();
      } else if (key.name === "left") {
        cleanup();
        resolve({ values: Array.from(selected), action: "back" });
      } else if (key.name === "return" || key.name === "right") {
        cleanup();
        resolve({ values: Array.from(selected), action: "next" });
      }
    };

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

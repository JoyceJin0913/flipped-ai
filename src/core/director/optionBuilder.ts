/**
 * OptionBuilder —— v1.1 选项配方求值器
 *
 * PRD §3.6：把策划写的「配方」求值成玩家看到的 4 个具体选项。
 *
 * 核心原则：
 *   1. 确定性：同一 (recipe, state, seed) 必返回完全相同的结果（含顺序）
 *   2. 灰显非隐藏：enabled=false 的选项仍返回，附 disabledReason
 *   3. A/B 槽目标去重：B 槽目标与 A 槽相同时换选下一个
 *   4. 不用 eval：表达式求值器用正则白名单句式表
 */

import type { BeatType } from "./types";

// ============================================================
// 类型定义
// ============================================================

/** 四槽位（§3.6） */
export type OptionSlot = "A_advance" | "B_divert" | "C_avoid" | "D_risk";

/** 意图类型（与 actor 层对齐） */
type IntentType =
  | "probe" | "advance" | "soothe" | "humor"
  | "adventure" | "defend" | "retreat" | "observe" | "tease";

/** 单个变体 */
export interface OptionVariant {
  /** 命中条件表达式，空字符串=始终命中 */
  when: string;
  /** 文案模板，支持 {{npc.name}} / {{day}} / {{tension}} / {{heart.X}} 插值 */
  text: string;
  intentType: IntentType;
  riskLevel: "safe" | "moderate" | "risky";
  /** 冰山层级门禁：要求目标 NPC 至少解锁到此层才可启用 */
  requiresExposeLayer?: 1 | 2 | 3 | 4;
}

/** 单槽位规格 */
export interface OptionSlotSpec {
  slot: OptionSlot;
  /** 是否启用（表达式，如 "heart.wenrou > 20"，"true"=始终启用） */
  enabled: string;
  /** 未启用时的灰显原因 */
  disabledReason?: string;
  /** 变体列表，按顺序求值 when，取首个命中 */
  variants: OptionVariant[];
  /** 全部 when 不命中时的兜底变体 */
  fallbackVariant: OptionVariant;
}

/** 配方（§3.6 optionRecipe） */
export interface OptionRecipe {
  id: string;
  beatId?: string;
  day?: number;
  slots: OptionSlotSpec[];
  /** A/B 槽目标去重 */
  dedupeAB: boolean;
}

/** 求值上下文（从 WorldState + beat 派生，纯数据） */
export interface EvalState {
  tension: number;
  day: number;
  beatType: BeatType;
  /** npcId → 心动值 0-100 */
  heart: Record<string, number>;
  /** npcId → 已解锁冰山层级 1-4 */
  exposeLayer: Record<string, number>;
  /** npcId → 特质标签数组 */
  traits: Record<string, string[]>;
  /** npcId → NPC 名字（文案插值用） */
  npcName: Record<string, string>;
  /** factKey → fact value 字符串 */
  facts: Record<string, string>;
  /** 玩家性别（male/female） */
  playerGender?: "male" | "female";
}

/** 求值产出的单个选项 */
export interface BuiltOption {
  slot: OptionSlot;
  text: string;
  intentType: IntentType;
  riskLevel: "safe" | "moderate" | "risky";
  /** 是否可点（灰显而非隐藏） */
  enabled: boolean;
  disabledReason?: string;
  /** 目标 NPC ID（A/B 槽） */
  targetNpcId?: string;
}

// ============================================================
// 主求值入口
// ============================================================

/**
 * 主求值入口 —— 确定性契约：同一 (recipe, state, seed) 必返回相同结果
 *
 * 流程（§3.6.2）：
 *   1. 检查 enabled/condition → 灰显而非隐藏
 *   2. 按 variants 顺序求值 when，取首个命中
 *   3. 全不命中用 fallbackVariant
 *   4. 检查 requiresExposeLayer 门禁
 *   5. 渲染文案（插值 + A/B 去重）
 */
export function buildOptions(
  recipe: OptionRecipe,
  state: EvalState,
  seed: number
): BuiltOption[] {
  const results: BuiltOption[] = [];
  let aTargetNpcId: string | undefined;

  // 计算好感最高的 NPC（A 槽默认目标）
  const topNpcId = getTopNpc(state);

  for (const spec of recipe.slots) {
    // 1. 检查 slot 级 enabled
    const slotEnabled = evalExpr(
      spec.enabled === "true" ? "always" : spec.enabled,
      state,
      topNpcId
    );

    // 2. 求值 variants 取首个命中
    let matchedVariant: OptionVariant | null = null;
    for (const v of spec.variants) {
      const whenExpr = v.when === "" || v.when === "always" ? "always" : v.when;
      if (evalExpr(whenExpr, state, topNpcId)) {
        matchedVariant = v;
        break;
      }
    }
    // 3. 全不命中 → fallbackVariant
    if (!matchedVariant) {
      matchedVariant = spec.fallbackVariant;
    }

    // 4. 确定 A/B 槽目标 NPC
    let targetNpcId: string | undefined;
    if (spec.slot === "A_advance") {
      targetNpcId = topNpcId;
      aTargetNpcId = topNpcId;
    } else if (spec.slot === "B_divert") {
      // B 槽目标 = 好感第二高的 NPC（去重）
      targetNpcId = getSecondNpc(state, aTargetNpcId);
      if (recipe.dedupeAB && targetNpcId === aTargetNpcId) {
        targetNpcId = getSecondNpc(state, aTargetNpcId);
      }
    }

    // 5. 检查 requiresExposeLayer 门禁
    let enabled = slotEnabled;
    let disabledReason: string | undefined;
    if (enabled && matchedVariant.requiresExposeLayer && targetNpcId) {
      const layer = state.exposeLayer[targetNpcId] ?? 0;
      if (layer < matchedVariant.requiresExposeLayer) {
        enabled = false;
        disabledReason = `好感不够，还不够熟`;
      }
    }
    if (!enabled && !disabledReason && spec.disabledReason) {
      disabledReason = spec.disabledReason;
    }

    // 6. 渲染文案
    const text = renderText(matchedVariant.text, state, targetNpcId);

    const opt: BuiltOption = {
      slot: spec.slot,
      text,
      intentType: matchedVariant.intentType,
      riskLevel: matchedVariant.riskLevel,
      enabled,
    };
    if (disabledReason) {
      opt.disabledReason = disabledReason;
    }
    if (targetNpcId) {
      opt.targetNpcId = targetNpcId;
    }
    results.push(opt);
  }

  return results;
}

// ============================================================
// 表达式求值器（不用 eval）
// ============================================================

/**
 * 表达式求值器
 *
 * 支持：
 *   - "always" → true
 *   - "true" → true
 *   - 原子比较：tension > 40, heart.wenrou > 20, day == 1
 *   - && / || 组合（单层）
 *   - ! 前缀取反
 *
 * 未识别路径 → false（安全失败）
 */
export function evalExpr(
  expr: string,
  state: EvalState,
  topNpcId?: string
): boolean {
  const trimmed = expr.trim();

  if (trimmed === "" || trimmed === "always" || trimmed === "true") return true;
  if (trimmed === "false") return false;

  // || 分组
  if (trimmed.includes("||")) {
    const parts = splitTopLevel(trimmed, "||");
    return parts.some((p) => evalExpr(p, state, topNpcId));
  }

  // && 分组
  if (trimmed.includes("&&")) {
    const parts = splitTopLevel(trimmed, "&&");
    return parts.every((p) => evalExpr(p, state, topNpcId));
  }

  // ! 前缀
  if (trimmed.startsWith("!")) {
    return !evalExpr(trimmed.slice(1), state, topNpcId);
  }

  // 原子比较
  return evalAtom(trimmed, state, topNpcId);
}

/** 拆分顶层 && 或 ||（不拆括号内的） */
function splitTopLevel(expr: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") depth--;
    else if (depth === 0 && expr.slice(i, i + sep.length) === sep) {
      parts.push(expr.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  parts.push(expr.slice(start));
  return parts.map((s) => s.trim());
}

/** 求值单个原子比较 */
function evalAtom(
  atom: string,
  state: EvalState,
  topNpcId?: string
): boolean {
  // 匹配：左值 运算符 右值
  const match = atom.match(
    /^\s*!?\s*([a-zA-Z_][\w.]*)\s*(>=|<=|==|!=|>|<)\s*(.+?)\s*$/
  );
  if (!match) {
    // 可能是裸布尔字段（如 "true"）
    if (atom.trim() === "true") return true;
    if (atom.trim() === "false") return false;
    console.warn(`[evalExpr] 未识别表达式: "${atom}"`);
    return false;
  }

  const negate = match[0]!.startsWith("!");
  const leftPath = match[1]!;
  const op = match[2]!;
  const rightRaw = match[3]!.trim();

  // 解析左值
  const leftVal = resolveLeftValue(leftPath, state, topNpcId);
  if (leftVal === undefined) {
    console.warn(`[evalExpr] 未识别路径: "${leftPath}"`);
    return false;
  }

  // 解析右值
  const rightVal = parseRightValue(rightRaw);

  // 比较
  let result: boolean;
  if (typeof leftVal === "number" && typeof rightVal === "number") {
    result = compareNum(leftVal, op, rightVal);
  } else {
    result = compareStr(String(leftVal), op, String(rightVal));
  }

  return negate ? !result : result;
}

/** 解析左值路径 */
function resolveLeftValue(
  path: string,
  state: EvalState,
  topNpcId?: string
): string | number | undefined {
  // {{topNpc}} 占位符替换
  const realPath = path.replace(/\{\{topNpc\}\}/g, topNpcId ?? "");

  if (realPath === "tension") return state.tension;
  if (realPath === "day") return state.day;

  if (realPath.startsWith("heart.")) {
    const npcId = realPath.slice(6);
    return state.heart[npcId] ?? 30;
  }

  if (realPath.startsWith("exposeLayer.")) {
    const npcId = realPath.slice(12);
    return state.exposeLayer[npcId] ?? 0;
  }

  if (realPath.startsWith("facts.")) {
    const key = realPath.slice(6);
    return state.facts[key] ?? "";
  }

  return undefined;
}

/** 解析右值 */
function parseRightValue(raw: string): string | number {
  const trimmed = raw.trim();
  // 数字
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") return num;
  // 字符串（去引号）
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** 数值比较 */
function compareNum(left: number, op: string, right: number): boolean {
  switch (op) {
    case ">": return left > right;
    case "<": return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    case "==": return left === right;
    case "!=": return left !== right;
    default: return false;
  }
}

/** 字符串比较 */
function compareStr(left: string, op: string, right: string): boolean {
  switch (op) {
    case "==": return left === right;
    case "!=": return left !== right;
    default: return false;
  }
}

// ============================================================
// 确定性伪随机
// ============================================================

/**
 * 确定性伪随机生成器
 *
 * 基于 seed 的简单 LCG（线性同余生成器）。
 * 同一 seed 必产生同一序列。
 */
export function deterministicRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

// ============================================================
// 文案插值
// ============================================================

/**
 * 文案插值：替换 {{npc.name}} / {{day}} / {{tension}} / {{heart.X}}
 */
export function renderText(
  template: string,
  state: EvalState,
  targetNpcId?: string
): string {
  let result = template;

  // {{npc.name}} → 目标 NPC 名字
  if (targetNpcId) {
    const name = state.npcName[targetNpcId] ?? targetNpcId;
    result = result.replace(/\{\{npc\.name\}\}/g, name);
  }

  // {{day}} → 天数
  result = result.replace(/\{\{day\}\}/g, String(state.day));

  // {{tension}} → 张力值
  result = result.replace(/\{\{tension\}\}/g, String(state.tension));

  // {{heart.X}} → 某 NPC 心动值
  result = result.replace(/\{\{heart\.(\w+)\}\}/g, (_m, npcId: string) => {
    return String(state.heart[npcId] ?? 30);
  });

  // {{topNpc.name}} → 好感最高 NPC 名字
  const topNpc = getTopNpc(state);
  if (topNpc) {
    result = result.replace(/\{\{topNpc\.name\}\}/g, state.npcName[topNpc] ?? topNpc);
  }

  return result;
}

// ============================================================
// 辅助函数
// ============================================================

/** 获取好感最高的 NPC ID */
function getTopNpc(state: EvalState): string | undefined {
  let best: string | undefined;
  let bestVal = -1;
  for (const [id, val] of Object.entries(state.heart)) {
    if (val > bestVal) {
      bestVal = val;
      best = id;
    }
  }
  return best;
}

/** 获取好感第二高的 NPC ID（排除 excludeId） */
function getSecondNpc(state: EvalState, excludeId?: string): string | undefined {
  let best: string | undefined;
  let bestVal = -1;
  for (const [id, val] of Object.entries(state.heart)) {
    if (id === excludeId) continue;
    if (val > bestVal) {
      bestVal = val;
      best = id;
    }
  }
  return best;
}

/**
 * 从 WorldState + beat 派生 EvalState（适配层）
 */
export function deriveEvalState(
  worldState: import("../state/worldTypes").WorldState,
  beatType: BeatType,
  tension: number,
  npcIds: string[],
  npcNameMap: Record<string, string>
): EvalState {
  const heart: Record<string, number> = {};
  const exposeLayer: Record<string, number> = {};
  const traits: Record<string, string[]> = {};
  const npcName: Record<string, string> = {};
  const facts: Record<string, string> = {};

  for (const id of npcIds) {
    heart[id] = worldState.playerRelations[id]?.heartValue ?? 30;
    exposeLayer[id] = worldState.playerRelations[id]?.icebergCluesUnlocked ?? 0;
    // 从 NPC 库取特质
    traits[id] = [];
    npcName[id] = npcNameMap[id] ?? id;
  }

  // 填充 facts
  if (worldState.worldFacts) {
    for (const [key, fact] of Object.entries(worldState.worldFacts)) {
      facts[key] = fact.value;
    }
  }

  return {
    tension,
    day: worldState.day,
    beatType,
    heart,
    exposeLayer,
    traits,
    npcName,
    facts,
  };
}

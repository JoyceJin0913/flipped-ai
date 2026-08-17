/**
 * 意图映射层（本移植版新增模块）
 *
 * 游戏规格的四槽位意图（OptionIntent，共 10 种）与裁判层 Δ 矩阵支持的
 * 9 种 ActorIntentType 并不一一对应 —— EXTENDED_BASE_MATRIX /
 * PERSONALITY_MOD_MATRIX 只覆盖 probe/advance/soothe/humor/adventure/
 * defend/retreat/observe/tease（src/core/referee/matrix.ts）。
 *
 * 本模块把 10 种玩法意图映射到矩阵意图 + 强度，使 settle() 无需改动即可结算。
 * 强度目前不影响 Δ（矩阵只按 type 查表），但为 validators 的暴露层级推断
 * （inferExposureLayer，本移植版未启用）保留语义。
 *
 * 映射决策（与任务规格一致）：
 * - comfort    → soothe  (medium)   安抚：矩阵中依恋奖励最高的意图
 * - confess    → advance (high)     告白 = 高强度推进
 * - expose_self→ probe   (high)     自我暴露 = 高强度试探
 * - ally       → soothe  (low)      结盟是轻安抚
 * - challenge  → adventure (medium) 挑战 = 冒险系行为
 * - withdraw   → retreat (medium)   撤退直接对应矩阵意图
 * - deflect    → retreat (low)      回避是弱化版撤退
 * - provoke    → advance (high)     挑衅 = 攻击性推进
 * - tease      → tease   (medium)   同名直接映射
 * - observe    → observe (low)      观察是低强度行为
 */

import type { ActorIntentType, ActorOutput } from "./actorTypes";

// ============================================================
// 游戏规格四槽位意图
// ============================================================

/** 游戏规格的四槽位意图（10 种） */
export type OptionIntent =
  | "tease"
  | "comfort"
  | "confess"
  | "expose_self"
  | "ally"
  | "observe"
  | "challenge"
  | "withdraw"
  | "deflect"
  | "provoke";

/** 全部 OptionIntent 列表（供遍历/冒烟测试） */
export const OPTION_INTENTS: OptionIntent[] = [
  "tease",
  "comfort",
  "confess",
  "expose_self",
  "ally",
  "observe",
  "challenge",
  "withdraw",
  "deflect",
  "provoke",
];

/** 映射结果：矩阵意图 + 强度 */
export interface MappedIntent {
  type: ActorIntentType;
  intensity: "low" | "medium" | "high";
}

/**
 * 把玩法意图映射到裁判层矩阵意图。
 * @param i 四槽位意图
 * @returns { type, intensity } —— type 一定落在 EXTENDED_BASE_MATRIX 覆盖的 9 种内
 */
export function mapIntent(i: OptionIntent): MappedIntent {
  switch (i) {
    case "tease":
      return { type: "tease", intensity: "medium" };
    case "comfort":
      return { type: "soothe", intensity: "medium" };
    case "confess":
      return { type: "advance", intensity: "high" };
    case "expose_self":
      return { type: "probe", intensity: "high" };
    case "ally":
      return { type: "soothe", intensity: "low" };
    case "observe":
      return { type: "observe", intensity: "low" };
    case "challenge":
      return { type: "adventure", intensity: "medium" };
    case "withdraw":
      return { type: "retreat", intensity: "medium" };
    case "deflect":
      return { type: "retreat", intensity: "low" };
    case "provoke":
      return { type: "advance", intensity: "high" };
    default:
      // 理论不可达：OptionIntent 为穷举联合类型
      throw new Error(`未知玩法意图：${String(i)}`);
  }
}

/**
 * 构造可直接交给 settle() 的 ActorOutput。
 *
 * 默认值说明：
 * - intent.target = "player"（默认对玩家说话；对 NPC 说话由调用方覆写）
 * - intent.topic = ""（话题由调用方填充）
 * - intent.isReactive = false（主动发言）
 * - emotionTag = "neutral"（调用方可按需覆写）
 * - 不设置 action / microAction（ActorOutput 可选字段）
 *
 * @param npcId 发言 NPC ID
 * @param line 台词文本（注意：不要包含好感值字样，否则触发 7a 越权拦截）
 * @param intent 玩法意图
 */
export function buildActorOutput(npcId: string, line: string, intent: OptionIntent): ActorOutput {
  const { type, intensity } = mapIntent(intent);
  return {
    npcId,
    line,
    intent: {
      type,
      target: "player",
      topic: "",
      intensity,
      isReactive: false,
    },
    emotionTag: "neutral",
  };
}

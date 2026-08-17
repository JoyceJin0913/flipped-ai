/**
 * 心动分级视觉信号（纯函数移植版）
 *
 * 从 src/stores/useGameStore.ts:322-341 移植（PRD §11.3 五档信号），
 * 去掉对 zustand store 的依赖，改为纯函数：
 *
 *   getHeartSignal(rel) → "none" | "micro" | "crush" | "critical" | "jealous"
 *
 * 判定顺序与原版严格一致（先暴击 → 心动 → 微动 → 吃醋 → 无）：
 * 1. 最近一次互动 Δ ≥ 8 → critical（单次大增）
 * 2. heartValue ≥ 75 且 interactionCount ≥ 5 → critical（高心动 + 高互动）
 * 3. heartValue ≥ 60 → crush
 * 4. heartValue ≥ 40 且最近一次互动 Δ > 0 → micro
 * 5. 今日投给他人的票数 > 0 且 heartValue ≥ 45 → jealous（吃醋）
 * 6. 否则 → none
 *
 * 注意：原版中 jealous 检查在 micro 之后，即使满足吃醋条件，
 * 若同时满足 micro 条件仍返回 micro —— 移植版保持该语义。
 */

/** 心动信号五档 */
export type HeartSignal = "none" | "micro" | "crush" | "critical" | "jealous";

/** getHeartSignal 的输入（原版来自 store 的 relationships[npcId] + 今日投票） */
export interface HeartSignalInput {
  /** 当前心动值 0-100 */
  heartValue: number;
  /** 累计互动次数 */
  interactionCount: number;
  /** 心动瞬间记录（只需 delta 字段参与判定） */
  moments: { delta: number }[];
  /** 今日玩家投给他人的未撤回票数（吃醋检测，原版为 votes 过滤结果） */
  todayVotesForOthers: number;
}

/**
 * 计算心动分级视觉信号。
 * @param input 心动值 + 互动统计 + 今日他投
 * @returns 五档信号之一
 */
export function getHeartSignal(input: HeartSignalInput): HeartSignal {
  const { heartValue, interactionCount, moments, todayVotesForOthers } = input;

  // 暴击：单次大增或高心动值 + 高互动
  const lastMoment = moments[moments.length - 1];
  if (lastMoment && lastMoment.delta >= 8) return "critical";
  if (heartValue >= 75 && interactionCount >= 5) return "critical";
  if (heartValue >= 60) return "crush";
  if (heartValue >= 40 && lastMoment && lastMoment.delta > 0) return "micro";

  // 吃醋检测：玩家给其他人投了票但没给 TA
  if (todayVotesForOthers > 0 && heartValue >= 45) return "jealous";

  return "none";
}

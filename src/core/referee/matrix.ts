/**
 * 裁判层 Δ 矩阵数据
 *
 * 扩展自 scoring.ts 的 BASE_MATRIX，从 5×3 扩展到 9×3（新增 defend/retreat/observe/tease）。
 * 所有人格向量修正权重也集中在此文件，调平入口唯一。
 */

import type { ActorIntentType } from "../actor/types";
import type { AttachmentType } from "../types";

// ============================================================
// §1 扩展基础矩阵（9 意图 × 3 依恋类型）
// ============================================================

/**
 * 扩展 BASE_MATRIX：原 5 种意图 + 新增 4 种（defend/retreat/observe/tease）
 * 单元格含义：该意图对该依恋类型 NPC 的基础 Δ
 */
export const EXTENDED_BASE_MATRIX: Record<ActorIntentType, Record<AttachmentType, number>> = {
  // ---- 原 5 种 ----
  probe:     { secure: 3, anxious: 2, avoidant: 1 },
  advance:   { secure: 4, anxious: 5, avoidant: -2 },
  soothe:    { secure: 3, anxious: 7, avoidant: 2 },
  humor:     { secure: 4, anxious: 3, avoidant: 2 },
  adventure: { secure: 5, anxious: 3, avoidant: -1 },
  // ---- 新增 4 种 ----
  defend:    { secure: 1, anxious: 0, avoidant: 3 },
  retreat:   { secure: -1, anxious: -2, avoidant: 1 },
  observe:   { secure: 1, anxious: 1, avoidant: 2 },
  tease:     { secure: 2, anxious: 1, avoidant: -1 },
};

// ============================================================
// §2 人格向量修正矩阵
// ============================================================

/**
 * 每种意图对 5 个人格维度的权重（verbosity 不参与 Δ 计算，仅在 validators 中校验句长）。
 *
 * personalityMod = Σ(weight[i] × pv[i])
 * 正权重 = 该维度越高 Δ 越大；负权重 = 该维度越高 Δ 越小。
 */
export const PERSONALITY_MOD_MATRIX: Record<
  ActorIntentType,
  {
    initiative: number;
    jealousySensitivity: number;
    exposureThreshold: number;
    conflictTendency: number;
    humorTendency: number;
  }
> = {
  // 试探：主动性强加分，但自我暴露阈值高的人不容易接招
  probe: {
    initiative: 2,
    jealousySensitivity: 0,
    exposureThreshold: -1,
    conflictTendency: 0,
    humorTendency: 1,
  },
  // 推进：主动性加分，暴露阈值高的人抗拒推进，冲突倾向高的人推进更猛
  advance: {
    initiative: 3,
    jealousySensitivity: 0,
    exposureThreshold: -2,
    conflictTendency: 1,
    humorTendency: 0,
  },
  // 安抚：暴露阈值低的人容易被安抚，冲突倾向高的人难安抚
  soothe: {
    initiative: 1,
    jealousySensitivity: 0,
    exposureThreshold: -2,
    conflictTendency: -2,
    humorTendency: 1,
  },
  // 幽默：幽默倾向主导
  humor: {
    initiative: 1,
    jealousySensitivity: 0,
    exposureThreshold: 0,
    conflictTendency: 0,
    humorTendency: 3,
  },
  // 冒险：主动性 + 冲突倾向加分，暴露阈值高的人抗拒
  adventure: {
    initiative: 3,
    jealousySensitivity: 0,
    exposureThreshold: -2,
    conflictTendency: 2,
    humorTendency: 1,
  },
  // 防御：暴露阈值高的人善于防御，主动性低的人倾向防御
  defend: {
    initiative: -1,
    jealousySensitivity: 1,
    exposureThreshold: 2,
    conflictTendency: 2,
    humorTendency: -1,
  },
  // 撤退：主动性高的人不愿撤退，暴露阈值高的人倾向撤退
  retreat: {
    initiative: -3,
    jealousySensitivity: 0,
    exposureThreshold: 2,
    conflictTendency: -2,
    humorTendency: -1,
  },
  // 观察：被动行为，主动性低的人更善观察
  observe: {
    initiative: -2,
    jealousySensitivity: 1,
    exposureThreshold: 1,
    conflictTendency: 0,
    humorTendency: 0,
  },
  // 调侃：幽默 + 主动性主导
  tease: {
    initiative: 2,
    jealousySensitivity: 0,
    exposureThreshold: -1,
    conflictTendency: 1,
    humorTendency: 3,
  },
};

// ============================================================
// §3 场景系数
// ============================================================

/**
 * 场景系数：私密夜间加成最高，公共场合最低。
 * 同时保留原 SceneKey 键名以兼容旧代码。
 */
export const SCENE_MULT: Record<string, number> = {
  private_day: 1.0,
  private_night: 1.3,
  public: 0.8,
  public_chat: 0.8,
  public_date: 1.2,
};

// ============================================================
// §4 阶段系数
// ============================================================

/**
 * 阶段系数：早期（stranger）放大 Δ 帮助破冰，后期（crush）缩小 Δ 防止溢出。
 * 与 scoring.ts 的 STAGE_MULT 方向相反 —— 裁判层采用不同的调平策略。
 */
export const STAGE_MULT: Record<string, number> = {
  stranger: 1.2,
  icebreak: 1.0,
  flirt: 0.9,
  crush: 0.8,
};

// ============================================================
// §5 冰山解锁阈值
// ============================================================

/**
 * 累计心动值达到阈值时解锁对应冰山层：
 * L1 表现层(20) → L2 角色层(40) → L3 冲突层(60) → L4 核心层(80)
 */
export const ICEBERG_THRESHOLDS: number[] = [20, 40, 60, 80];

// ============================================================
// §6 核心需求命中表
// ============================================================

/**
 * 各依恋类型的核心需求可被哪些意图命中：
 * - secure：真诚的推进、幽默、冒险 → 被真诚对待
 * - anxious：推进（承诺）、安抚（确认） → 被坚定选择、被安抚
 * - avoidant：试探、观察（温和接近）、安抚 → 被耐心接近
 */
const CORE_NEED_HITS: Record<AttachmentType, ActorIntentType[]> = {
  secure: ["advance", "humor", "adventure"],
  anxious: ["advance", "soothe"],
  avoidant: ["probe", "observe", "soothe"],
};

/**
 * 检查意图是否命中该依恋类型 NPC 的核心需求。
 * 命中时 settle 函数会额外加 +2 bonus。
 */
export function checkCoreNeedHit(
  intentType: ActorIntentType,
  attachment: AttachmentType,
): boolean {
  const hits = CORE_NEED_HITS[attachment];
  return hits?.includes(intentType) ?? false;
}

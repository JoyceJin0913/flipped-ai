/**
 * 人格向量构建（依赖向量推导的静态映射）
 *
 * 从 src/core/actor/types.ts:159-210 移植：
 *   - ATTACHMENT_BASE_VECTORS（依恋类型 → 基础向量）
 *   - MBTI_VECTOR_MODIFIERS（MBTI → 向量修正）
 * 并新增 buildPersonalityVector(npc)：依恋基础向量 × MBTI 修正，钳位 0-1。
 *
 * 计算方式：
 *   vector = clamp(base[attachment] + mbtiMod[mbti], 0, 1)
 * 全部维度初始 _deltas = {}，后续人格演化再写入本轮变化量。
 */

import type { NPC } from "@/onboarding/types";
import type { PersonalityVector, PersonalityVectorKey } from "./actorTypes";

// ============================================================
// 依恋类型 → 基础向量
// ============================================================

/** 依恋类型 → 基础向量 */
export const ATTACHMENT_BASE_VECTORS: Record<
  NPC["attachment"],
  Omit<PersonalityVector, "npcId" | "_deltas">
> = {
  secure: {
    initiative: 0.6,
    jealousySensitivity: 0.3,
    exposureThreshold: 0.4,
    conflictTendency: 0.5,
    humorTendency: 0.5,
    verbosity: 0.6,
  },
  anxious: {
    initiative: 0.7,
    jealousySensitivity: 0.8,
    exposureThreshold: 0.3,
    conflictTendency: 0.3,
    humorTendency: 0.3,
    verbosity: 0.7,
  },
  avoidant: {
    initiative: 0.3,
    jealousySensitivity: 0.4,
    exposureThreshold: 0.8,
    conflictTendency: 0.2,
    humorTendency: 0.3,
    verbosity: 0.3,
  },
};

// ============================================================
// MBTI → 向量修正
// ============================================================

/** MBTI → 向量修正 */
export const MBTI_VECTOR_MODIFIERS: Partial<
  Record<NPC["mbti"], Partial<Record<PersonalityVectorKey, number>>>
> = {
  INTJ: { initiative: -0.1, verbosity: -0.2, conflictTendency: +0.1 },
  INTP: { initiative: -0.05, verbosity: -0.1, conflictTendency: +0.05 },
  ENTJ: { initiative: +0.15, verbosity: +0.1, conflictTendency: +0.1 },
  ENTP: { initiative: +0.2, verbosity: +0.2, humorTendency: +0.2 },
  INFJ: { initiative: -0.05, verbosity: -0.05, exposureThreshold: +0.1 },
  INFP: { initiative: -0.1, verbosity: -0.1, exposureThreshold: +0.1 },
  ENFJ: { initiative: +0.15, verbosity: +0.15, humorTendency: +0.1 },
  ENFP: { initiative: +0.2, verbosity: +0.2, humorTendency: +0.2 },
  ISTJ: { initiative: -0.05, verbosity: -0.15, conflictTendency: +0.05 },
  ISFJ: { initiative: +0.05, verbosity: +0.05, exposureThreshold: +0.05 },
  ESTJ: { initiative: +0.15, verbosity: +0.1, conflictTendency: +0.15 },
  ESFJ: { initiative: +0.1, verbosity: +0.15, humorTendency: +0.1 },
  ISTP: { initiative: -0.05, verbosity: -0.15, conflictTendency: +0.05 },
  ISFP: { initiative: -0.1, verbosity: -0.1, exposureThreshold: +0.1 },
  ESTP: { initiative: +0.2, verbosity: +0.15, conflictTendency: +0.1 },
  ESFP: { initiative: +0.2, verbosity: +0.2, humorTendency: +0.2, conflictTendency: -0.1 },
};

// ============================================================
// 构建函数
// ============================================================

/** 把数值钳位到 [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 从 NPC 角色卡构建初始人格向量：
 *   base = ATTACHMENT_BASE_VECTORS[npc.attachment]
 *   mod  = MBTI_VECTOR_MODIFIERS[npc.mbti] ?? {}
 *   pv[维度] = clamp(base[维度] + mod[维度], 0, 1)
 *
 * @param npc NPC 角色卡（来自 @/onboarding/npcLibrary）
 * @returns 六维人格向量，_deltas 初始为空
 */
export function buildPersonalityVector(npc: NPC): PersonalityVector {
  const base = ATTACHMENT_BASE_VECTORS[npc.attachment];
  const mods = MBTI_VECTOR_MODIFIERS[npc.mbti];

  const apply = (key: PersonalityVectorKey, baseValue: number): number =>
    clamp01(baseValue + (mods?.[key] ?? 0));

  return {
    npcId: npc.id,
    initiative: apply("initiative", base.initiative),
    jealousySensitivity: apply("jealousySensitivity", base.jealousySensitivity),
    exposureThreshold: apply("exposureThreshold", base.exposureThreshold),
    conflictTendency: apply("conflictTendency", base.conflictTendency),
    humorTendency: apply("humorTendency", base.humorTendency),
    verbosity: apply("verbosity", base.verbosity),
    _deltas: {},
  };
}

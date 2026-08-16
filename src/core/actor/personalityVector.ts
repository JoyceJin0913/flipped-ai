/**
 * 人格向量初始化与演化
 *
 * 从 NPC 的依恋类型 + MBTI 推导六维人格向量，
 * 并根据事件触发器进行 ±0.02~0.05 的微调演化。
 */

import { getNpcById } from "../npcLibrary";
import type { NPC } from "../types";
import type { PersonalityVector, EvolutionTriggerType, PersonalityVectorKey } from "./types";
import { ATTACHMENT_BASE_VECTORS, MBTI_VECTOR_MODIFIERS, EVOLUTION_RULES } from "./types";

/** 将值限制在 [0, 1] 范围内 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 从 NPC 的 attachment + mbti 推导初始人格向量
 *
 * 基础向量来自依恋类型（secure/anxious/avoidant），
 * 再叠加 MBTI 修正值（如 INTJ 话量 -0.2，ENTP 幽默 +0.2）。
 */
export function initPersonalityVector(npc: NPC): PersonalityVector {
  const base = ATTACHMENT_BASE_VECTORS[npc.attachment];
  const modifier = MBTI_VECTOR_MODIFIERS[npc.mbti] ?? {};

  const applyModifier = (key: PersonalityVectorKey, baseValue: number): number => {
    const mod = modifier[key];
    if (mod === undefined) return baseValue;
    return clamp01(baseValue + mod);
  };

  return {
    npcId: npc.id,
    initiative: applyModifier("initiative", base.initiative),
    jealousySensitivity: applyModifier("jealousySensitivity", base.jealousySensitivity),
    exposureThreshold: applyModifier("exposureThreshold", base.exposureThreshold),
    conflictTendency: applyModifier("conflictTendency", base.conflictTendency),
    humorTendency: applyModifier("humorTendency", base.humorTendency),
    verbosity: applyModifier("verbosity", base.verbosity),
    _deltas: {},
  };
}

/**
 * 人格演化：事件触发后微调向量（±0.02~0.05，clamp [0,1]）
 *
 * 返回新向量，_deltas 记录经 clamp 后的实际变化量（可能为 0）。
 */
export function evolveVector(
  pv: PersonalityVector,
  trigger: EvolutionTriggerType,
): PersonalityVector {
  const rule = EVOLUTION_RULES[trigger];
  const deltas: Partial<Record<PersonalityVectorKey, number>> = {};

  const applyDelta = (key: PersonalityVectorKey, current: number): number => {
    const delta = rule[key];
    if (delta === undefined || delta === 0) return current;
    const newValue = clamp01(current + delta);
    const actualDelta = newValue - current;
    if (actualDelta !== 0) {
      deltas[key] = actualDelta;
    }
    return newValue;
  };

  return {
    npcId: pv.npcId,
    initiative: applyDelta("initiative", pv.initiative),
    jealousySensitivity: applyDelta("jealousySensitivity", pv.jealousySensitivity),
    exposureThreshold: applyDelta("exposureThreshold", pv.exposureThreshold),
    conflictTendency: applyDelta("conflictTendency", pv.conflictTendency),
    humorTendency: applyDelta("humorTendency", pv.humorTendency),
    verbosity: applyDelta("verbosity", pv.verbosity),
    _deltas: deltas,
  };
}

/**
 * 批量初始化人格向量
 *
 * @param npcIds NPC ID 列表
 * @returns npcId → PersonalityVector 映射
 */
export function initAllPersonalityVectors(npcIds: string[]): Record<string, PersonalityVector> {
  const result: Record<string, PersonalityVector> = {};
  for (const id of npcIds) {
    const npc = getNpcById(id);
    if (npc) {
      result[id] = initPersonalityVector(npc);
    }
  }
  return result;
}

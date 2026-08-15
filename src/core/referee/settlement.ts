/**
 * 裁判层 Δ 结算引擎
 *
 * 核心纯函数 settle：根据意图 × 依恋 × 人格 × 场景 × 阶段 计算 Δ，
 * 并运行三道校验（越权 / 一致性 / 信息泄露）。
 *
 * 设计原则：
 * - 纯函数，不修改任何外部状态
 * - Δ 计算与违规检查分离：即使有违规也返回 Δ，由调用方决定是否采纳
 * - 所有数值查表集中在 matrix.ts，调平入口唯一
 */

import type { SettlementRequest, SettlementResult, RefereeViolation } from "./types";
import type { TextContract } from "../actor/types";
import type { WorldEventLog } from "../state/worldTypes";
import { getNpcById } from "../npcLibrary";
import { getStageFromValue } from "../scoring";
import {
  EXTENDED_BASE_MATRIX,
  PERSONALITY_MOD_MATRIX,
  SCENE_MULT,
  STAGE_MULT,
  ICEBERG_THRESHOLDS,
  checkCoreNeedHit,
} from "./matrix";
import {
  checkOverscoreViolation,
  checkPersonalityConsistency,
  checkInfoLeak,
} from "./validators";

// ============================================================
// 常量
// ============================================================

/** Δ 下限 */
const DELTA_MIN = -15;
/** Δ 上限 */
const DELTA_MAX = 18;
/** 心动值下限 */
const HEART_MIN = 0;
/** 心动值上限 */
const HEART_MAX = 100;
/** 核心需求命中奖励 */
const CORE_NEED_BONUS = 2;
/** 默认场景系数 */
const DEFAULT_SCENE_MULT = 1.0;
/** 默认阶段系数 */
const DEFAULT_STAGE_MULT = 1.0;
/** 默认依恋类型（NPC 未找到时） */
const DEFAULT_ATTACHMENT = "secure" as const;

// ============================================================
// 冰山线索文本生成
// ============================================================

/** 冰山四层键名 */
const ICEBERG_LAYERS = ["surface", "role", "conflict", "core"] as const;
type IcebergLayer = (typeof ICEBERG_LAYERS)[number];

/** 冰山四层中文名 */
const ICEBERG_LAYER_NAMES = ["表现层", "角色层", "冲突层", "核心层"];

/**
 * 生成冰山线索文本
 * @param npcName NPC 名称
 * @param npcPersonality NPC 冰山人格数据
 * @param clueLevel 解锁的层数（1-indexed）
 */
function generateClueText(
  npcName: string,
  npcPersonality: {
    surface: string[];
    role: string;
    conflict: string;
    core: string;
  },
  clueLevel: number,
): string {
  const layerIdx = Math.min(Math.max(clueLevel - 1, 0), ICEBERG_LAYERS.length - 1);
  const layerName = ICEBERG_LAYER_NAMES[layerIdx] ?? "未知层";
  const layerKey = ICEBERG_LAYERS[layerIdx];

  if (!layerKey) {
    return `【${npcName}的${layerName}】\n（暂无信息）`;
  }

  const text = npcPersonality[layerKey];
  const content =
    typeof text === "string" ? text : (text[0] ?? "（暂无信息）");

  return `【${npcName}的${layerName}】\n${content}`;
}

// ============================================================
// 核心结算函数
// ============================================================

/**
 * Δ 结算引擎。
 *
 * 流程：
 * 1. 查 EXTENDED_BASE_MATRIX[intent.type][attachment] → base
 * 2. 查 PERSONALITY_MOD_MATRIX[intent.type] × pv → personalityMod
 * 3. Δ = base × sceneMult × stageMult + personalityMod + coreNeedBonus
 * 4. clamp [-15, +18]
 * 5. 计算新心动值 + 新阶段
 * 6. 冰山解锁检查
 * 7. 运行越权检查（收集 violations）
 * 8. 返回 SettlementResult
 *
 * @param req 结算请求
 * @param textContract 文字契约（提供时启用人格一致性校验）
 * @param visibleEvents NPC 可见事件（提供时启用信息泄露检查）
 * @param allEvents 全部事件（提供时启用信息泄露检查）
 */
export function settle(
  req: SettlementRequest,
  textContract?: TextContract,
  visibleEvents?: WorldEventLog,
  allEvents?: WorldEventLog,
): SettlementResult {
  const {
    actorOutput,
    targetNpcId,
    currentHeart,
    scene,
    relationshipStage,
    personalityVector: pv,
  } = req;

  // ---- 步骤 1：查基础值 ----
  const npc = getNpcById(targetNpcId);
  const attachment = npc?.attachment ?? DEFAULT_ATTACHMENT;

  const baseRow = EXTENDED_BASE_MATRIX[actorOutput.intent.type];
  const base = baseRow?.[attachment] ?? 0;

  // ---- 步骤 2：人格向量修正 ----
  const modRow = PERSONALITY_MOD_MATRIX[actorOutput.intent.type];
  const personalityMod = modRow
    ? modRow.initiative * pv.initiative +
      modRow.jealousySensitivity * pv.jealousySensitivity +
      modRow.exposureThreshold * pv.exposureThreshold +
      modRow.conflictTendency * pv.conflictTendency +
      modRow.humorTendency * pv.humorTendency
    : 0;

  // ---- 步骤 3：场景/阶段系数 + 核心需求奖励 ----
  const sceneMult = SCENE_MULT[scene] ?? DEFAULT_SCENE_MULT;
  const stageMult = STAGE_MULT[relationshipStage] ?? DEFAULT_STAGE_MULT;
  const coreNeedHit = checkCoreNeedHit(actorOutput.intent.type, attachment);
  const coreNeedBonus = coreNeedHit ? CORE_NEED_BONUS : 0;

  // ---- 步骤 4：计算 Δ 并 clamp ----
  const rawDelta = base * sceneMult * stageMult + personalityMod + coreNeedBonus;
  const delta = Math.max(
    DELTA_MIN,
    Math.min(DELTA_MAX, Math.round(rawDelta)),
  );

  // ---- 步骤 5：计算新心动值 + 新阶段 ----
  const newHeartValue = Math.max(
    HEART_MIN,
    Math.min(HEART_MAX, currentHeart + delta),
  );
  const newStage = getStageFromValue(newHeartValue);

  // ---- 步骤 6：冰山解锁检查 ----
  const prevCluesUnlocked = ICEBERG_THRESHOLDS.filter(
    (t) => currentHeart >= t,
  ).length;
  const newCluesUnlocked = ICEBERG_THRESHOLDS.filter(
    (t) => newHeartValue >= t,
  ).length;
  const unlocksIcebergClue = newCluesUnlocked > prevCluesUnlocked;

  // 生成冰山线索文本（仅在解锁且 NPC 存在时）
  const clueText =
    unlocksIcebergClue && npc
      ? generateClueText(npc.name, npc.personality, newCluesUnlocked)
      : undefined;

  // ---- 步骤 7：运行越权检查 ----
  const violations: RefereeViolation[] = [];

  // 7a. 越权拦截（始终执行）
  const overscore = checkOverscoreViolation(actorOutput);
  if (overscore) violations.push(overscore);

  // 7b. 人格一致性校验（需要 textContract）
  if (textContract) {
    const consistency = checkPersonalityConsistency(
      actorOutput,
      pv,
      textContract,
    );
    if (consistency) violations.push(consistency);
  }

  // 7c. 信息泄露检查（需要 visibleEvents + allEvents）
  if (visibleEvents && allEvents) {
    const infoLeak = checkInfoLeak(
      actorOutput,
      visibleEvents,
      allEvents,
    );
    if (infoLeak) violations.push(infoLeak);
  }

  // ---- 步骤 8：返回结果 ----
  const result: SettlementResult = {
    delta,
    newHeartValue,
    newStage,
    unlocksIcebergClue,
    ...(clueText !== undefined ? { clueText } : {}),
    breakdown: {
      base,
      personalityMod: Math.round(personalityMod * 100) / 100,
      sceneMult,
      stageMult,
      coreNeedBonus,
    },
    violations,
  };

  return result;
}

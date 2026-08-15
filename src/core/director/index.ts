/**
 * 导演层入口
 *
 * 统一导出导演层的核心接口。导演层职责：
 * - 决定"本幕必须发生什么节拍"（蓝图生成）
 * - 谁有发言权（竞价调度）
 * - 张力调节
 * - 收场判定
 *
 * 导演层不写任何一句台词 —— 台词由演员层（Actor）生成。
 */

import type { WorldState } from "../state/worldTypes";
import type { Beat, BiddingResult, SceneBlueprint } from "./types";
import { runBidding } from "./scheduler";

// ============================================================
// 统一导出
// ============================================================

export { computeDesire } from "./scheduler";
export { runBidding };
export { generateBlueprint, adjustTension, checkResolution } from "./beats";
export type {
  Beat,
  BeatType,
  SceneBlueprint,
  BiddingResult,
  DirectorContext,
  TensionState,
  BeatProgress,
  SceneTurn,
} from "./types";

// ============================================================
// 导演回合执行
// ============================================================

/**
 * 执行一个导演回合
 *
 * 流程：
 * 1. 从蓝图中取出当前节拍（beatIndex 对应的 Beat）
 * 2. 对节拍的候选 NPC 执行发言权竞价
 * 3. 返回节拍定义与竞价结果（谁发言、谁做微反应、分数明细）
 *
 * @param blueprint   场景蓝图
 * @param beatIndex   当前节拍索引
 * @param worldState  世界状态（提供人格向量、事件日志、沉默/冷却映射）
 * @returns           节拍定义 + 竞价结果
 * @throws            当 beatIndex 超出蓝图节拍范围时抛错
 */
export function runDirectorTurn(
  blueprint: SceneBlueprint,
  beatIndex: number,
  worldState: WorldState
): { beat: Beat; bidding: BiddingResult } {
  const beat = blueprint.beats[beatIndex];
  if (beat === undefined) {
    throw new Error(
      `Beat index ${beatIndex} out of range (blueprint "${blueprint.sceneId}" has ${blueprint.beats.length} beats)`
    );
  }

  const bidding = runBidding(
    beat.speakerCandidates,
    worldState.personalityVectors,
    beat,
    worldState.eventLog,
    worldState.beatProgress.silenceMap,
    worldState.beatProgress.cooldownMap
  );

  return { beat, bidding };
}

// ============================================================
// 玩家选项生成
// ============================================================

/** 玩家选项模板 */
interface ChoiceTemplate {
  text: string;
  intentType: string;
  riskLevel: string;
}

/** 低张力场景选项（破冰、日常闲聊） */
const LOW_TENSION_CHOICES: ChoiceTemplate[] = [
  { text: "聊聊你的兴趣爱好吧", intentType: "probe", riskLevel: "low" },
  { text: "开个玩笑活跃一下气氛", intentType: "humor", riskLevel: "low" },
  { text: "先听听大家怎么说", intentType: "observe", riskLevel: "low" },
];

/** 中张力场景选项（暧昧、升温） */
const MEDIUM_TENSION_CHOICES: ChoiceTemplate[] = [
  { text: "主动表达自己的心意", intentType: "advance", riskLevel: "medium" },
  { text: "用温柔的话语安抚对方", intentType: "soothe", riskLevel: "low" },
  { text: "调侃一下化解尴尬", intentType: "tease", riskLevel: "medium" },
];

/** 高张力场景选项（冲突、对峙） */
const HIGH_TENSION_CHOICES: ChoiceTemplate[] = [
  { text: "直面冲突，说出真实想法", intentType: "advance", riskLevel: "high" },
  { text: "暂时退让，避免矛盾升级", intentType: "retreat", riskLevel: "medium" },
  { text: "为自己的立场辩护", intentType: "defend", riskLevel: "medium" },
];

/**
 * 根据当前节拍张力等级生成玩家选项
 *
 * 张力分档（综合节拍目标张力 60% + 当前张力 40%）：
 * - 低张力（0-40）：试探、幽默、观察等低风险选项
 * - 中张力（41-70）：推进、安抚、调侃等中风险选项
 * - 高张力（71-100）：推进、防御、撤退等中高风险选项
 *
 * 选项会根据玩家与 NPC 的关系亲密度进行个性化：
 * - 查找好感度最高的 NPC，在 advance/soothe 选项中引用其 ID
 *
 * @param beat        当前节拍
 * @param npcIds      场景内 NPC ID 列表
 * @param worldState  世界状态（用于读取关系与张力）
 */
export function generatePlayerChoices(
  beat: Beat,
  npcIds: string[],
  worldState: WorldState
): Array<{ text: string; intentType: string; riskLevel: string }> {
  // 综合节拍目标张力与当前张力，得到有效张力
  const effectiveTension = Math.round(
    beat.tensionTarget * 0.6 + worldState.tension.current * 0.4
  );

  // 按有效张力分档选择模板
  let templates: ChoiceTemplate[];
  if (effectiveTension <= 40) {
    templates = LOW_TENSION_CHOICES;
  } else if (effectiveTension <= 70) {
    templates = MEDIUM_TENSION_CHOICES;
  } else {
    templates = HIGH_TENSION_CHOICES;
  }

  // 查找好感度最高的 NPC，用于个性化选项
  let topNpcId: string | undefined;
  let topAffinity = -1;
  for (const id of npcIds) {
    const rel = worldState.playerRelations[id];
    if (rel !== undefined && rel.heartValue > topAffinity) {
      topAffinity = rel.heartValue;
      topNpcId = id;
    }
  }
  // 若无关系数据，回退到第一个 NPC
  const targetNpcId = topNpcId ?? npcIds[0];

  // 个性化选项文本
  return templates.map((t) => {
    if (targetNpcId !== undefined && t.intentType === "advance") {
      return { ...t, text: `向 ${targetNpcId} 坦白自己的心意` };
    }
    if (targetNpcId !== undefined && t.intentType === "soothe") {
      return { ...t, text: `温柔地安抚 ${targetNpcId}` };
    }
    return t;
  });
}

/**
 * 发言权竞价调度引擎
 *
 * 职责：根据 NPC 人格向量、当前节拍、事件日志，计算各 NPC 的发言欲望分数，
 * 选出本节拍的发言者与微反应者。
 *
 * 六因子加权公式：
 *   desire = initiative×1.0 + topicRelevance×1.5 + emotionalPressure×1.2
 *          + silencePenalty×0.8 - avoidanceFactor×1.0 - recentSpeakCooldown×1.3
 *          + random(-0.1, 0.1)
 */

import type { PersonalityVector } from "../actor/types";
import type { Beat, BiddingResult } from "./types";
import type { WorldEventLog } from "../state/worldTypes";

// ============================================================
// 辅助函数
// ============================================================

/**
 * 取数组末尾 n 个元素（安全处理空数组与越界）
 */
function takeLast<T>(arr: readonly T[], n: number): T[] {
  if (arr.length === 0) return [];
  const start = Math.max(0, arr.length - n);
  return arr.slice(start);
}

/**
 * 计算话题相关度：该 NPC 是否在最近事件的 participants 中出现
 * 返回 0 或 1（二值）
 *
 * 实现：扫描最近 5 条事件，只要任一事件的 participants 包含该 NPC 即认为相关。
 */
function computeTopicRelevance(npcId: string, eventLog: WorldEventLog): number {
  const recentEvents = takeLast(eventLog.events, 5);
  for (const evt of recentEvents) {
    if (evt.participants.includes(npcId)) {
      return 1;
    }
  }
  return 0;
}

/**
 * 计算情绪压力：最近 3 条事件中涉及该 NPC 的比例
 * 返回 0 ~ 1 之间的浮点数
 *
 * "涉及" = 该 NPC 出现在事件的 participants 列表中。
 */
function computeEmotionalPressure(
  npcId: string,
  eventLog: WorldEventLog
): number {
  const recent3 = takeLast(eventLog.events, 3);
  if (recent3.length === 0) return 0;
  let involved = 0;
  for (const evt of recent3) {
    if (evt.participants.includes(npcId)) {
      involved++;
    }
  }
  return involved / recent3.length;
}

// ============================================================
// 核心函数
// ============================================================

/**
 * 计算 NPC 的发言欲望分数（6因子加权 + 随机扰动）
 *
 * 因子说明：
 * - initiative：NPC 主动性（来自人格向量），系数 1.0
 * - topicRelevance：是否被当前话题提及（从 eventLog participants 检查），系数 1.5
 * - emotionalPressure：近期被影响的程度（最近3条事件涉及比例），系数 1.2
 * - silencePenalty：沉默轮数（沉默越久越想发言），系数 0.8
 * - avoidanceFactor：高张力 + 低冲突倾向时回避（0 或 0.5），系数 1.0（负向）
 * - recentSpeakCooldown：近期刚发言过则冷却（0 或 1），系数 1.3（负向）
 *
 * @param npcId             NPC ID
 * @param pv                NPC 人格向量
 * @param beat              当前节拍
 * @param eventLog          世界事件日志
 * @param silenceTurns      连续沉默轮数
 * @param recentSpokeTurns  近期发言轮数（>0 表示刚发言过，需冷却）
 */
export function computeDesire(
  npcId: string,
  pv: PersonalityVector,
  beat: Beat,
  eventLog: WorldEventLog,
  silenceTurns: number,
  recentSpokeTurns: number
): number {
  // 因子1: initiative（主动性）
  const initiative = pv.initiative;

  // 因子2: topicRelevance（话题相关度，二值 0/1）
  const topicRelevance = computeTopicRelevance(npcId, eventLog);

  // 因子3: emotionalPressure（情绪压力，0~1 浮点）
  const emotionalPressure = computeEmotionalPressure(npcId, eventLog);

  // 因子4: silencePenalty（沉默惩罚 = 沉默轮数）
  const silencePenalty = silenceTurns;

  // 因子5: avoidanceFactor（回避因子）
  // 当 beat.tensionTarget > 70 且 pv.conflictTendency < 0.3 时为 0.5，否则 0
  const avoidanceFactor =
    beat.tensionTarget > 70 && pv.conflictTendency < 0.3 ? 0.5 : 0;

  // 因子6: recentSpeakCooldown（近期发言冷却，二值 0/1）
  const recentSpeakCooldown = recentSpokeTurns > 0 ? 1 : 0;

  // 随机扰动 [-0.1, 0.1)
  const noise = (Math.random() * 2 - 1) * 0.1;

  const desire =
    initiative * 1.0 +
    topicRelevance * 1.5 +
    emotionalPressure * 1.2 +
    silencePenalty * 0.8 -
    avoidanceFactor * 1.0 -
    recentSpeakCooldown * 1.3 +
    noise;

  return desire;
}

/**
 * 执行竞价，选出发言者 + 微反应者
 *
 * 算法：
 * 1. 为每个候选 NPC 计算 desire 分数（跳过无人格向量的候选）
 * 2. 按分数降序排列
 * 3. 先确保 mustInclude 的 NPC 进入发言者列表
 * 4. 再按分数补充发言者，直到达到目标数量（介于 minSpeakers 与 maxSpeakers 之间）
 * 5. 剩余候选中分数高于阈值的成为微反应者（最多 3 位）
 *
 * @param candidateIds  候选 NPC ID 列表（来自 beat.speakerCandidates）
 * @param vectors       NPC 人格向量字典
 * @param beat          当前节拍
 * @param eventLog      世界事件日志
 * @param silenceMap    各 NPC 连续沉默轮数映射
 * @param cooldownMap   各 NPC 发言冷却轮数映射
 */
export function runBidding(
  candidateIds: string[],
  vectors: Record<string, PersonalityVector>,
  beat: Beat,
  eventLog: WorldEventLog,
  silenceMap: Record<string, number>,
  cooldownMap: Record<string, number>
): BiddingResult {
  const scores: Record<string, number> = {};
  const validCandidates: string[] = [];

  // 计算每个候选的 desire 分数
  for (const id of candidateIds) {
    const pv = vectors[id];
    if (!pv) continue;
    const silenceTurns = silenceMap[id] ?? 0;
    const recentSpokeTurns = cooldownMap[id] ?? 0;
    scores[id] = computeDesire(
      id,
      pv,
      beat,
      eventLog,
      silenceTurns,
      recentSpokeTurns
    );
    validCandidates.push(id);
  }

  // 按分数降序排列
  const sorted = [...validCandidates].sort((a, b) => {
    const sa = scores[a] ?? -Infinity;
    const sb = scores[b] ?? -Infinity;
    return sb - sa;
  });

  // 目标发言者数量：至少 minSpeakers、至少 mustInclude 数量，不超过 maxSpeakers
  const mustInclude = beat.mustInclude ?? [];
  const targetSpeakerCount = Math.min(
    Math.max(beat.minSpeakers, mustInclude.length),
    beat.maxSpeakers
  );

  // 选择发言者
  const speakers: string[] = [];
  const speakerSet = new Set<string>();

  // 先加入 mustInclude 的 NPC（前提是它们在有效候选列表中）
  for (const id of mustInclude) {
    if (validCandidates.includes(id) && !speakerSet.has(id)) {
      speakers.push(id);
      speakerSet.add(id);
    }
  }

  // 按分数补充发言者，直到达到目标数量
  for (const id of sorted) {
    if (speakers.length >= targetSpeakerCount) break;
    if (!speakerSet.has(id)) {
      speakers.push(id);
      speakerSet.add(id);
    }
  }

  // 选择微反应者：剩余候选中分数 > 阈值，最多 3 位
  const microReactors: string[] = [];
  const MICRO_THRESHOLD = 0.1;
  const MAX_MICRO = 3;
  for (const id of sorted) {
    if (microReactors.length >= MAX_MICRO) break;
    if (!speakerSet.has(id)) {
      const score = scores[id] ?? 0;
      if (score > MICRO_THRESHOLD) {
        microReactors.push(id);
      }
    }
  }

  return { speakers, microReactors, scores };
}

/**
 * 分池竞价：异性池 Top 2 + 同性池 Top 1，其余走微反应
 *
 * 按 PRD v0.2 §3.2 和 §2.4 要求，9 位 NPC 不能混池全局排序，
 * 否则同性竞争者会因缺少"被玩家点名"权重而长期沉默。
 *
 * 算法：
 * 1. 对异性池所有 NPC 计算 desire 分数，取 Top 2 作为 speakers
 * 2. 对同性池所有 NPC 计算 desire 分数，取 Top 1 作为 speakers
 * 3. speakers = [...oppositeSexTop2, ...sameSexTop1]
 * 4. microReactors = 其余所有 NPC
 * 5. scores = 所有 NPC 的分数合并
 *
 * @param oppositeSexIds  异性 NPC（5位）
 * @param sameSexIds      同性 NPC（4位）
 * @param vectors         NPC 人格向量字典
 * @param beat            当前节拍
 * @param eventLog        世界事件日志
 * @param silenceMap      各 NPC 连续沉默轮数映射
 * @param cooldownMap     各 NPC 发言冷却轮数映射
 */
export function runBiddingSplitPool(
  oppositeSexIds: string[],
  sameSexIds: string[],
  vectors: Record<string, PersonalityVector>,
  beat: Beat,
  eventLog: WorldEventLog,
  silenceMap: Record<string, number>,
  cooldownMap: Record<string, number>
): BiddingResult {
  const scores: Record<string, number> = {};

  /**
   * 计算单个池子的 desire 分数，返回按分数降序排列的有效候选列表
   * （跳过无人格向量的候选）。副作用：写入 scores。
   */
  const scorePool = (poolIds: readonly string[]): string[] => {
    const valid: string[] = [];
    for (const id of poolIds) {
      const pv = vectors[id];
      if (!pv) continue;
      const silenceTurns = silenceMap[id] ?? 0;
      const recentSpokeTurns = cooldownMap[id] ?? 0;
      scores[id] = computeDesire(
        id,
        pv,
        beat,
        eventLog,
        silenceTurns,
        recentSpokeTurns
      );
      valid.push(id);
    }
    return valid.sort((a, b) => {
      const sa = scores[a] ?? -Infinity;
      const sb = scores[b] ?? -Infinity;
      return sb - sa;
    });
  };

  const oppositeSorted = scorePool(oppositeSexIds);
  const sameSorted = scorePool(sameSexIds);

  // 异性池取 Top 2，同性池取 Top 1
  const oppositeSexSpeakers = oppositeSorted.slice(0, 2);
  const sameSexSpeakers = sameSorted.slice(0, 1);

  const speakers = [...oppositeSexSpeakers, ...sameSexSpeakers];
  const speakerSet = new Set(speakers);

  // 其余所有 NPC 走微反应模板池（零模型调用）
  const microReactors = [...oppositeSorted, ...sameSorted].filter(
    (id) => !speakerSet.has(id)
  );

  return {
    speakers,
    microReactors,
    scores,
    poolBreakdown: {
      oppositeSexSpeakers,
      sameSexSpeakers,
    },
  };
}

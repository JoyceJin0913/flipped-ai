/**
 * PRD §12 数值配置总表（计分表 + 判定矩阵 + 匹配池算法）
 *
 * 工程侧拿到本文件即可跑通全部数值判定。
 * 调平入口集中在本文件，不要散落到业务代码里。
 */

import type {
  MbtiQuestion, AttachmentQuestion, IntentType, AttachmentType, IcebergPersonality,
  SceneKey, StageKey, TestResult, MBTI, ResolveInput, ResolveResult,
  PlayerProfile, NPC, MatchTier, CandidateInfo,
} from "./types";
import { NPC_LIBRARY, getOppositeGenderNpcs } from "./npcLibrary";

// ============================================================
// §12.1 表A · 12 题人格测试计分
// ============================================================

/** A.1 MBTI 四轴（第 1-8 题） */
export const MBTI_QUESTIONS: MbtiQuestion[] = [
  { q: 1, axis: "EI", A: { label: "家里看片做饭", score: { I: 1 } }, B: { label: "出门逛街见朋友", score: { E: 1 } } },
  { q: 2, axis: "EI", A: { label: "慢慢观察再靠近", score: { I: 1 } }, B: { label: "自来熟直接聊", score: { E: 1 } } },
  { q: 3, axis: "SN", A: { label: "眼前的心动感觉", score: { S: 1 } }, B: { label: "聊得来的精神共鸣", score: { N: 1 } } },
  { q: 4, axis: "SN", A: { label: "具体的样子和习惯", score: { S: 1 } }, B: { label: "我们之间的化学反应", score: { N: 1 } } },
  { q: 5, axis: "TF", A: { label: "讲道理分析对错", score: { T: 1 } }, B: { label: "先在乎对方情绪", score: { F: 1 } } },
  { q: 6, axis: "TF", A: { label: "帮 TA 想解决办法", score: { T: 1 } }, B: { label: "抱抱 TA 说没事", score: { F: 1 } } },
  { q: 7, axis: "JP", A: { label: "有规划稳步推进", score: { J: 1 } }, B: { label: "顺其自然看感觉", score: { P: 1 } } },
  { q: 8, axis: "JP", A: { label: "想尽快确定关系", score: { J: 1 } }, B: { label: "享受这种模糊感", score: { P: 1 } } },
];

export const MBTI_QUESTION_TITLES: Record<number, string> = {
  1: "理想的周末约会是？",
  2: "认识新的心动对象时，你会？",
  3: "你更看重一段关系里的？",
  4: "回忆一个人时，你先想起的是？",
  5: "对方跟你吐槽工作时，你会？",
  6: "对方情绪崩溃时，你的第一反应是？",
  7: "面对一段刚开始的关系，你倾向？",
  8: "关于「确定关系」这件事，你？",
};

/** A.2 依恋类型（第 9-12 题） */
export const ATTACHMENT_QUESTIONS: AttachmentQuestion[] = [
  { q: 9, title: "对方几小时没回消息，你会？", anx: "反复看手机胡思乱想", avo: "无所谓各忙各的", safe: "有点在意但能等" },
  { q: 10, title: "关系变亲密时，你？", anx: "想要更多确认和保证", avo: "想留点自己的空间", safe: "享受靠近也不慌" },
  { q: 11, title: "你最怕关系里的？", anx: "被冷落被抛弃", avo: "被束缚失去自由", safe: "都还好能沟通" },
  { q: 12, title: "对方想深入了解你，你？", anx: "开心终于有人懂我", avo: "有点抗拒不想全暴露", safe: "愿意慢慢敞开" },
];

export const ATTACHMENT_RULES = { anx_weight: 2, avo_weight: 2, threshold: 4 } as const;

export type MbtiAnswer = "A" | "B";
export type AttachmentAnswer = "anx" | "avo" | "safe";

/**
 * 计算 12 题测试结果
 */
export function calcTestResult(
  mbtiAnswers: (MbtiAnswer | undefined)[],
  attachAnswers: (AttachmentAnswer | undefined)[],
): TestResult {
  const axes: Record<string, number> = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  MBTI_QUESTIONS.forEach((q, idx) => {
    const pick = mbtiAnswers[idx];
    if (!pick) return;
    const scoreMap = pick === "A" ? q.A.score : q.B.score;
    Object.entries(scoreMap).forEach(([k, v]) => { axes[k] = (axes[k] ?? 0) + (v ?? 0); });
  });

  const weakAxes: string[] = [];
  const axisPairs: [string, string, string][] = [
    ["I", "E", "EI"], ["S", "N", "SN"], ["T", "F", "TF"], ["J", "P", "JP"],
  ];

  let mbti = "";
  axisPairs.forEach(([first, second, axisName]) => {
    const vf = axes[first] ?? 0;
    const vs = axes[second] ?? 0;
    if (vf > vs) mbti += first;
    else if (vs > vf) mbti += second;
    else { mbti += first; weakAxes.push(axisName); }
  });

  let anx = 0, avo = 0;
  attachAnswers.forEach((a) => {
    if (a === "anx") anx += ATTACHMENT_RULES.anx_weight;
    if (a === "avo") avo += ATTACHMENT_RULES.avo_weight;
  });

  const t = ATTACHMENT_RULES.threshold;
  let attachment: AttachmentType;
  if (anx >= t && avo < t) attachment = "anxious";
  else if (avo >= t && anx < t) attachment = "avoidant";
  else if (anx < t && avo < t) attachment = "secure";
  else attachment = "anxious"; // 混乱型归并焦虑

  return { mbti: mbti as MBTI, attachment, weakAxes, raw: { anx, avo, axes } };
}

// ============================================================
// §12.2 / §12.3 表B · 意图 × 依恋 判定核心矩阵
// ============================================================

export const BASE_MATRIX: Record<IntentType, Record<AttachmentType, number>> = {
  probe:     { secure: 3, anxious: 3, avoidant: 4 },
  advance:   { secure: 4, anxious: 6, avoidant: -3 },
  soothe:    { secure: 3, anxious: 7, avoidant: 2 },
  humor:     { secure: 4, anxious: 2, avoidant: 3 },
  adventure: { secure: 3, anxious: 4, avoidant: -5 },
};

/** 场景系数 */
export const SCENE_MULT: Record<SceneKey, number> = {
  private_day: 1.0,
  private_night: 1.3,
  public_chat: 0.8,
  public_date: 1.2,
};

/** 关系阶段系数 */
export const STAGE_MULT: Record<StageKey, number> = {
  stranger: 0.8,
  icebreak: 1.0,
  flirt: 1.2,
  crush: 1.4,
};

/** 冰山线索解锁阈值（累计正向变动达到时解锁一层） */
export const ICEBERG_THRESHOLDS = [10, 25, 45, 65]; // 对应 L1→L4

// ============================================================
// §12.5 判定引擎
// ============================================================

/**
 * 核心判定函数：计算一次对话意图的心动值变化
 *
 * 公式：Δ = 基础值(intent, attachment) × 场景系数(scene) × 阶段系数(stage)
 *       + 命中核心需求奖励(+2) + 深夜加成(×1.3 已含在场景系数中)
 */
export function resolveInteraction(input: ResolveInput, npc: NPC, currentHeartValue: number): ResolveResult {
  const base = BASE_MATRIX[input.intent][npc.attachment];
  const sceneMult = input.isNight ? SCENE_MULT.private_night : SCENE_MULT.private_day;

  // 根据当前心动值判断阶段
  const stage = getStageFromValue(currentHeartValue);
  const stageMult = STAGE_MULT[stage];

  // 计算基础变动
  let delta = Math.round(base * sceneMult * stageMult);

  // 命中核心需求奖励
  // 简化处理：推进/安抚类意图有概率命中
  const coreNeedHit = (input.intent === "advance" || input.intent === "soothe") && Math.random() > 0.6;
  const coreNeedBonus = coreNeedHit ? 2 : 0;
  delta += coreNeedBonus;

  // 限制范围 [-15, +18]
  delta = Math.max(-15, Math.min(18, delta));

  // 计算新阶段
  const newValue = Math.max(0, Math.min(100, currentHeartValue + delta));
  const newStage = getStageFromValue(newValue);

  // 判断是否解锁冰山线索
  const prevCluesUnlocked = ICEBERG_THRESHOLDS.filter(t => currentHeartValue >= t).length;
  const newCluesUnlocked = ICEBERG_THRESHOLDS.filter(t => newValue >= t).length;
  const unlocksIcebergClue = newCluesUnlocked > prevCluesUnlocked;

  // 生成 NPC 反应文本
  const npcReaction = generateNpcReaction(input.intent, npc, delta);

  return {
    delta,
    newStage,
    unlocksIcebergClue,
    ...(unlocksIcebergClue ? { clueText: getIcebergClueText(npc, newCluesUnlocked) } : {}),
    npcReaction,
    breakdown: { base, sceneMult, stageMult, nightBonus: 0, coreNeedBonus },
  };
}

/** 根据心动值获取阶段 */
export function getStageFromValue(value: number): StageKey {
  if (value <= 20) return "stranger";
  if (value <= 45) return "icebreak";
  if (value <= 70) return "flirt";
  return "crush";
}

// ============================================================
// §12.4 三档匹配池算法
// ============================================================

export interface MatchingConfig {
  HIGH_AFFINITY_MIN: number;  // 高契合最低分
  CONTRAST_MIN: number;       // 反差吸引最低分
  RED_FLAG_MAX: number;       // 雷区最高分
  MAX_SWAP_COUNT: number;     // 最大换一批次数
  REQUIRED_COUNT: number;     // 需要选出的人数
  FORCE_RED_FLAG: boolean;    // 是否强制包含至少一个雷区
}

export const MATCHING_CONFIG: MatchingConfig = {
  HIGH_AFFINITY_MIN: 65,
  CONTRAST_MIN: 40,
  RED_FLAG_MAX: 30,
  MAX_SWAP_COUNT: 3,
  REQUIRED_COUNT: 5,
  FORCE_RED_FLAG: true,
};

/**
 * 计算完整候选池（不截断）：四维加权打分 → 三档分类 → 排序
 * 用于「8 选 5」界面展示全部候选。
 */
export function calculateCandidatePool(player: PlayerProfile): CandidateInfo[] {
  const candidates = getOppositeGenderNpcs(player.gender);
  const scored: CandidateInfo[] = candidates.map((npc) => {
    const score = computeMatchScore(player, npc);
    const tier = classifyTier(score.score, player, npc);
    return { npcId: npc.id, tier, matchScore: score.score, reasons: score.reasons };
  });
  const tierOrder: Record<MatchTier, number> = {
    high_affinity: 0, contrast: 1, red_flag: 2, filler: 3,
  };
  scored.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.matchScore - a.matchScore);
  return scored;
}

/**
 * 计算匹配池：四维加权打分 → 三档分类 → 8选5
 *
 * @param player 玩家档案
 * @returns 选出的 5 位候选者 + 分档信息
 */
export function calculateMatchingPool(player: PlayerProfile): CandidateInfo[] {
  const candidates = getOppositeGenderNpcs(player.gender);
  const scored: CandidateInfo[] = candidates.map(npc => {
    const score = computeMatchScore(player, npc);
    const tier = classifyTier(score.score, player, npc);
    return { npcId: npc.id, tier, matchScore: score.score, reasons: score.reasons };
  });

  // 排序：高契合 > 反差 > 雷区 > 填充
  const tierOrder: Record<MatchTier, number> = {
    high_affinity: 0, contrast: 1, red_flag: 2, filler: 3,
  };
  scored.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.matchScore - a.matchScore);

  // 选出前 5 位
  return scored.slice(0, MATCHING_CONFIG.REQUIRED_COUNT);
}

interface ScoreResult { score: number; reasons: string[] }

function computeMatchScore(player: PlayerProfile, npc: NPC): ScoreResult {
  let score = 50; // 基准分
  const reasons: string[] = [];

  // 1. MBTI 补偿/互补（+/- 15）
  const mbtiBonus = computeMbtiCompatibility(player.mbti, npc.mbti);
  score += mbtiBonus;
  if (mbtiBonus > 5) reasons.push(`MBTI 互补 +${mbtiBonus}`);
  else if (mbtiBonus < -5) reasons.push(`MBTI 冲突 ${mbtiBonus}`);

  // 2. 依恋类型互动（+/- 10）
  const attachBonus = computeAttachmentInteraction(player.attachment, npc.attachment);
  score += attachBonus;
  reasons.push(`依恋互动 ${attachBonus >= 0 ? "+" : ""}${attachBonus}`);

  // 3. 特质匹配（每个匹配 +3）
  const traitMatches = player.weakAxes.filter(wa =>
    npc.traits.some(t => t.toLowerCase().includes(wa.toLowerCase()) ||
                         wa.toLowerCase().includes(t.toLowerCase()))
  ).length;
  score += traitMatches * 3;
  if (traitMatches > 0) reasons.push(`弱轴互补 +${traitMatches * 3}`);

  // 4. 雷区检测（每个命中 -8）
  const redFlagHits = npc.redFlags.filter(rf =>
    player.weakAxes.some(wa =>
      wa.toLowerCase().includes(rf.toLowerCase()) || rf.toLowerCase().includes(wa.toLowerCase())
    )
  ).length;
  score -= redFlagHits * 8;
  if (redFlagHits > 0) reasons.push(`⚠️ 雷区 -${redFlagHits * 8}`);

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function computeMbtiCompatibility(a: MBTI, b: MBTI): number {
  let bonus = 0;
  const pairs: [string, string, string][] = [
    [a[0]!, b[0]!, "EI"], [a[1]!, b[1]!, "SN"], [a[2]!, b[2]!, "TF"], [a[3]!, b[3]!, "JP"],
  ];
  pairs.forEach(([ca, cb, _axis]) => {
    if (ca === cb) bonus -= 2; // 相同偏内向减分（缺少火花）
    else bonus += 4; // 不同轴互补加分
  });
  return Math.max(-15, Math.min(15, bonus));
}

function computeAttachmentInteraction(a: AttachmentType, b: AttachmentType): number {
  const matrix: Record<AttachmentType, Record<AttachmentType, number>> = {
    secure:   { secure: 5, anxious: 3, avoidant: 2 },
    anxious:  { secure: 3, anxious: -4, avoidant: -8 },
    avoidant: { secure: 2, avoidant: -4, anxious: -8 },
  };
  return matrix[a]?.[b] ?? 0;
}

function classifyTier(score: number, _player: PlayerProfile, npc: NPC): MatchTier {
  if (score >= MATCHING_CONFIG.HIGH_AFFINITY_MIN) return "high_affinity";
  if (score >= MATCHING_CONFIG.CONTRAST_MIN) return "contrast";
  if (score <= MATCHING_CONFIG.RED_FLAG_MAX) return "red_flag";
  return "filler";
}

// ============================================================
// NPC 反应生成（占位 —— 后续接入 AI）
// ============================================================

const REACTION_TEMPLATES: Record<IntentType, Record<AttachmentType, string[]>> = {
  probe: {
    secure: ["嗯？你想了解什么。", "这个问题有点意思，说说你的想法。"],
    anxious: ["你怎么突然问这个……是有什么想法吗？", "（停顿了一下）你想知道多少？"],
    avoidant: ["这重要吗？", "为什么问这个。"],
  },
  advance: {
    secure: ["我也正想跟你多说说话。", "那我们多聊聊？"],
    anxious: ["真的吗……你不是在哄我吧？", "（眼睛亮了一下）你说真的？"],
    avoidant: ["太早了吧。", "别急着定义什么。"],
  },
  soothe: {
    secure: ["谢谢，我好多了。", "有你在我放心多了。"],
    anxious: ["你……你是唯一一个看出来的人。", "（眼眶微红）谢谢你。"],
    avoidant: ["我没那么脆弱。", "不用管我。"],
  },
  humor: {
    secure: ["哈哈哈 你也太会说了", "行啊，接得住你的梗"],
    anxious: ["（忍不住笑了）你这个人……", "好吧，你赢了这次"],
    avoidant: ["还行。", "……有点好笑。"],
  },
  adventure: {
    secure: ["走！我陪你。", "有意思，来吧！"],
    anxious: ["这……会不会太冒险了？", "但你如果要去的话……我跟上。"],
    avoidant: ["不去。", "你自己去吧。"],
  },
};

function generateNpcReaction(intent: IntentType, npc: NPC, _delta: number): string {
  const templates = REACTION_TEMPLATES[intent]?.[npc.attachment];
  if (!templates) return "...";
  return templates[Math.floor(Math.random() * templates.length)] ?? "...";
}

function getIcebergClueText(npc: NPC, clueLevel: number): string {
  const layers = ["surface", "role", "conflict", "core"];
  const layerNames = ["表现层", "角色层", "冲突层", "核心层"];
  const layer = layers[Math.min(clueLevel - 1, 3)]!;
  const text = npc.personality[layer as keyof IcebergPersonality];
  return `【${npc.name}的${layerNames[Math.min(clueLevel - 1, 3)]}】\n${typeof text === "string" ? text : text[0]}`;
}

// ============================================================
// §9 经济系统配置
// ============================================================

export const ECONOMY_CONFIG = {
  STARTING_POINTS: 50,
  DAILY_BONUS: 20,
  PEEK_COST: 100,
  INTRUDE_COST: 200,
  GUESS_GAME_REWARD: 30,
  FREE_PEEK_DAYS: [3] as number[],
  FREE_INTRUDE_DAYS: [5] as number[],
  VOTE_REWARD: 10,
} as const;

// ============================================================
// §3.7 心动投票配置
// ============================================================

export const VOTE_CONFIG = {
  DAILY_VOTE_LIMIT: 2,
  VOTE_VALUE: 5,
  REVOKE_PENALTY: 2,
  VOTE_REWARD: 10,
} as const;

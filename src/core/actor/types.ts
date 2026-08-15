/**
 * 演员层类型定义
 *
 * 核心红线：ActorOutput 中没有任何好感增减字段。Δ 由裁判层查表计算。
 */

import type { MBTI, AttachmentType } from "../types";

// ============================================================
// 人格数值向量（实时演化）
// ============================================================

/** 六维人格向量（0-1 浮点） */
export interface PersonalityVector {
  npcId: string;
  /** 主动性：多大概率主动发起对话/行动 */
  initiative: number;
  /** 嫉妒敏感度：看到玩家对别人好时多大反应 */
  jealousySensitivity: number;
  /** 自我暴露阈值：好感需达多少才愿说心里话（越高越难敞开） */
  exposureThreshold: number;
  /** 冲突倾向：遇到分歧时是正面刚还是回避 */
  conflictTendency: number;
  /** 幽默倾向：用笑话化解尴尬的频率 */
  humorTendency: number;
  /** 话量：说长句还是短句 */
  verbosity: number;
  /** 演化追踪（本轮变化量） */
  _deltas: Partial<Record<PersonalityVectorKey, number>>;
}

/** 人格向量键名联合类型 */
export type PersonalityVectorKey =
  | "initiative"
  | "jealousySensitivity"
  | "exposureThreshold"
  | "conflictTendency"
  | "humorTendency"
  | "verbosity";

// ============================================================
// 演员输出（结构化意图 + 台词）
// ============================================================

/** 演员意图（不含数值，仅标签） */
export interface ActorIntent {
  type: ActorIntentType;
  /** 意图指向对象 ID（npcId | "player" | "group"） */
  target: string;
  /** 话题关键词 */
  topic: string;
  /** 意图强度 */
  intensity: "low" | "medium" | "high";
  /** 是否为对上一句话的被动反应 */
  isReactive: boolean;
}

/** 演员意图类型（扩展自原 IntentType，增加 4 种） */
export type ActorIntentType =
  | "probe"     // 试探
  | "advance"   // 推进
  | "soothe"    // 安抚
  | "humor"     // 幽默
  | "adventure" // 冒险
  | "defend"    // 防御
  | "retreat"   // 撤退
  | "observe"   // 观察
  | "tease";    // 调侃

/** 情绪标签 */
export type EmotionTag =
  | "neutral"
  | "curious"
  | "happy"
  | "amused"
  | "vulnerable"
  | "defensive"
  | "jealous"
  | "moved"
  | "flustered"
  | "cold";

/** 演员输出（核心数据结构） */
export interface ActorOutput {
  /** NPC ID 或 "player" */
  npcId: string;
  /** 台词文本 */
  line: string;
  /** 括号内动作/神情描述 */
  action?: string;
  /** 结构化意图（不含好感值） */
  intent: ActorIntent;
  /** 情绪标签 */
  emotionTag: EmotionTag;
  /** 微反应文本（未发言 NPC 专用） */
  microAction?: string;
}

// ============================================================
// 文字人格契约
// ============================================================

/** 文字契约：每个 NPC 的说话风格约束 */
export interface TextContract {
  npcId: string;
  /** 说话特点（如"短句、不主动、语尾常停顿"） */
  speechStyle: string;
  /** 口头禅 */
  catchphrases: string[];
  /** 不能说的话（信息隔离 + 人格红线） */
  forbiddenPhrases: string[];
  /** 可用语气范围 */
  toneRange: EmotionTag[];
  /** 句长范围 [min, max] */
  sentenceLengthRange: [number, number];
}

// ============================================================
// 演员上下文
// ============================================================

/** 演员上下文（信息隔离后的） */
export interface ActorContext {
  npcId: string;
  /** 人格数值向量 */
  personality: PersonalityVector;
  /** 文字人格契约 */
  textContract: TextContract;
  /** 仅可见事件（经 audience 过滤） */
  visibleEvents: import("../state/worldTypes").WorldEventLog;
  /** 导演指令 */
  directorCtx: import("../director/types").DirectorContext;
  /** 对玩家好感 0-100 */
  relationshipToPlayer: number;
  /** 对其他 NPC 好感 */
  relationshipsToNpcs: Record<string, number>;
}

// ============================================================
// 人格演化触发器
// ============================================================

export type EvolutionTriggerType =
  | "rejected"
  | "affirmed"
  | "jealousy_event"
  | "deep_exposure"
  | "conflict_won"
  | "conflict_lost"
  | "humor_success"
  | "humor_fail"
  | "observed_rivalry"
  | "trusted_by_player";

// ============================================================
// 依赖向量推导的静态映射
// ============================================================

/** 依恋类型 → 基础向量 */
export const ATTACHMENT_BASE_VECTORS: Record<
  AttachmentType,
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

/** MBTI → 向量修正 */
export const MBTI_VECTOR_MODIFIERS: Partial<
  Record<MBTI, Partial<Record<PersonalityVectorKey, number>>>
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

/** 人格演化规则 */
export const EVOLUTION_RULES: Record<
  EvolutionTriggerType,
  Partial<Record<PersonalityVectorKey, number>>
> = {
  rejected: { initiative: -0.03, exposureThreshold: +0.02 },
  affirmed: { initiative: +0.02, exposureThreshold: -0.02 },
  jealousy_event: { jealousySensitivity: +0.04, conflictTendency: +0.02, verbosity: +0.03 },
  deep_exposure: { exposureThreshold: -0.03, initiative: +0.01, jealousySensitivity: -0.01 },
  conflict_won: { conflictTendency: +0.02, initiative: +0.01 },
  conflict_lost: { conflictTendency: -0.01, verbosity: -0.02, initiative: -0.02 },
  humor_success: { humorTendency: +0.03, verbosity: +0.01 },
  humor_fail: { humorTendency: -0.02, verbosity: -0.01 },
  observed_rivalry: { jealousySensitivity: +0.03, conflictTendency: +0.01 },
  trusted_by_player: { exposureThreshold: -0.04, initiative: +0.02 },
};

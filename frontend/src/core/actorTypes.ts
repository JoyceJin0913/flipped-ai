/**
 * 演员层类型定义（纯类型移植版）
 *
 * 从 src/core/actor/types.ts 移植，仅保留零依赖纯类型：
 *   - PersonalityVector / PersonalityVectorKey
 *   - ActorIntent / ActorIntentType / ActorOutput / EmotionTag
 *   - TextContract
 *
 * 裁剪决策：
 *   - ActorContext 引用了 director 的 DirectorContext 与 state 的 WorldEventLog，未移植
 *   - EvolutionTriggerType / EVOLUTION_RULES 属于人格演化层，未移植（后续按需搬运）
 *   - ATTACHMENT_BASE_VECTORS / MBTI_VECTOR_MODIFIERS 已移至 ../personalityVector.ts
 *
 * 核心红线：ActorOutput 中没有任何好感增减字段。Δ 由裁判层查表计算。
 */

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
  | "probe" // 试探
  | "advance" // 推进
  | "soothe" // 安抚
  | "humor" // 幽默
  | "adventure" // 冒险
  | "defend" // 防御
  | "retreat" // 撤退
  | "observe" // 观察
  | "tease"; // 调侃

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

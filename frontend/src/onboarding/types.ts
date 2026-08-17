/**
 * PRD §4 全局类型定义
 * 心动岛（Heart Signal Island）AI 恋综游戏 —— 唯一类型口径源
 *
 * 本文件是全部模块共用的类型契约。
 * 任何新增/修改类型必须同步更新此文件，禁止在业务代码中内联定义。
 */

// ============================================================
// §4.1 玩家档案
// ============================================================

/** 玩家性别，决定 NPC 池和竞争者构成 */
export type PlayerGender = "male" | "female";

/** MBTI 十六型（完整枚举） */
export type MBTI =
  | "INTJ"
  | "INTP"
  | "ENTJ"
  | "ENTP"
  | "INFJ"
  | "INFP"
  | "ENFJ"
  | "ENFP"
  | "ISTJ"
  | "ISFJ"
  | "ESTJ"
  | "ESFJ"
  | "ISTP"
  | "ISFP"
  | "ESTP"
  | "ESFP";

/** 十二星座 */
export type Zodiac =
  | "aries"
  | "taurus"
  | "gemini"
  | "cancer"
  | "leo"
  | "virgo"
  | "libra"
  | "scorpio"
  | "sagittarius"
  | "capricorn"
  | "aquarius"
  | "pisces";

/** 依恋类型（§12.1 判定结果） */
export type AttachmentType = "secure" | "anxious" | "avoidant";

/** 玩家档案 */
export interface PlayerProfile {
  name: string;
  gender: PlayerGender;
  age?: number; // 年龄（18-32），可选以兼容旧存档
  mbti: MBTI;
  zodiac: Zodiac;
  attachment: AttachmentType;
  weakAxes: string[]; // MBTI 平局轴（反差池钩子）
}

// ============================================================
// §4.2 冰山四层人格模型
// ============================================================

/** NPC 冰山四层人格 */
export interface IcebergPersonality {
  /** L1 表现层：外在行为模式、第一印象标签 */
  surface: string[];
  /** L2 角色层：社交面具、小屋人设定位 */
  role: string;
  /** L3 冲突层：核心矛盾、触发雷区、情绪开关 */
  conflict: string;
  /** L4 核心层：真实自我、深层恐惧与渴望 */
  core: string;
}

/** NPC 完整角色卡 */
export interface NPC {
  id: string;
  name: string;
  gender: "male" | "female"; // 相对于玩家的异性
  age: number;
  mbti: MBTI;
  zodiac: Zodiac;
  attachment: AttachmentType;
  avatar?: string; // 头像 URL
  personality: IcebergPersonality;

  // 匹配度计算用
  traits: string[]; // 表面特质标签
  redFlags: string[]; // 雷区关键词
  coreNeeds: string[]; // 核心需求（命中+2）

  // 可执行人格契约（人格保真度规范 §2）
  styleContract?: StyleContract;
  // 依恋类型硬规则（人格保真度规范 §2）
  attachmentRules?: AttachmentRules;
}

/** 可执行风格契约 —— 把形容词翻译成可断言的行为规则 */
export interface StyleContract {
  /** 每轮最大字数 */
  maxCharsPerTurn: number;
  /** 每轮最大句数 */
  maxSentencesPerTurn: number;
  /** 省略号最低使用频率（0-1） */
  ellipsisFrequencyMin?: number;
  /** 禁用标点 */
  bannedPunctuation: string[];
  /** 禁用词 */
  bannedWords: string[];
  /** 禁用句式（正则模式） */
  bannedPatterns: string[];
  /** 签名用词（口癖） */
  signatureTokens: string[];
}

/** 依恋类型硬规则 —— 可执行的行为约束 */
export interface AttachmentRules {
  /** 被示好时的首次反应 */
  onBeingCourted?: {
    firstTimeMustBe: string[]; // 首次必须使用的 act 类型
    note?: string;
  };
  /** 允许的行为类型 */
  allowedActs: string[];
  /** 禁止的行为类型 */
  forbiddenActs: string[];
  /** 冰山层级解锁的好感阈值 */
  exposureGate: {
    L1: number;
    L2: number;
    L3: number;
    L4: number;
  };
}

// ============================================================
// §4.3 关系状态机
// ============================================================

/** 关系阶段（§12.3 阶段系数对应） */
export type RelationshipStage =
  | "stranger" // 0-20: 陌生人
  | "icebreak" // 21-45: 破冰
  | "flirt" // 46-70: 暧昧
  | "crush"; // 71-100: 心动

export const STAGE_THRESHOLDS: Record<RelationshipStage, [number, number]> = {
  stranger: [0, 20],
  icebreak: [21, 45],
  flirt: [46, 70],
  crush: [71, 100],
};

/** 单对关系状态 */
export interface Relationship {
  npcId: string;
  heartValue: number; // 0-100 心动值
  stage: RelationshipStage;
  interactionCount: number;
  lastInteractionAct: ActKey | null;
  icebergCluesUnlocked: number; // 已解锁的冰山线索数 (0-4)
  moments: HeartMoment[]; // 心动瞬间记录
}

/** 心动瞬间 */
export interface HeartMoment {
  day: number;
  time: string;
  place: string;
  text: string;
  delta: number; // 正=加分 负=扣分
  intent?: IntentType; // 触发意图
}

// ============================================================
// §4.4 日循环 / 三幕节奏
// ============================================================

export type ActKey = "daytime" | "private_chat" | "solo_review";

export const ACT_ORDER: ActKey[] = ["daytime", "private_chat", "solo_review"];

export interface DayCycleState {
  currentDay: number; // 1-7
  currentAct: ActKey;
  actCompleted: Record<number, Partial<Record<ActKey, boolean>>>;
  chattedToday: string[]; // 今日已聊天的 NPC ID 列表
  remainingVotes: number; // 今日剩余心动票
  events: GameEvent[]; // 今日事件日志
}

/** 游戏事件（公共/私密） */
export interface GameEvent {
  id: string;
  day: number;
  act: ActKey;
  type: "public" | "private";
  timestamp: string; // 如 "20:37"
  title: string;
  description: string;
  participants?: string[];
  effects?: { target: string; delta: number }[];
}

// ============================================================
// §4.5 五类对话意图
// ============================================================

export type IntentType = "probe" | "advance" | "soothe" | "humor" | "adventure";

export const INTENT_LABELS: Record<IntentType, string> = {
  probe: "试探",
  advance: "推进",
  soothe: "安抚",
  humor: "幽默",
  adventure: "冒险",
};

export const INTENT_COLORS: Record<IntentType, string> = {
  probe: "text-blue-400",
  advance: "text-red-400",
  soothe: "text-green-400",
  humor: "text-yellow-400",
  adventure: "text-purple-400",
};

// ============================================================
// §4.6 场景 & 阶段
// ============================================================

export type SceneKey = "private_day" | "private_night" | "public_chat" | "public_date";

export type StageKey = "stranger" | "icebreak" | "flirt" | "crush";

// ============================================================
// §4.7 经济系统
// ============================================================

export interface EconomyState {
  points: number; // 心动点数
  peekCoupons: number; // 偷看券
  intrudeCoupons: number; // 闯入券
  freePeekGrantedOn: number[]; // 免费偷看发放日期
  freeIntrudeGrantedOn: number[]; // 免费闯入发放日期
}

// ============================================================
// §4.8 测试相关
// ============================================================

export interface MbtiOption {
  label: string;
  score: Partial<Record<string, number>>;
}

export interface MbtiQuestion {
  q: number;
  axis: string;
  A: MbtiOption;
  B: MbtiOption;
}

export interface AttachmentQuestion {
  q: number;
  title: string;
  anx: string;
  avo: string;
  safe: string;
}

export interface TestResult {
  mbti: MBTI;
  attachment: AttachmentType;
  weakAxes: string[];
  raw: { anx: number; avo: number; axes: Record<string, number> };
}

// ============================================================
// §4.9 匹配池
// ============================================================

export type MatchTier = "high_affinity" | "contrast" | "red_flag" | "filler";

export interface CandidateInfo {
  npcId: string;
  tier: MatchTier;
  matchScore: number;
  reasons: string[];
}

// ============================================================
// §4.10 判定引擎输入输出
// ============================================================

export interface ResolveInput {
  intent: IntentType;
  npcId: string;
  scene: SceneKey;
  isNight: boolean;
  isInitiator: boolean; // true=主动(扣1行动力) false=被动(0)
}

export interface ResolveResult {
  delta: number;
  newStage: RelationshipStage;
  unlocksIcebergClue: boolean;
  clueText?: string;
  npcReaction: string;
  breakdown: {
    base: number;
    sceneMult: number;
    stageMult: number;
    nightBonus: number;
    coreNeedBonus: number;
  };
}

// ============================================================
// §4.11 心动投票
// ============================================================

export interface HeartVote {
  day: number;
  targetId: string;
  isRevoke: boolean; // 是否为撤回操作
  revokedPreviousTarget?: string; // 撤回前的目标
}

// ============================================================
// §4.12 游戏阶段（路由级）
// ============================================================

export type GamePhase =
  | "profile_setup" // 建档案
  | "personality_test" // 人格测试
  | "matching" // 8选5
  | "intro" // 开场动画
  | "day_loop" // 日循环主玩法
  | "finale" // 终选之夜
  | "review"; // 复盘画像

// ============================================================
// §4.13 辅助类型
// ============================================================

/** 性别（用于成员列表） */
export type Gender = "m" | "f";

/** 选择项（事件选择） */
export interface Choice {
  key: "A" | "B" | "C";
  label: string;
  result: string;
  effects: { name: string; delta: number }[];
}

/** 场景事件 */
export interface Scene {
  id: string;
  place: string;
  time: string;
  title: string;
  image?: string;
  core?: boolean;
  observe?: boolean;
  outcome?: string;
  dialogue: { who: string; line: string }[];
  question: string;
  hint: string;
  choices: Choice[];
}

/** 热点标注 */
export interface Hotspot {
  sceneId: string;
  label: string;
  top: string;
  left: string;
}

/** 成员信息 */
export interface Member {
  name: string;
  gender: Gender;
  where: string;
  top: string;
  left: string;
  avatar?: string;
}

/** 心动档案 */
export interface Affinity {
  name: string;
  value: number;
  status: string;
  moments: HeartMoment[];
}

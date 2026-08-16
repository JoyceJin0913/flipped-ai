/**
 * 世界状态类型定义
 *
 * 状态层是唯一真相源：事件日志、关系矩阵、特质向量、解锁层级
 * 所有层都从这里读取状态，但只有裁判层通过 store 更新数值
 */

import type { ActKey, Relationship } from "../types";
import type { PersonalityVector, TextContract, EmotionTag } from "../actor/types";
import type { TensionState, BeatProgress } from "../director/types";

// ============================================================
// 世界事件日志（append-only）
// ============================================================

/** 全局事件日志 */
export interface WorldEventLog {
  events: WorldEvent[];
}

/** 世界事件 */
export interface WorldEvent {
  /** 事件 ID */
  id: string;
  /** 天数 */
  day: number;
  /** 幕 */
  act: ActKey;
  /** 时间戳 */
  timestamp: string;
  /** 事件类型 */
  type: "public" | "private" | "internal";
  /** 事件描述 */
  description: string;
  /** 参与 NPC ID 列表 */
  participants: string[];
  /** 可见范围 NPC ID 列表（信息隔离核心） */
  audience: string[];
  /** 意图标签 */
  intentTag?: string;
  /** 情绪标签 */
  emotionTag?: EmotionTag;
  /** 关联节拍 ID */
  beatRef?: string;
  /** 台词文本（如有） */
  line?: string;
  /** 动作描述（如有） */
  action?: string;
}

// ============================================================
// NPC↔NPC 关系矩阵
// ============================================================

/** 单向关系条目 */
export interface NpcRelation {
  /** 主体 NPC ID */
  from: string;
  /** 客体 NPC ID */
  to: string;
  /** 好感 0-100（初始 50） */
  affinity: number;
  /** 敌意 0-100（初始 0） */
  hostility: number;
  /** 竞争度 0-100（争夺同一玩家时上升） */
  rivalry: number;
  /** 上次互动天数 */
  lastInteractionDay: number;
  /** 互动次数 */
  interactionCount: number;
  /** 相关事件 ID 列表 */
  events: string[];
}

/** 关系矩阵：from → to → relation */
export type RelationMatrix = Record<string, Record<string, NpcRelation>>;

// ============================================================
// 世界状态（唯一真相源）
// ============================================================

/** 世界状态 */
export interface WorldState {
  /** 当前天数 */
  day: number;
  /** 当前幕 */
  act: ActKey;
  /** 张力状态 */
  tension: TensionState;
  /** 全局事件日志 */
  eventLog: WorldEventLog;
  /** NPC↔NPC 关系矩阵 */
  relations: RelationMatrix;
  /** 玩家→NPC 关系（保留原 Relationship 结构） */
  playerRelations: Record<string, Relationship>;
  /** 各 NPC 的人格向量 */
  personalityVectors: Record<string, PersonalityVector>;
  /** 各 NPC 的文字契约 */
  textContracts: Record<string, TextContract>;
  /** 节拍进度 */
  beatProgress: BeatProgress;
  /** v1.1：跨天事实引用表（factKey → fact） */
  worldFacts: WorldFacts;
}

// ============================================================
// v1.1：跨天事实（§2.4 factKey 落地）
// ============================================================

/** 单条跨天事实 */
export interface WorldFact {
  /** 事实键（如 "day1_first_speaker"） */
  key: string;
  /** 写入天数 */
  day: number;
  /** 来源 beat id */
  beatId: string;
  /** 事实值描述 */
  value: string;
  /** 是否已确认 */
  confirmed: boolean;
}

/** 事实表：key → fact */
export type WorldFacts = Record<string, WorldFact>;

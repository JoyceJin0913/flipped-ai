/**
 * 世界状态类型定义（移植裁剪版）
 *
 * 从 src/core/state/worldTypes.ts 移植。
 *
 * 裁剪决策：
 *   - WorldEventLog / WorldEvent / WorldFact / WorldFacts 为纯类型，已搬运
 *   - NpcRelation / RelationMatrix / WorldState 未搬运（依赖 director 的
 *     TensionState / BeatProgress，属于导演层引用，本移植版暂不引入）
 *   - ActKey 类型改为从 @/onboarding/types 引入
 */

import type { ActKey } from "@/onboarding/types";
import type { EmotionTag } from "./actorTypes";

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

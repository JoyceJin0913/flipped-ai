/**
 * 导演层类型定义
 *
 * 导演层职责：决定"本幕必须发生什么节拍"、谁有发言权、张力调节、收场判定
 * 导演层不写任何一句台词
 */

import type { ActKey } from "../types";
import type { EmotionTag } from "../actor/types";
import type { BeatV1Ext } from "./beatTypes";

// ============================================================
// 节拍系统
// ============================================================

/** 节拍类型 */
export type BeatType =
  | "opening"         // 开场旁白
  | "trigger"         // 触发发言
  | "dialogue"        // NPC 发言轮
  | "micro_reaction"  // 微反应轮
  | "player_choice"   // 玩家决策
  | "resolution"      // 收场旁白
  | "ending";         // 结局

/** 节拍定义 */
export interface Beat {
  type: BeatType;
  /** 可发言 NPC 候选 ID */
  speakerCandidates: string[];
  /** 本节拍主题 */
  topic?: string;
  /** 目标张力 0-100 */
  tensionTarget: number;
  /** 最少需要几位发言 */
  minSpeakers: number;
  /** 最多几位 */
  maxSpeakers: number;
  /** 必须包含的 NPC */
  mustInclude?: string[];
  /** 是否需要玩家决策 */
  playerChoiceRequired: boolean;
  /** 节拍 ID */
  id: string;
}

// ============================================================
// 场景蓝图
// ============================================================

/** 场景蓝图（导演层的核心产出） */
export interface SceneBlueprint {
  day: number;
  act: "daytime" | "private_chat";
  sceneId: string;
  title: string;
  location: string;
  atmosphere: string;
  /** 节拍序列（v1.1：扩展为 Beat & BeatV1Ext） */
  beats: (Beat & BeatV1Ext)[];
  /** 降级到 v1.0 固定脚本的 ID */
  fallbackScriptId?: string;
}

// ============================================================
// 发言权竞价
// ============================================================

/** 发言权竞价结果 */
export interface BiddingResult {
  /** 获得发言权的 NPC（Top N） */
  speakers: string[];
  /** 走微反应的 NPC */
  microReactors: string[];
  /** 所有 NPC 的 desire 分数 */
  scores: Record<string, number>;
  /** 分池明细（仅 runBiddingSplitPool 填充） */
  poolBreakdown?: {
    /** 异性池入选发言者（Top 2） */
    oppositeSexSpeakers: string[];
    /** 同性池入选发言者（Top 1） */
    sameSexSpeakers: string[];
  };
}

// ============================================================
// 场景上下文
// ============================================================

/** 场景回合记录 */
export interface SceneTurn {
  npcId: string;
  line: string;
  action?: string;
  intentType: string;
  emotionTag: EmotionTag;
  isMicroReaction: boolean;
}

/** 场景上下文（导演传递给演员） */
export interface DirectorContext {
  /** 当前节拍 */
  beat: Beat;
  /** 当前发言者 ID */
  speakerId: string;
  /** 话题 */
  topic: string;
  /** 张力等级 0-100 */
  tensionLevel: number;
  /** 已发生的发言序列 */
  sceneHistory: SceneTurn[];
  /** 信息可见范围 */
  audienceFilter: string[];
  /** 反应对象（如果是被动反应） */
  reactTo?: import("../actor/types").ActorOutput;
  /** 当前天数 */
  day: number;
}

// ============================================================
// 张力状态
// ============================================================

/** 张力状态 */
export interface TensionState {
  /** 当前张力 0-100 */
  current: number;
  /** 趋势 */
  trend: "rising" | "stable" | "falling";
  /** 上一轮变化量 */
  lastDelta: number;
}

// ============================================================
// 节拍进度
// ============================================================

/** 节拍进度追踪 */
export interface BeatProgress {
  /** 当前节拍索引 */
  beatIndex: number;
  /** 已发言的 NPC 集合 */
  allSpeakers: string[];
  /** 各 NPC 连续沉默轮数 */
  silenceMap: Record<string, number>;
  /** 各 NPC 发言冷却轮数 */
  cooldownMap: Record<string, number>;
  /** 场景回合记录 */
  turns: SceneTurn[];
}

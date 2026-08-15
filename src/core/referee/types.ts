/**
 * 裁判层类型定义
 *
 * 裁判层职责：好感 Δ 结算、人格一致性校验、越权拦截、内容安全审核
 * 裁判层不生成任何内容，只做数学运算和规则校验
 */

import type { ActorOutput, PersonalityVector, TextContract } from "../actor/types";
import type { RelationshipStage } from "../types";
import type { SceneTurn } from "../director/types";

// ============================================================
// 结算请求与结果
// ============================================================

/** 结算请求 */
export interface SettlementRequest {
  /** 演员输出 */
  actorOutput: ActorOutput;
  /** 被影响的 NPC ID */
  targetNpcId: string;
  /** 当前心动值 */
  currentHeart: number;
  /** 场景类型 */
  scene: string;
  /** 关系阶段 */
  relationshipStage: RelationshipStage;
  /** 人格向量（用于修正） */
  personalityVector: PersonalityVector;
}

/** 结算结果 */
export interface SettlementResult {
  /** 好感变化量 */
  delta: number;
  /** 新心动值 */
  newHeartValue: number;
  /** 新关系阶段 */
  newStage: RelationshipStage;
  /** 是否解锁冰山线索 */
  unlocksIcebergClue: boolean;
  /** 冰山线索文本 */
  clueText?: string;
  /** 结算明细 */
  breakdown: SettlementBreakdown;
  /** 越权拦截记录 */
  violations: RefereeViolation[];
}

/** 结算明细 */
export interface SettlementBreakdown {
  /** 基础值（查表） */
  base: number;
  /** 人格向量修正 */
  personalityMod: number;
  /** 场景系数 */
  sceneMult: number;
  /** 阶段系数 */
  stageMult: number;
  /** 核心需求命中奖励 */
  coreNeedBonus: number;
}

// ============================================================
// 越权违规
// ============================================================

/** 裁判层违规类型 */
export interface RefereeViolation {
  type: RefereeViolationType;
  /** 违规详情 */
  detail: string;
  /** 严重程度：warn=警告但放行，block=拦截并要求重新生成 */
  severity: "warn" | "block";
}

/** 违规类型枚举 */
export type RefereeViolationType =
  | "overscore"           // 演员输出了好感值
  | "forbidden_phrase"    // 台词包含禁用短语
  | "info_leak"           // 信息泄露（引用了不该知道的事）
  | "personality_break";  // 人格一致性破裂

// ============================================================
// 校验请求
// ============================================================

/** 人格一致性校验请求 */
export interface ConsistencyCheckRequest {
  output: ActorOutput;
  pv: PersonalityVector;
  contract: TextContract;
  /** NPC ID，用于查询 StyleContract / AttachmentRules（人格保真度规范 §5） */
  npcId?: string;
  /** 当前对该 NPC 的好感值（0-100），用于检查 exposureGate */
  currentHeartValue?: number;
  /** 本场景历史回合，用于判断是否"首次被示好"（空表示首次） */
  sceneHistory?: SceneTurn[];
}

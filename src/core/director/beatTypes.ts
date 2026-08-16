/**
 * v1.1 Beat 扩展类型
 *
 * 基于 PRD v1.1 §2.4，为现有 Beat 接口补充：
 *   - narrativeInvariant（叙事不变量）
 *   - trigger.ladder（三级降级：natural → forced → narration）
 *   - outcomes（结果收敛）
 *   - factKey（跨天事实引用键）
 *   - playerRole（玩家在 beat 中的角色）
 *
 * 设计：全部可选，通过 Beat & BeatV1Ext 组合，向后兼容 v1.0 Beat。
 */

// ============================================================
// 三级降级阶梯（§2.4.2 trigger.ladder）
// ============================================================

export type TriggerLadder = "natural" | "forced" | "narration";

/** forced 模式挑人条件（禁止写死 npcId，§2.4.2） */
export interface ForcedSelector {
  /** 挑人谓词 */
  predicate:
    | "highest_affinity"    // 对玩家好感最高
    | "lowest_affinity"    // 对玩家好感最低
    | "highest_initiative" // 人格主动性最高
    | "silent_longest"     // 沉默最久
    | "specific_trait";    // 具备某特质
  /** specific_trait 时的特质值 */
  traitValue?: string;
  /** 没人满足时的兜底候选池（仍按谓词二次筛选，非写死 npcId） */
  fallbackPool?: "all" | "opposite_sex" | "same_sex";
}

/** beat 触发定义 */
export interface BeatTrigger {
  /** 降级阶梯类型 */
  ladder: TriggerLadder;
  /** forced 时必填：挑人条件 */
  forcedSelector?: ForcedSelector;
  /** narration 时的旁白文本 */
  narrationText?: string;
  /** natural 模式的预算轮数（超过则降级到 forced） */
  budgetRounds?: number;
}

// ============================================================
// 玩家角色（§2.4.5 playerRole）
// ============================================================

export type PlayerRole = "decider" | "participant" | "observer";

// ============================================================
// 结果收敛（§2.4.3 outcomes）
// ============================================================

/** 事实写入指令（factKey 跨天引用，§2.4.4） */
export interface WorldFactWrite {
  /** 唯一事实键，如 "day1_first_speaker" */
  key: string;
  /** 事实值描述 */
  value: string;
  /** 是否标记为已确认（默认 true） */
  confirmed?: boolean;
}

/** 单个结果（§2.4.3 outcomes） */
export interface BeatOutcome {
  /** 结果 ID */
  id: string;
  /** 结果文案描述 */
  description: string;
  /** 是否默认兜底（整个 outcomes 恰好 1 个 isDefault=true） */
  isDefault: boolean;
  /** 触发条件表达式（非默认项必填；空=始终命中） */
  condition?: string;
  /** 该结果写入 worldFacts 的事实 */
  factsToWrite?: WorldFactWrite[];
  /** 张力调整 */
  tensionDelta?: number;
}

// ============================================================
// v1.1 Beat 扩展接口
// ============================================================

/** v1.1 Beat 扩展（全部可选，向后兼容 v1.0） */
export interface BeatV1Ext {
  /** 叙事不变量：beat 结束后必然成立的断言（可判定，非情绪） */
  narrativeInvariant?: string;
  /** 触发降级阶梯 */
  trigger?: BeatTrigger;
  /** 结果收敛列表（≥2 个，恰好 1 个 isDefault） */
  outcomes?: BeatOutcome[];
  /** 跨天事实引用键 */
  factKey?: string;
  /** 玩家在本 beat 的角色 */
  playerRole?: PlayerRole;
}

/** v1.1 Beat = 原 Beat + v1.1 扩展 */
export type BeatV11 = import("./types").Beat & BeatV1Ext;

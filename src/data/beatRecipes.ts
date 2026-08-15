/**
 * 7 天 Beat 配方数据（v1.1）
 *
 * 承载 v1.1 五字段（narrativeInvariant / trigger.ladder / outcomes / factKey / playerRole）。
 * 与 eventScripts.ts（氛围/旁白）分工：这里只管"必然发生什么事实"。
 *
 * key = beat.id（由 generateBlueprint 生成的 beat ID 格式：day{N}-{act}-beat-{M}）
 */

import type { BeatV1Ext } from "../core/director/beatTypes";

/** 单个 beat 的 v1.1 扩展配方，key = beat.id */
export type BeatRecipeMap = Record<string, BeatV1Ext>;

/**
 * Day1-7 配方表（按 beatId 索引）
 *
 * 目前填充 Day1 的关键 beat 做联调，Day2-7 按需补全。
 * 缺失的 beatId 走 v1.0 行为（无 invariant / 无 trigger / 无 outcomes）。
 */
export const BEAT_RECIPES: BeatRecipeMap = {
  // ================================================================
  // Day 1 · 早餐桌上的沉默
  // ================================================================

  // b1: 开场旁白 —— observer
  "day1-daytime-beat-0": {
    narrativeInvariant: "所有 NPC 已抵达小屋，早餐场景已建立",
    playerRole: "observer",
    trigger: {
      ladder: "narration",
      narrationText: "清晨的小屋很安静。厨房飘来咖啡的香气，大家陆续走出来。",
    },
  },

  // b2: trigger beat —— 自然竞价破冰，若失败降级 forced 挑主动性最高者
  "day1-daytime-beat-1": {
    narrativeInvariant: "至少 1 位 NPC 已对玩家开口发言",
    trigger: {
      ladder: "natural",
      budgetRounds: 2,
      forcedSelector: { predicate: "highest_initiative", fallbackPool: "all" },
    },
    factKey: "day1_first_speaker",
    playerRole: "observer",
    outcomes: [
      {
        id: "o_silence_broken",
        description: "沉默被打破：至少一位 NPC 主动开口",
        isDefault: false,
        condition: "any_speaker",
        factsToWrite: [{ key: "day1_first_speaker", value: "broken" }],
      },
      {
        id: "o_still_silent",
        description: "仍无人开口（兜底：forced 或 narration 兜住）",
        isDefault: true,
        factsToWrite: [{ key: "day1_first_speaker", value: "unbroken" }],
        tensionDelta: 5,
      },
    ],
  },

  // b3: dialogue beat —— participant
  "day1-daytime-beat-2": {
    narrativeInvariant: "至少 2 位 NPC 已参与对话",
    playerRole: "participant",
    trigger: {
      ladder: "natural",
      budgetRounds: 2,
      forcedSelector: { predicate: "silent_longest", fallbackPool: "all" },
    },
  },

  // b4: player_choice —— decider
  "day1-daytime-beat-3": {
    narrativeInvariant: "玩家已做出当日公共事件的首次表态",
    playerRole: "decider",
    factKey: "day1_player_stance",
    outcomes: [
      {
        id: "o_advance",
        description: "玩家主动推进话题",
        isDefault: false,
        condition: "player_intent == advance",
        factsToWrite: [{ key: "day1_player_stance", value: "advance" }],
        tensionDelta: 5,
      },
      {
        id: "o_observe",
        description: "玩家选择观察（兜底）",
        isDefault: true,
        factsToWrite: [{ key: "day1_player_stance", value: "observe" }],
      },
    ],
  },

  // b5: resolution beat —— observer
  "day1-daytime-beat-4": {
    narrativeInvariant: "Day 1 早餐场景已结束，各 NPC 的初步印象已形成",
    playerRole: "observer",
    trigger: {
      ladder: "narration",
      narrationText: "早餐渐渐吃完，大家各自散去。第一天的早晨就这样过去了。",
    },
  },

  // ================================================================
  // Day 2-7 · 待补全（按需参照 Day1 格式添加）
  // ================================================================
};

/** 取某 beat 的 v1.1 扩展（无则返回空对象，走 v1.0 行为） */
export function getBeatRecipe(beatId: string): BeatV1Ext {
  return BEAT_RECIPES[beatId] ?? {};
}

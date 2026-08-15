/**
 * OptionBuilder 配方数据
 *
 * 按 day 索引的玩家选项配方（替代 PublicEventScene 硬编码 3 选项）。
 * 策划写配方不写成品的选项，同一 (state, seed) 必产出同一组选项。
 *
 * 四槽位模型（§3.6）：
 *   A_advance：推进槽 —— 主动推进关系
 *   B_divert：转移槽 —— 把注意力转向别人
 *   C_avoid：回避槽 —— 不接招、保持距离
 *   D_risk：风险槽 —— 大胆冒险
 */

import type { OptionRecipe } from "../core/director/optionBuilder";

/** 按 day 索引的玩家选项配方 */
export const OPTION_RECIPES: Record<number, OptionRecipe> = {
  // ================================================================
  // Day 1 · 早餐桌上的沉默（低张力、破冰期）
  // ================================================================
  1: {
    id: "day1_public_choice",
    day: 1,
    dedupeAB: true,
    slots: [
      {
        slot: "A_advance",
        enabled: "true",
        disabledReason: "好感太低，现在表态有些突兀",
        variants: [
          {
            when: "tension < 40",
            text: "我想多了解{{npc.name}}一些",
            intentType: "probe",
            riskLevel: "moderate",
          },
          {
            when: "tension >= 40",
            text: "刚才{{npc.name}}说的话我一直在想",
            intentType: "advance",
            riskLevel: "moderate",
          },
        ],
        fallbackVariant: {
          when: "",
          text: "主动和{{npc.name}}搭话",
          intentType: "advance",
          riskLevel: "moderate",
        },
      },
      {
        slot: "B_divert",
        enabled: "true",
        variants: [
          {
            when: "day == 1",
            text: "今天这气氛比我预想的有趣多了",
            intentType: "humor",
            riskLevel: "safe",
          },
        ],
        fallbackVariant: {
          when: "",
          text: "聊点别的轻松一下吧",
          intentType: "humor",
          riskLevel: "safe",
        },
      },
      {
        slot: "C_avoid",
        enabled: "true",
        variants: [
          {
            when: "",
            text: "我先看看大家怎么聊",
            intentType: "observe",
            riskLevel: "safe",
          },
        ],
        fallbackVariant: {
          when: "",
          text: "我先看看大家怎么聊",
          intentType: "observe",
          riskLevel: "safe",
        },
      },
      {
        slot: "D_risk",
        enabled: "tension > 50",
        disabledReason: "气氛还不到冒险的时候",
        variants: [
          {
            when: "tension > 60",
            text: "直接问{{npc.name}}一个有点冒犯的问题",
            intentType: "adventure",
            riskLevel: "risky",
            requiresExposeLayer: 2,
          },
        ],
        fallbackVariant: {
          when: "",
          text: "抛个大胆的话试试水",
          intentType: "adventure",
          riskLevel: "risky",
        },
      },
    ],
  },

  // ================================================================
  // Day 2 · 试探（中低张力）
  // ================================================================
  2: {
    id: "day2_public_choice",
    day: 2,
    dedupeAB: true,
    slots: [
      {
        slot: "A_advance",
        enabled: "true",
        variants: [
          {
            when: "tension < 50",
            text: "昨天没来得及聊，今天想补上",
            intentType: "advance",
            riskLevel: "moderate",
          },
          {
            when: "tension >= 50",
            text: "我觉得我们之间好像有点什么",
            intentType: "advance",
            riskLevel: "risky",
          },
        ],
        fallbackVariant: {
          when: "",
          text: "想跟{{npc.name}}多聊聊",
          intentType: "advance",
          riskLevel: "moderate",
        },
      },
      {
        slot: "B_divert",
        enabled: "true",
        variants: [
          {
            when: "",
            text: "把话题引向另一个人",
            intentType: "tease",
            riskLevel: "safe",
          },
        ],
        fallbackVariant: {
          when: "",
          text: "换个话题吧",
          intentType: "humor",
          riskLevel: "safe",
        },
      },
      {
        slot: "C_avoid",
        enabled: "true",
        variants: [
          {
            when: "",
            text: "保持安静，观察一下",
            intentType: "observe",
            riskLevel: "safe",
          },
        ],
        fallbackVariant: {
          when: "",
          text: "暂时不说话",
          intentType: "retreat",
          riskLevel: "safe",
        },
      },
      {
        slot: "D_risk",
        enabled: "tension > 55",
        disabledReason: "气氛还不到冒险的时候",
        variants: [
          {
            when: "tension > 55",
            text: "当着大家的面对{{npc.name}}表态",
            intentType: "advance",
            riskLevel: "risky",
            requiresExposeLayer: 2,
          },
        ],
        fallbackVariant: {
          when: "",
          text: "说一句让人意外的话",
          intentType: "adventure",
          riskLevel: "risky",
        },
      },
    ],
  },

  // ================================================================
  // Day 3-7 · 按需补全（参照 Day1/2 格式）
  // ============================================================
};

/** 取某天的选项配方 */
export function getOptionRecipe(day: number): OptionRecipe | undefined {
  return OPTION_RECIPES[day];
}

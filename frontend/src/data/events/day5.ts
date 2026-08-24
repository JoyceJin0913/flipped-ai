/**
 * Day 5 · 秘密交换之夜（high）
 *
 * 依据：《心动岛_七日公共事件_精简版.md》§7（第 282-323 行）
 * 事件顺序：day5_first_secret → day5_their_exchange → day5_sense_wrong
 *
 * 引擎注记（turnRunner 兜底/生成点，详见主会话交接报告）：
 * 1. 7.1 A 槽变体 a/b 按 day4_went_date 互斥（数据以 all_of 含该 fact 条件
 *    表达）：引擎对「变体 fact 条件」（day4_went_date / day5_leaked）按
 *    「隐藏」处理而非灰显，其余条件按灰显 + lockLabel。
 * 2. 7.1 A 变体 a 的 target = 约会对象（day4_accepted_npc）；A 变体 b 的
 *    {target} = 留守期间最亲近的 NPC（引擎按留守组内最高好感解析，非默认
 *    第二好感）。
 * 3. 信任额度（§11）：A/B 各 -1、D -2、C 不扣。含 resource 条件的选项未
 *    给 lockLabel——引擎须按实际未满足的条件动态生成（好感不足 →「好感≥X
 *    解锁」；额度不足 →「信任额度已用完」，与 types.ts 生成规则一致）。
 * 4. 转述判定（A/B 变体 30%、D 50%）与 7.2 的 day5_exchange_pair /
 *    day5_leaked / day5_leaked_listener 由 afterHooks ["d5_resolve_exchange"]
 *    结算；7.3 的 A 变体 a 与 D 槽依赖该结算结果。
 * 5. 7.3 A 变体 a「需 L3（按 {听者} 依恋阈值）」为动态阈值，文档未给示例
 *    数字——数据统一以 min:85 占位 + lockLabel「好感≥85解锁」，引擎须按
 *    {听者} 依恋 L3（secure 50 / avoidant 60 / anxious 45）动态替换阈值与
 *    lockLabel。
 * 6. 7.3 D 槽效果「摊开者 -6（颜面）/ 被摊开者 -4 / 知情旁观者 +2」的
 *    NPC 映射：数据取 摊开者 = 转述者 day5_leaked（-6）、知情旁观者 =
 *    day5_leaked_listener（+2）；「被摊开者」= 玩家本人（秘密的主人）颜面
 *    -4 无玩家效果目标，由引擎按自我形象结算。如需调整映射请主会话确认。
 * 7. 7.3 A 变体 a 的 {听者}「-4（被抓包）或 +2（坦白）」依人格二选一，
 *    引擎判定后覆写 Δ。
 * 8. day5_their_exchange 为 hidden 形态：narration 为空，全文即文档原句
 *    「某两人在阳台待了很久。」（script 单行旁白）。
 */
import type { DaySpec, DecisionEventSpec, OpenEventSpec } from "./types";

/** 7.1 第一次私密讲述（决策）· high · 有 D 槽 · 耗信任额度 */
const firstSecret: DecisionEventSpec = {
  kind: "decision",
  id: "day5_first_secret",
  day: 5,
  title: "第一次私密讲述",
  location: "别墅起居室",
  timeLabel: "D5 深夜",
  tension: "high",
  allowRiskSlot: true,
  narration: [
    "灯暗了一半。想听别人的秘密，必须先说一个自己的。你有三次额度——说出口的话，收不回来。",
  ],
  options: [
    {
      id: "a_to_date_partner",
      slot: "A",
      intent: "expose_self",
      risk: "dangerous",
      // 变体 a：day4_went_date=true，目标=约会对象；变体条件按隐藏处理（注记 1）
      text: "向{约会对象}说一件从没说过的事",
      requires: {
        kind: "all_of",
        of: [
          { kind: "fact", key: "day4_went_date", value: "true" },
          {
            kind: "affinity",
            npc: { kind: "fact", key: "day4_accepted_npc" },
            min: 30,
          },
          { kind: "resource", resource: "trust_points", min: 1 },
        ],
      },
      effects: [
        {
          npc: { kind: "fact", key: "day4_accepted_npc" },
          delta: 6,
          note: "深度信任；40% 转述风险（引擎按 §7.1 结算）",
        },
      ],
      consumes: [{ resource: "trust_points", amount: 1 }],
      facts: [
        { key: "day5_secret_target", value: "{约会对象}" },
        { key: "day5_used_points", value: "1" },
      ],
    },
    {
      id: "a_to_closest_stayer",
      slot: "A",
      intent: "expose_self",
      risk: "subtle",
      // 变体 b：day4_went_date=false；{target} = 留守期间最亲近的 NPC（注记 2）
      text: "向留守期间最亲近的{target}说一件自己的事",
      requires: {
        kind: "all_of",
        of: [
          { kind: "fact", key: "day4_went_date", value: "false" },
          { kind: "affinity", npc: { kind: "target" }, min: 20 },
          { kind: "resource", resource: "trust_points", min: 1 },
        ],
      },
      effects: [{ npc: { kind: "target" }, delta: 4, note: "留守期间最亲近者" }],
      consumes: [{ resource: "trust_points", amount: 1 }],
      facts: [
        { key: "day5_secret_target", value: "{target}" },
        { key: "day5_used_points", value: "1" },
      ],
    },
    {
      id: "b_to_second",
      slot: "B",
      intent: "ally",
      risk: "subtle",
      text: "转而去找{target}（第二好感）",
      requires: { kind: "resource", resource: "trust_points", min: 1 },
      effects: [{ npc: { kind: "target" }, delta: 3 }],
      consumes: [{ resource: "trust_points", amount: 1 }],
      facts: [
        { key: "day5_secret_target", value: "{target}" },
        { key: "day5_used_points", value: "1" },
      ],
    },
    {
      id: "c_keep_points",
      slot: "C",
      intent: "withdraw",
      risk: "safe",
      text: "什么都不说，留着额度",
      // 无显著变化；本日不暴露（转述风险为 0）
      facts: [{ key: "day5_used_points", value: "0" }],
    },
    {
      id: "d_spend_twice",
      slot: "D",
      intent: "expose_self",
      risk: "dangerous",
      text: "一次用掉两次额度，说难以启齿的事",
      requires: {
        kind: "all_of",
        of: [
          { kind: "affinity", npc: { kind: "target" }, min: 35 },
          { kind: "resource", resource: "trust_points", min: 2 },
        ],
      },
      effects: [
        {
          npc: { kind: "target" },
          delta: 8,
          note: "最深信任；50% 转述风险（引擎按 §7.1 结算）",
        },
      ],
      consumes: [{ resource: "trust_points", amount: 2 }],
      facts: [
        { key: "day5_secret_target", value: "{target}" },
        { key: "day5_used_points", value: "2" },
      ],
    },
  ],
};

/** 7.2 他们之间的交换（开放）· hidden · 一句话 */
const theirExchange: OpenEventSpec = {
  kind: "open",
  id: "day5_their_exchange",
  day: 5,
  title: "他们之间的交换",
  location: "阳台（玩家不在场）",
  timeLabel: "D5 深夜",
  tension: "high",
  visibility: "hidden",
  narration: [],
  // 结算：day5_exchange_pair + 泄露判定 → day5_leaked / day5_leaked_listener
  afterHooks: ["d5_resolve_exchange"],
  script: [{ line: "某两人在阳台待了很久。" }],
};

/** 7.3 察觉到不对（决策）· high · 有 D 槽 */
const senseWrong: DecisionEventSpec = {
  kind: "decision",
  id: "day5_sense_wrong",
  day: 5,
  title: "察觉到不对",
  location: "别墅走廊/起居室",
  timeLabel: "D5 深夜（熄灯前）",
  tension: "high",
  allowRiskSlot: true,
  narration: ["总觉得哪里不对。有人在你背后交换了什么——你知道的太多，或者太少。"],
  options: [
    {
      id: "a_confront_listener",
      slot: "A",
      intent: "tease",
      risk: "dangerous",
      // 变体 a：day5_leaked=true；{听者} = day5_leaked_listener
      text: "直接问{听者}：「你听谁说的？」",
      requires: {
        kind: "all_of",
        of: [
          { kind: "fact", key: "day5_leaked", value: "true" },
          {
            kind: "affinity",
            npc: { kind: "fact", key: "day5_leaked_listener" },
            min: 85,
          },
        ],
      },
      // 文档「需 L3（按 {听者} 依恋阈值）」为动态阈值：min:85 为占位，
      // 引擎按 {听者} 依恋 L3（secure 50 / avoidant 60 / anxious 45）替换（注记 5）
      lockLabel: "好感≥85解锁",
      effects: [
        {
          npc: { kind: "fact", key: "day5_leaked_listener" },
          delta: -4,
          note: "被抓包（或依人格坦白 +2，引擎判定）；秘密传播链暴露",
        },
      ],
      facts: [{ key: "day5_confronted", value: "true" }],
    },
    {
      id: "a_ask_focus_npc",
      slot: "A",
      intent: "tease",
      risk: "subtle",
      // 变体 b：day5_leaked=false；若 day5_exchange_pair 含焦点则点破一半
      text: "问{焦点NPC}刚才去哪了",
      effects: [
        {
          npc: { kind: "focus" },
          delta: 1,
          note: "或 -1（窥探感，avoidant 敏感）；若 day5_exchange_pair 含焦点则点破一半（引擎）",
        },
      ],
    },
    {
      id: "b_probe_target",
      slot: "B",
      intent: "observe",
      risk: "subtle",
      text: "去找{target}打听",
      effects: [
        {
          npc: { kind: "target" },
          delta: 1,
          note: "若 {target} 知情则获得线索（影响模型后续对话）",
        },
      ],
    },
    {
      id: "c_pretend_not_notice",
      slot: "C",
      intent: "deflect",
      risk: "subtle",
      text: "装作没注意到",
      // 无显著变化；秘密留在暗处
    },
    {
      id: "d_expose_openly",
      slot: "D",
      intent: "provoke",
      risk: "dangerous",
      text: "当着几个人把事摊开",
      requires: {
        kind: "all_of",
        of: [
          { kind: "fact", key: "day5_leaked", value: "true" },
          {
            kind: "affinity",
            npc: { kind: "fact", key: "day5_leaked_listener" },
            min: 25,
          },
        ],
      },
      lockLabel: "好感≥25解锁",
      effects: [
        {
          npc: { kind: "fact", key: "day5_leaked_listener" },
          delta: -6,
          note: "摊开者（转述者被当众戳穿）颜面",
        },
      ],
      // 被摊开者 = 玩家本人（秘密的主人），颜面 -4 无玩家效果目标，
      // 由引擎按自我形象结算；知情旁观者 +2（敢作敢当）由引擎按
      // day5_exchange_pair 另一方解析（注记 6）
      facts: [{ key: "day5_confronted", value: "true" }],
    },
  ],
};

export const day5: DaySpec = {
  day: 5,
  theme: "秘密交换之夜",
  tension: "high",
  events: [firstSecret, theirExchange, senseWrong],
};

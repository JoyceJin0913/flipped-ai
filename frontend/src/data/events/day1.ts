/**
 * Day 1 · 早餐桌上的沉默（low）
 *
 * 依据：《心动岛_七日公共事件_精简版.md》§3（第 89-127 行）
 * 事件顺序：day1_seat_choice → day1_silence_broken → day1_player_approached
 *
 * 引擎注记（turnRunner 兜底/生成点，详见主会话交接报告）：
 * 1. day1_seat_choice 的 afterHooks 挂 d1_roll_approacher，但只在玩家选 C
 *    （day1_seat_side=stand）时执行，写入 day1_approacher。
 * 2. day1_seat_neighbor 的 value 由引擎在选项结算时覆写（
 *    day1_seat_side=left → 左邻座 id，=right → 右邻座 id），数据先给 ""。
 * 3. 3.3 所有 {搭话NPC} 引用（旁白、requires、效果）统一用 fact key
 *    "day1_first_speaker"；引擎解析时应先取 day1_approacher（3.1 选 C 时
 *    存在）再回退 day1_first_speaker——兜底是引擎职责。
 * 4. {沉默NPC} 效果目标引用 fact key "day1_silent_npc"，需引擎按
 *    「当天发言最少者（并列取好感最高者）」解析或写入。
 * 5. day1_silence_broken 的台词 speaker = fact day1_first_speaker，
 *    引擎缺席岛上时整行跳过（types.ts ScriptLine 约定）。
 */
import type { DaySpec, DecisionEventSpec, OpenEventSpec } from "./types";

/** 3.1 选座位（决策）· low · 无 D 槽 */
const seatChoice: DecisionEventSpec = {
  kind: "decision",
  id: "day1_seat_choice",
  day: 1,
  title: "选座位",
  location: "别墅餐厅长桌",
  timeLabel: "D1 早晨",
  tension: "low",
  allowRiskSlot: false,
  narration: [
    "早餐已经摆好了。长桌旁坐满了人，只剩两个空位——一个在左边，一个在右边。你站在门口，所有人都在看你要坐哪。",
  ],
  beforeHooks: ["d1_seed_seats"],
  // 选项级语义：只有选 C（day1_seat_side=stand）才执行，由引擎判断
  afterHooks: ["d1_roll_approacher"],
  options: [
    {
      id: "a_left",
      slot: "A",
      intent: "comfort",
      risk: "safe",
      text: "坐到左边，坐在{邻座A}旁边",
      effects: [
        {
          npc: { kind: "fact", key: "day1_seat_left" },
          delta: 2,
          note: "主动靠近；依恋加权：anxious +3",
        },
      ],
      facts: [
        { key: "day1_seat_side", value: "left" },
        { key: "day1_seat_neighbor", value: "" }, // 引擎结算时覆写为邻座 NPC id
      ],
    },
    {
      id: "b_right",
      slot: "B",
      intent: "comfort",
      risk: "safe",
      text: "坐到右边，坐在{邻座B}旁边",
      effects: [{ npc: { kind: "fact", key: "day1_seat_right" }, delta: 2, note: "主动靠近" }],
      facts: [
        { key: "day1_seat_side", value: "right" },
        { key: "day1_seat_neighbor", value: "" }, // 引擎结算时覆写为邻座 NPC id
      ],
    },
    {
      id: "c_watch",
      slot: "C",
      intent: "deflect",
      risk: "subtle",
      text: "先站在门口看一会儿",
      effects: [
        {
          npc: { kind: "all" },
          delta: 1,
          note: "存在感；随机 1 位 NPC 主动招呼你由引擎生成（d1_roll_approacher → day1_approacher）",
        },
      ],
      facts: [{ key: "day1_seat_side", value: "stand" }],
    },
  ],
};

/** 3.2 沉默被打破（开放）· full */
const silenceBroken: OpenEventSpec = {
  kind: "open",
  id: "day1_silence_broken",
  day: 1,
  title: "沉默被打破",
  location: "餐厅长桌",
  timeLabel: "D1 早晨",
  tension: "low",
  visibility: "full",
  narration: ["没有人说话。筷子碰着碗沿的声音都很清楚。终于有人先开口了。"],
  script: [
    // 打破沉默者由引擎决定（d1_seed_seats 后写入 day1_first_speaker）；
    // 台词为通用短句，任何人格/StyleContract 下成立
    { speaker: { kind: "fact", key: "day1_first_speaker" }, line: "早上好，都醒了。" },
    { speaker: { kind: "fact", key: "day1_first_speaker" }, line: "先吃吧，菜要凉了。" },
    { line: "{沉默NPC} 抬了抬眼皮，没有接话。空气松动了一点。" },
    { line: "有人小声应了一声，筷子开始动了。沉默像冰面一样裂开。" },
  ],
};

/** 3.3 玩家被搭话（决策）· low · 无 D 槽 */
const playerApproached: DecisionEventSpec = {
  kind: "decision",
  id: "day1_player_approached",
  day: 1,
  title: "玩家被搭话",
  location: "餐厅长桌",
  timeLabel: "D1 早晨（散场前）",
  tension: "low",
  allowRiskSlot: false,
  narration: ["{搭话NPC} 转向你，桌上安静了一瞬——他在等你的回答。"],
  options: [
    {
      id: "a_continue",
      slot: "A",
      intent: "expose_self",
      risk: "safe",
      text: "顺着{搭话NPC}的话接下去，简单说说自己",
      requires: {
        kind: "any_of",
        of: [
          {
            kind: "relationship_metric",
            npc: { kind: "fact", key: "day1_first_speaker" },
            metric: "tension",
            max: 40,
          },
          {
            kind: "memory_tag",
            npc: { kind: "fact", key: "day1_first_speaker" },
            tag: "support",
          },
        ],
      },
      effects: [
        {
          npc: { kind: "fact", key: "day1_first_speaker" },
          delta: 2,
          note: "自我暴露 L1",
        },
      ],
      fallback: {
        id: "a_guarded_reply",
        slot: "A",
        intent: "deflect",
        risk: "safe",
        text: "先简短回应{搭话NPC}，把话题留在轻松的范围",
        effects: [
          {
            npc: { kind: "fact", key: "day1_first_speaker" },
            delta: 1,
            note: "张力较高且无支持记忆时的保守回应",
          },
        ],
      },
    },
    {
      id: "a_point_out",
      slot: "A",
      intent: "tease",
      risk: "safe",
      text: "点出反差：「你看起来不像会先开口」",
      requires: {
        kind: "attachment_is",
        npc: { kind: "fact", key: "day1_first_speaker" },
        attachment: "avoidant",
      },
      lockLabel: "搭话者为回避型才可选",
      effects: [
        {
          npc: { kind: "fact", key: "day1_first_speaker" },
          delta: 4,
          note: "被看见；注意不得触发其 comfort/provoke 禁令",
        },
      ],
    },
    {
      id: "b_silent",
      slot: "B",
      intent: "ally",
      risk: "subtle",
      text: "把话头递给一直没说话的{沉默NPC}",
      requires: { kind: "custom", id: "d1_three_silent" },
      lockLabel: "场上不足 3 人沉默",
      effects: [
        {
          npc: { kind: "fact", key: "day1_silent_npc" },
          delta: 3,
          note: "话头被递过去",
        },
        {
          npc: { kind: "fact", key: "day1_first_speaker" },
          delta: -1,
          note: "话头被截",
        },
      ],
      fallback: {
        id: "b_to_target",
        slot: "B",
        intent: "ally",
        risk: "subtle",
        text: "把话题引向{target}（第二好感）",
      },
    },
    {
      id: "c_not_answer",
      slot: "C",
      intent: "deflect",
      risk: "subtle",
      text: "笑一下，没接话",
      effects: [{ npc: { kind: "all" }, delta: -1, note: "接不住话；保留神秘感" }],
    },
  ],
};

export const day1: DaySpec = {
  day: 1,
  theme: "早餐桌上的沉默",
  tension: "low",
  events: [seatChoice, silenceBroken, playerApproached],
};

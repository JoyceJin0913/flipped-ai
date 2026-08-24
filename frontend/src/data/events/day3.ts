/**
 * Day 3 · 真心话大冒险（high）
 *
 * 依据：《心动岛_七日公共事件_精简版.md》§5（第 179-219 行）
 * 事件顺序：day3_called_out → day3_npc_grilling → day3_design_question
 *
 * 引擎注记（turnRunner 兜底/生成点，详见主会话交接报告）：
 * 1. day3_called_out 的 beforeHooks 挂 d3_generate_question_level（生成
 *    L1~L3 → day3_question_level）；A 槽两个变体按 custom 条件
 *    d3_question_at_most_l2 / d3_question_is_l3 互斥渲染（二选一出其一，
 *    共 4 个可见选项，§5.1 表格脚注）。
 * 2. 「提问者」效果目标无现成 NpcRef 类型（提问权归上一轮回答者，引擎
 *    内部状态，无 fact key），用 {kind:"random"} + note 语义化描述，由
 *    引擎按 note 解析。
 * 3. day3_npc_grilling 全程旁白引述（speaker 省略），不点具体人名，用
 *    泛称「有人」「被追问的人」，保证任何 NPC 组合下文案成立。
 * 4. day3_design_target 由选项选择器（storeAs）写入；
 *    day3_design_scope=all / pass 由选项 facts 写入。
 * 5. 5.3 A2 的 requires 为「好感≥40 且 依恋=anxious」（文档 lockLabel
 *    「好感≥40解锁」照抄）；5.3 B 的条件不足时替换为 fallback「把提问权
 *    交给{target}」（安全，{target}+2）。
 */
import type { DaySpec, DecisionEventSpec, OpenEventSpec } from "./types";

/** 5.1 玩家被点名（决策）· high · 无 D 槽 · A 槽双变体互斥 */
const calledOut: DecisionEventSpec = {
  kind: "decision",
  id: "day3_called_out",
  day: 3,
  title: "玩家被点名",
  location: "客厅",
  timeLabel: "D3 夜晚",
  tension: "high",
  allowRiskSlot: false,
  narration: ["瓶子转了三圈，停在你的方向。全场安静下来——问题已经问出来了，所有人都看着你。"],
  beforeHooks: ["d3_generate_question_level"],
  options: [
    {
      id: "a_plain",
      slot: "A",
      intent: "expose_self",
      risk: "safe",
      text: "如实回答（问题 ≤L2）",
      requires: { kind: "custom", id: "d3_question_at_most_l2" },
      lockLabel: "问题层级为 L3",
      effects: [
        { npc: { kind: "random" }, delta: 2, note: "提问者（坦诚）" },
        { npc: { kind: "all" }, delta: 1 },
      ],
    },
    {
      id: "a_deep",
      slot: "A",
      intent: "expose_self",
      risk: "subtle",
      text: "回答这个深层问题（问题 =L3）",
      requires: { kind: "custom", id: "d3_question_is_l3" },
      lockLabel: "问题层级低于 L3",
      effects: [
        {
          npc: { kind: "random" },
          delta: 5,
          note: "提问者（深层回答）；自我暴露风险：有 20% 概率被转述",
        },
      ],
      facts: [{ key: "day3_exposed_self", value: "true" }],
    },
    {
      id: "b_exemption",
      slot: "B",
      intent: "deflect",
      risk: "safe",
      text: "使用豁免权",
      requires: { kind: "resource", resource: "exemption", min: 1 },
      effects: [
        { npc: { kind: "all" }, delta: -1 },
        {
          npc: { kind: "random" },
          delta: -3,
          note: "提问者（问题白问）；使用后本日不再被点名",
        },
      ],
      consumes: [{ resource: "exemption", amount: 1 }],
      facts: [{ key: "day3_used_exemption", value: "true" }],
    },
    {
      id: "b_counter",
      slot: "B",
      intent: "challenge",
      risk: "dangerous",
      text: "反问提问者：「那你呢？」",
      effects: [
        {
          npc: { kind: "random" },
          delta: 4,
          note: "提问者依人格 ±：anxious +4（被认真对待）/ secure +2 / avoidant -2（被冒犯）",
        },
        { npc: { kind: "all" }, delta: 1, note: "起哄" },
      ],
    },
    {
      id: "c_penalty",
      slot: "C",
      intent: "withdraw",
      risk: "subtle",
      text: "接受惩罚，不回答",
      effects: [
        {
          npc: { kind: "all" },
          delta: 1,
          note: "娱乐；玩家自我形象 -1（非 NPC 目标，引擎另行处理）",
        },
      ],
    },
  ],
};

/** 5.2 NPC 追问（开放）· full · 全程旁白引述，无具体人名 */
const npcGrilling: OpenEventSpec = {
  kind: "open",
  id: "day3_npc_grilling",
  day: 3,
  title: "NPC 追问",
  location: "客厅",
  timeLabel: "D3 夜晚（玩家回合之后）",
  tension: "high",
  visibility: "full",
  narration: ["提问权交到了刚才回答的人手里。他转向了另一个人——追问，不可以拒绝。"],
  script: [
    { line: "提问权在人群里转了一圈，最终停在某个人身上。追问开始了——这一次，不允许拒绝。" },
    { line: "「你刚才说的，是真的吗？」有人问得很直接。被追问的人沉默了片刻。" },
    { line: "「如果是谎话，你今天已经说得够多了。」声音不大，客厅里却安静得吓人。" },
    { line: "被追问的人垂着眼，手指微微收紧。有人动用了豁免权，有人硬着头皮答了下去。" },
    { line: "追问没有停。有人被问红了眼眶，有人在旁边悄悄松了口气。" },
  ],
};

/** 5.3 玩家设计问题（决策）· high · 无 D 槽 */
const designQuestion: DecisionEventSpec = {
  kind: "decision",
  id: "day3_design_question",
  day: 3,
  title: "玩家设计问题",
  location: "客厅",
  timeLabel: "D3 夜晚",
  tension: "high",
  allowRiskSlot: false,
  narration: [
    "瓶子停在你面前。提问权现在属于你——这是你当导演的时刻，你可以指定任何人和任何问题方向。",
  ],
  options: [
    {
      id: "a_room",
      slot: "A",
      intent: "tease",
      risk: "dangerous",
      text: "问全场：「有人已经心动了吗？」",
      effects: [
        {
          npc: { kind: "random" },
          delta: 2,
          note: "被说中的 NPC（引擎判定）+2；avoidant 再 -2（被当众戳穿）；话题急转，后续回合全部重定向",
        },
      ],
      facts: [{ key: "day3_design_scope", value: "all" }],
    },
    {
      id: "a_target",
      slot: "A",
      intent: "tease",
      risk: "dangerous",
      text: "问{target}：「你为什么总是在意别人怎么看你？」",
      requires: {
        kind: "all_of",
        of: [
          { kind: "affinity", npc: { kind: "target" }, min: 40 },
          { kind: "attachment_is", npc: { kind: "target" }, attachment: "anxious" },
        ],
      },
      lockLabel: "好感≥40解锁",
      selector: {
        prompt: "选择提问目标",
        storeAs: "day3_design_target",
      },
      effects: [
        {
          npc: { kind: "target" },
          delta: 6,
          note: "被说中=被理解；若问题戳错（层级不足）则 -3",
        },
      ],
    },
    {
      id: "b_silent",
      slot: "B",
      intent: "challenge",
      risk: "subtle",
      text: "问一直沉默的{target}：「你为什么一直不说话？」",
      requires: { kind: "custom", id: "d3_two_silent" },
      lockLabel: "场上沉默者不足 2 人",
      selector: {
        prompt: "选择提问目标",
        storeAs: "day3_design_target",
      },
      effects: [
        {
          npc: { kind: "target" },
          delta: -2,
          note: "回避型 -2~-3（当众被戳，噩梦）；随后私下安抚可 +6；非回避型 +3——依人格结算",
        },
      ],
      fallback: {
        id: "b_pass_to_target",
        slot: "B",
        intent: "ally",
        risk: "safe",
        text: "把提问权交给{target}",
        selector: {
          prompt: "选择把提问权交给谁",
          storeAs: "day3_design_target",
        },
        effects: [{ npc: { kind: "target" }, delta: 2, note: "把提问权交给对方" }],
      },
    },
    {
      id: "c_pass",
      slot: "C",
      intent: "withdraw",
      risk: "safe",
      text: "放弃提问权",
      facts: [{ key: "day3_design_scope", value: "pass" }],
    },
  ],
};

export const day3: DaySpec = {
  day: 3,
  theme: "真心话大冒险",
  tension: "high",
  events: [calledOut, npcGrilling, designQuestion],
};

/**
 * Day 6 · 公开表态日（very-high）
 *
 * 依据：《心动岛_七日公共事件_精简版.md》§8（第 325-367 行）
 * 事件顺序：day6_earlier_declarations → day6_declare → day6_rejected_response
 *
 * 引擎注记（turnRunner 兜底/生成点，详见主会话交接报告）：
 * 1. 8.1 挂 beforeHooks ["d6_generate_order","d6_generate_early_declares"]，
 *    需在渲染前结算（脚本/旁白依赖 day6_order）；脚本仅挂载第 1 位表态者的
 *    通用台词（speaker = day6_order 首元素），第 2~4 位为旁白泛写——完整
 *    表态过程由模型生成（文档 8.1 脚本定义）。
 * 2. 8.2 A1（向{焦点NPC}告白）告白阈值 = 目标依恋 L4（avoidant 85 /
 *    secure 75 / anxious 70），requires 无法静态表达：数据以 min:85 +
 *    lockLabel「好感≥85解锁」占位，引擎须在渲染时按目标（玩家最高好感 NPC）
 *    依恋动态替换阈值与 lockLabel，并在选项触发时锁定目标写入
 *    day6_player_declared。
 * 3. 8.2 A2 为自由选择器（文档 8.2 A2），selector 挂 defaultRef highest、
 *    storeAs day6_player_declared，由选择器直接写入表态目标。
 * 4. 8.2 D 槽 {零票者} = 引擎按 custom d6_has_zero_vote 判定后解析
 *    （day6_zero_vote 列表内满足 玩家→NPC≥85 者）；文档给定 ≥85 → 静态，
 *    无需动态替换。无零票者时该变体条件按隐藏处理。
 * 5. 表态后结算：d6_recompute_votes 重算后段表态/零票/互选与被拒名单
 *    （day6_mutual / day6_rejected_by）——「若目标预选玩家 → day6_mutual」
 *    「被拒名单」均由此钩子结算，数据不写 effects；弃权时预选玩家的 NPC
 *    负向 Δ 上浮（secure -5 / anxious -12~-15 / avoidant -7）亦由引擎按
 *    §13 结算。
 * 6. 8.3 分支：有被拒者（custom d6_has_rejected）按文档 3 选项；无被拒者
 *    分支（not_fact day6_rejected_by）为新增轻决策兜底 2 选项（文档 8.3
 *    未定义无被拒者场景，兜底设计见主会话确认）。引擎契约：d6_recompute_votes
 *    只在存在被拒者（含 NPC 间被拒，供 8.3 展示）时写入 day6_rejected_by，
 *    名单为空则不写该 key。
 * 7. 8.3 A 的 {target} = 任一被拒者，默认玩家拒绝的人（day6_rejected_by
 *    中玩家侧），非默认第二好感；A 槽安抚补偿（anxious -8~-10→-4~-5 /
 *    avoidant -5→-3 / secure -3→-1）与 B 槽依恋分化行为（anxious 当晚追问
 *    / avoidant 无反应 / secure 点头致意）由引擎按 §13 结算，数据无直接 Δ。
 */
import type { DaySpec, DecisionEventSpec, OpenEventSpec } from "./types";

/** 8.1 前几位表态（开放）· full · 顺序与目标由引擎预生成 */
const earlierDeclarations: OpenEventSpec = {
  kind: "open",
  id: "day6_earlier_declarations",
  day: 6,
  title: "前几位表态",
  location: "庭院",
  timeLabel: "D6 上午",
  tension: "very-high",
  visibility: "full",
  narration: [
    "表态顺序公布——好感最低的人第一个。顺序本身就是前五天的公开排名。每个名字说出口，都在改变后面人的处境。",
  ],
  beforeHooks: ["d6_generate_order", "d6_generate_early_declares"],
  script: [
    { line: "第一个开口的人站了起来。院子里安静得能听见风吹草叶的声音。" },
    { speaker: { kind: "fact", key: "day6_order" }, line: "「我选……坐在窗边的人。」" },
    { line: "名字落地，像一颗石子掉进水里。有人低头，有人抬了抬眉。" },
    { line: "第二个、第三个人陆续开口。顺序越到后面，空气越重。" },
    { line: "前四位说完了。每个名字，都在改变后面人的处境。" },
  ],
};

/** 8.2 轮到玩家表态（决策）· very-high · 有 D 槽 · 表态不可撤回 */
const declare: DecisionEventSpec = {
  kind: "decision",
  id: "day6_declare",
  day: 6,
  title: "轮到玩家表态",
  location: "庭院中央",
  timeLabel: "D6 上午",
  tension: "very-high",
  allowRiskSlot: true,
  narration: ["轮到你了。所有人都在看你走向谁——或者，不走向任何人。表态不可撤回。"],
  afterHooks: ["d6_recompute_votes"],
  options: [
    {
      id: "a_confess_highest",
      slot: "A",
      intent: "confess",
      risk: "dangerous",
      // {焦点NPC} = 玩家最高好感 NPC（§2.5 焦点缺省语义），替代文档 {最高好感NPC}
      text: "向{焦点NPC}告白",
      // 动态阈值：min:85 为占位，引擎按目标依恋 L4（85/75/70）替换（注记 2）
      requires: {
        kind: "affinity",
        npc: { kind: "highest" },
        min: 85,
      },
      lockLabel: "好感≥85解锁",
      effects: [
        {
          npc: { kind: "highest" },
          delta: 5,
          note: "若预选玩家 → day6_mutual=true（P1 候选）；若预选他人 → 当众被拒（P2 错位候选）——由 d6_recompute_votes 结算",
        },
      ],
      consumes: [{ resource: "declaration", amount: 1 }],
      facts: [{ key: "day6_player_declared", value: "{焦点NPC}" }],
    },
    {
      id: "a_declare_target",
      slot: "A",
      intent: "comfort",
      risk: "safe",
      text: "选{target}，正式表态（不深入）",
      selector: {
        prompt: "选谁？",
        defaultRef: { kind: "highest" },
        storeAs: "day6_player_declared",
      },
      effects: [
        {
          npc: { kind: "target" },
          delta: 4,
          note: "被承认；若 {target} 预选玩家 → day6_mutual=true（引擎结算）；玩家对 target 表态印象 +2",
        },
      ],
      consumes: [{ resource: "declaration", amount: 1 }],
    },
    {
      id: "c_abstain",
      slot: "C",
      intent: "withdraw",
      risk: "dangerous",
      text: "弃权，不选任何人",
      effects: [
        {
          npc: { kind: "random" },
          delta: -5,
          note: "预选玩家的 NPC 们（引擎按 day6_early_declares 解析）：按 §13 依恋反应且 Δ 上浮 secure -5 / anxious -12~-15 / avoidant -7（注记 5）",
        },
      ],
      consumes: [{ resource: "declaration", amount: 1 }],
      facts: [
        { key: "day6_player_declared", value: "none" },
        { key: "day6_player_abstained", value: "true" },
      ],
    },
    {
      id: "d_pick_zero_vote",
      slot: "D",
      intent: "confess",
      risk: "dangerous",
      text: "选零票者——最意外的选择",
      // {零票者} 由引擎解析（day6_zero_vote 列表内满足好感 ≥85 者）
      requires: {
        kind: "all_of",
        of: [
          { kind: "custom", id: "d6_has_zero_vote" },
          { kind: "affinity", npc: { kind: "fact", key: "day6_zero_vote" }, min: 85 },
        ],
      },
      lockLabel: "好感≥85解锁",
      effects: [
        {
          npc: { kind: "fact", key: "day6_zero_vote" },
          delta: 10,
          note: "被拯救；全场哗然；因其 NPC→玩家<40（否则不会零票），通常走向 P2/P4 线",
        },
      ],
      consumes: [{ resource: "declaration", amount: 1 }],
      facts: [{ key: "day6_player_declared", value: "{零票者}" }],
    },
  ],
};

/** 8.3 被拒者反应应对（决策·轻决策）· very-high · 无 D 槽 */
const rejectedResponse: DecisionEventSpec = {
  kind: "decision",
  id: "day6_rejected_response",
  day: 6,
  title: "被拒者反应应对",
  location: "庭院→各回各处",
  timeLabel: "D6 下午",
  tension: "very-high",
  allowRiskSlot: false,
  narration: [
    "被公开拒绝的人的反应，比表态本身更重。有人大方点头，有人强笑，有人面无表情——你在场，你看见了。",
  ],
  branches: [
    {
      id: "has_rejected",
      when: { kind: "custom", id: "d6_has_rejected" },
      options: [
        {
          id: "a_comfort_rejected",
          slot: "A",
          intent: "comfort",
          risk: "safe",
          // {target} = 任一被拒者，默认玩家拒绝的人（注记 7）
          text: "走过去，对被拒者{target}说一句",
          // 安抚补偿由引擎按 §13 依恋类型结算：
          // anxious -8~-10 → -4~-5；avoidant -5 → -3（仍不可完全挽回）；secure -3 → -1
          facts: [{ key: "day6_comforted", value: "{target}" }],
        },
        {
          id: "b_leave_space",
          slot: "B",
          intent: "observe",
          risk: "subtle",
          text: "远远看着，把空间留给他/她",
          // 依恋分化行为（anxious 当晚追问「是不是我哪里做错了」/ avoidant
          // 无反应 / secure 点头致意）由引擎按 §13 生成
        },
        {
          id: "c_walk_away",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "假装没看见，走开",
          effects: [
            {
              npc: { kind: "target" },
              delta: -1,
              note: "被拒者追加（-1~-2）；avoidant 进入关系冻结 day6_frozen={target}（D7 和解效果减半）",
            },
          ],
          facts: [{ key: "day6_frozen", value: "{target}" }],
        },
      ],
    },
    {
      // 兜底分支：文档 8.3 未定义无被拒者场景，主会话确认后补轻决策 2 选项
      id: "no_rejected",
      when: { kind: "not_fact", key: "day6_rejected_by" },
      options: [
        {
          id: "nf_a_thanks",
          slot: "A",
          intent: "comfort",
          risk: "safe",
          text: "跟{target}说今天辛苦了",
          effects: [
            {
              npc: { kind: "target" },
              delta: 1,
              note: "轻安抚（兜底分支设计）",
            },
          ],
        },
        {
          id: "nf_c_say_nothing",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "什么也不说",
        },
      ],
    },
  ],
};

export const day6: DaySpec = {
  day: 6,
  theme: "公开表态日",
  tension: "very-high",
  events: [earlierDeclarations, declare, rejectedResponse],
};

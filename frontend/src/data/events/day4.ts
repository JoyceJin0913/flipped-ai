/**
 * Day 4 · 海边双人约会（high）
 *
 * 依据：《心动岛_七日公共事件_精简版.md》§6（第 221-279 行）
 * 事件顺序：day4_invite_round → day4_respond_invite → day4_date_or_stay
 *
 * 引擎注记（turnRunner 兜底/生成点，详见主会话交接报告）：
 * 1. day4_invite_round 挂 afterHooks ["d4_generate_invites"]（§6.1 名额生成 →
 *    day4_invite_count / day4_invited_by / day4_date_pairs / day4_inviter_a /
 *    day4_inviter_b）；本事件脚本含 {day4_inviter_a/b} speaker 台词，需引擎
 *    在渲染前先行结算该钩子（否则 speaker 缺席整行跳过，与 day2_group_tension
 *    同通道）。
 * 2. day4_respond_invite 分支条件支持 0 / 1 / 2 份邀请，不强行补齐名额。
 * 3. 选项 facts 的 value 中 {邀请者A}/{邀请者B} 由引擎解析为对应邀请者 id；
 *    day4_declined_by_player 为逗号分隔列表；day4_soft_reject 为独立 key。
 * 4. 6.2 分支 A 的 D 槽 {target} = 被拒绝者，不用选择器：引擎按
 *    day4_declined_by_player（本分支恒 1 人）解析其 requires/效果/facts。
 * 5. 约会名额属 NPC 侧（§11），玩家选项不消耗资源：名额锁定与拒绝对价由
 *    引擎按 §6.1 生成结果结算，数据只写参考 Δ。
 * 6. 6.3 信息隔离（只生成玩家所在线内容；留守时结算后追加一段留守组自发
 *    互动观察）为引擎/模型职责，数据不表达。
 * 7. 6.3 分支 A 的 A 槽「需 L3（按 {约会对象} 依恋阈值）」文档 lockLabel 为
 *    「动态，如好感≥50解锁」示例值——数据用示例数字 50 静态表达，引擎可按
 *    目标依恋 L3（secure 50 / avoidant 60 / anxious 45）精确化并同步 lockLabel。
 * 8. 6.3 留守分支与 6.2 分支 B 的 {target} = 留守组内 NPC（引擎按留守组
 *    解析，非默认第二好感）。
 */
import type { DaySpec, DecisionEventSpec, OpenEventSpec } from "./types";

/** 6.1 邀请发出（开放）· full · 名额由引擎生成 */
const inviteRound: OpenEventSpec = {
  kind: "open",
  id: "day4_invite_round",
  day: 4,
  title: "邀请发出",
  location: "客厅→海边入口",
  timeLabel: "D4 上午",
  tension: "high",
  visibility: "full",
  narration: ["导演宣布：今天有两个约会名额。邀请权不在你手里——所有人都在等，谁先走向谁。"],
  // 名额生成：谁邀请谁由引擎判定（§6.1），脚本不假设具体 NPC
  afterHooks: ["d4_generate_invites"],
  script: [
    { line: "安静只持续了几秒。有人站了起来。" },
    { speaker: { kind: "fact", key: "day4_inviter_a" }, line: "「今天，想和你去看海。」" },
    { line: "有人在人群里应了一声，两人并肩往海边入口走去。" },
    { speaker: { kind: "fact", key: "day4_inviter_b" }, line: "「一起去海边走走吗？」" },
    { line: "又有人走向自己的目标。两两成行的人笑着走远了。" },
    { line: "留下来的人，站了一会儿，各自转身。" },
  ],
};

/** 6.2 回应邀请（决策）· high · 有 D 槽 · 0 / 1 / 2 份邀请 */
const respondInvite: DecisionEventSpec = {
  kind: "decision",
  id: "day4_respond_invite",
  day: 4,
  title: "回应邀请",
  location: "海边入口",
  timeLabel: "D4 上午",
  tension: "high",
  allowRiskSlot: true,
  narration: ["海边入口渐渐安静下来。有人结伴离开，也有人留下——现在轮到你回应。"],
  branches: [
    {
      id: "two_or_more_invites",
      // 当前一局最多两份邀请。
      when: { kind: "fact", key: "day4_invite_count", value: "2" },
      options: [
        {
          id: "a_accept_inviter_a",
          slot: "A",
          intent: "confess",
          risk: "dangerous",
          text: "答应{邀请者A}",
          effects: [
            {
              npc: { kind: "fact", key: "day4_inviter_a" },
              delta: 8,
              note: "心动峰值",
            },
            {
              npc: { kind: "fact", key: "day4_inviter_b" },
              delta: -5,
              note: "被拒（依恋反应见 §7）",
            },
          ],
          facts: [
            { key: "day4_accepted_npc", value: "{邀请者A}" },
            { key: "day4_went_date", value: "true" },
            { key: "day4_declined_by_player", value: "{邀请者B}" },
          ],
        },
        {
          id: "b_soften_inviter_b",
          slot: "B",
          intent: "ally",
          risk: "dangerous",
          text: "答应前，先跟{邀请者B}说一句话",
          effects: [
            {
              npc: { kind: "fact", key: "day4_inviter_b" },
              delta: -2,
              note: "被拒缓和（原 -5 缓为 -2）",
            },
            {
              npc: { kind: "fact", key: "day4_inviter_a" },
              delta: -1,
              note: "被抢先",
            },
          ],
          facts: [
            { key: "day4_accepted_npc", value: "{邀请者A}" },
            { key: "day4_went_date", value: "true" },
            { key: "day4_declined_by_player", value: "{邀请者B}" },
            // soft_reject 单独 key，写被缓和者 id
            { key: "day4_soft_reject", value: "{邀请者B}" },
          ],
        },
        {
          id: "c_decline_stay",
          slot: "C",
          intent: "withdraw",
          risk: "dangerous",
          text: "婉拒，留下来",
          effects: [
            {
              npc: { kind: "fact", key: "day4_inviter_a" },
              delta: -5,
              note: "被婉拒（依恋反应见 §7）",
            },
            {
              npc: { kind: "fact", key: "day4_inviter_b" },
              delta: -5,
              note: "被婉拒（依恋反应见 §7）",
            },
          ],
          facts: [
            { key: "day4_went_date", value: "false" },
            { key: "day4_declined_by_player", value: "{邀请者A},{邀请者B}" },
          ],
        },
        {
          id: "d_call_back_rejected",
          slot: "D",
          intent: "confess",
          risk: "dangerous",
          text: "在被拒绝的{target}离开时，叫住他/她",
          // {target} = 被拒绝者：引擎按 day4_declined_by_player（本分支恒 1 人）
          // 解析，不用选择器
          requires: {
            kind: "affinity",
            npc: { kind: "fact", key: "day4_declined_by_player" },
            min: 25,
          },
          lockLabel: "好感≥25解锁",
          effects: [
            {
              npc: { kind: "fact", key: "day4_declined_by_player" },
              delta: 3,
              note: "被拒绝的{target}（anxious +6 / avoidant +3 但别扭）",
            },
            {
              npc: { kind: "fact", key: "day4_accepted_npc" },
              delta: -2,
              note: "已答应对象",
            },
          ],
          facts: [{ key: "day4_called_back", value: "{target}" }],
        },
      ],
    },
    {
      id: "one_invite",
      when: { kind: "fact", key: "day4_invite_count", value: "1" },
      options: [
        {
          id: "a_accept_only_inviter",
          slot: "A",
          intent: "confess",
          risk: "subtle",
          text: "答应{邀请者A}",
          effects: [
            {
              npc: { kind: "fact", key: "day4_inviter_a" },
              delta: 8,
              note: "接受唯一邀请",
            },
          ],
          facts: [
            { key: "day4_accepted_npc", value: "{邀请者A}" },
            { key: "day4_went_date", value: "true" },
          ],
        },
        {
          id: "b_ask_before_accepting",
          slot: "B",
          intent: "expose_self",
          risk: "subtle",
          text: "先问{邀请者A}为什么会选择你",
          effects: [
            {
              npc: { kind: "fact", key: "day4_inviter_a" },
              delta: 4,
              note: "确认邀请动机",
            },
          ],
          facts: [
            { key: "day4_accepted_npc", value: "{邀请者A}" },
            { key: "day4_went_date", value: "true" },
          ],
        },
        {
          id: "c_decline_only_inviter",
          slot: "C",
          intent: "withdraw",
          risk: "dangerous",
          text: "婉拒{邀请者A}，选择留下",
          effects: [
            {
              npc: { kind: "fact", key: "day4_inviter_a" },
              delta: -5,
              note: "唯一邀请被拒绝",
            },
          ],
          facts: [
            { key: "day4_went_date", value: "false" },
            { key: "day4_declined_by_player", value: "{邀请者A}" },
          ],
        },
      ],
    },
    {
      id: "no_invite",
      when: { kind: "fact", key: "day4_invite_count", value: "0" },
      options: [
        {
          id: "a_talk_unpicked",
          slot: "A",
          intent: "comfort",
          risk: "safe",
          text: "跟另一个也没被选的人搭话",
          effects: [
            {
              npc: { kind: "random" },
              delta: 3,
              note: "另一个也没被选的人（同病相怜）",
            },
          ],
        },
        {
          id: "b_turn_target",
          slot: "B",
          intent: "ally",
          risk: "safe",
          text: "转向{target}（留守组）",
          effects: [{ npc: { kind: "target" }, delta: 2, note: "留守组" }],
        },
        {
          id: "c_say_nothing",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "什么也没说",
          // 无显著变化；保留体面
          facts: [{ key: "day4_went_date", value: "false" }],
        },
      ],
    },
  ],
};

/** 6.3 约会独处 / 留守（决策）· high · 有 D 槽 · 信息隔离双分支 */
const dateOrStay: DecisionEventSpec = {
  kind: "decision",
  id: "day4_date_or_stay",
  day: 4,
  title: "约会独处 / 留守",
  location: "海边栈道 / 别墅客厅",
  timeLabel: "D4 下午",
  tension: "high",
  allowRiskSlot: true,
  narration: [
    "约会的人走了。留下来的人和去的人，各有各的煎熬——今天之后，有人靠近了，有人被留在了原地。",
  ],
  branches: [
    {
      id: "went_date",
      when: { kind: "fact", key: "day4_went_date", value: "true" },
      options: [
        {
          id: "a_private_story",
          slot: "A",
          intent: "expose_self",
          risk: "subtle",
          text: "说一件人多时不会说的事",
          // 文档：需 L3（按 {约会对象} 依恋阈值），lockLabel 为动态示例值
          // 「好感≥50解锁」；数据用 50，引擎可按目标依恋 L3 精确化（注记 7）
          requires: {
            kind: "affinity",
            npc: { kind: "fact", key: "day4_accepted_npc" },
            min: 50,
          },
          lockLabel: "好感≥50解锁",
          effects: [
            {
              npc: { kind: "fact", key: "day4_accepted_npc" },
              delta: 5,
              note: "自我暴露",
            },
          ],
        },
        {
          id: "b_mention_left_behind",
          slot: "B",
          intent: "challenge",
          risk: "dangerous",
          text: "提起留在岛上的{target}",
          effects: [
            {
              npc: { kind: "fact", key: "day4_accepted_npc" },
              delta: -5,
              note: "心不在焉",
            },
            { npc: { kind: "target" }, delta: 1, note: "被惦记" },
          ],
        },
        {
          id: "c_quiet_stay",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "只是安静地待着",
          effects: [
            {
              npc: { kind: "fact", key: "day4_accepted_npc" },
              delta: -1,
              note: "期待落空；对 avoidant +2（懂你的沉默）",
            },
          ],
        },
        {
          id: "d_push_relation_forward",
          slot: "D",
          intent: "confess",
          risk: "dangerous",
          text: "把关系往前推一步（含蓄）",
          requires: {
            kind: "affinity",
            npc: { kind: "fact", key: "day4_accepted_npc" },
            min: 30,
          },
          lockLabel: "好感≥30解锁",
          effects: [
            {
              npc: { kind: "fact", key: "day4_accepted_npc" },
              delta: 8,
              note: "secure/anxious +8；avoidant 触发硬规则（首次被示好必以 withdraw/deflect 开场，先 -3 后若有耐心 +10，一步到位不可得）",
            },
          ],
          facts: [{ key: "day4_advanced_relation", value: "true" }],
        },
      ],
    },
    {
      id: "stayed",
      when: { kind: "fact", key: "day4_went_date", value: "false" },
      options: [
        {
          id: "a_talk_to_stayer",
          slot: "A",
          intent: "comfort",
          risk: "safe",
          text: "跟另一个留守的{target}搭话",
          effects: [{ npc: { kind: "target" }, delta: 2, note: "留守组" }],
        },
        {
          id: "a_admit_not_chosen",
          slot: "A",
          intent: "expose_self",
          risk: "subtle",
          text: "承认：「我今天没被选」",
          effects: [
            {
              npc: { kind: "random" },
              delta: 4,
              note: "留守同伴（自我暴露 L2）；anxious 同伴 +5",
            },
          ],
        },
        {
          id: "b_turn_second",
          slot: "B",
          intent: "ally",
          risk: "subtle",
          text: "转向{target}（第二好感）",
          effects: [{ npc: { kind: "target" }, delta: 2 }],
        },
        {
          id: "c_be_alone",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "一个人待着",
          effects: [
            {
              npc: { kind: "all" },
              delta: -1,
              note: "隔阂感；avoidant 理解（-0）",
            },
          ],
        },
      ],
    },
  ],
};

export const day4: DaySpec = {
  day: 4,
  theme: "海边双人约会",
  tension: "high",
  events: [inviteRound, respondInvite, dateOrStay],
};

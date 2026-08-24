/**
 * Day 7 · 离别前夜·篝火（high）
 *
 * 依据：《心动岛_七日公共事件_精简版.md》§9（第 369-418 行）
 * 事件顺序：day7_npc_speeches → day7_solo_chance → day7_confession_window
 *
 * 引擎注记（turnRunner 兜底/生成点，详见主会话交接报告）：
 * 1. 9.1 硬编码台词遵守各 NPC StyleContract 字数上限：luze「路上小心。」
 *    （文档规定 ≤28 字、无标点禁令外字符）；zhoumu 不说话、只递东西
 *    （旁白行）；xiazhi 长句（anxious ≤50 字）；anran 理性总结
 *    （avoidant ≤20 字）。luze 在 NPC→玩家 ≥85 时破例多说一句——由引擎
 *    追加，数据只写默认句。其余 NPC 发言由模型生成，数据以旁白泛写。
 * 2. 9.2 A1/A2/B 共享 selector {prompt:"把谁叫到一边？", storeAs:
 *    "day7_solo_target"}，无 allowNone——放弃单独机会只走 C 选项（避免与
 *    selector 放弃入口并存），C 写 day7_solo_target="none"。
 * 3. 9.2 A1 告白阈值 = 目标依恋 L4 动态（avoidant 85 / secure 75 /
 *    anxious 70）：数据以 min:85 + lockLabel「好感≥85解锁」占位；且条件
 *    在渲染时按选择器默认目标判定灰显，玩家选择后引擎须对所选 NPC 复核
 *    （好感不足则拒绝确认）。A2 的「需 L3」（文档 lockLabel 为「好感≥40
 *    解锁」）为静态 40。
 * 4. 9.2 B 的被拒者 = day6_rejected_by ∪ day4_declined_by_player
 *    （custom d7_has_declined）；选择器理论上可选任意人，引擎应按被拒者
 *    集合约束可选范围（或按集合解析目标）。
 * 5. 9.3 事件级 when custom d7_confession_triggered（①9.2 选了告白 →
 *    场景=玩家与 {target}；②玩家未告白 → ∃Y：Y→玩家≥85 ∧ 玩家→Y≥60，
 *    Y 向玩家告白）；d7_resolve_confession 在事件结算后执行，事件被跳过
 *    时也必须执行（写 day7_confession_result / day7_confession_success 并
 *    触发 resolveEnding，§9.3 结局锁定）。
 * 6. 9.3 A1/A2/B 的条件按场景判定：①玩家主动告白 → 成功 ⇔ 玩家→X ≥ X.L4
 *    ∧ X→玩家 ≥ X.L4；②被告白 → 接受 ⇔ 玩家→Y ≥60。A1/A2 为互斥变体
 *    （按 d7_confession_possible / d7_confession_not_possible 二选一渲染），
 *    B 仅告白未成功时可用。
 * 7. 9.3 A2「对方 -2」的目标 = 场景对象（玩家主动 → day7_solo_target；
 *    被告白 → Y），引擎解析；A1 达成约定后的收尾对白由模型生成。
 */
import type { DaySpec, DecisionEventSpec, NpcSelectorSpec, OpenEventSpec } from "./types";

/** 9.2 selector：A1/A2/B 共享，放弃只走 C 选项 */
const soloSelector: NpcSelectorSpec = {
  prompt: "把谁叫到一边？",
  storeAs: "day7_solo_target",
};

/** 9.1 NPC 发言（开放）· full · 逐人风格硬约束 */
const npcSpeeches: OpenEventSpec = {
  kind: "open",
  id: "day7_npc_speeches",
  day: 7,
  title: "NPC 发言",
  location: "篝火广场",
  timeLabel: "D7 夜晚",
  tension: "high",
  visibility: "full",
  narration: [
    "火升起来了。每人都有一次说话的机会，但火不等人——高外向的人先抢到了话筒，沉默的人最后一个开口。",
  ],
  script: [
    { line: "火苗跳动，有人说得很长，有人只说了一句。" },
    { line: "有人讲起第一天的事，有人讲起岛上最好的一顿饭。笑声和沉默轮番落在火边。" },
    { speaker: "luze", line: "路上小心。" },
    { line: "周牧没有开口，只是把修好的东西递到你手里。他站了一会儿，又退回火圈外。" },
    { line: "夏栀说到一半，声音开始抖。" },
    { speaker: "xiazhi", line: "我其实……很想谢谢大家，我会记得这里的。" },
    { line: "她哭着说完了最后一句。" },
    { speaker: "anran", line: "这几天聊得够多了。我不后悔。" },
    { line: "然后火又安静下来，只剩柴火的噼啪声。" },
  ],
};

/** 9.2 玩家的单独机会（决策）· high · 无 D 槽 · 只 1 次机会 */
const soloChance: DecisionEventSpec = {
  kind: "decision",
  id: "day7_solo_chance",
  day: 7,
  title: "玩家的单独机会",
  location: "篝火旁→篝火圈外",
  timeLabel: "D7 夜晚",
  tension: "high",
  allowRiskSlot: false,
  narration: [
    "你只有一次把某人叫到一边的机会——这可能是告白、道歉，或告别。火光照着所有人的脸，你只能选一个。",
  ],
  options: [
    {
      id: "a_confess_target",
      slot: "A",
      intent: "confess",
      risk: "dangerous",
      text: "向{target}告白",
      // 动态阈值：min:85 为占位，引擎按所选目标依恋 L4（85/75/70）替换（注记 3）
      requires: {
        kind: "affinity",
        npc: { kind: "target" },
        min: 85,
      },
      lockLabel: "好感≥85解锁",
      selector: soloSelector,
      consumes: [{ resource: "solo_chance", amount: 1 }],
      // 触发 9.3 告白窗口由引擎按 day7_solo_target + d7_confession_triggered 判定
    },
    {
      id: "a_reconcile_target",
      slot: "A",
      intent: "comfort",
      risk: "subtle",
      text: "不是告白——道歉/和解/告别",
      requires: {
        kind: "affinity",
        npc: { kind: "target" },
        min: 40,
      },
      lockLabel: "好感≥40解锁",
      selector: soloSelector,
      effects: [
        {
          npc: { kind: "target" },
          delta: 3,
          note: "若 {target} 在 day6_frozen 则减半（+1）",
        },
      ],
      consumes: [{ resource: "solo_chance", amount: 1 }],
    },
    {
      id: "b_speak_to_rejected",
      slot: "B",
      intent: "ally",
      risk: "subtle",
      text: "找被你拒绝过的人说句话",
      requires: { kind: "custom", id: "d7_has_declined" },
      lockLabel: "你还没有拒绝过谁",
      selector: soloSelector,
      effects: [
        {
          npc: { kind: "random" },
          delta: 4,
          note: "被拒者（day6_rejected_by ∪ day4_declined_by_player，引擎解析）；avoidant 被拒者仅 +1（难以挽回）",
        },
      ],
      consumes: [{ resource: "solo_chance", amount: 1 }],
    },
    {
      id: "c_waive_chance",
      slot: "C",
      intent: "withdraw",
      risk: "safe",
      text: "放弃单独机会，留在篝火旁",
      effects: [
        {
          npc: { kind: "all" },
          delta: 1,
          note: "与多人告别（独立叙事回报）；克制结局候选（P4）",
        },
      ],
      facts: [{ key: "day7_solo_target", value: "none" }],
    },
  ],
};

/** 9.3 告白窗口（决策·conditional）· high · 无 D 槽 · 仅触发时渲染 */
const confessionWindow: DecisionEventSpec = {
  kind: "decision",
  id: "day7_confession_window",
  day: 7,
  title: "告白窗口",
  location: "篝火圈外",
  timeLabel: "D7 深夜",
  tension: "high",
  allowRiskSlot: false,
  // 触发判定（注记 5）：①9.2 选了告白 ②∃Y：Y→玩家≥85 ∧ 玩家→Y≥60
  when: { kind: "custom", id: "d7_confession_triggered" },
  // 跳过时也要执行（结局锁定，§9.3）
  afterHooks: ["d7_resolve_confession"],
  narration: ["你站在风口里，火光照着你们两个人的脸。有些话，只能在这里说最后一次。"],
  options: [
    {
      id: "a_final_confirm",
      slot: "A",
      intent: "confess",
      risk: "dangerous",
      text: "最后一句确认",
      // 场景 ①② 的成败判定均由 custom 条件承载（注记 6）
      requires: { kind: "custom", id: "d7_confession_possible" },
      lockLabel: "告白成功判定不成立",
      // 两人达成约定 day7_confession_success=true（P1 候选）；成功后收尾
      // 对白由模型生成；d7_resolve_confession 幂等补写 confession_success
      facts: [{ key: "day7_confession_result", value: "success" }],
    },
    {
      id: "a_end_gracefully",
      slot: "A",
      intent: "comfort",
      risk: "subtle",
      text: "体面地结束对话",
      requires: { kind: "custom", id: "d7_confession_not_possible" },
      lockLabel: "告白成功判定成立时不可选",
      effects: [
        {
          npc: { kind: "fact", key: "day7_solo_target" },
          delta: -2,
          note: "对方（场景对象：玩家主动告白 → day7_solo_target；被告白 → Y，引擎解析）；落空感，依恋反应见 §7 上浮",
        },
      ],
      facts: [{ key: "day7_confession_result", value: "rejected" }],
    },
    {
      id: "b_back_to_fire",
      slot: "B",
      intent: "ally",
      risk: "safe",
      text: "回到篝火旁，跟{target}说最后一句",
      requires: { kind: "custom", id: "d7_confession_not_possible" },
      lockLabel: "告白已成功时不可选",
      effects: [
        {
          npc: { kind: "target" },
          delta: 2,
          note: "把注意力放回全场",
        },
      ],
    },
    {
      id: "c_watch_fire",
      slot: "C",
      intent: "withdraw",
      risk: "subtle",
      text: "沉默地看着火",
      // 无显著变化；克制线加深
    },
  ],
};

export const day7: DaySpec = {
  day: 7,
  theme: "离别前夜·篝火",
  tension: "high",
  events: [npcSpeeches, soloChance, confessionWindow],
};

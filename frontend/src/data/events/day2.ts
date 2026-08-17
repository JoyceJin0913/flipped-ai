/**
 * Day 2 · 分组厨艺大比拼（medium）
 *
 * 依据：《心动岛_七日公共事件_精简版.md》§4（第 129-177 行）
 * 事件顺序：day2_pick_teammates → day2_group_tension → day2_failure_attribution
 *
 * 引擎注记（turnRunner 兜底/生成点，详见主会话交接报告）：
 * 1. day2_pick_teammates 分支 A「第一个选{焦点NPC}」的文案用枚举内等价
 *    占位符 {焦点NPC}（§2.5：焦点缺省 = 玩家最高好感 NPC）替代文档的
 *    {最高好感NPC}；效果目标用 {kind:"highest"}。
 * 2. 选项 facts 的 value 中出现的占位符（{焦点NPC}、{队长}、{选中者}、
 *    {culprit}）需引擎解析为 NPC id 后写入；{队长}/{选中者} 无独立 fact
 *    key，来源为引擎内部队长判定/选人结算。
 * 3. 「队长」「落选在即者」「组员」等效果目标无现成 NpcRef 类型，
 *    用 {kind:"random"} + note 语义化描述，由引擎按 note 解析（与
 *    types.ts 中 random 的「引擎按 note 说明随机」注释同通道）。
 * 4. day2_group_tension 挂 afterHooks: ["d2_resolve_last_picked"] 写入
 *    day2_last_picked / day2_comforter；但本事件旁白/脚本在渲染时就需要
 *    {lastPicked} / {comforter}，引擎需在渲染前先行结算该钩子（或允许
 *    占位符缺省）。
 * 5. 分支 B 的 nf_b_speak 条件推断自文档语义「替被推责者说话」
 *    （存在 day2_failed_culprit 才成立），文档正文未单列 requires 列。
 */
import type { DaySpec, DecisionEventSpec, OpenEventSpec } from "./types";

/** 4.1 选人轮次（决策）· medium · 无 D 槽 · 队长/非队长双分支 */
const pickTeammates: DecisionEventSpec = {
  kind: "decision",
  id: "day2_pick_teammates",
  day: 2,
  title: "选人轮次",
  location: "户外料理区",
  timeLabel: "D2 上午",
  tension: "medium",
  allowRiskSlot: false,
  narration: [
    "三个队长站到了前面。选人顺序公布——最先选的人，所有人都知道他选了谁。轮到你时，空气绷紧了。",
  ],
  beforeHooks: ["d2_determine_captains"],
  afterHooks: ["d2_resolve_groups"],
  branches: [
    {
      id: "captain",
      when: { kind: "fact", key: "day2_player_is_captain", value: "true" },
      options: [
        {
          id: "cap_a_first",
          slot: "A",
          intent: "comfort",
          risk: "safe",
          text: "第一个选{焦点NPC}",
          effects: [
            { npc: { kind: "highest" }, delta: 4, note: "公开偏爱" },
            { npc: { kind: "all_others" }, delta: -1, note: "被忽略/观察（-1~-2）" },
          ],
          // {焦点NPC} = 玩家最高好感 NPC（§2.5 焦点缺省语义），引擎解析为 id
          facts: [{ key: "day2_player_picked", value: "{焦点NPC}" }],
        },
        {
          id: "cap_b_surprise",
          slot: "B",
          intent: "challenge",
          risk: "subtle",
          text: "选一个意外的人",
          selector: {
            prompt: "选择你要选的人（意外选择）",
            storeAs: "day2_player_picked",
          },
          effects: [
            {
              npc: { kind: "fact", key: "day2_player_picked" },
              delta: 5,
              note: "被选者（公开信号）",
            },
            { npc: { kind: "highest" }, delta: -2, note: "最高好感者（公开信号）" },
          ],
        },
        {
          id: "cap_b_speak",
          slot: "B",
          intent: "ally",
          risk: "subtle",
          text: "帮一直没被选的人说话",
          requires: { kind: "custom", id: "d2_someone_about_to_be_unpicked" },
          lockLabel: "场上无人落选在即",
          effects: [
            {
              npc: { kind: "random" },
              delta: 5,
              note: "落选在即者（引擎判定，与 d2_someone_about_to_be_unpicked 同一判定）",
            },
            { npc: { kind: "all" }, delta: 1, note: "公道" },
          ],
        },
        {
          id: "cap_c_step_back",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "退后一步，不主动",
          effects: [
            {
              npc: { kind: "all" },
              delta: -1,
              note: "队长失格印象；对 avoidant -0（他理解退缩）",
            },
          ],
          facts: [{ key: "day2_player_picked", value: "none" }],
        },
      ],
    },
    {
      id: "not_captain",
      when: { kind: "fact", key: "day2_player_is_captain", value: "false" },
      options: [
        {
          id: "non_a_signal",
          slot: "A",
          intent: "comfort",
          risk: "subtle",
          text: "向队长示意愿意加入",
          requires: { kind: "custom", id: "d2_pick_round_early" },
          lockLabel: "选人已过前两轮",
          effects: [
            {
              npc: { kind: "random" },
              delta: 2,
              note: "队长（示好）；若队长=最高好感者，其 anxious 加权 +4",
            },
          ],
          // {队长} 无独立 fact key，来源=引擎内部队长判定，引擎解析为 id
          facts: [{ key: "day2_player_picked_by", value: "{队长}" }],
        },
        {
          id: "non_a_wait",
          slot: "A",
          intent: "observe",
          risk: "safe",
          text: "安静等着被选",
          // {选中者} = 最终选中玩家的人，引擎在选人结算时解析为 id
          facts: [{ key: "day2_player_picked_by", value: "{选中者}" }],
        },
        {
          id: "non_b_speak",
          slot: "B",
          intent: "ally",
          risk: "subtle",
          text: "帮一直没被选的人说话",
          requires: { kind: "custom", id: "d2_someone_about_to_be_unpicked" },
          lockLabel: "场上无人落选在即",
          effects: [
            {
              npc: { kind: "random" },
              delta: 5,
              note: "落选在即者（引擎判定，与 d2_someone_about_to_be_unpicked 同一判定）",
            },
          ],
        },
        {
          id: "non_c_step_back",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "退后一步，不主动",
          facts: [{ key: "day2_player_picked_by", value: "none" }],
        },
      ],
    },
  ],
};

/** 4.2 分组后暗流（开放）· half · 纯动作描写 */
const groupTension: OpenEventSpec = {
  kind: "open",
  id: "day2_group_tension",
  day: 2,
  title: "分组后暗流",
  location: "各组料理台",
  timeLabel: "D2 上午（分组后）",
  tension: "medium",
  visibility: "half",
  narration: ["{lastPicked} 低着头走进了自己的组，{comforter} 拍了拍她/他旁边的空位。"],
  // 写入 day2_last_picked / day2_comforter（引擎注记：渲染需先行结算）
  afterHooks: ["d2_resolve_last_picked"],
  script: [
    { line: "{lastPicked} 低着头走进自己的组，没有看任何人。" },
    { line: "{comforter} 往旁边让了让，拍了拍空位。" },
    { line: "有人张了张嘴，最后还是把话咽了回去。" },
    { line: "切菜声很密，说话声很少。各组的空气，都不一样。" },
  ],
};

/** 4.3 失败归因（决策）· medium · 无 D 槽 · 本组翻车/他组翻车双分支 */
const failureAttribution: DecisionEventSpec = {
  kind: "decision",
  id: "day2_failure_attribution",
  day: 2,
  title: "失败归因",
  location: "料理区",
  timeLabel: "D2 午后（试菜前）",
  tension: "medium",
  allowRiskSlot: false,
  narration: [
    "某组的菜做砸了。成功的合作没有戏，失败后的归因才有戏——谁道歉、谁推责、谁沉默、谁替人背锅。",
  ],
  branches: [
    {
      id: "player_group_failed",
      when: { kind: "fact", key: "day2_player_group_failed", value: "true" },
      options: [
        {
          id: "fail_a_own",
          slot: "A",
          intent: "expose_self",
          risk: "safe",
          text: "「是我看错了火候。」",
          effects: [
            {
              npc: { kind: "random" },
              delta: 2,
              note: "组员（担当印象，+2~3）；焦点 NPC 依恋加权：secure +3 / anxious +4（被护住）/ avoidant +1",
            },
          ],
        },
        {
          id: "fail_a_blame",
          slot: "A",
          intent: "challenge",
          risk: "dangerous",
          text: "「刚才谁负责计时的？」",
          requires: { kind: "fact", key: "day2_failed_culprit" },
          lockLabel: "尚无明确责任人",
          effects: [
            {
              npc: { kind: "fact", key: "day2_failed_culprit" },
              delta: -6,
              note: "责任人；若责任人是焦点 NPC，关系可能不可逆",
            },
            { npc: { kind: "random" }, delta: -1, note: "其余组员（气氛紧张）" },
          ],
          // {culprit} = day2_failed_culprit 的值，引擎解析为 id
          facts: [{ key: "day2_player_blamed", value: "{culprit}" }],
        },
        {
          id: "fail_b_reassure",
          slot: "B",
          intent: "comfort",
          risk: "subtle",
          text: "跟{target}说「不是你的问题」",
          effects: [
            {
              npc: { kind: "target" },
              delta: 4,
              note: "若 target 是被推责者则 +6",
            },
          ],
        },
        {
          id: "fail_c_silent",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "保持沉默",
          effects: [{ npc: { kind: "random" }, delta: -1, note: "组员（没人兜底）" }],
        },
      ],
    },
    {
      id: "player_group_ok",
      when: { kind: "fact", key: "day2_player_group_failed", value: "false" },
      options: [
        {
          id: "nf_a_soothe",
          slot: "A",
          intent: "comfort",
          risk: "safe",
          text: "「算了，还有下次」",
          effects: [{ npc: { kind: "all" }, delta: 1, note: "打圆场" }],
        },
        {
          id: "nf_b_speak",
          slot: "B",
          intent: "ally",
          risk: "subtle",
          text: "替被推责者说话",
          requires: { kind: "fact", key: "day2_failed_culprit" },
          lockLabel: "无人被推责",
          effects: [
            {
              npc: { kind: "fact", key: "day2_failed_culprit" },
              delta: 5,
              note: "被推责者",
            },
          ],
        },
        {
          id: "nf_c_silent",
          slot: "C",
          intent: "withdraw",
          risk: "subtle",
          text: "保持沉默",
        },
      ],
    },
  ],
};

export const day2: DaySpec = {
  day: 2,
  theme: "分组厨艺大比拼",
  tension: "medium",
  events: [pickTeammates, groupTension, failureAttribution],
};

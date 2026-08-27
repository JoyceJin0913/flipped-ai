/**
 * 七日公共事件 —— 共享数据契约（唯一事实来源）
 *
 * 依据：《心动岛_七日公共事件_精简版.md》（repo 根，§1~§15）
 * 本文件由主会话统一维护。T3/T4 写事件数据、T2 写 store、T5 写 turnRunner
 * 时一律只 import，不得修改本文件；需要新增枚举值（CustomCondId /
 * EngineHookId / 占位符 / 事件 id）必须先报告主会话，由主会话统一追加。
 *
 * 分层约定：
 * - types.ts（本文件）   ：类型 + 枚举 + 常量标签
 * - day{1..7}.ts         ：7 天事件数据（每文件导出 const dayN: DaySpec）
 * - turnRunner.ts (T5)   ：引擎逻辑（钩子实现、占位符填充、条件判定、结算）
 * - useIslandStore.ts    ：持久化状态（relationships / worldFacts / resources）
 */

import type { AttachmentType } from "../../onboarding/types";
import type { OptionIntent } from "../../core/intents";
import type { WorldFactWrite } from "../../core/worldFacts";

// ============================================================
// 基础枚举
// ============================================================

/** 天数 1~7 */
export type DayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 张力档位（§1：低→low、中→medium、中高/高→high、极高→very-high） */
export type TensionLevel = "low" | "medium" | "high" | "very-high";

/** 风险等级（§2.1 硬规则 2：界面只显示风险，不显示好感数值） */
export type RiskLevel = "safe" | "subtle" | "dangerous";

/** 选项槽位（§2.2）：A推进 / B转移 / C回避（张力≥high 必出现）/ D风险（仅 allowRiskSlot） */
export type SlotId = "A" | "B" | "C" | "D";

/** 开放事件三形态（§2.3） */
export type Visibility = "full" | "half" | "hidden";

/** 玩家稀缺资源（§11） */
export type ResourceKey =
  | "exemption" // 豁免权：D3 开场 1 次，仅 D3 有效
  | "trust_points" // 信任额度：D5 开场 3 次，D 槽耗 2 次，不过夜
  | "declaration" // 表态权：D6，不可撤回
  | "solo_chance"; // 单独机会：D7，仅 1 人

/** 21 个事件 id（播放顺序 = 每行内从左到右） */
export const ALL_EVENT_IDS = [
  "day1_seat_choice",
  "day1_silence_broken",
  "day1_player_approached",
  "day2_pick_teammates",
  "day2_group_tension",
  "day2_failure_attribution",
  "day3_called_out",
  "day3_npc_grilling",
  "day3_design_question",
  "day4_invite_round",
  "day4_respond_invite",
  "day4_date_or_stay",
  "day5_first_secret",
  "day5_their_exchange",
  "day5_sense_wrong",
  "day6_earlier_declarations",
  "day6_declare",
  "day6_rejected_response",
  "day7_npc_speeches",
  "day7_solo_chance",
  "day7_confession_window",
] as const;

export type EventId = (typeof ALL_EVENT_IDS)[number];

/** 玩家侧资源初始发放（store 在进天时执行，见 §11 发放时机） */
export const DAY_RESOURCE_GRANTS: Partial<Record<DayNumber, ResourceKey[]>> = {
  3: ["exemption"],
  5: ["trust_points"],
  6: ["declaration"],
  7: ["solo_chance"],
};

// ============================================================
// 占位符（§2.5 + 事件内引用的扩展）
// ============================================================

export const PLACEHOLDERS = [
  "{target}",
  "{焦点NPC}",
  "{邻座A}",
  "{邻座B}",
  "{沉默NPC}",
  "{搭话NPC}",
  "{邀请者A}",
  "{邀请者B}",
  "{听者}",
  "{lastPicked}",
  "{comforter}",
  "{约会对象}",
] as const;

export type Placeholder = (typeof PLACEHOLDERS)[number];

/**
 * 占位符 → 引擎解析来源（turnRunner 实现，数据方不得臆造新占位符）：
 * - {target}      选择器目标；无选择器时默认=玩家第二好感 NPC（§2.5）
 * - {焦点NPC}     事件 focus 字段指定的 NPC；未指定=玩家最高好感 NPC
 * - {邻座A}/{邻座B}  引擎种子事实 day1_seat_left / day1_seat_right
 * - {搭话NPC}     day1_approacher（3.1 选 C 时写入）；否则 day1_first_speaker
 * - {邀请者A/B}   day4_inviter_a / day4_inviter_b（d4_generate_invites 写入）
 * - {听者}        day5_leaked_listener
 * - {lastPicked}  day2_last_picked
 * - {comforter}   day2_comforter（d2_resolve_last_picked 写入）
 * - {约会对象}    day4_accepted_npc
 * - {沉默NPC}     当天发言最少的 NPC（引擎统计，并列取好感最高者）
 */

// ============================================================
// NPC 引用
// ============================================================

/** 指向单个 NPC 的引用 */
export type NpcRef =
  | { kind: "npc"; id: string } // 显式 NPC id（npcLibrary）
  | { kind: "focus" } // 事件焦点（focus 字段 > 最高好感）
  | { kind: "target" } // 选择器目标（默认第二好感）
  | { kind: "highest" } // 玩家最高好感 NPC
  | { kind: "second" } // 玩家第二好感 NPC
  | { kind: "fact"; key: string }; // worldFact 存单个 NPC id（列表取第一个）

/** 效果目标：单个 NPC 引用或集合 */
export type EffectTarget =
  | NpcRef
  | { kind: "fact_list"; key: string } // 逗号分隔列表，全员生效
  | { kind: "all" } // 岛上全体 NPC
  | { kind: "all_others" } // 除本选项主目标外全体
  | { kind: "random" }; // 引擎按 note 说明随机（如「另一个没被选的人」）

// ============================================================
// 条件（requires / when）
// ============================================================

/** 自定义条件（turnRunner 内置实现；T3/T4 只能用枚举内 id，缺了先报告） */
export type CustomCondId =
  | "d1_three_silent" // D1 场上 ≥3 人沉默（3.3 B）
  | "d2_someone_about_to_be_unpicked" // D2 有 ≥1 人落选在即（4.1 双分支）
  | "d2_pick_round_early" // D2 选人进行到前两轮（4.1 非队长 A1）
  | "d3_question_at_most_l2" // D3 问题层级 ≤L2（5.1 A1 变体）
  | "d3_question_is_l3" // D3 问题层级 =L3（5.1 A2 变体）
  | "d3_two_silent" // D3 场上 ≥2 人沉默（5.3 B）
  | "d6_has_zero_vote" // D6 存在零票者（8.2 D 槽）
  | "d6_has_rejected" // D6 存在被拒者（8.3 A）
  | "d7_has_declined" // D7 day6_rejected_by ∪ day4_declined_by_player 非空（9.2 B）
  | "d7_confession_triggered" // D7 告白窗口触发判定（9.3 ①②）
  | "d7_confession_possible" // D7 告白成功判定成立（9.3 A）
  | "d7_confession_not_possible"; // D7 告白未成功（9.3 B）

/** 选项条件 / 事件跳过条件 */
export type OptionRequire =
  | { kind: "affinity"; npc: NpcRef; min: number; direction?: "player_to_npc" } // 默认玩家→NPC
  | {
      kind: "relationship_metric";
      npc: NpcRef;
      metric: "player_interest" | "npc_interest" | "trust" | "tension" | "intimacy";
      min?: number;
      max?: number;
    }
  | {
      kind: "memory_tag";
      npc: NpcRef;
      tag: "chat" | "support" | "promise" | "date" | "conflict" | "rejection" | "secret";
    }
  | { kind: "attachment_is"; npc: NpcRef; attachment: AttachmentType }
  | { kind: "resource"; resource: ResourceKey; min: number }
  | { kind: "fact"; key: string; value?: string } // 存在（给 value 则须相等）
  | { kind: "not_fact"; key: string }
  | { kind: "all_of"; of: OptionRequire[] }
  | { kind: "any_of"; of: OptionRequire[] }
  | { kind: "custom"; id: CustomCondId };

/**
 * lockLabel 生成规则（turnRunner）：
 * - 未显式给 lockLabel 时：affinity 条件 → 「好感≥{min}解锁」；
 *   resource 条件 → 「信任额度已用完」/「豁免权已使用」等；
 *   其余条件 → 由数据方显式提供 lockLabel。
 */

// ============================================================
// 引擎钩子（beforeHooks / afterHooks，turnRunner 内置实现）
// ============================================================

/**
 * 引擎钩子 id。只做「事实/状态的生成与重算」，资源发放走 store 进天逻辑
 * （DAY_RESOURCE_GRANTS），不在此列。T3/T4 只能用枚举内 id，缺了先报告。
 */
export type EngineHookId =
  | "d1_seed_seats" // before day1_seat_choice：固定种子生成左右邻座 → day1_seat_left/day1_seat_right
  | "d1_roll_approacher" // after day1_seat_choice 选 C：随机搭话者 → day1_approacher
  | "d2_determine_captains" // before day2_pick_teammates：队长判定 → day2_player_is_captain
  | "d2_resolve_groups" // after day2_pick_teammates：分组+某组必然翻车 → day2_failed_group/day2_player_group_failed/day2_failed_culprit
  | "d2_resolve_last_picked" // after day2_group_tension：day2_last_picked + day2_comforter
  | "d3_generate_question_level" // before day3_called_out：生成 L1~L3 → day3_question_level
  | "d4_generate_invites" // after day4_invite_round：§6.1 名额生成 → day4_invite_count/day4_invited_by/day4_date_pairs/day4_inviter_a/day4_inviter_b
  | "d5_resolve_exchange" // after day5_their_exchange：day5_exchange_pair + 泄露判定 → day5_leaked/day5_leaked_listener
  | "d6_generate_order" // before day6_earlier_declarations：表态顺序 → day6_order
  | "d6_generate_early_declares" // before day6_earlier_declarations：预生成表态+零票者 → day6_early_declares/day6_zero_vote
  | "d6_recompute_votes" // after day6_declare：重算后段表态/零票/互选/被拒名单 → day6_mutual/day6_rejected_by
  | "d7_resolve_confession"; // after day7_confession_window（跳过时也要跑）：告白成败 → day7_confession_result/day7_confession_success

// ============================================================
// 效果 / 选项 / 选择器
// ============================================================

/** 好感变化效果（参考 Δ；主目标以 settle() 结算为准） */
export interface EventEffect {
  /** 目标 */
  npc: EffectTarget;
  /** 参考 Δ（正负均可） */
  delta: number;
  /** 人类可读说明（回放/调试用，如「依恋加权：anxious +3」） */
  note?: string;
}

/** 资源消耗 */
export interface ResourceCost {
  resource: ResourceKey;
  amount: number;
}

/** NPC 选择器（选项点击后弹出） */
export interface NpcSelectorSpec {
  /** 选择器标题 */
  prompt: string;
  /** 默认选中（缺省 = 玩家第二好感 NPC，§2.5） */
  defaultRef?: NpcRef;
  /** 允许放弃（如 D7 单独机会，写 "none"） */
  allowNone?: boolean;
  /** 放弃按钮文案（如「放弃单独机会」） */
  noneLabel?: string;
  /** 选中结果写入的 worldFact key */
  storeAs?: string;
}

/** 单个选项 */
export interface EventOption {
  /** 事件内唯一 id（如 "a_join"，同一事件的多个分支间不得重复） */
  id: string;
  /** 槽位（同槽多个选项 = 互斥变体，按 requires 二选一渲染） */
  slot: SlotId;
  /** 四槽位意图（10 种，见 core/intents.ts） */
  intent: OptionIntent;
  /** 风险等级（只显示这个，不显示好感数值） */
  risk: RiskLevel;
  /** 选项文案（含 {占位符}） */
  text: string;
  /** 解锁条件（不满足 → 灰显 + lockLabel） */
  requires?: OptionRequire;
  /** 灰显提示（缺省按 requires 自动生成，见上文规则） */
  lockLabel?: string;
  /** 好感变化效果（参考值） */
  effects?: EventEffect[];
  /** 写入 worldFact */
  facts?: WorldFactWrite[];
  /** 消耗稀缺资源 */
  consumes?: ResourceCost[];
  /** NPC/旁白对玩家选择的即时反应（硬编码，含 {占位符}） */
  reply?: string;
  /** 需要玩家先选目标的选择器 */
  selector?: NpcSelectorSpec;
  /** requires 不满足时的替换选项（如 D1 3.3 B → 「把话题引向{target}」） */
  fallback?: EventOption;
}

/** 互斥分支（按 when 择一渲染整组选项） */
export interface OptionBranch {
  /** 分支名（回放/调试用，如 "captain" / "not_captain"） */
  id: string;
  /** 分支条件 */
  when: OptionRequire;
  /** 该分支的选项组 */
  options: EventOption[];
  /** 该分支的选择器 */
  selector?: NpcSelectorSpec;
}

// ============================================================
// 事件 / 天
// ============================================================

/** 事件公共字段 */
export interface EventBase {
  id: EventId;
  day: DayNumber;
  /** 事件标题（如「选座位」） */
  title: string;
  /** 地点（如「别墅餐厅长桌」） */
  location: string;
  /** 时间标签（如「D1 早晨」） */
  timeLabel: string;
  /** 张力 */
  tension: TensionLevel;
  /** 开场旁白段落（含 {占位符}，逐段渲染） */
  narration: string[];
  /** 渲染条件：不满足则跳过本事件（如 day7_confession_window） */
  when?: OptionRequire;
  /** 渲染前引擎钩子 */
  beforeHooks?: EngineHookId[];
  /** 结算后引擎钩子 */
  afterHooks?: EngineHookId[];
}

/** 决策事件 */
export interface DecisionEventSpec extends EventBase {
  kind: "decision";
  /** D 风险槽是否开放（§2.2 标注的 5 个事件才为 true） */
  allowRiskSlot: boolean;
  /** 事件焦点（缺省 = 玩家最高好感 NPC） */
  focus?: NpcRef;
  /** 无分支事件：直接给 options；有分支：给 branches（二者必居其一） */
  options?: EventOption[];
  branches?: OptionBranch[];
  /** 事件级选择器（一般放选项上，此处备用） */
  selector?: NpcSelectorSpec;
}

/** 开放事件台词行（speaker 缺席岛上 → 整行跳过） */
export interface ScriptLine {
  /** 说话者：NPC id / NpcRef；省略 = 旁白 */
  speaker?: string | NpcRef;
  /** 台词（遵守该 NPC StyleContract 字数上限） */
  line: string;
}

/** 开放事件（无玩家决策） */
export interface OpenEventSpec extends EventBase {
  kind: "open";
  /** 三形态：full 完整对话 / half 只动作描写 / hidden 一句话 */
  visibility: Visibility;
  /** 事件正文 */
  script: ScriptLine[];
}

export type EventSpec = DecisionEventSpec | OpenEventSpec;

/** 一天的事件包（events 顺序即播放顺序，固定 3 个） */
export interface DaySpec {
  day: DayNumber;
  /** 当日主题（如「早餐桌上的沉默」） */
  theme: string;
  tension: TensionLevel;
  events: [EventSpec, EventSpec, EventSpec];
  /** 进入当天时执行的钩子 */
  openingHooks?: EngineHookId[];
  /** 离开当天时执行的钩子 */
  closingHooks?: EngineHookId[];
}

// ============================================================
// worldFact 值约定（§12）
// ============================================================

/**
 * fact 值一律为字符串：
 * - 布尔： "true" / "false"（如 day2_player_is_captain）
 * - 列表：逗号分隔（如 day4_invited_by = "guyan,xiaohai"）；空列表 = ""
 * - 空值： "none"（如 day7_solo_target=null 时）
 * - 引擎内部结构（如 day6_early_declares、day6_mutual、day4_date_pairs）：
 *   由引擎自定字符串格式（建议 JSON.stringify），引擎自己写自己读，
 *   数据方不得直接依赖其内部格式，需要元素时用引擎提供的单值/列表键。
 *
 * §12 表中由「玩家选择」直接写入的 fact 由数据方在选项 facts 里声明；
 * 由「引擎结算」写入的 fact 由对应 EngineHookId 负责。
 */

// ============================================================
// 中文标签（UI 用，T5/T6 直接 import）
// ============================================================

export const RISK_LABELS: Record<RiskLevel, string> = {
  safe: "安全",
  subtle: "微妙",
  dangerous: "危险",
};

export const SLOT_LABELS: Record<SlotId, string> = {
  A: "推进",
  B: "转移",
  C: "回避",
  D: "风险",
};

export const TENSION_LABELS: Record<TensionLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
  "very-high": "极高",
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  full: "全可见",
  half: "半可见",
  hidden: "不可见",
};

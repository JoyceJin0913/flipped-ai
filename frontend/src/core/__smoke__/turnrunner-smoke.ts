/**
 * turnRunner 冒烟测试（T5 产出，对照 island-smoke.ts 模式）
 *
 * 运行（必须在 frontend 目录下，@/ 别名由 tsconfig paths 提供）：
 *   cd frontend && ../backend/node_modules/.bin/tsx src/core/__smoke__/turnrunner-smoke.ts
 *
 * 覆盖：
 *   1. fillText：12 占位符真名替换（含 {搭话NPC} 回退 first_speaker）
 *   2. evaluateRequire：affinity/resource/fact/not_fact/all_of/custom + 动态阈值
 *   3. buildOptions：分支择一、变体隐藏 vs 灰显、fallback、C 槽告警、D 槽门禁
 *   4. resolveOption：settle 主目标 Δ∈[-15,18] 且 ≠0、依恋修正表、facts 占位符、
 *      selector storeAs、day1_seat_neighbor 覆写
 *   5. runEngineHook：d1_seed_seats / d2 三件套 / d3 / d4 / d6 三件套 / d7 的
 *      关键输出与幂等性
 *   6. custom 条件：d2/d3/d6/d7 全量抽查
 */

// 注：本测试不 import store（turnRunner 依赖链纯数据/纯函数），无需 window shim。
import type { WorldFacts, WorldFact } from "../worldTypes";
import type { WorldFactWrite } from "../worldFacts";
import type {
  DecisionEventSpec,
  EngineHookId,
  EventId,
  EventOption,
  ResourceKey,
} from "../../data/events/types";

/** 冒烟用 9 人岛（混合三种依恋类型） */
const NINE = [
  "guyan", // 顾言 secure
  "xiaohai", // 小海 anxious
  "luze", // 陆则 avoidant
  "anran", // 安然 avoidant
  "chengyi", // 承熠 secure
  "linxia", // 林夏 anxious
  "zhoumu", // 周牧 avoidant
  "ningwan", // 宁婉 secure
  "xiazhi", // 夏栀 anxious
];

// ---- 计数与断言 ----
let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${name}: ${msg}`);
    console.error(`FAIL ${name} -> ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log("turnRunner smoke test");
  const m = await import("../turnRunner");
  const events = await import("../../data/events");
  // 数据校验随 import 执行（validateEventData）

  type Ctx = import("../turnRunner").EngineContext;
  const makeCtx = (
    init: {
      rel?: Record<string, [number, number]>;
      facts?: Record<string, string>;
      resources?: Partial<Record<ResourceKey, number>>;
      day?: number;
      eventIndex?: number;
      eventLog?: Array<{ eventId: string; optionId: string | null }>;
      rng?: () => number;
    } = {},
  ): Ctx => {
    const relationships: Record<string, import("../turnRunner").EngineCtxRel> = {};
    for (const id of NINE) {
      const [px, nx] = init.rel?.[id] ?? [30, 30];
      relationships[id] = { toNpc: px, fromNpc: nx };
    }
    const worldFacts: WorldFacts = {};
    for (const [k, v] of Object.entries(init.facts ?? {})) {
      const f: WorldFact = {
        key: k,
        value: v,
        day: init.day ?? 1,
        beatId: "smoke",
        confirmed: true,
      };
      worldFacts[k] = f;
    }
    return {
      npcIds: [...NINE],
      relationships,
      worldFacts,
      resources: {
        exemption: 0,
        trust_points: 0,
        declaration: 0,
        solo_chance: 0,
        ...init.resources,
      },
      day: init.day ?? 1,
      eventIndex: init.eventIndex ?? 0,
      eventLog: init.eventLog ?? [],
      random: init.rng ?? (() => 0.5),
    };
  };

  const writeMap = (r: import("../turnRunner").EngineResult): Record<string, string> =>
    Object.fromEntries(r.factWrites.map((w) => [w.key, w.value]));

  /** 分支事件内取选项（resolveOption 需要分支内 option 对象） */
  const findOpt = (
    ev: DecisionEventSpec,
    branchId: string | null,
    optionId: string,
  ): EventOption => {
    if (ev.branches && branchId) {
      const b = ev.branches.find((x) => x.id === branchId);
      const inBranch = b?.options.find((o) => o.id === optionId);
      if (inBranch) return inBranch;
    }
    const top = ev.options?.find((o) => o.id === optionId);
    if (!top) throw new Error(`缺选项 ${optionId}`);
    return top;
  };

  const baseRel: Record<string, [number, number]> = {
    guyan: [40, 30],
    xiaohai: [35, 30],
    luze: [30, 30],
    anran: [30, 30],
    chengyi: [30, 30],
    linxia: [30, 30],
    zhoumu: [30, 30],
    ningwan: [30, 30],
    xiazhi: [30, 30],
  };

  // ============================================================
  // 1. fillText：12 占位符
  // ============================================================
  console.log("\n[1] fillText");
  {
    const ctx = makeCtx({
      rel: baseRel,
      facts: {
        day1_seat_left: "chengyi",
        day1_seat_right: "ningwan",
        day1_silent_npc: "anran",
        day1_approacher: "zhoumu",
        day1_first_speaker: "guyan",
        day2_last_picked: "luze",
        day2_comforter: "xiaohai",
        day4_inviter_a: "xiazhi",
        day4_inviter_b: "ningwan",
        day4_accepted_npc: "linxia",
        day5_leaked_listener: "zhoumu",
      },
    });
    // {target} = 第二好感（px: guyan 40 > xiaohai 35）
    check("target -> 第二好感", () => {
      if (m.fillText("{target}坐在角落", ctx) !== "小海坐在角落") {
        throw new Error(`got: ${m.fillText("{target}坐在角落", ctx)}`);
      }
    });
    check("焦点NPC -> 最高好感", () => {
      if (m.fillText("{焦点NPC}起身", ctx) !== "顾言起身") {
        throw new Error(`got: ${m.fillText("{焦点NPC}起身", ctx)}`);
      }
    });
    check("邻座A/B", () => {
      if (m.fillText("{邻座A}与{邻座B}", ctx) !== "承熠与宁婉") {
        throw new Error(`got: ${m.fillText("{邻座A}与{邻座B}", ctx)}`);
      }
    });
    check("沉默NPC / 搭话NPC（approacher 优先于 first_speaker）", () => {
      if (m.fillText("{搭话NPC}看向{沉默NPC}", ctx) !== "周牧看向安然") {
        throw new Error(`got: ${m.fillText("{搭话NPC}看向{沉默NPC}", ctx)}`);
      }
    });
    check("搭话NPC 回退 day1_first_speaker", () => {
      const c2 = makeCtx({
        rel: baseRel,
        facts: { day1_first_speaker: "guyan" },
      });
      if (m.fillText("{搭话NPC}", c2) !== "顾言") {
        throw new Error(`got: ${m.fillText("{搭话NPC}", c2)}`);
      }
    });
    check("lastPicked / comforter", () => {
      if (m.fillText("{lastPicked}靠在{comforter}肩头", ctx) !== "陆则靠在小海肩头") {
        throw new Error(`got: ${m.fillText("{lastPicked}靠在{comforter}肩头", ctx)}`);
      }
    });
    check("邀请者A/B / 约会对象 / 听者", () => {
      if (
        m.fillText("{邀请者A}和{邀请者B}等在门口，{约会对象}已出发，{听者}躲在窗帘后", ctx) !==
        "夏栀和宁婉等在门口，林夏已出发，周牧躲在窗帘后"
      ) {
        throw new Error(
          `got: ${m.fillText("{邀请者A}和{邀请者B}等在门口，{约会对象}已出发，{听者}躲在窗帘后", ctx)}`,
        );
      }
    });
    check("占位符缺失保留原文不抛错", () => {
      // 未知占位符（不在 PLACEHOLDER_MAP）保持原文；{沉默NPC} 等引擎会
      // 按岛上状态兜底解析（silentNpcId），不是缺失
      if (
        m.fillText("无法解析的{未知占位符}没了", makeCtx({ rel: baseRel })) !==
        "无法解析的{未知占位符}没了"
      ) {
        throw new Error("未知占位符缺失时应保留原文");
      }
    });
  }

  // ============================================================
  // 2. evaluateRequire
  // ============================================================
  console.log("\n[2] evaluateRequire");
  {
    const ctx = makeCtx({
      rel: { ...baseRel, guyan: [40, 30], luze: [90, 30] },
      resources: { trust_points: 0 },
    });
    check("affinity 通过/未过 + lockLabel", () => {
      const ok = m.evaluateRequire({ kind: "affinity", npc: { kind: "highest" }, min: 30 }, ctx);
      if (!ok.pass) throw new Error("min30 应通过");
      const fail = m.evaluateRequire({ kind: "affinity", npc: { kind: "highest" }, min: 95 }, ctx);
      if (fail.pass) throw new Error("min95（>最高 90）不应通过");
      if (fail.lockLabel !== "好感≥95解锁") throw new Error(`label=${fail.lockLabel}`);
    });
    check("resource 未过 -> 信任额度已用完", () => {
      const r = m.evaluateRequire({ kind: "resource", resource: "trust_points", min: 1 }, ctx);
      if (r.pass || r.lockLabel !== "信任额度已用完") {
        throw new Error(`got ${JSON.stringify(r)}`);
      }
    });
    check("fact / not_fact", () => {
      const c2 = makeCtx({ facts: { day4_went_date: "true" } });
      if (!m.evaluateRequire({ kind: "fact", key: "day4_went_date", value: "true" }, c2).pass) {
        throw new Error("fact true 应通过");
      }
      if (m.evaluateRequire({ kind: "fact", key: "day4_went_date", value: "false" }, c2).pass) {
        throw new Error("fact false 不应通过");
      }
      if (!m.evaluateRequire({ kind: "not_fact", key: "day5_leaked" }, c2).pass) {
        throw new Error("not_fact 应通过");
      }
    });
    check("all_of 取首个未过子条件的 lockLabel", () => {
      // fact 子条件先满足 → 首个未过 = resource → 信任额度已用完
      const c2 = makeCtx({ facts: { day4_went_date: "true" } });
      const r = m.evaluateRequire(
        {
          kind: "all_of",
          of: [
            { kind: "fact", key: "day4_went_date", value: "true" },
            { kind: "resource", resource: "trust_points", min: 1 },
          ],
        },
        c2,
      );
      if (r.pass) throw new Error("不应通过");
      if (r.lockLabel !== "信任额度已用完") throw new Error(`label=${r.lockLabel}`);
    });
    check("custom d7_has_declined / d6_has_zero_vote / d6_has_rejected", () => {
      const c2 = makeCtx({
        facts: { day6_rejected_by: "guyan,luze", day6_zero_vote: "zhoumu" },
      });
      if (!m.evaluateRequire({ kind: "custom", id: "d7_has_declined" }, c2).pass) {
        throw new Error("有被拒名单应通过");
      }
      if (!m.evaluateRequire({ kind: "custom", id: "d6_has_zero_vote" }, c2).pass) {
        throw new Error("有零票者应通过");
      }
      if (!m.evaluateRequire({ kind: "custom", id: "d6_has_rejected" }, c2).pass) {
        throw new Error("有被拒者应通过");
      }
      const c3 = makeCtx({});
      if (m.evaluateRequire({ kind: "custom", id: "d6_has_rejected" }, c3).pass) {
        throw new Error("无被拒者不应通过");
      }
    });
    check("动态阈值 dynamicAffinityMin", () => {
      // 最高好感 = luze（avoidant）→ L4=85；xiaohai（anxious）→ L4=70
      if (
        m.dynamicAffinityMin(
          "a_confess_highest",
          makeCtx({ rel: { ...baseRel, luze: [90, 30] } }),
        ) !== 85
      ) {
        throw new Error("luze avoidant L4 应为 85");
      }
      if (
        m.dynamicAffinityMin(
          "a_confess_highest",
          makeCtx({ rel: { ...baseRel, xiaohai: [90, 30] } }),
        ) !== 70
      ) {
        throw new Error("xiaohai anxious L4 应为 70");
      }
      // a_reconcile_target 无动态规则 → null
      if (m.dynamicAffinityMin("a_reconcile_target", makeCtx({})) !== null) {
        throw new Error("a_reconcile_target 应无动态阈值");
      }
    });
  }

  // ============================================================
  // 3. buildOptions
  // ============================================================
  console.log("\n[3] buildOptions");
  {
    const d1 = events.getDay(1)?.events[0];
    const d2 = events.getDay(2)?.events[0];
    const d3 = events.getDay(3)?.events[0];
    const d4 = events.getDay(4)?.events[1];
    const d5 = events.getDay(5)?.events[0];
    const d6 = events.getDay(6)?.events[1];
    const d7 = events.getDay(7)?.events[1];
    if (!d1 || !d2 || !d3 || !d4 || !d5 || !d6 || !d7) throw new Error("事件缺失");

    check("day2 分支择一：captain", () => {
      const r = m.buildOptions(
        d2 as DecisionEventSpec,
        makeCtx({ facts: { day2_player_is_captain: "true" } }),
      );
      if (r.branchId !== "captain") throw new Error(`branch=${r.branchId}`);
      if (!r.options.some((o) => o.option.id === "cap_a_first")) {
        throw new Error("应含 cap_a_first");
      }
      if (r.options.some((o) => o.option.id === "non_a_signal")) {
        throw new Error("不应含 non_a_signal");
      }
    });
    check("day2 分支择一：not_captain + 轮次灰显", () => {
      const r = m.buildOptions(
        d2 as DecisionEventSpec,
        makeCtx({ facts: { day2_player_is_captain: "false", day2_player_pick_position: "7" } }),
      );
      if (r.branchId !== "not_captain") throw new Error(`branch=${r.branchId}`);
      const nonA = r.options.find((o) => o.option.id === "non_a_signal");
      if (!nonA) throw new Error("应含 non_a_signal");
      if (nonA.enabled) throw new Error("轮次 7 时应灰显");
      // 数据自带 lockLabel「选人已过前两轮」→ 引擎原样透出
      if (nonA.lockLabel !== "选人已过前两轮") throw new Error(`label=${nonA.lockLabel}`);
    });
    check("day3 变体互斥：L3 -> a_plain 隐藏、a_deep 可见", () => {
      const r = m.buildOptions(
        d3 as DecisionEventSpec,
        makeCtx({
          facts: { day3_question_level: "L3", day3_questioner: "xiaohai" },
          rel: baseRel,
        }),
      );
      const ids = r.options.map((o) => o.option.id);
      if (!ids.includes("a_deep")) throw new Error(`缺 a_deep: ${ids.join(",")}`);
      if (ids.includes("a_plain")) throw new Error(`a_plain 应隐藏: ${ids.join(",")}`);
    });
    check("day3 豁免权灰显", () => {
      const r = m.buildOptions(
        d3 as DecisionEventSpec,
        makeCtx({ facts: { day3_question_level: "L1", day3_questioner: "xiaohai" } }),
      );
      const b = r.options.find((o) => o.option.id === "b_exemption");
      if (!b) throw new Error("缺 b_exemption");
      if (b.enabled) throw new Error("exemption=0 应灰显");
      if (b.lockLabel !== "豁免权已使用") throw new Error(`label=${b.lockLabel}`);
      const r2 = m.buildOptions(
        d3 as DecisionEventSpec,
        makeCtx({ facts: { day3_question_level: "L1" }, resources: { exemption: 1 } }),
      );
      const b2 = r2.options.find((o) => o.option.id === "b_exemption");
      if (!b2?.enabled) throw new Error("exemption=1 应可选");
    });
    check("day4 分支择一（0 份）", () => {
      const r = m.buildOptions(
        d4 as DecisionEventSpec,
        makeCtx({ facts: { day4_invite_count: "0" }, rel: baseRel }),
      );
      if (r.branchId !== "no_invite") throw new Error(`branch=${r.branchId}`);
      if (r.options.some((o) => o.option.id === "a_accept_inviter_a")) {
        throw new Error("0 份时不应有接受选项");
      }
    });
    check("day5 变体 fact 隐藏 + 信任额度灰显", () => {
      const r = m.buildOptions(
        d5 as DecisionEventSpec,
        makeCtx({
          facts: { day4_went_date: "false", day4_date_pairs: "[]" },
          resources: { trust_points: 0 },
          rel: baseRel,
        }),
      );
      const ids = r.options.map((o) => o.option.id);
      if (ids.includes("a_to_date_partner"))
        throw new Error(`a_to_date_partner 应隐藏: ${ids.join(",")}`);
      if (!ids.includes("a_to_closest_stayer")) throw new Error("缺 a_to_closest_stayer");
      const b = r.options.find((o) => o.option.id === "b_to_second");
      if (!b) throw new Error("缺 b_to_second");
      if (b.enabled) throw new Error("trust=0 应灰显");
      if (b.lockLabel !== "信任额度已用完") throw new Error(`label=${b.lockLabel}`);
    });
    check("day5 信任额度 2 -> d_spend_twice 可选", () => {
      const r = m.buildOptions(
        d5 as DecisionEventSpec,
        makeCtx({
          facts: { day4_went_date: "false" },
          resources: { trust_points: 2 },
          rel: { ...baseRel, xiaohai: [50, 30] }, // second 好感 50 ≥ 35
        }),
      );
      const d = r.options.find((o) => o.option.id === "d_spend_twice");
      if (!d?.enabled) throw new Error("trust=2 且好感够时应可选");
    });
    check("day6 零票变体隐藏", () => {
      const r = m.buildOptions(
        d6 as DecisionEventSpec,
        makeCtx({
          facts: { day6_zero_vote: "" },
          resources: { declaration: 1 },
          rel: { ...baseRel, guyan: [40, 30], xiaohai: [35, 30] },
        }),
      );
      if (r.options.some((o) => o.option.id === "d_pick_zero_vote")) {
        throw new Error("无零票者时 d_pick_zero_vote 应隐藏");
      }
    });
    check("day6 a_confess_highest 动态 L4 灰显/可选", () => {
      // 最高 = luze avoidant px 80 → 阈值 85 → 灰显 + label 好感≥85解锁
      const r1 = m.buildOptions(
        d6 as DecisionEventSpec,
        makeCtx({
          facts: {},
          resources: { declaration: 1 },
          rel: { ...baseRel, luze: [80, 30] },
        }),
      );
      const a1 = r1.options.find((o) => o.option.id === "a_confess_highest");
      if (!a1) throw new Error("缺 a_confess_highest");
      if (a1.enabled) throw new Error("px80 < avoidant L4 85 应灰显");
      if (a1.lockLabel !== "好感≥85解锁") throw new Error(`label=${a1.lockLabel}`);
      // 最高 = xiaohai anxious px 80 → 阈值 70 → 可选
      const r2 = m.buildOptions(
        d6 as DecisionEventSpec,
        makeCtx({
          resources: { declaration: 1 },
          rel: { ...baseRel, xiaohai: [80, 30] },
        }),
      );
      const a2 = r2.options.find((o) => o.option.id === "a_confess_highest");
      if (!a2?.enabled) throw new Error("px80 ≥ anxious L4 70 应可选");
    });
    check("day7 a_confess_target 动态 L4 lockLabel 替换", () => {
      // 最高=顾言(80) → second=小海 anxious px60 → 阈值 70 → 灰显 + label 好感≥70解锁（替换 85）
      const r = m.buildOptions(
        d7 as DecisionEventSpec,
        makeCtx({
          rel: { ...baseRel, guyan: [80, 30], xiaohai: [60, 30] },
          resources: { solo_chance: 1 },
        }),
      );
      const a = r.options.find((o) => o.option.id === "a_confess_target");
      if (!a) throw new Error("缺 a_confess_target");
      if (a.enabled) throw new Error("px60 < anxious L4 70 应灰显");
      if (a.lockLabel !== "好感≥70解锁") throw new Error(`label=${a.lockLabel}`);
    });
    check("day7 b_speak_to_rejected 灰显（custom 非隐藏）", () => {
      const r = m.buildOptions(
        d7 as DecisionEventSpec,
        makeCtx({ resources: { solo_chance: 1 }, rel: { ...baseRel, xiaohai: [70, 30] } }),
      );
      const b = r.options.find((o) => o.option.id === "b_speak_to_rejected");
      if (!b) throw new Error("缺 b_speak_to_rejected");
      if (b.hidden) throw new Error("应灰显而非隐藏");
      if (b.lockLabel !== "你还没有拒绝过谁") throw new Error(`label=${b.lockLabel}`);
    });
    check("fallback 替换", () => {
      const fb: EventOption = {
        id: "fb_x",
        slot: "B",
        intent: "ally",
        risk: "safe",
        text: "兜底动作",
      };
      const synth: DecisionEventSpec = {
        kind: "decision",
        id: "synth_fb" as EventId,
        day: 1,
        title: "t",
        location: "l",
        timeLabel: "t",
        tension: "medium",
        allowRiskSlot: true,
        narration: [],
        options: [
          {
            id: "orig_x",
            slot: "A",
            intent: "comfort",
            risk: "safe",
            text: "原动作",
            requires: { kind: "custom", id: "d6_has_rejected" },
            fallback: fb,
          },
        ],
      };
      const r = m.buildOptions(synth, makeCtx({}));
      if (r.options.length !== 1) throw new Error(`应只剩 1 个选项: ${r.options.length}`);
      if (r.options[0]?.option.id !== "fb_x") throw new Error("应渲染 fallback");
    });
    check("C 槽缺失告警", () => {
      const synth: DecisionEventSpec = {
        kind: "decision",
        id: "synth_c" as EventId,
        day: 1,
        title: "t",
        location: "l",
        timeLabel: "t",
        tension: "high",
        allowRiskSlot: true,
        narration: [],
        options: [
          { id: "a_x", slot: "A", intent: "comfort", risk: "safe", text: "A" },
          { id: "b_x", slot: "B", intent: "ally", risk: "subtle", text: "B" },
        ],
      };
      const r = m.buildOptions(synth, makeCtx({}));
      if (!r.warnings.some((w) => w.includes("C 槽缺失"))) {
        throw new Error(`应告警 C 槽缺失: ${r.warnings.join(";")}`);
      }
    });
    check("D 槽门禁", () => {
      const synth: DecisionEventSpec = {
        kind: "decision",
        id: "synth_d" as EventId,
        day: 1,
        title: "t",
        location: "l",
        timeLabel: "t",
        tension: "low",
        allowRiskSlot: false,
        narration: [],
        options: [
          { id: "a_x", slot: "A", intent: "comfort", risk: "safe", text: "A" },
          { id: "d_x", slot: "D", intent: "provoke", risk: "dangerous", text: "D" },
        ],
      };
      const r = m.buildOptions(synth, makeCtx({}));
      if (r.options.some((o) => o.option.id === "d_x")) {
        throw new Error("allowRiskSlot=false 应剔除 D");
      }
      if (!r.warnings.some((w) => w.includes("D 槽门禁"))) {
        throw new Error("应告警 D 槽门禁");
      }
    });
  }

  // ============================================================
  // 4. resolveOption
  // ============================================================
  console.log("\n[4] resolveOption");
  {
    const d1 = events.getDay(1)?.events[0];
    const d2 = events.getDay(2)?.events[0];
    const d3 = events.getDay(3)?.events[0];
    const d4 = events.getDay(4)?.events[1];
    const d5 = events.getDay(5)?.events[2];
    const d6 = events.getDay(6)?.events[1];
    if (!d1 || !d2 || !d3 || !d4 || !d5 || !d6) throw new Error("事件缺失");
    const e1 = d1 as DecisionEventSpec;
    const e2 = d2 as DecisionEventSpec;
    const e3 = d3 as DecisionEventSpec;
    const e4 = d4 as DecisionEventSpec;
    const e5 = d5 as DecisionEventSpec;
    const e6 = d6 as DecisionEventSpec;

    check("day1 a_left：settle 主目标 Δ≠0 ∈[-15,18] + seat_neighbor 覆写", () => {
      const opt = e1.options!.find((o) => o.id === "a_left")!;
      const r = m.resolveOption(
        e1,
        opt,
        null,
        makeCtx({ rel: baseRel, facts: { day1_seat_left: "chengyi", day1_seat_right: "ningwan" } }),
      );
      if (r.mainTargetId !== "chengyi") throw new Error(`main=${r.mainTargetId}`);
      const main = r.deltas.find((d) => d.npcId === "chengyi" && d.direction === "to_npc");
      if (!main) throw new Error(`缺 chengyi 主 Δ: ${JSON.stringify(r.deltas)}`);
      if (main.delta === 0 || Math.abs(main.delta) > 18) {
        throw new Error(`主 Δ 越界: ${main.delta}`);
      }
      const nb = r.factsWrites.find((w) => w.key === "day1_seat_neighbor");
      if (!nb || nb.value !== "chengyi") {
        throw new Error(`seat_neighbor 应覆写为 chengyi: ${JSON.stringify(nb)}`);
      }
      const side = r.factsWrites.find((w) => w.key === "day1_seat_side");
      if (side?.value !== "left") throw new Error("seat_side=left");
    });
    check("day3 b_counter：依恋修正表（anxious 提问者 +4 from_npc）", () => {
      const opt = e3.options!.find((o) => o.id === "b_counter")!;
      const r = m.resolveOption(
        e3,
        opt,
        null,
        makeCtx({ rel: baseRel, facts: { day3_questioner: "xiaohai" } }),
      );
      const d = r.deltas.find((x) => x.npcId === "xiaohai" && x.direction === "from_npc");
      if (!d || d.delta !== 4)
        throw new Error(`xiaohai 应 from_npc+4: ${JSON.stringify(r.deltas)}`);
    });
    check("day4 a_accept_inviter_a：facts 占位符 {邀请者A} 解析 + 依恋修正表", () => {
      const opt = findOpt(e4, "two_or_more_invites", "a_accept_inviter_a");
      const r = m.resolveOption(
        e4,
        opt,
        null,
        makeCtx({
          rel: baseRel,
          facts: { day4_invite_count: "2", day4_inviter_a: "xiazhi", day4_inviter_b: "ningwan" },
        }),
      );
      const acc = r.factsWrites.find((w) => w.key === "day4_accepted_npc");
      if (acc?.value !== "xiazhi") throw new Error(`accepted 应=xiazhi: ${JSON.stringify(acc)}`);
      // 次要目标：inviter_b -5 数据原值
      const bd = r.deltas.find((x) => x.npcId === "ningwan");
      if (!bd || bd.delta !== -5) throw new Error(`ningwan 应 -5: ${JSON.stringify(r.deltas)}`);
    });
    check("day4 c_quiet_stay：avoidant 被赴约者 +2 from_npc；secure -1", () => {
      // c_quiet_stay 在 day4_date_or_stay（events[2]，went_date 分支）
      const d4b = events.getDay(4)?.events[2] as DecisionEventSpec | undefined;
      if (!d4b) throw new Error("缺 day4_date_or_stay");
      const opt = findOpt(d4b, "went_date", "c_quiet_stay");
      const r1 = m.resolveOption(
        d4b,
        opt,
        null,
        makeCtx({ rel: baseRel, facts: { day4_accepted_npc: "luze", day4_went_date: "true" } }),
      );
      const d1 = r1.deltas.find((x) => x.npcId === "luze");
      if (!d1 || d1.direction !== "from_npc" || d1.delta !== 2) {
        throw new Error(`luze avoidant 应 from_npc+2: ${JSON.stringify(r1.deltas)}`);
      }
      const r2 = m.resolveOption(
        d4b,
        opt,
        null,
        makeCtx({ rel: baseRel, facts: { day4_accepted_npc: "chengyi", day4_went_date: "true" } }),
      );
      const d2 = r2.deltas.find((x) => x.npcId === "chengyi");
      if (!d2 || d2.direction !== "from_npc" || d2.delta !== -1) {
        throw new Error(`chengyi secure 应 from_npc-1: ${JSON.stringify(r2.deltas)}`);
      }
    });
    check("day5 d_expose_openly：听者 -6 + 知情旁观者 +2", () => {
      const opt = e5.options!.find((o) => o.id === "d_expose_openly")!;
      const r = m.resolveOption(
        e5,
        opt,
        null,
        makeCtx({
          rel: baseRel,
          facts: {
            day5_leaked: "true",
            day5_leaked_listener: "zhoumu",
            day5_exchange_pair: "zhoumu,anran",
          },
        }),
      );
      const listener = r.deltas.find((x) => x.npcId === "zhoumu");
      if (!listener || listener.direction !== "from_npc" || listener.delta !== -6) {
        throw new Error(`zhoumu 应 from_npc-6: ${JSON.stringify(r.deltas)}`);
      }
      const other = r.deltas.find((x) => x.npcId === "anran");
      if (!other || other.direction !== "from_npc" || other.delta !== 2) {
        throw new Error(`anran 知情旁观者应 from_npc+2: ${JSON.stringify(r.deltas)}`);
      }
    });
    check("day2 cap_b_surprise：selector storeAs 写入 + 效果可见", () => {
      const opt = findOpt(e2, "captain", "cap_b_surprise");
      const r = m.resolveOption(
        e2,
        opt,
        "ningwan",
        makeCtx({ rel: baseRel, facts: { day2_player_is_captain: "true" } }),
      );
      const pick = r.factsWrites.find((w) => w.key === "day2_player_picked");
      if (pick?.value !== "ningwan") throw new Error(`picked 应=ningwan: ${JSON.stringify(pick)}`);
      if (r.mainTargetId !== "ningwan") throw new Error(`main=${r.mainTargetId}`);
      const main = r.deltas.find((x) => x.npcId === "ningwan" && x.direction === "to_npc");
      if (!main || main.delta === 0 || Math.abs(main.delta) > 18) {
        throw new Error(`ningwan settle 主 Δ 越界: ${JSON.stringify(r.deltas)}`);
      }
    });
    check("day6 a_declare_target：selector 写入 day6_player_declared", () => {
      const opt = e6.options!.find((o) => o.id === "a_declare_target")!;
      const r = m.resolveOption(e6, opt, "chengyi", makeCtx({ rel: baseRel }));
      const decl = r.factsWrites.find((w) => w.key === "day6_player_declared");
      if (decl?.value !== "chengyi")
        throw new Error(`declared 应=chengyi: ${JSON.stringify(decl)}`);
    });
    check("day6 c_walk_away：{target} 解析为被拒者（非第二好感）+ 冻结事实", () => {
      const d6b = events.getDay(6)?.events[2] as DecisionEventSpec | undefined;
      if (!d6b) throw new Error("缺 day6_rejected_response");
      const opt = findOpt(d6b, "has_rejected", "c_walk_away");
      const r = m.resolveOption(
        d6b,
        opt,
        null,
        makeCtx({ rel: baseRel, facts: { day6_rejected_by: "xiaohai,luze" } }),
      );
      if (r.mainTargetId !== "xiaohai") throw new Error(`main 应=xiaohai: ${r.mainTargetId}`);
      const frozen = r.factsWrites.find((w) => w.key === "day6_frozen");
      if (frozen?.value !== "xiaohai")
        throw new Error(`frozen 应=xiaohai: ${JSON.stringify(frozen)}`);
      const d = r.deltas.find((x) => x.npcId === "xiaohai");
      if (!d) throw new Error(`缺 xiaohai Δ: ${JSON.stringify(r.deltas)}`);
    });
  }

  // ============================================================
  // 5. runEngineHook
  // ============================================================
  console.log("\n[5] runEngineHook");
  {
    check("d1_seed_seats：两邻座互异 + first_speaker/silent_npc + 幂等", () => {
      const ctx = makeCtx({ rel: baseRel, day: 1 });
      const r = m.runEngineHook("d1_seed_seats", ctx);
      const w = writeMap(r);
      if (!w["day1_seat_left"] || !w["day1_seat_right"]) throw new Error("缺邻座");
      if (w["day1_seat_left"] === w["day1_seat_right"]) throw new Error("邻座重复");
      if (!w["day1_first_speaker"]) throw new Error("缺 first_speaker");
      if (!w["day1_silent_npc"]) throw new Error("缺 silent_npc");
      if (w["day1_silent_npc"] === w["day1_first_speaker"])
        throw new Error("silent 与 first_speaker 重复");
      // 幂等：结果落库后再跑同一钩子 → 无输出
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r2 = m.runEngineHook("d1_seed_seats", ctx2);
      if (r2.factWrites.length !== 0) throw new Error("d1_seed_seats 应幂等");
    });
    check("d1_roll_approacher：stand 才写 + 幂等", () => {
      const r = m.runEngineHook(
        "d1_roll_approacher",
        makeCtx({ facts: { day1_seat_side: "stand" } }),
      );
      if (!writeMap(r)["day1_approacher"]) throw new Error("stand 应写 approacher");
      const r2 = m.runEngineHook(
        "d1_roll_approacher",
        makeCtx({ facts: { day1_seat_side: "left" } }),
      );
      if (r2.factWrites.length !== 0) throw new Error("left 不应写 approacher");
    });
    check("d2_determine_captains：队长判定 + 玩家非队长位置", () => {
      const ctx = makeCtx({
        rel: {
          guyan: [30, 30],
          xiaohai: [60, 60],
          luze: [90, 20],
          anran: [30, 30],
          chengyi: [30, 30],
          linxia: [30, 30],
          zhoumu: [30, 30],
          ningwan: [30, 30],
          xiazhi: [30, 30],
        },
      });
      const r = m.runEngineHook("d2_determine_captains", ctx);
      const w = writeMap(r);
      if (w["day2_player_is_captain"] !== "false") throw new Error("玩家不应是队长");
      if (w["day2_player_pick_position"] !== "4")
        throw new Error(`pos=${w["day2_player_pick_position"]}`);
      if (w["day2_player_pick_captain"] !== "xiaohai") {
        throw new Error(`pickCaptain=${w["day2_player_pick_captain"]}`);
      }
      const order = JSON.parse(w["day2_pick_order"] ?? "[]") as Array<{
        pickIdx: number;
        target: string;
      }>;
      if (order.length !== 7) throw new Error(`order 长度=${order.length}`);
      // 第 4 位 = 玩家被选
      if (order[3]?.target !== "player")
        throw new Error(`第4位应=player: ${JSON.stringify(order[3])}`);
    });
    check("d2_determine_captains：玩家当队长（全场并列 → 玩家为次队长）", () => {
      // 队长判定：cap1=最高分、cap2=最低分倒序首个≠cap1、cap3=随机。
      // 玩家分 = 全场 max(px)；全 NPC px+nx=10 与玩家 10 并列 → cap2=player
      const ctx = makeCtx({
        rel: {
          guyan: [10, 0],
          xiaohai: [10, 0],
          luze: [10, 0],
          anran: [10, 0],
          chengyi: [10, 0],
          linxia: [10, 0],
          zhoumu: [10, 0],
          ningwan: [10, 0],
          xiazhi: [10, 0],
        },
      });
      const r = m.runEngineHook("d2_determine_captains", ctx);
      const w = writeMap(r);
      if (w["day2_player_is_captain"] !== "true") throw new Error("玩家应是队长");
      if (w["day2_player_pick_position"] !== "2")
        throw new Error(`pos=${w["day2_player_pick_position"]}`);
      // 幂等
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r2 = m.runEngineHook("d2_determine_captains", ctx2);
      if (r2.factWrites.length !== 0) throw new Error("d2_determine_captains 应幂等");
    });
    check("d2_resolve_groups：分组 + 翻车组 + 责任人 + 幂等", () => {
      const ctx = makeCtx({
        rel: {
          guyan: [30, 30],
          xiaohai: [60, 60],
          luze: [90, 20],
          anran: [30, 30],
          chengyi: [30, 30],
          linxia: [30, 30],
          zhoumu: [30, 30],
          ningwan: [30, 30],
          xiazhi: [30, 30],
        },
        day: 2,
      });
      const r0 = m.runEngineHook("d2_determine_captains", ctx);
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r0.factWrites, 2) };
      const r = m.runEngineHook("d2_resolve_groups", ctx2);
      const w = writeMap(r);
      if (w["day2_player_group_failed"] !== "false")
        throw new Error(`groupFailed=${w["day2_player_group_failed"]}`);
      if (!w["day2_failed_culprit"]) throw new Error("缺 culprit");
      const groups = JSON.parse(w["day2_groups"] ?? "{}") as Record<string, string[]>;
      if (Object.keys(groups).length !== 3) throw new Error(`组数=${Object.keys(groups).length}`);
      // 玩家组 = xiaohai（第 4 位选玩家的队长）
      const pg = w["day2_player_group"];
      if (pg !== "xiaohai") throw new Error(`playerGroup=${pg}`);
      // 幂等：把 resolve_groups 自己的输出也落库后再跑
      const ctx3: Ctx = { ...ctx2, worldFacts: merge(ctx2.worldFacts, r.factWrites, 2) };
      const r2 = m.runEngineHook("d2_resolve_groups", ctx3);
      if (r2.factWrites.length !== 0) throw new Error("d2_resolve_groups 应幂等");
    });
    check("d2_resolve_last_picked：最后被选者 + comforter", () => {
      const order = [
        { pickIdx: 1, picker: "xiaohai", target: "anran" },
        { pickIdx: 2, picker: "guyan", target: "chengyi" },
        { pickIdx: 3, picker: "zhoumu", target: "linxia" },
        { pickIdx: 4, picker: "xiaohai", target: "player" },
        { pickIdx: 5, picker: "guyan", target: "ningwan" },
        { pickIdx: 6, picker: "zhoumu", target: "xiazhi" },
        { pickIdx: 7, picker: "xiaohai", target: "luze" },
      ];
      const ctx = makeCtx({
        facts: {
          day2_pick_order: JSON.stringify(order),
          day2_groups: JSON.stringify({
            xiaohai: ["xiaohai", "anran", "luze"],
            guyan: ["guyan", "chengyi", "ningwan"],
            zhoumu: ["zhoumu", "linxia", "xiazhi"],
          }),
          day2_player_group: "xiaohai",
        },
        rel: { ...baseRel, luze: [60, 30], anran: [50, 30] },
      });
      const r = m.runEngineHook("d2_resolve_last_picked", ctx);
      const w = writeMap(r);
      if (w["day2_last_picked"] !== "luze") throw new Error(`lastPicked=${w["day2_last_picked"]}`);
      // comforter = 同组（xiaohai 组）px 最高 ≠ luze → anran (50)
      if (w["day2_comforter"] !== "anran") throw new Error(`comforter=${w["day2_comforter"]}`);
      // 幂等
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r2 = m.runEngineHook("d2_resolve_last_picked", ctx2);
      if (r2.factWrites.length !== 0) throw new Error("d2_resolve_last_picked 应幂等");
    });
    check("d3_generate_question_level：L1~L3 + 幂等", () => {
      const ctx = makeCtx({ day: 3 });
      const r = m.runEngineHook("d3_generate_question_level", ctx);
      const w = writeMap(r);
      if (!["L1", "L2", "L3"].includes(w["day3_question_level"] ?? "")) {
        throw new Error(`level=${w["day3_question_level"]}`);
      }
      // 幂等
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r2 = m.runEngineHook("d3_generate_question_level", ctx2);
      if (r2.factWrites.length !== 0) throw new Error("d3 应幂等");
    });
    check("d4_generate_invites：恰 1 位想邀请玩家 → 追加 → count=2", () => {
      const ctx = makeCtx({
        rel: {
          guyan: [50, 60],
          xiaohai: [45, 60],
          luze: [30, 60],
          anran: [30, 60],
          chengyi: [30, 60],
          linxia: [30, 60],
          zhoumu: [30, 60],
          ningwan: [30, 60],
          xiazhi: [30, 60],
        },
        day: 4,
      });
      const r = m.runEngineHook("d4_generate_invites", ctx);
      const w = writeMap(r);
      if (w["day4_invite_count"] !== "2") throw new Error(`count=${w["day4_invite_count"]}`);
      // 想邀请玩家的 = guyan（60≥55 ∧ 50≥40）；xiaohai px45<40 不算 → 触发追加
      const invited = (w["day4_invited_by"] ?? "").split(",");
      if (invited.length !== 2 || !invited.includes("guyan")) {
        throw new Error(`invited=${w["day4_invited_by"]}`);
      }
      if (!w["day4_inviter_a"] || !w["day4_inviter_b"]) throw new Error("缺 inviter_a/b");
      // 幂等
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r2 = m.runEngineHook("d4_generate_invites", ctx2);
      if (r2.factWrites.length !== 0) throw new Error("d4_generate_invites 应幂等");
    });
    check("d4_generate_invites：无人想邀请玩家 → count=0", () => {
      const ctx = makeCtx({
        rel: {
          guyan: [30, 60],
          xiaohai: [30, 60],
          luze: [30, 60],
          anran: [30, 60],
          chengyi: [30, 60],
          linxia: [30, 60],
          zhoumu: [30, 60],
          ningwan: [30, 60],
          xiazhi: [30, 60],
        },
        day: 4,
      });
      const r = m.runEngineHook("d4_generate_invites", ctx);
      const w = writeMap(r);
      if (w["day4_invite_count"] !== "0") throw new Error(`count=${w["day4_invite_count"]}`);
      // 无人邀请玩家 → 不写 inviter_a/b（respond_invite 走 no_invite 分支）
      if (w["day4_inviter_a"] !== undefined) throw new Error(`inviter_a=${w["day4_inviter_a"]}`);
      if (w["day4_inviter_b"] !== undefined) throw new Error(`inviter_b=${w["day4_inviter_b"]}`);
    });
    check("d5_resolve_exchange：秘密+2 点 → 50% 泄露（rng 0.5 < 0.5 → 不泄露）", () => {
      const ctx = makeCtx({
        facts: { day5_secret_target: "xiaohai", day5_used_points: "2" },
        day: 5,
        rng: () => 0.49,
      });
      const r = m.runEngineHook("d5_resolve_exchange", ctx);
      const w = writeMap(r);
      if (w["day5_leaked"] !== "true") throw new Error(`leaked=${w["day5_leaked"]}`);
      if (!w["day5_leaked_listener"]) throw new Error("缺 listener");
      // rng ≥ 0.5 → 不泄露
      const ctx2 = makeCtx({
        facts: { day5_secret_target: "xiaohai", day5_used_points: "2" },
        day: 5,
        rng: () => 0.5,
      });
      const r2 = m.runEngineHook("d5_resolve_exchange", ctx2);
      if (writeMap(r2)["day5_leaked"] !== "false") throw new Error("rng0.5 应不泄露");
      // 幂等（用泄露 ctx 的结果落库）
      const ctx3: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r3 = m.runEngineHook("d5_resolve_exchange", ctx3);
      if (r3.factWrites.length !== 0) throw new Error("d5 应幂等");
    });
    check("d6_generate_order：nx 并列 → lastPicked 优先", () => {
      const ctx = makeCtx({ rel: { ...baseRel, luze: [30, 30], guyan: [30, 30] }, day: 6 });
      const c1: Ctx = {
        ...ctx,
        worldFacts: {
          ...ctx.worldFacts,
          day2_last_picked: {
            key: "day2_last_picked",
            value: "luze",
            day: 2,
            beatId: "smoke",
            confirmed: true,
          },
        },
      };
      const r = m.runEngineHook("d6_generate_order", c1);
      const order = (writeMap(r)["day6_order"] ?? "").split(",");
      if (order.length !== 9) throw new Error(`order 长度=${order.length}`);
      if (order[0] !== "luze") throw new Error(`order[0]=${order[0]}`);
    });
    check("d6_generate_early_declares：nx<30 弃权 + 60% 预选玩家", () => {
      const ctx = makeCtx({
        rel: { ...baseRel, xiaohai: [30, 25], guyan: [30, 60], luze: [30, 60] },
        day: 6,
      });
      const r = m.runEngineHook("d6_generate_early_declares", ctx);
      const w = writeMap(r);
      const map = JSON.parse(w["day6_early_declares"] ?? "{}") as Record<string, string>;
      // 幂等
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r2 = m.runEngineHook("d6_generate_early_declares", ctx2);
      if (r2.factWrites.length !== 0) throw new Error("d6_early 应幂等");
      if (map["xiaohai"] !== "none") throw new Error(`xiaohai nx25 应弃权: ${map["xiaohai"]}`);
      if (map["guyan"] !== "player") throw new Error(`guyan 应预选玩家: ${map["guyan"]}`);
    });
    check("d6_recompute_votes：互选 + 被拒名单 + 弃权惩罚", () => {
      const early: Record<string, string> = {
        guyan: "player",
        xiaohai: "player",
        luze: "player",
        chengyi: "guyan",
        anran: "none",
        zhoumu: "ningwan",
        ningwan: "linxia",
        linxia: "xiaohai",
        xiazhi: "chengyi",
      };
      const ctx = makeCtx({
        rel: {
          guyan: [30, 30],
          xiaohai: [30, 35],
          luze: [30, 40],
          chengyi: [30, 45],
          anran: [30, 50],
          zhoumu: [30, 55],
          ningwan: [30, 60],
          linxia: [30, 65],
          xiazhi: [30, 70],
        },
        facts: {
          day6_early_declares: JSON.stringify(early),
          day6_player_declared: "guyan",
          day6_order: "guyan,xiaohai,luze,chengyi,anran,zhoumu,ningwan,linxia,xiazhi",
        },
        day: 6,
      });
      const r = m.runEngineHook("d6_recompute_votes", ctx);
      const w = writeMap(r);
      if (w["day6_mutual"] !== "guyan=true") throw new Error(`mutual=${w["day6_mutual"]}`);
      const rejected = (w["day6_rejected_by"] ?? "").split(",");
      if (!rejected.includes("xiaohai") || !rejected.includes("luze")) {
        throw new Error(`被拒名单缺玩家侧: ${rejected.join(",")}`);
      }
      // 裁定补丁：玩家侧被拒者必须排在 NPC 间被拒者前面（a_comfort_rejected 取 [0]）
      if (!rejected.join(",").startsWith("xiaohai,luze")) {
        throw new Error(`玩家侧被拒者应排名单前: ${rejected.join(",")}`);
      }
      // 非弃权：玩家侧被拒者 §13 基准（xiaohai anxious -8~-10）
      const xiaohai = r.deltas.find((d) => d.npcId === "xiaohai");
      if (!xiaohai || xiaohai.direction !== "from_npc") throw new Error("缺 xiaohai 被拒 Δ");
      if (xiaohai.delta > -8 || xiaohai.delta < -10) {
        throw new Error(`xiaohai Δ=${xiaohai.delta} 应 ∈[-10,-8]`);
      }
      // 弃权：上浮（anxious -12~-15）
      const ctxAbstain = makeCtx({
        rel: {
          guyan: [30, 30],
          xiaohai: [30, 35],
          luze: [30, 40],
          chengyi: [30, 45],
          anran: [30, 50],
          zhoumu: [30, 55],
          ningwan: [30, 60],
          linxia: [30, 65],
          xiazhi: [30, 70],
        },
        facts: {
          day6_early_declares: JSON.stringify(early),
          day6_player_declared: "none",
          day6_player_abstained: "true",
          day6_order: "guyan,xiaohai,luze,chengyi,anran,zhoumu,ningwan,linxia,xiazhi",
        },
        day: 6,
      });
      const ra = m.runEngineHook("d6_recompute_votes", ctxAbstain);
      const xh = ra.deltas.find((d) => d.npcId === "xiaohai");
      if (!xh || xh.delta > -12 || xh.delta < -15) {
        throw new Error(`弃权 xiaohai Δ=${xh?.delta} 应 ∈[-15,-12]`);
      }
      const lu = ra.deltas.find((d) => d.npcId === "luze");
      if (!lu || lu.delta !== -7) throw new Error(`弃权 luze Δ=${lu?.delta} 应为 -7`);
      // 幂等（非弃权 ctx 的结果落库后重跑）
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r3 = m.runEngineHook("d6_recompute_votes", ctx2);
      if (r3.factWrites.length !== 0) throw new Error("d6_recompute 应幂等");
    });
    check("d7_resolve_confession：①玩家告白双向 L4 → success", () => {
      const ctx = makeCtx({
        rel: { ...baseRel, guyan: [90, 90] },
        facts: { day7_solo_target: "guyan" },
        eventLog: [{ eventId: "day7_solo_chance", optionId: "a_confess_target" }],
        day: 7,
      });
      const r = m.runEngineHook("d7_resolve_confession", ctx);
      const w = writeMap(r);
      if (w["day7_confession_result"] !== "success")
        throw new Error(`result=${w["day7_confession_result"]}`);
      if (w["day7_confession_success"] !== "guyan=true") {
        throw new Error(`success=${w["day7_confession_success"]}`);
      }
      // 幂等（结局锁定只写一次）
      const ctx2: Ctx = { ...ctx, worldFacts: merge(ctx.worldFacts, r.factWrites, ctx.day) };
      const r2 = m.runEngineHook("d7_resolve_confession", ctx2);
      if (r2.factWrites.length !== 0) throw new Error("d7 应幂等");
    });
    check("d7_resolve_confession：①告白未达 L4 → rejected", () => {
      const ctx = makeCtx({
        rel: { ...baseRel, guyan: [40, 90] },
        facts: { day7_solo_target: "guyan" },
        eventLog: [{ eventId: "day7_solo_chance", optionId: "a_confess_target" }],
        day: 7,
      });
      const r = m.runEngineHook("d7_resolve_confession", ctx);
      const w = writeMap(r);
      if (w["day7_confession_result"] !== "rejected")
        throw new Error(`result=${w["day7_confession_result"]}`);
      if (w["day7_confession_success"] !== "none")
        throw new Error(`success=${w["day7_confession_success"]}`);
    });
    check("d7_resolve_confession：②Y 告白 px≥60 → success；未触发 → none", () => {
      const ctx = makeCtx({
        rel: { ...baseRel, zhoumu: [70, 90] },
        day: 7,
      });
      const r = m.runEngineHook("d7_resolve_confession", ctx);
      const w = writeMap(r);
      if (w["day7_confession_success"] !== "zhoumu=true") {
        throw new Error(`success=${w["day7_confession_success"]}`);
      }
      // 无人 nx≥85 且玩家未告白 → 不触发 → none
      const ctxNone = makeCtx({ rel: baseRel, day: 7 });
      const r2 = m.runEngineHook("d7_resolve_confession", ctxNone);
      if (writeMap(r2)["day7_confession_success"] !== "none") {
        throw new Error("无触发条件应 none");
      }
    });
  }

  // ============================================================
  // 5.5 裁定补丁：候选约束 + 安抚补偿（§13 端点）
  // ============================================================
  console.log("\n[5.5] 裁定补丁");
  {
    check("selectorCandidates：b_speak_to_rejected 被拒集合去重，其余 null", () => {
      const ev7 = events.getDay(7)?.events.find((e) => e.id === "day7_solo_chance") as
        DecisionEventSpec | undefined;
      if (!ev7) throw new Error("缺 day7_solo_chance");
      const opt = ev7.options!.find((o) => o.id === "b_speak_to_rejected")!;
      const c = makeCtx({
        facts: {
          day6_rejected_by: "zhoumu,linxia",
          day4_declined_by_player: "linxia,guyan",
        },
      });
      const cands = m.selectorCandidates(opt, c);
      if (!cands || cands.join(",") !== "zhoumu,linxia,guyan") {
        throw new Error(`候选应去重且玩家侧在前: ${JSON.stringify(cands)}`);
      }
      // 无被拒名单 → 空数组（选项本身被 requires d7_has_declined 门禁）
      if (m.selectorCandidates(opt, makeCtx({}))?.length !== 0) {
        throw new Error("空名单应返回空数组");
      }
      const any = ev7.options!.find((o) => o.id === "a_confess_target")!;
      if (m.selectorCandidates(any, c) !== null) {
        throw new Error("非 b_speak_to_rejected 应返回 null");
      }
    });
    check("a_comfort_rejected：§13 端点恢复 anxious +4~+5 / avoidant +2 / secure +2", () => {
      const ev6 = events.getDay(6)?.events[2] as DecisionEventSpec | undefined;
      if (!ev6) throw new Error("缺 day6_rejected_response");
      const opt = findOpt(ev6, "has_rejected", "a_comfort_rejected");
      const dOf = (relKey: string) =>
        m
          .resolveOption(
            ev6,
            opt,
            null,
            makeCtx({ rel: baseRel, facts: { day6_rejected_by: relKey } }),
          )
          .deltas.find((x) => x.npcId === relKey);
      // anxious（xiaohai）：randInt(4,5) @ rng0.5 → 5
      const da = dOf("xiaohai");
      if (!da || da.direction !== "from_npc" || da.delta < 4 || da.delta > 5) {
        throw new Error(`anxious 应 +4~+5: ${JSON.stringify(da)}`);
      }
      const dl = dOf("luze");
      if (!dl || dl.direction !== "from_npc" || dl.delta !== 2) {
        throw new Error(`avoidant 应 +2: ${JSON.stringify(dl)}`);
      }
      const dg = dOf("guyan");
      if (!dg || dg.direction !== "from_npc" || dg.delta !== 2) {
        throw new Error(`secure 应 +2: ${JSON.stringify(dg)}`);
      }
      // facts 占位符 {target} 解析
      const r = m.resolveOption(
        ev6,
        opt,
        null,
        makeCtx({ rel: baseRel, facts: { day6_rejected_by: "xiaohai" } }),
      );
      const fc = r.factsWrites.find((w) => w.key === "day6_comforted");
      if (fc?.value !== "xiaohai") {
        throw new Error(`comforted 应=xiaohai: ${JSON.stringify(fc)}`);
      }
    });
  }

  // ============================================================
  // 6. custom 条件全量抽查
  // ============================================================
  console.log("\n[6] custom 条件");
  {
    check("d2 轮次/落选在即", () => {
      const early = makeCtx({
        facts: {
          day2_player_pick_position: "2",
          day2_captains: JSON.stringify(["xiaohai", "guyan", "zhoumu"]),
        },
      });
      if (!m.evaluateRequire({ kind: "custom", id: "d2_pick_round_early" }, early).pass) {
        throw new Error("pos2 应 early");
      }
      const late = makeCtx({ facts: { day2_player_pick_position: "7" } });
      if (m.evaluateRequire({ kind: "custom", id: "d2_pick_round_early" }, late).pass) {
        throw new Error("pos7 不应 early");
      }
      const about = makeCtx({
        facts: {
          day2_player_pick_position: "4",
          day2_captains: JSON.stringify(["xiaohai", "guyan", "zhoumu"]),
          day2_pick_order: JSON.stringify([
            { pickIdx: 1, picker: "xiaohai", target: "anran" },
            { pickIdx: 2, picker: "guyan", target: "chengyi" },
            { pickIdx: 3, picker: "zhoumu", target: "linxia" },
          ]),
        },
        rel: { ...baseRel, luze: [30, 20] },
      });
      if (
        !m.evaluateRequire({ kind: "custom", id: "d2_someone_about_to_be_unpicked" }, about).pass
      ) {
        throw new Error("应有落选在即者");
      }
    });
    check("d3 问题层级 customs", () => {
      const c1 = makeCtx({ facts: { day3_question_level: "L1" } });
      if (!m.evaluateRequire({ kind: "custom", id: "d3_question_at_most_l2" }, c1).pass) {
        throw new Error("L1 ≤ L2");
      }
      const c3 = makeCtx({ facts: { day3_question_level: "L3" } });
      if (m.evaluateRequire({ kind: "custom", id: "d3_question_at_most_l2" }, c3).pass) {
        throw new Error("L3 不应 ≤L2");
      }
      if (!m.evaluateRequire({ kind: "custom", id: "d3_question_is_l3" }, c3).pass) {
        throw new Error("L3 应 is_l3");
      }
    });
    check("d1/d3 沉默人数 customs", () => {
      // 当天无 open 事件 speakers → 全沉默（9 人）
      if (!m.evaluateRequire({ kind: "custom", id: "d1_three_silent" }, makeCtx({ day: 1 })).pass) {
        throw new Error("d1_three_silent 应通过");
      }
      if (!m.evaluateRequire({ kind: "custom", id: "d3_two_silent" }, makeCtx({ day: 3 })).pass) {
        throw new Error("d3_two_silent 应通过");
      }
    });
    check("d7 告白触发/可能 customs", () => {
      // ① 玩家告白（日志）→ triggered
      const t1 = makeCtx({
        rel: { ...baseRel, guyan: [90, 90] },
        facts: { day7_solo_target: "guyan" },
        eventLog: [{ eventId: "day7_solo_chance", optionId: "a_confess_target" }],
        day: 7,
      });
      if (!m.evaluateRequire({ kind: "custom", id: "d7_confession_triggered" }, t1).pass) {
        throw new Error("玩家告白应 triggered");
      }
      if (!m.evaluateRequire({ kind: "custom", id: "d7_confession_possible" }, t1).pass) {
        throw new Error("双向 L4 应 possible");
      }
      if (m.evaluateRequire({ kind: "custom", id: "d7_confession_not_possible" }, t1).pass) {
        throw new Error("possible 时 not_possible 应 false");
      }
      // ① px 不足 → possible false
      const t2 = makeCtx({
        rel: { ...baseRel, guyan: [40, 90] },
        facts: { day7_solo_target: "guyan" },
        eventLog: [{ eventId: "day7_solo_chance", optionId: "a_confess_target" }],
        day: 7,
      });
      if (m.evaluateRequire({ kind: "custom", id: "d7_confession_possible" }, t2).pass) {
        throw new Error("px40 不应 possible");
      }
      if (!m.evaluateRequire({ kind: "custom", id: "d7_confession_not_possible" }, t2).pass) {
        throw new Error("px40 应 not_possible");
      }
      // ② Y 告白 px≥60 → possible；px<60 → 未触发
      const t3 = makeCtx({ rel: { ...baseRel, zhoumu: [70, 90] }, day: 7 });
      if (!m.evaluateRequire({ kind: "custom", id: "d7_confession_triggered" }, t3).pass) {
        throw new Error("Y 告白应 triggered");
      }
      // 无人 nx≥85 且玩家未告白 → 未触发
      const t4 = makeCtx({ rel: baseRel, day: 7 });
      if (m.evaluateRequire({ kind: "custom", id: "d7_confession_triggered" }, t4).pass) {
        throw new Error("无告白动作且无 Y 不应 triggered");
      }
    });
  }

  // ============================================================
  // 汇总
  // ============================================================
  console.log(`\n==== ${passed} passed, ${failures.length} failed ====`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("turnRunner smoke: ALL PASS");
}

/** 把钩子输出合并进 facts（模拟 applyResolvedOption 落库） */
function merge(facts: WorldFacts, writes: WorldFactWrite[], day: number): WorldFacts {
  const out: WorldFacts = { ...facts };
  for (const w of writes) {
    out[w.key] = {
      key: w.key,
      value: w.value,
      day,
      beatId: "smoke",
      confirmed: true,
    };
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * resolveEnding + useIslandStore 冒烟测试（回归基线，保留在仓库）
 *
 * 覆盖（与验收标准一致）：
 *   A. resolveEnding 六结局各命中一个场景，含边界：
 *      - P1 边界：px=84 不触发 mutual
 *      - P2 三种子情形（Day6 选 X 未互选 / Day7 告白被拒 / Day6 选了他人且未告白成功）
 *      - P3 边界：max(nx)=49 → 不触发 hesitant（P5 边界，触发 solo）；50 → hesitant
 *      - P4 需 day6_player_abstained + 未向 X 告白（solo_target ≠ X）
 *      - P6 两种名单来源（day6_rejected_by / day6_npc_rejected）
 *   B. store 链：initFromOnboarding（无 onboarding 数据时安全；幂等）
 *      → applyResolvedOption（好感钳位 95 顶到 100、0 压到 0；资源扣减不过 0）
 *      → advanceEvent（钳位 ≤2）→ advanceDay（day3 exemption=1、day5 trust_points=3）
 *      → resolveEnding（命中 mutual）→ resetRun
 *   C. persist 配置：key/version 正确 + 写入真实发生。
 *
 * 运行方式（tsx 位于 backend/node_modules；tsconfig 发现基于 cwd，
 * 需在 frontend/ 下运行才能解析 @/* 路径别名）：
 *   cd frontend && ../backend/node_modules/.bin/tsx src/core/__smoke__/island-smoke.ts
 *
 * 浏览器端说明：persist 默认存储 window.localStorage。Node 无 localStorage，
 * 本脚本在 import store 之前给 globalThis.window 装一个内存实现（Map 驱动），
 * 因此 store 创建/写入行为与浏览器一致，但「刷新后 rehydrate」不在 Node 模拟
 * （localStorage 在浏览器端由 zustand persist 自动恢复，key "flipped-ai-island"）。
 */

import { getNpcById } from "@/onboarding/npcLibrary";
import type { NPC } from "@/onboarding/types";
import {
  ENDING_IDS,
  resolveEnding,
  resolveEndingDetail,
  type EndingDetail,
  type EndingId,
  type NpcAffinityPair,
} from "../ending";
import { createEmptyFacts, writeFacts, type WorldFactWrite } from "../worldFacts";
import type { WorldFacts } from "../worldTypes";

// ------------------------------------------------------------
// Node 环境 polyfill（必须在 import 任何 zustand store 之前执行）
// ------------------------------------------------------------

interface MemStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memStorage = new Map<string, string>();
const memLocalStorage: MemStorage = {
  getItem: (key) => memStorage.get(key) ?? null,
  setItem: (key, value) => {
    memStorage.set(key, value);
  },
  removeItem: (key) => {
    memStorage.delete(key);
  },
};
(globalThis as unknown as { window: { localStorage: MemStorage } }).window = {
  localStorage: memLocalStorage,
};

// ------------------------------------------------------------
// 断言工具
// ------------------------------------------------------------

let assertionCount = 0;

function assert(condition: boolean, label: string): void {
  assertionCount++;
  if (!condition) {
    throw new Error(`断言失败：${label}`);
  }
}

// ------------------------------------------------------------
// 测试数据工具
// ------------------------------------------------------------

function npcById(id: string): NPC {
  const npc = getNpcById(id);
  if (!npc) {
    throw new Error(`冒烟测试前置条件失败：NPC ${id} 未找到`);
  }
  return npc;
}

/** 造事实表（day 固定 7，beatId 固定 "smoke"） */
function factsOf(writes: [key: string, value: string][]): WorldFacts {
  return writeFacts(
    createEmptyFacts(),
    writes.map(([key, value]): WorldFactWrite => ({ key, value })),
    7,
    "smoke",
  );
}

function rel(
  entries: [npcId: string, toNpc: number, fromNpc: number][],
): Record<string, NpcAffinityPair> {
  const out: Record<string, NpcAffinityPair> = {};
  for (const [npcId, toNpc, fromNpc] of entries) {
    out[npcId] = { toNpc, fromNpc };
  }
  return out;
}

function endingLabel(id: EndingId): string {
  return id;
}

function logEnding(name: string, detail: EndingDetail): void {
  const match = detail.matchNpcId ? `（主角=${detail.matchNpcId}）` : "";
  console.log(`  ${name} → ${endingLabel(detail.id)}${match}`);
}

// ------------------------------------------------------------
// Part A：resolveEnding 六结局短路
// ------------------------------------------------------------

function testEndings(): void {
  console.log("== Part A：resolveEnding 六结局短路 ==");

  // ENDING_IDS 常量顺序
  assert(ENDING_IDS.length === 6, "ENDING_IDS 应有 6 个结局");
  assert(
    ENDING_IDS.join(",") === "mutual,missed,hesitant,restrained,solo,broken",
    "ENDING_IDS 顺序应为 P1~P6",
  );

  // ---- P1 双向奔赴 ----
  {
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 90, 90],
        ["xiaohai", 40, 40],
      ]),
      facts: factsOf([["day6_mutual", "guyan=true,xiaohai=false"]]),
    });
    assert(detail.id === "mutual", "P1：px≥85∧nx≥85∧day6_mutual 含 X → mutual");
    assert(detail.matchNpcId === "guyan", "P1：matchNpcId 应为 guyan");
    logEnding("P1 mutual（day6_mutual 列表）", detail);
  }
  {
    // day7_confession_success 只含 true 项（裸 id 列表）也能命中 P1
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 90, 90],
        ["xiaohai", 90, 90],
      ]),
      facts: factsOf([
        ["day7_confession_success", "guyan"],
        ["day7_confession_result", "success"],
      ]),
    });
    assert(detail.id === "mutual", "P1：day7_confession_success 裸 id 列表 → mutual");
    logEnding("P1 mutual（day7 告白成功）", detail);
  }
  {
    // P1 边界：px=84 → 不触发 mutual
    const id = resolveEnding({
      relationships: rel([
        ["guyan", 84, 90],
        ["xiaohai", 40, 40],
      ]),
      facts: factsOf([["day6_mutual", "guyan"]]),
    });
    assert(id !== "mutual", "P1 边界：px=84 不触发 mutual");
    logEnding("P1 边界（px=84，不得 mutual）", { id });
  }

  // ---- P2 错位：三种子情形 ----
  {
    // 子情形 1：Day6 选了 X 但 X 未选玩家（day6_mutual 不含 X=true）
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 80, 90],
        ["xiaohai", 40, 40],
      ]),
      facts: factsOf([
        ["day6_player_declared", "guyan"],
        ["day6_mutual", "xiaohai=true"],
      ]),
    });
    assert(detail.id === "missed", "P2-1：Day6 选 X 未互选 → missed");
    assert(detail.matchNpcId === "guyan", "P2-1：matchNpcId 应为 guyan");
    logEnding("P2-1 missed（Day6 选 X 未互选）", detail);
  }
  {
    // 子情形 2：Day7 向 X 告白被拒（solo_target=X ∧ result=rejected）
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 90, 90],
        ["xiaohai", 40, 40],
      ]),
      facts: factsOf([
        ["day7_solo_target", "guyan"],
        ["day7_confession_result", "rejected"],
      ]),
    });
    assert(detail.id === "missed", "P2-2：Day7 告白被拒 → missed");
    logEnding("P2-2 missed（Day7 告白被拒）", detail);
  }
  {
    // 子情形 3：Day6 选了他人 Y（≠X）且 Day7 未向 X 告白成功
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 85, 90],
        ["xiaohai", 60, 40],
      ]),
      facts: factsOf([
        ["day6_player_declared", "xiaohai"],
        ["day7_solo_target", "none"],
      ]),
    });
    assert(detail.id === "missed", "P2-3：Day6 选他人且 Day7 未告白成功 → missed");
    assert(detail.matchNpcId === "guyan", "P2-3：matchNpcId 应为 guyan");
    logEnding("P2-3 missed（Day6 选他人）", detail);
  }
  {
    // P2 优先于 P4：Day6 弃权 + Day7 告白失败 → missed（告白失败优先，§10 补充）
    const id = resolveEnding({
      relationships: rel([
        ["guyan", 70, 90],
        ["xiaohai", 40, 40],
      ]),
      facts: factsOf([
        ["day6_player_abstained", "true"],
        ["day7_solo_target", "guyan"],
        ["day7_confession_result", "rejected"],
      ]),
    });
    assert(id === "missed", "P2 优先：弃权+告白失败 → missed 而非 restrained");
    logEnding("P2 优先（弃权+告白失败）", { id });
  }

  // ---- P3 迟疑 ----
  {
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 70, 60],
        ["xiaohai", 40, 30],
      ]),
      facts: factsOf([["day7_solo_target", "xiaohai"]]),
    });
    assert(detail.id === "hesitant", "P3：max(nx)=60 ∈[50,85) 且未告白 → hesitant");
    assert(detail.matchNpcId === "guyan", "P3：matchNpcId 应为 nx 最大的 guyan");
    logEnding("P3 hesitant（max(nx)=60）", detail);
  }
  {
    // P3 下边界：max(nx)=50 恰好 ∈ [50,85)
    const id = resolveEnding({
      relationships: rel([
        ["guyan", 70, 50],
        ["xiaohai", 40, 30],
      ]),
      facts: factsOf([["day7_solo_target", "xiaohai"]]),
    });
    assert(id === "hesitant", "P3 边界：max(nx)=50 → hesitant");
    logEnding("P3 边界（max(nx)=50）", { id });
  }

  // ---- P4 克制 ----
  {
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 70, 90],
        ["xiaohai", 40, 30],
      ]),
      facts: factsOf([
        ["day6_player_abstained", "true"],
        ["day7_solo_target", "xiaohai"],
      ]),
    });
    assert(detail.id === "restrained", "P4：弃权+未向 X 告白 → restrained");
    assert(detail.matchNpcId === "guyan", "P4：matchNpcId 应为 guyan");
    logEnding("P4 restrained（弃权+未告白）", detail);
  }
  {
    // P4 负例：solo_target 指向 X → 不触发 restrained
    const id = resolveEnding({
      relationships: rel([
        ["guyan", 70, 90],
        ["xiaohai", 40, 30],
      ]),
      facts: factsOf([
        ["day6_player_abstained", "true"],
        ["day7_solo_target", "guyan"],
      ]),
    });
    assert(id !== "restrained", "P4 负例：Day7 向 X 告白过 → 不得 restrained");
    logEnding("P4 负例（solo_target=guyan，不得 restrained）", { id });
  }

  // ---- P5 独行（含边界 max(nx)=49）----
  {
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 30, 49],
        ["xiaohai", 20, 10],
      ]),
      facts: factsOf([]),
    });
    assert(detail.id === "solo", "P5：max(nx)=49 → solo（[50,85) 边界之下）");
    assert(detail.matchNpcId === undefined, "P5：solo 无主角");
    logEnding("P5 solo（max(nx)=49 边界）", detail);
  }

  // ---- P6 失和 ----
  {
    // day6_rejected_by 名单命中
    // 注意：P6 需 ¬P1~¬P5，因此场上其余人 nx 不能落在 P3 的 [50,85)（否则被迟疑截胡）
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 30, 12],
        ["xiaohai", 60, 90],
      ]),
      facts: factsOf([["day6_rejected_by", "guyan"]]),
    });
    assert(detail.id === "broken", "P6：nx≤15 且在 day6_rejected_by → broken");
    assert(detail.matchNpcId === "guyan", "P6：matchNpcId 应为 guyan");
    logEnding("P6 broken（day6_rejected_by）", detail);
  }
  {
    // day6_npc_rejected（引擎写的 NPC 间被拒名单）命中；缺失按空处理
    const detail = resolveEndingDetail({
      relationships: rel([
        ["guyan", 30, 15],
        ["xiaohai", 60, 90],
      ]),
      facts: factsOf([
        ["day6_rejected_by", "none"],
        ["day6_npc_rejected", "guyan"],
      ]),
    });
    assert(detail.id === "broken", "P6：nx≤15 且在 day6_npc_rejected → broken");
    logEnding("P6 broken（day6_npc_rejected）", detail);
  }
  {
    // P6 负例：nx 很低但未被公开拒绝 → 不得 broken
    const id = resolveEnding({
      relationships: rel([
        ["guyan", 30, 12],
        ["xiaohai", 60, 90],
      ]),
      facts: factsOf([["day6_rejected_by", "xiaohai"]]),
    });
    assert(id !== "broken", "P6 负例：nx≤15 但未被拒绝 → 不得 broken");
    logEnding("P6 负例（未被拒，不得 broken）", { id });
  }

  console.log(`Part A 断言全部通过（${assertionCount} 条累计）`);
  console.log("");
}

// ------------------------------------------------------------
// Part B + C：useIslandStore 链 + persist 配置
// ------------------------------------------------------------

async function testStore(): Promise<void> {
  const { useIslandStore } = await import("../../stores/useIslandStore");
  const { useGameStore } = await import("../../stores/useOnboardingStore");

  console.log("== Part C：persist 配置 ==");
  const persistApi = useIslandStore.persist.getOptions();
  assert(persistApi.name === "flipped-ai-island", "persist key 应为 flipped-ai-island");
  assert(persistApi.version === 1, "persist version 应为 1");
  console.log(`  persist key=${persistApi.name} version=${persistApi.version}`);
  console.log(
    "  说明：浏览器端由 zustand persist 自动恢复 localStorage（key flipped-ai-island）；" +
      "Node 下用内存 storage 模拟写入，rehydrate 不在此模拟。",
  );

  console.log("");
  console.log("== Part B：useIslandStore 状态链 ==");

  // ---- B1 无 onboarding 数据时安全 ----
  const initial = useIslandStore.getState();
  assert(initial.npcIds.length === 0, "初始 npcIds 应为空");
  initial.initFromOnboarding(); // 不应抛异常
  const afterSafeInit = useIslandStore.getState();
  assert(
    afterSafeInit.npcIds.length === initial.npcIds.length &&
      afterSafeInit.relationships === initial.relationships,
    "无 onboarding 数据时 initFromOnboarding 应安全跳过（状态不变）",
  );
  console.log("  B1 无 onboarding 数据安全跳过：通过");

  // ---- B2 交接名单 + 幂等 ----
  const islandNpcs = ["guyan", "xiaohai", "baize", "qiaoyi", "xiazhi"].map(npcById);
  const competitors = ["ningwan", "linxia", "suqing", "jiangye"].map(npcById);
  useGameStore.getState().setIslandNpcs(islandNpcs, competitors);

  useIslandStore.getState().initFromOnboarding();
  let s = useIslandStore.getState();
  const npcIds = islandNpcs.concat(competitors).map((n) => n.id);
  assert(
    s.npcIds.length === 9 && npcIds.every((id) => s.npcIds.includes(id)),
    "npcIds 应为 islandNpcs(5)+competitors(4) 的 id 列表",
  );
  assert(
    npcIds.every((id) => s.relationships[id]?.toNpc === 30 && s.relationships[id]?.fromNpc === 30),
    "初始关系应全员 30/30",
  );
  assert(s.day === 1 && s.eventIndex === 0, "初始 day=1 / eventIndex=0");
  assert(s.phase === "day_loop" && s.ending === null && s.seq === 0, "初始 phase/ending/seq 正确");
  assert(
    Object.values(s.resources).every((v) => v === 0),
    "初始资源应全 0",
  );

  // 幂等：重复调用不重建（改状态后再调，状态不被覆盖）
  useIslandStore.getState().applyResolvedOption({
    day: 1,
    eventId: "day1_seat_choice",
    kind: "decision",
    optionId: "a_join",
    optionText: "坐到顾言旁边",
    risk: "safe",
    targetNpcId: "guyan",
    deltas: [{ npcId: "guyan", direction: "to_npc", delta: 10 }],
    factsWrites: [],
    resourceCosts: [],
  });
  useIslandStore.getState().initFromOnboarding();
  s = useIslandStore.getState();
  assert(s.eventLog.length === 1, "名单一致时重复 init 不应重置 eventLog");
  assert(s.relationships["guyan"]?.toNpc === 40, "名单一致时重复 init 不应重置好感");
  console.log("  B2 名单交接 + 幂等（重复 init 不重建）：通过");

  // ---- B3 applyResolvedOption：好感钳位 / 资源钳位 / 事实 / 回放 ----
  useIslandStore.getState().applyResolvedOption({
    day: 1,
    eventId: "day1_silence_broken",
    kind: "open",
    optionId: "",
    optionText: "",
    risk: null,
    targetNpcId: null,
    deltas: [
      { npcId: "guyan", direction: "to_npc", delta: 80 }, // 40+80=120 → 钳到 100
      { npcId: "xiaohai", direction: "from_npc", delta: -80 }, // 30-80=-50 → 钳到 0
      { npcId: "linxia", direction: "to_npc", delta: 10 }, // 30+10=40
    ],
    factsWrites: [{ key: "day1_first_speaker", value: "guyan" }],
    resourceCosts: [{ resource: "exemption", amount: 1 }], // 0-1 → 钳到 0
  });
  s = useIslandStore.getState();
  assert(s.relationships["guyan"]?.toNpc === 100, "好感上钳位：应顶到 100");
  assert(s.relationships["xiaohai"]?.fromNpc === 0, "好感下钳位：应压到 0");
  assert(s.relationships["linxia"]?.toNpc === 40, "competitor 好感也应生效");
  assert(s.resources.exemption === 0, "资源扣减钳位 ≥0：exemption 应为 0");
  assert(s.worldFacts["day1_first_speaker"]?.value === "guyan", "facts 应写入 worldFacts");
  assert(s.eventLog.length === 2, "eventLog 应追加到 2 条");
  assert(s.seq === 2, "seq 应自增到 2");
  const entry = s.eventLog[1];
  assert(
    entry !== undefined &&
      entry.day === 1 &&
      entry.kind === "open" &&
      entry.optionId === "" &&
      entry.risk === null &&
      entry.deltas?.length === 3 &&
      entry.facts?.length === 1,
    "回放条目字段应完整",
  );
  console.log("  B3 好感/资源钳位 + 事实写入 + 回放：通过");

  // ---- B4 advanceEvent 钳位 ≤2 ----
  useIslandStore.getState().advanceEvent(); // 1
  useIslandStore.getState().advanceEvent(); // 2
  useIslandStore.getState().advanceEvent(); // 仍 2
  assert(useIslandStore.getState().eventIndex === 2, "advanceEvent 应钳位到 2");
  console.log("  B4 advanceEvent 钳位 ≤2：通过");

  // ---- B5 advanceDay 资源发放（day1 → day7）----
  // day1 → day2（无发放）→ day3（exemption+1）→ day4 → day5（trust_points+3）→
  // day6（declaration+1）→ day7（solo_chance+1）→ day7 不动
  useIslandStore.getState().advanceDay(); // → 2
  useIslandStore.getState().advanceDay(); // → 3
  s = useIslandStore.getState();
  assert(s.day === 3 && s.resources.exemption === 1, "day3 应发放 exemption=1");
  useIslandStore.getState().advanceDay(); // → 4
  assert(useIslandStore.getState().resources.exemption === 1, "day4 exemption 保持 1");
  useIslandStore.getState().advanceDay(); // → 5
  s = useIslandStore.getState();
  assert(s.day === 5 && s.resources.trust_points === 3, "day5 应发放 trust_points=3");
  useIslandStore.getState().advanceDay(); // → 6
  assert(useIslandStore.getState().resources.declaration === 1, "day6 应发放 declaration=1");
  useIslandStore.getState().advanceDay(); // → 7
  assert(useIslandStore.getState().resources.solo_chance === 1, "day7 应发放 solo_chance=1");
  useIslandStore.getState().advanceDay(); // day7 不动
  assert(useIslandStore.getState().day === 7, "day=7 时 advanceDay 不应再动");
  assert(useIslandStore.getState().eventIndex === 0, "advanceDay 应重置 eventIndex=0");
  console.log("  B5 advanceDay 资源发放（day3=1 / day5=3 / day6=1 / day7=1）：通过");

  // ---- B6 resolveEnding：构造 mutual 状态 ----
  useIslandStore.getState().applyResolvedOption({
    day: 6,
    eventId: "day6_declare",
    kind: "decision",
    optionId: "a_public",
    optionText: "正式表态",
    risk: "dangerous",
    targetNpcId: "guyan",
    deltas: [{ npcId: "guyan", direction: "from_npc", delta: 70 }], // 30+70=100
    factsWrites: [
      { key: "day6_player_declared", value: "guyan" },
      { key: "day6_mutual", value: "guyan=true,xiaohai=false" },
    ],
    resourceCosts: [],
  });
  s = useIslandStore.getState();
  assert(s.relationships["guyan"]?.toNpc === 100, "B6 前置：guyan px=100");
  assert(s.relationships["guyan"]?.fromNpc === 100, "B6 前置：guyan nx=100");
  useIslandStore.getState().resolveEnding();
  s = useIslandStore.getState();
  assert(s.ending === "mutual", "resolveEnding 应命中 mutual");
  assert(s.phase === "finale", "resolveEnding 应切 phase=finale");
  console.log("  B6 resolveEnding（命中 mutual，phase=finale）：通过");

  // ---- B7 选择器 ----
  useIslandStore.getState().resetRun();
  useIslandStore.getState().applyResolvedOption({
    day: 1,
    eventId: "day1_seat_choice",
    kind: "decision",
    optionId: "a_join",
    optionText: "坐到顾言旁边",
    risk: "safe",
    targetNpcId: "guyan",
    deltas: [
      { npcId: "guyan", direction: "to_npc", delta: 40 }, // 70
      { npcId: "xiaohai", direction: "to_npc", delta: 40 }, // 70（并列，guyan 靠前）
      { npcId: "linxia", direction: "to_npc", delta: 10 }, // 40
    ],
    factsWrites: [],
    resourceCosts: [],
  });
  assert(
    useIslandStore.getState().highestNpcId() === "guyan",
    "highestNpcId：并列取 npcIds 靠前（guyan）",
  );
  assert(useIslandStore.getState().secondNpcId() === "xiaohai", "secondNpcId 应为 xiaohai");
  const heart = useIslandStore.getState().getHeart("guyan");
  assert(
    heart !== null && heart.toNpc === 70 && heart.fromNpc === 30,
    "getHeart 应返回 {toNpc, fromNpc}",
  );
  assert(useIslandStore.getState().getHeart("nobody") === null, "getHeart：未知 id 返回 null");
  console.log("  B7 选择器 highest/second/getHeart（含并列）：通过");

  // ---- B7.5 applyResolvedOption 幂等：同 (day, eventId) 重复结算应跳过 ----
  // （T6 验收补丁契约：重看当天事件 / 刷新恢复重播时，数值与回放不重复落库）
  useIslandStore.getState().applyResolvedOption({
    day: 1,
    eventId: "day1_seat_choice",
    kind: "decision",
    optionId: "c_stand",
    optionText: "站着",
    risk: "subtle",
    targetNpcId: "guyan",
    deltas: [{ npcId: "guyan", direction: "to_npc", delta: 10 }],
    factsWrites: [{ key: "day1_seat_side", value: "stand" }],
    resourceCosts: [],
  });
  s = useIslandStore.getState();
  assert(s.eventLog.length === 1, "重复结算同一 eventId：eventLog 不应追加");
  assert(s.seq === 1, "重复结算同一 eventId：seq 不应自增");
  assert(s.relationships["guyan"]?.toNpc === 70, "重复结算同一 eventId：好感不应重复应用");
  assert(s.worldFacts["day1_seat_side"] === undefined, "重复结算同一 eventId：facts 不应重复写入");
  console.log("  B7.5 applyResolvedOption 幂等（重复结算跳过）：通过");

  // ---- B7.6 hook 写入不挡真实结算（T8 联调发现「幂等错杀」bug 的契约）----
  // beforeHooks 的引擎写入（kind:"open" + optionId:""）与真实结算同 eventId，
  // 不计入幂等键；hook 重跑只合并状态、不追加 eventLog。
  useIslandStore.getState().resetRun();
  useIslandStore.getState().applyResolvedOption({
    day: 1,
    eventId: "day1_seat_choice",
    kind: "open",
    optionId: "",
    optionText: "",
    risk: null,
    targetNpcId: null,
    deltas: null,
    factsWrites: [{ key: "day1_seat_left", value: "guyan" }],
    resourceCosts: [],
  });
  s = useIslandStore.getState();
  assert(s.eventLog.length === 1, "hook 写入应追加 1 条 eventLog");
  assert(s.worldFacts["day1_seat_left"]?.value === "guyan", "hook 写入 facts 应落库");
  useIslandStore.getState().applyResolvedOption({
    day: 1,
    eventId: "day1_seat_choice",
    kind: "decision",
    optionId: "a_left",
    optionText: "坐到左边",
    risk: "safe",
    targetNpcId: "guyan",
    deltas: [{ npcId: "guyan", direction: "to_npc", delta: 2 }],
    factsWrites: [{ key: "day1_seat_side", value: "left" }],
    resourceCosts: [],
  });
  s = useIslandStore.getState();
  assert(s.eventLog.length === 2, "hook 记录不挡真实结算：eventLog 应为 2 条");
  assert(s.relationships["guyan"]?.toNpc === 32, "hook 记录不挡真实结算：好感应 +2");
  assert(s.worldFacts["day1_seat_side"]?.value === "left", "结算 facts 应落库");
  useIslandStore.getState().applyResolvedOption({
    day: 1,
    eventId: "day1_seat_choice",
    kind: "decision",
    optionId: "c_stand",
    optionText: "站着",
    risk: "subtle",
    targetNpcId: "guyan",
    deltas: [{ npcId: "guyan", direction: "to_npc", delta: 10 }],
    factsWrites: [{ key: "day1_seat_side", value: "stand" }],
    resourceCosts: [],
  });
  s = useIslandStore.getState();
  assert(s.eventLog.length === 2, "真实结算后重复结算：eventLog 不应追加");
  assert(s.relationships["guyan"]?.toNpc === 32, "真实结算后重复结算：好感不应重复");
  useIslandStore.getState().applyResolvedOption({
    day: 1,
    eventId: "day1_seat_choice",
    kind: "open",
    optionId: "",
    optionText: "",
    risk: null,
    targetNpcId: null,
    deltas: null,
    factsWrites: [{ key: "day1_seat_left", value: "guyan" }],
    resourceCosts: [],
  });
  s = useIslandStore.getState();
  assert(s.eventLog.length === 2, "hook 重跑：eventLog 不应追加重复条目");
  assert(s.worldFacts["day1_seat_left"]?.value === "guyan", "hook 重跑：facts 仍应合并");
  console.log("  B7.6 hook 写入不挡真实结算 + hook 重跑去重：通过");

  // ---- B7.7 真实结算后 afterHooks 写入必须放行（T8 联调发现「幂等误挡
  // 结算后钩子」bug 的契约：d6_recompute_votes 在玩家表态结算后重算
  // 互选/被拒名单/弃权惩罚 Δ，若被幂等挡掉则结局判定失真）----
  // 先写玩家弃权结算（模拟 settleAndApply 的 decision 写入）
  useIslandStore.getState().applyResolvedOption({
    day: 6,
    eventId: "day6_declare",
    kind: "decision",
    optionId: "c_abstain",
    optionText: "弃权，不选任何人",
    risk: "dangerous",
    targetNpcId: null,
    deltas: null,
    factsWrites: [{ key: "day6_player_declared", value: "none" }],
    resourceCosts: [{ resource: "declaration", amount: 1 }],
  });
  // 再写 afterHooks 重算输出（模拟 d6_recompute_votes 结算后钩子）
  useIslandStore.getState().applyResolvedOption({
    day: 6,
    eventId: "day6_declare",
    kind: "open",
    optionId: "",
    optionText: "",
    risk: null,
    targetNpcId: null,
    deltas: [{ npcId: "xiazhi", direction: "from_npc", delta: -12 }],
    factsWrites: [{ key: "day6_rejected_by", value: "xiazhi" }],
    resourceCosts: [],
  });
  s = useIslandStore.getState();
  assert(s.eventLog.length === 3, "结算后 hook 写入：eventLog 不应追加重复条目");
  assert(s.relationships["xiazhi"]?.fromNpc === 18, "结算后 hook 写入：好感 Δ 应照常应用（30-12）");
  assert(s.worldFacts["day6_rejected_by"]?.value === "xiazhi", "结算后 hook 写入：facts 应落库");
  console.log("  B7.7 真实结算后 afterHooks 写入放行（合并状态、不追加 log）：通过");

  // ---- B8 resetRun：回到初始（保留名单）----
  useIslandStore.getState().resetRun();
  s = useIslandStore.getState();
  assert(
    s.day === 1 && s.eventIndex === 0 && s.phase === "day_loop",
    "resetRun 应重置 day/eventIndex/phase",
  );
  assert(
    s.ending === null && s.seq === 0 && s.eventLog.length === 0,
    "resetRun 应清空 ending/seq/eventLog",
  );
  assert(
    s.npcIds.length === 9 &&
      s.npcIds.every(
        (id) => s.relationships[id]?.toNpc === 30 && s.relationships[id]?.fromNpc === 30,
      ),
    "resetRun 应保留 npcIds 并重建 30/30",
  );
  assert(
    Object.values(s.resources).every((v) => v === 0),
    "resetRun 应清零资源",
  );
  console.log("  B8 resetRun（保留名单，重建 30/30）：通过");

  // ---- B9 persist 写入真实发生 ----
  assert(
    memStorage.has("flipped-ai-island"),
    "persist 写入应落盘到存储（flipped-ai-island 键存在）",
  );
  const persistedRaw = memStorage.get("flipped-ai-island");
  assert(
    persistedRaw !== undefined && persistedRaw.includes('"version":1'),
    "持久化内容应含 version:1",
  );
  console.log("  B9 persist 写入（key + version:1）：通过");

  console.log(`Part B/C 断言全部通过（累计 ${assertionCount} 条）`);
  console.log("");
}

// ------------------------------------------------------------
// 入口
// ------------------------------------------------------------

void (async () => {
  try {
    testEndings();
    await testStore();
    console.log("冒烟测试通过 ✓");
  } catch (err) {
    console.error("冒烟测试失败：", err);
    process.exit(1);
  }
})();

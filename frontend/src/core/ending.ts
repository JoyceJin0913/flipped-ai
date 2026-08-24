/**
 * 六结局短路判定（纯函数）
 *
 * 依据《心动岛_七日公共事件_精简版.md》§10 结局判定表（阈值写死）。
 * 六结局按优先级短路（P1→P2→P3→P4→P5→P6，命中即返回，不继续检查）。
 * `玩家→X` 记 px、`X→玩家` 记 nx。
 *
 * 输入可从 useIslandStore 状态直接构造：
 *   resolveEnding({ relationships: store.relationships, facts: store.worldFacts })
 *
 * 事实值约定（写死，§12）：
 *   - 布尔："true" / "false"
 *   - 列表：逗号分隔；空值写 "none"
 *   - day6_mutual / day7_confession_success：引擎写的 "npcId=true" 逗号分隔列表
 *     （如 "guyan=true,xiaohai=false"，或只含 true 项 "guyan"）——
 *     解析时先 split 逗号，item 为 X 或 "X=true" 即算 X=true
 *   - day6_player_declared / day7_solo_target：单个 npc id 或 "none"
 *
 * 本模块只读事实，不写事实；day6_* / day7_* 等键由引擎（turnRunner，T5）写入。
 */

import type { WorldFacts } from "./worldTypes";
import { readFact } from "./worldFacts";

// ============================================================
// 类型与常量
// ============================================================

/** 六结局 id（按优先级 P1~P6 顺序） */
export type EndingId =
  | "mutual" // P1 双向奔赴
  | "missed" // P2 错位
  | "hesitant" // P3 迟疑
  | "restrained" // P4 克制
  | "solo" // P5 独行
  | "broken"; // P6 失和

/** 结局 id 常量数组（P1~P6 顺序，UI/回放可遍历） */
export const ENDING_IDS: EndingId[] = [
  "mutual",
  "missed",
  "hesitant",
  "restrained",
  "solo",
  "broken",
];

/** 单个 NPC 的双向好感值 */
export interface NpcAffinityPair {
  /** 玩家→NPC（px） */
  toNpc: number;
  /** NPC→玩家（nx） */
  fromNpc: number;
}

/** 结局判定输入（可从 store 状态直接构造） */
export interface EndingInput {
  /** 岛上全体 NPC 的关系值 */
  relationships: Record<string, NpcAffinityPair>;
  /** 世界事实表 */
  facts: WorldFacts;
}

/** 结局详情（含主角 NPC，供结局页点名） */
export interface EndingDetail {
  /** 结局 id */
  id: EndingId;
  /** 结局主角 NPC（solo 等无主角的结局省略） */
  matchNpcId?: string;
}

// ============================================================
// 写死阈值（§10）
// ============================================================

const MUTUAL_THRESHOLD = 85; // P1：px≥85 ∧ nx≥85
const MISSED_NX_THRESHOLD = 85; // P2：nx≥85
const HESITANT_NX_MIN = 50; // P3：max(nx) ∈ [50, 85)
const HESITANT_NX_MAX = 85;
const RESTRAINED_NX_THRESHOLD = 85; // P4：nx≥85
const RESTRAINED_PX_THRESHOLD = 60; // P4：px≥60
const SOLO_NX_MAX = 50; // P5：∀X nx < 50
const BROKEN_NX_MAX = 15; // P6：nx ≤ 15

// ============================================================
// 事实读取辅助（§12 值约定）
// ============================================================

/** 读布尔事实（值 === "true" 才算真） */
function readBool(facts: WorldFacts, key: string): boolean {
  return readFact(facts, key) === "true";
}

/** 读列表事实（逗号分隔；"none" / "" / 缺失 → 空列表） */
function readList(facts: WorldFacts, key: string): string[] {
  const raw = readFact(facts, key);
  if (!raw || raw === "none") return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** 读单个 NPC 事实（"none" / 缺失 → null） */
function readSingleNpc(facts: WorldFacts, key: string): string | null {
  const raw = readFact(facts, key);
  if (!raw || raw === "none") return null;
  return raw;
}

/**
 * 判定 "npcId=true" 逗号分隔列表（day6_mutual / day7_confession_success）
 * 中是否包含指定 NPC 的 true 标记。
 * item 为裸 id（"guyan"）或 "guyan=true" → true；"guyan=false" → false。
 */
function listMarkTrue(facts: WorldFacts, key: string, npcId: string): boolean {
  const raw = readFact(facts, key);
  if (!raw || raw === "none") return false;
  return raw.split(",").some((item) => {
    const trimmed = item.trim();
    if (trimmed === npcId) return true;
    const eq = trimmed.indexOf("=");
    if (eq > 0 && trimmed.slice(0, eq) === npcId) {
      return trimmed.slice(eq + 1) === "true";
    }
    return false;
  });
}

/** nx 最大的 NPC（并列取 npcIds 顺序靠前；全员缺失返回 null） */
function argmaxFromNpc(
  npcIds: string[],
  relationships: Record<string, NpcAffinityPair>,
): string | null {
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const npcId of npcIds) {
    const rel = relationships[npcId];
    if (!rel) continue;
    if (rel.fromNpc > bestValue) {
      bestValue = rel.fromNpc;
      best = npcId;
    }
  }
  return best;
}

// ============================================================
// 核心判定（短路）
// ============================================================

/** 内部求值结果 */
interface EndingDecision {
  id: EndingId;
  matchNpcId: string | null;
}

/** 按 §10 优先级短路求值，命中即返回 */
function evaluateEnding(input: EndingInput): EndingDecision {
  const { relationships, facts } = input;
  const npcIds = Object.keys(relationships);

  const declared = readSingleNpc(facts, "day6_player_declared");
  const soloTarget = readSingleNpc(facts, "day7_solo_target");
  const confessionResult = readFact(facts, "day7_confession_result");

  // ---- P1 双向奔赴：∃X：px≥85 ∧ nx≥85 ∧ 互选/告白成功 ----
  for (const npcId of npcIds) {
    const rel = relationships[npcId];
    if (!rel) continue;
    if (
      rel.toNpc >= MUTUAL_THRESHOLD &&
      rel.fromNpc >= MUTUAL_THRESHOLD &&
      (listMarkTrue(facts, "day6_mutual", npcId) ||
        listMarkTrue(facts, "day7_confession_success", npcId))
    ) {
      return { id: "mutual", matchNpcId: npcId };
    }
  }

  // ---- P2 错位：∃X：nx≥85 ∧ 行动过但失败/辜负 ----
  for (const npcId of npcIds) {
    const rel = relationships[npcId];
    if (!rel) continue;
    if (rel.fromNpc < MISSED_NX_THRESHOLD) continue;

    const mutualWithX = listMarkTrue(facts, "day6_mutual", npcId);
    const confessedXOnDay7 = soloTarget === npcId && confessionResult === "success";

    const sub1 = declared === npcId && !mutualWithX; // Day6 选 X 但 X 未选玩家
    const sub2 = soloTarget === npcId && confessionResult === "rejected"; // Day7 向 X 告白失败
    // Day6 选了他人 Y（≠X，且确实表态过）且 Day7 未向 X 告白成功
    const sub3 = declared !== null && declared !== npcId && !confessedXOnDay7;

    if (sub1 || sub2 || sub3) {
      return { id: "missed", matchNpcId: npcId };
    }
  }

  // ---- P3 迟疑：max(nx) ∈ [50, 85) ∧ 玩家 Day7 未向该对象告白 ----
  const maxNxId = argmaxFromNpc(npcIds, relationships);
  if (maxNxId !== null) {
    const maxNx = relationships[maxNxId]?.fromNpc ?? -1;
    if (maxNx >= HESITANT_NX_MIN && maxNx < HESITANT_NX_MAX) {
      const notConfessedToMax = soloTarget !== maxNxId || confessionResult !== "success";
      if (notConfessedToMax) {
        return { id: "hesitant", matchNpcId: maxNxId };
      }
    }
  }

  // ---- P4 克制：弃权 ∧ ∃X：nx≥85 ∧ px≥60 ∧ Day7 未向 X 告白 ----
  if (readBool(facts, "day6_player_abstained")) {
    for (const npcId of npcIds) {
      const rel = relationships[npcId];
      if (!rel) continue;
      if (
        rel.fromNpc >= RESTRAINED_NX_THRESHOLD &&
        rel.toNpc >= RESTRAINED_PX_THRESHOLD &&
        soloTarget !== npcId
      ) {
        return { id: "restrained", matchNpcId: npcId };
      }
    }
  }

  // ---- P5 独行：∀X：nx < 50 ----
  if (npcIds.every((npcId) => (relationships[npcId]?.fromNpc ?? 0) < SOLO_NX_MAX)) {
    return { id: "solo", matchNpcId: null };
  }

  // ---- P6 失和：∃X：nx ≤ 15 ∧ X 被公开拒绝 ----
  const rejected = new Set([
    ...readList(facts, "day6_rejected_by"),
    ...readList(facts, "day6_npc_rejected"), // 引擎写的 NPC 间被拒名单，缺失按空处理
  ]);
  for (const npcId of npcIds) {
    const rel = relationships[npcId];
    if (!rel) continue;
    if (rel.fromNpc <= BROKEN_NX_MAX && rejected.has(npcId)) {
      return { id: "broken", matchNpcId: npcId };
    }
  }

  // 兜底：规格未覆盖的退化局面（正常流程不可达——P5 已兜住全部 nx<50 的情形）。
  // 保守返回 solo，不抛错。
  return { id: "solo", matchNpcId: null };
}

// ============================================================
// 对外 API
// ============================================================

/** 判定结局（纯函数，短路；只返回 EndingId） */
export function resolveEnding(input: EndingInput): EndingId {
  return resolveEndingDetail(input).id;
}

/** 判定结局并返回详情（含主角 NPC，供结局页点名） */
export function resolveEndingDetail(input: EndingInput): EndingDetail {
  const decision = evaluateEnding(input);
  return decision.matchNpcId === null
    ? { id: decision.id }
    : { id: decision.id, matchNpcId: decision.matchNpcId };
}

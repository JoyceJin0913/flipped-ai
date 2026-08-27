/**
 * turnRunner —— 七日公共事件引擎（T5）
 *
 * 纯函数为主：不 import 任何 store，所有输入以 EngineContext 状态快照传入；
 * 写入结果（facts / deltas / resources）由调用方（EventFlow）交给
 * useIslandStore.applyResolvedOption 落库。
 *
 * 依据：《心动岛_七日公共事件_精简版.md》§1~§15 + frontend/src/data/events/
 * types.ts 注释块（唯一共享契约）与 day1~7.ts 头部「引擎注记」。
 *
 * 对外 API：
 *   fillText / resolveNpcRef / resolveEffectTarget / resolveOptionTarget
 *   runEngineHook / evaluateRequire / buildOptions / resolveOption
 *   highestNpc / secondNpc / attachmentOf / ATTACHMENT_L3 / ATTACHMENT_L4
 *   confessionTriggered / confessionPartner（供 custom 与 smoke 复用）
 */

import type { WorldFacts } from "./worldTypes";
import { readFact, hasFact, writeFacts, type WorldFactWrite } from "./worldFacts";
import { getNpcById } from "@/onboarding/npcLibrary";
import type { AttachmentType } from "@/onboarding/types";
import { settle } from "./referee/settlement";
import { buildActorOutput } from "./intents";
import { buildPersonalityVector } from "./personalityVector";
import type { NpcOutputContext } from "./outputContext";
import {
  deriveRelationshipRoles,
  hasMemoryTag,
  rankEventCast,
  readRelationshipMetric,
} from "./relationshipEngine";
import { getStageFromValue } from "@/onboarding/scoring";
import type {
  CustomCondId,
  DecisionEventSpec,
  EffectTarget,
  EngineHookId,
  EventOption,
  NpcRef,
  OptionRequire,
  ResourceKey,
} from "../data/events/types";
import { getDay } from "../data/events";

// ============================================================
// 基础类型
// ============================================================

/** 单个 NPC 的双向好感（与 useIslandStore 的 IslandRelationship 结构一致） */
export interface EngineCtxRel {
  toNpc: number;
  fromNpc: number;
}

/** eventLog 的最小结构（store 的 IslandEventLogEntry 结构兼容子集） */
export interface EngineEventLogEntry {
  eventId: string;
  optionId: string | null;
}

/** 引擎上下文：store 状态的纯快照 + 可注入随机源 */
export interface EngineContext {
  npcIds: string[];
  relationships: Record<string, EngineCtxRel>;
  worldFacts: WorldFacts;
  resources: Record<ResourceKey, number>;
  day: number;
  eventIndex: number;
  eventLog: EngineEventLogEntry[];
  /** Unified read models. Optional so legacy fixtures and callers keep their exact behavior. */
  outputContexts?: {
    eventCast: Record<string, NpcOutputContext>;
    eventChoices: Record<string, NpcOutputContext>;
  };
  /** 随机源（smoke 注入定值实现确定性） */
  random: () => number;
}

/** 好感变化（direction 相对玩家视角，与 store IslandDelta 一致） */
export interface EngineDelta {
  npcId: string;
  direction: "to_npc" | "from_npc";
  delta: number;
}

/** 引擎钩子 / 结算结果（调用方交给 store 写入） */
export interface EngineResult {
  factWrites: WorldFactWrite[];
  deltas: EngineDelta[];
}

/** 条件求值选项（占位符解析上下文，buildOptions/resolveOption 内部线程） */
export interface EvalOptions {
  /** 选择器已选目标（{target} 优先取它） */
  selectedNpcId?: string | null;
  /** 事件焦点（{焦点NPC}） */
  focusNpcId?: string | null;
  /** 依恋 L3/L4 动态阈值替换（day4/5/6/7 告白/私密类选项） */
  affinityMinOverride?: number | null;
  /** 选项级 {target} 解析结果（留守组/被拒者等 override） */
  resolvedTarget?: string | null;
}

// ============================================================
// 依恋阈值工具（§2.4，写死）
// ============================================================

/** L3 好感阈值：secure 50 / avoidant 60 / anxious 45 */
export const ATTACHMENT_L3: Record<AttachmentType, number> = {
  secure: 50,
  avoidant: 60,
  anxious: 45,
};

/** L4 好感阈值：secure 75 / avoidant 85 / anxious 70 */
export const ATTACHMENT_L4: Record<AttachmentType, number> = {
  secure: 75,
  avoidant: 85,
  anxious: 70,
};

/** 依恋 L3 阈值（未知依恋回退 secure 50） */
export function attachmentL3(t: AttachmentType | undefined): number {
  return t ? (ATTACHMENT_L3[t] ?? 50) : 50;
}

/** 依恋 L4 阈值（未知依恋回退 secure 75） */
export function attachmentL4(t: AttachmentType | undefined): number {
  return t ? (ATTACHMENT_L4[t] ?? 75) : 75;
}

/** NPC 依恋类型（npcLibrary） */
export function attachmentOf(npcId: string): AttachmentType | undefined {
  return getNpcById(npcId)?.attachment;
}

/** NPC 真名（库内缺失时回退原 id） */
export function npcName(npcId: string | null): string | null {
  if (!npcId) return null;
  return getNpcById(npcId)?.name ?? npcId;
}

// ============================================================
// 随机 / 数值小工具
// ============================================================

/** [min, max] 内随机整数（含端点） */
function randInt(min: number, max: number, ctx: EngineContext): number {
  return min + Math.floor(ctx.random() * (max - min + 1));
}

/** 从列表随机取一个（空列表 → null） */
function pickOne(list: string[], ctx: EngineContext): string | null {
  if (list.length === 0) return null;
  return list[randInt(0, list.length - 1, ctx)] ?? null;
}

// ============================================================
// fact 读取小工具（§12 值约定）
// ============================================================

/** 读事实（缺失 → null） */
function fact(ctx: EngineContext, key: string): string | null {
  return readFact(ctx.worldFacts, key) ?? null;
}

/** 读列表事实（逗号分隔；"none"/""/缺失 → []） */
function factList(ctx: EngineContext, key: string): string[] {
  const raw = fact(ctx, key);
  if (!raw || raw === "none") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 读单个 NPC 事实（"none"/缺失 → null） */
function factNpc(ctx: EngineContext, key: string): string | null {
  const raw = fact(ctx, key);
  if (!raw || raw === "none") return null;
  return raw;
}

// ============================================================
// 玩家中心好感工具
// ============================================================

function px(ctx: EngineContext, npcId: string): number {
  return ctx.relationships[npcId]?.toNpc ?? 0;
}

function nx(ctx: EngineContext, npcId: string): number {
  return ctx.relationships[npcId]?.fromNpc ?? 0;
}

/** 玩家好感最高 NPC（并列取 npcIds 顺序靠前；与 store.highestNpcId 同规则） */
export function highestNpc(ctx: EngineContext): string | null {
  if (ctx.outputContexts?.eventCast) {
    return rankEventCast(ctx.npcIds, ctx.outputContexts.eventCast)[0] ?? null;
  }
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const id of ctx.npcIds) {
    const v = px(ctx, id);
    if (v > bestValue) {
      bestValue = v;
      best = id;
    }
  }
  return best;
}

/** 玩家好感第二的 NPC（与 store.secondNpcId 同规则） */
export function secondNpc(ctx: EngineContext): string | null {
  if (ctx.outputContexts?.eventCast) {
    return rankEventCast(ctx.npcIds, ctx.outputContexts.eventCast)[1] ?? null;
  }
  let first: string | null = null;
  let firstValue = -Infinity;
  let second: string | null = null;
  let secondValue = -Infinity;
  for (const id of ctx.npcIds) {
    const v = px(ctx, id);
    if (v > firstValue) {
      second = first;
      secondValue = firstValue;
      first = id;
      firstValue = v;
    } else if (v > secondValue) {
      second = id;
      secondValue = v;
    }
  }
  return second;
}

function eventChoiceContext(ctx: EngineContext, npcId: string): NpcOutputContext | null {
  return ctx.outputContexts?.eventChoices[npcId] ?? ctx.outputContexts?.eventCast[npcId] ?? null;
}

function highestFrom(ctx: EngineContext, npcIds: readonly string[]): string | null {
  if (npcIds.length === 0) return null;
  if (ctx.outputContexts?.eventCast) {
    return rankEventCast(npcIds, ctx.outputContexts.eventCast)[0] ?? null;
  }
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const id of npcIds) {
    const value = px(ctx, id);
    if (value > bestValue) {
      best = id;
      bestValue = value;
    }
  }
  return best;
}

/** 事件焦点：focus 字段 > 玩家最高好感 */
function focusNpcId(ctx: EngineContext, eventFocus?: NpcRef): string | null {
  if (eventFocus) {
    const r = resolveNpcRef(eventFocus, ctx, {});
    if (r) return r;
  }
  return highestNpc(ctx);
}

// ============================================================
// NpcRef 解析
// ============================================================

/**
 * 把 NpcRef 解析为单个 NPC id：
 * - npc：显式 id（名单外 → null）
 * - focus：opts.focusNpcId ?? 玩家最高好感
 * - target：opts.resolvedTarget ?? opts.selectedNpcId ?? 玩家第二好感（§2.5）
 * - highest / second
 * - fact：列表取第一个（types.ts 约定）
 */
export function resolveNpcRef(ref: NpcRef, ctx: EngineContext, opts?: EvalOptions): string | null {
  switch (ref.kind) {
    case "npc":
      return ctx.npcIds.includes(ref.id) ? ref.id : null;
    case "focus":
      return opts?.focusNpcId ?? highestNpc(ctx);
    case "target":
      return opts?.resolvedTarget ?? opts?.selectedNpcId ?? secondNpc(ctx);
    case "highest":
      return highestNpc(ctx);
    case "second":
      return secondNpc(ctx);
    case "fact":
      return factList(ctx, ref.key)[0] ?? null;
  }
}

// ============================================================
// 效果目标解析（含 random 按 note 语义）
// ============================================================

/** 解析效果目标为 NPC id 列表 */
export function resolveEffectTarget(
  target: EffectTarget,
  ctx: EngineContext,
  opts?: EvalOptions & { note?: string | undefined; mainTargetId?: string | null },
): string[] {
  switch (target.kind) {
    case "fact_list":
      return factList(ctx, target.key);
    case "all":
      return [...ctx.npcIds];
    case "all_others": {
      const main = opts?.mainTargetId;
      return ctx.npcIds.filter((id) => id !== main);
    }
    case "random":
      return randomTargetsByNote(opts?.note, ctx, opts?.mainTargetId ?? null);
    default:
      return resolveNpcRef(target, ctx, opts) ? [resolveNpcRef(target, ctx, opts) as string] : [];
  }
}

/**
 * random 目标按 note 语义化解析（T3 注记 3 / types.ts 注释同通道）。
 * 注意顺序敏感：先匹配更具体的 note 片段。
 */
function randomTargetsByNote(
  note: string | undefined,
  ctx: EngineContext,
  mainTargetId: string | null,
): string[] {
  const n = note ?? "";
  if (n.includes("落选在即")) {
    const t = unpickedAtPlayerTurnLowest(ctx);
    return t ? [t] : [];
  }
  if (n.includes("队长") && n.includes("示好")) {
    const t = playerPickCaptain(ctx);
    return t ? [t] : [];
  }
  if (n.includes("其余组员")) {
    const m = mainTargetId;
    return playerGroupMembers(ctx).filter((id) => id !== m);
  }
  if (n.includes("组员")) {
    return playerGroupMembers(ctx);
  }
  if (n.includes("提问者")) {
    const q = factNpc(ctx, "day3_questioner");
    return q ? [q] : [];
  }
  if (n.includes("被说中")) {
    const t = pickOne(ctx.npcIds, ctx);
    return t ? [t] : [];
  }
  if (n.includes("另一个也没被选") || n.includes("留守同伴")) {
    const t = stayGroupHighest(ctx);
    return t ? [t] : [];
  }
  if (n.includes("预选玩家")) {
    return earlyPreselectPlayer(ctx);
  }
  if (n.includes("被拒者")) {
    const t = declinedUnion(ctx)[0] ?? null;
    return t ? [t] : [];
  }
  // 兜底：随机 1 位 NPC
  const t = pickOne(ctx.npcIds, ctx);
  return t ? [t] : [];
}

// ============================================================
// 占位符填充（§2.5 + 扩展）
// ============================================================

const PLACEHOLDER_MAP: Record<string, keyof typeof PLACEHOLDER_RESOLVERS> = {
  "{target}": "target",
  "{焦点NPC}": "focus",
  "{邻座A}": "seatLeft",
  "{邻座B}": "seatRight",
  "{沉默NPC}": "silent",
  "{搭话NPC}": "approacher",
  "{邀请者A}": "inviterA",
  "{邀请者B}": "inviterB",
  "{听者}": "listener",
  "{lastPicked}": "lastPicked",
  "{comforter}": "comforter",
  "{约会对象}": "datePartner",
};

const PLACEHOLDER_RESOLVERS = {
  target: (ctx: EngineContext, opts?: EvalOptions) =>
    opts?.resolvedTarget ?? opts?.selectedNpcId ?? secondNpc(ctx),
  focus: (ctx: EngineContext, opts?: EvalOptions) => opts?.focusNpcId ?? highestNpc(ctx),
  seatLeft: (ctx: EngineContext) => factNpc(ctx, "day1_seat_left"),
  seatRight: (ctx: EngineContext) => factNpc(ctx, "day1_seat_right"),
  silent: (ctx: EngineContext) => silentNpcId(ctx),
  approacher: (ctx: EngineContext) =>
    factNpc(ctx, "day1_approacher") ?? factNpc(ctx, "day1_first_speaker"),
  inviterA: (ctx: EngineContext) => factNpc(ctx, "day4_inviter_a"),
  inviterB: (ctx: EngineContext) => factNpc(ctx, "day4_inviter_b"),
  listener: (ctx: EngineContext) => factNpc(ctx, "day5_leaked_listener"),
  lastPicked: (ctx: EngineContext) => factNpc(ctx, "day2_last_picked"),
  comforter: (ctx: EngineContext) => factNpc(ctx, "day2_comforter"),
  datePartner: (ctx: EngineContext) => factNpc(ctx, "day4_accepted_npc"),
};

/**
 * 填充文本中的全部 12 个占位符为 NPC 真名。
 * 无法解析（fact 缺失 / 名单外）时保留原占位符，不抛错。
 */
export function fillText(text: string, ctx: EngineContext, opts?: EvalOptions): string {
  let out = text;
  for (const [ph, key] of Object.entries(PLACEHOLDER_MAP)) {
    if (!out.includes(ph)) continue;
    const resolver = PLACEHOLDER_RESOLVERS[key];
    const id = resolver(ctx, opts);
    const name = npcName(id);
    if (name) out = out.split(ph).join(name);
  }
  return out;
}

/**
 * 事实 value 占位符解析（T3 注记 2/5/7、day4 注记 3、day6 注记 2/4）：
 * 除 12 个正文占位符外，额外支持 {队长}/{选中者}/{culprit}/{零票者} 等
 * 由引擎内部状态解析的键。
 */
export function resolveFactValue(value: string, ctx: EngineContext, opts?: EvalOptions): string {
  if (!value.includes("{")) return value;
  let out = value;
  // 12 个正文占位符（列表取单个 id 时取首个）
  for (const [ph, key] of Object.entries(PLACEHOLDER_MAP)) {
    if (!out.includes(ph)) continue;
    const id = PLACEHOLDER_RESOLVERS[key](ctx, opts);
    if (id) out = out.split(ph).join(id);
  }
  const engineIds: Array<[string, () => string | null]> = [
    ["{队长}", () => playerPickCaptain(ctx)],
    ["{选中者}", () => playerPickCaptain(ctx)],
    ["{culprit}", () => factNpc(ctx, "day2_failed_culprit")],
    [
      "{零票者}",
      () =>
        factList(ctx, "day6_zero_vote").find(
          (id) => ctx.relationships[id] !== undefined && px(ctx, id) >= 85,
        ) ?? null,
    ],
  ];
  for (const [ph, resolve] of engineIds) {
    if (!out.includes(ph)) continue;
    const id = resolve();
    if (id) out = out.split(ph).join(id);
  }
  return out;
}

// ============================================================
// {沉默NPC}：当天发言最少者（T3 注记 4）
// ============================================================

/**
 * 当天发言最少的 NPC：统计当天已播 open 事件 script 的 speaker 去重，
 * 未发言者中并列取 玩家→NPC 好感最高者。
 * 先查 fact day1_silent_npc，缺失则现算（写入由 d1_seed_seats 负责）。
 */
function silentNpcId(ctx: EngineContext): string | null {
  const cached = factNpc(ctx, "day1_silent_npc");
  if (cached) return cached;

  const daySpec = getDay(ctx.day);
  const speakers = new Set<string>();
  if (daySpec) {
    const upTo = Math.min(ctx.eventIndex, daySpec.events.length - 1);
    for (let i = 0; i <= upTo; i++) {
      const ev = daySpec.events[i];
      if (!ev || ev.kind !== "open") continue;
      for (const line of ev.script) {
        if (!line.speaker) continue;
        const ref: NpcRef =
          typeof line.speaker === "string" ? { kind: "npc", id: line.speaker } : line.speaker;
        const id = resolveNpcRef(ref, ctx, {});
        if (id) speakers.add(id);
      }
    }
  }

  const silent = ctx.npcIds.filter((id) => !speakers.has(id));
  if (silent.length === 0) return highestNpc(ctx);
  return highestFrom(ctx, silent);
}

/** 当天沉默人数（custom d1_three_silent / d3_two_silent 共用） */
function silentCount(ctx: EngineContext): number {
  const daySpec = getDay(ctx.day);
  if (!daySpec) return ctx.npcIds.length;
  const speakers = new Set<string>();
  const upTo = Math.min(ctx.eventIndex, daySpec.events.length - 1);
  for (let i = 0; i <= upTo; i++) {
    const ev = daySpec.events[i];
    if (!ev || ev.kind !== "open") continue;
    for (const line of ev.script) {
      if (!line.speaker) continue;
      const ref: NpcRef =
        typeof line.speaker === "string" ? { kind: "npc", id: line.speaker } : line.speaker;
      const id = resolveNpcRef(ref, ctx, {});
      if (id) speakers.add(id);
    }
  }
  return Math.max(0, ctx.npcIds.length - speakers.size);
}

// ============================================================
// D2 选人轮次模拟（d2_determine_captains 内部状态）
// ============================================================

/**
 * 队长判定（§4.1，解释性裁定）：
 *  - 候选 = 9 位 NPC + 玩家；
 *  - NPC 排序分 = px + nx（当天双向联结总和）；
 *    玩家排序分 = max(px)（D1 主动拉近关系 → 更容易当队长）；
 *  - 队长1 = 最高分者、队长2 = 最低分者（并列按 npcIds 顺序，玩家殿后），
 *    队长3 = 剩余候选按固定随机源抽取；
 *  - 玩家 ∈ 三队长 → day2_player_is_captain="true"。
 * 选人顺序 = 队长轮转 [C1,C2,C3,C1,C2,C3,C1]（10 人 / 3 组 → 4/3/3）；
 * 每轮队长选「未被选 NPC 中 nx 最高者」（并列 npcId 字典序）；
 * 玩家（非队长）在第 p 个位置被选（p 随机 1..7），其被指派队长 = 该位队长。
 * 玩家是队长时，其自己的选人发生在自己队长的第一轮。
 */
function simulateDay2Picks(ctx: EngineContext): {
  captains: string[];
  playerIsCaptain: boolean;
  playerPos: number; // 1..7
  playerPickCaptain: string | null; // 非队长时选玩家的队长
} {
  const npcs = [...ctx.npcIds];
  const order: string[] = [...npcs, "player"];
  const scoreOf = (id: string): number => {
    if (id === "player") {
      let best = 0;
      for (const n of npcs) best = Math.max(best, px(ctx, n));
      return best;
    }
    return px(ctx, id) + nx(ctx, id);
  };
  const sorted = [...order].sort((a, b) => {
    const d = scoreOf(b) - scoreOf(a);
    if (d !== 0) return d;
    return order.indexOf(a) - order.indexOf(b); // 并列：npcIds 顺序（player 殿后）
  });

  const cap1 = sorted[0] ?? null;
  const cap2 = [...sorted].reverse().find((id) => id !== cap1) ?? null;
  const remaining = sorted.filter((id) => id !== cap1 && id !== cap2);
  const cap3 = pickOne(remaining, ctx);

  const captains = [cap1, cap2, cap3].filter((c): c is string => c !== null);
  const playerIsCaptain = captains.includes("player");

  // 玩家位置
  let playerPos = 1;
  let playerPickCaptain: string | null = null;
  if (!playerIsCaptain) {
    playerPos = randInt(1, 7, ctx);
    const seq = ["c1", "c2", "c3", "c1", "c2", "c3", "c1"] as const;
    const pickerKey = seq[playerPos - 1] ?? "c1";
    const pickerIdx = pickerKey === "c1" ? 0 : pickerKey === "c2" ? 1 : 2;
    playerPickCaptain = captains[pickerIdx] ?? null;
  } else {
    const idx = captains.indexOf("player");
    playerPos = idx === 0 ? 1 : idx === 1 ? 2 : 3;
    playerPickCaptain = null;
  }
  return { captains, playerIsCaptain, playerPos, playerPickCaptain };
}

/** 选人进行到第几轮（custom d2_pick_round_early：≤2 轮） */
function pickRoundOfPlayer(ctx: EngineContext): number {
  const raw = fact(ctx, "day2_player_pick_position");
  if (raw === null) return 3;
  const pos = parseInt(raw, 10);
  return Math.ceil(pos / 3);
}

/** 落选在即者：玩家选人时刻尚未被选的 NPC 中 nx 最低者（custom/效果共用判定） */
function unpickedAtPlayerTurnLowest(ctx: EngineContext): string | null {
  const posRaw = fact(ctx, "day2_player_pick_position");
  if (posRaw === null) return null;
  const pos = parseInt(posRaw, 10);
  const order = parsePickOrder(ctx);
  // 玩家决策时点前发生的 NPC 选人次
  const prior = order.filter(
    (o) => o.pickIdx < pos && o.target !== "player" && o.target !== "none",
  );
  const picked = new Set(prior.map((o) => o.target));
  // 队长不参与「落选」判定（已被选为队长）
  const captains = new Set(parseCaptains(ctx));
  const unpicked = ctx.npcIds.filter((id) => !picked.has(id) && !captains.has(id));
  if (unpicked.length === 0) return null;
  let best: string | null = null;
  let bestValue = Infinity;
  for (const id of unpicked) {
    const v = nx(ctx, id);
    if (v < bestValue) {
      bestValue = v;
      best = id;
    }
  }
  return best;
}

/** day2_player_pick_position 存在 ⇒ 有 ≥1 个落选在即候选（解释性裁定） */
function hasSomeoneAboutToBeUnpicked(ctx: EngineContext): boolean {
  return unpickedAtPlayerTurnLowest(ctx) !== null;
}

interface PickEntry {
  pickIdx: number;
  picker: string;
  target: string;
}

function parsePickOrder(ctx: EngineContext): PickEntry[] {
  const raw = fact(ctx, "day2_pick_order");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PickEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as PickEntry).pickIdx === "number" &&
        typeof (e as PickEntry).picker === "string" &&
        typeof (e as PickEntry).target === "string",
    );
  } catch {
    return [];
  }
}

function playerGroupMembers(ctx: EngineContext): string[] {
  const raw = fact(ctx, "day2_groups");
  if (!raw) return [];
  try {
    const groups = JSON.parse(raw) as Record<string, string[]>;
    const playerGroup = factNpc(ctx, "day2_player_group");
    if (!playerGroup) return [];
    const members = groups[playerGroup] ?? [];
    return members.filter((m) => m !== "player");
  } catch {
    return [];
  }
}

function playerPickCaptain(ctx: EngineContext): string | null {
  return factNpc(ctx, "day2_player_pick_captain");
}

// ============================================================
// D4 留守组 / D6 预选 / D7 被拒名单（跨事件引擎私有状态）
// ============================================================

/**
 * 留守组（§6.3 注记 8 / day4 注记 2）：岛上 NPC - 成功成行者。
 * 成功成行 = day4_accepted_npc（玩家赴约时）+ day4_date_pairs 中
 * 不涉及玩家的 NPC-NPC 配对双方。
 */
function stayGroup(ctx: EngineContext): string[] {
  const went = new Set<string>();
  const accepted = factNpc(ctx, "day4_accepted_npc");
  if (accepted) went.add(accepted);
  const raw = fact(ctx, "day4_date_pairs");
  if (raw) {
    try {
      const pairs = JSON.parse(raw) as unknown;
      if (Array.isArray(pairs)) {
        for (const p of pairs) {
          if (!Array.isArray(p) || p.length !== 2) continue;
          const [a, b] = p as [unknown, unknown];
          if (typeof a === "string" && a !== "player" && ctx.npcIds.includes(a)) went.add(a);
          if (typeof b === "string" && b !== "player" && ctx.npcIds.includes(b)) went.add(b);
        }
      }
    } catch {
      /* 解析失败按空配对处理 */
    }
  }
  return ctx.npcIds.filter((id) => !went.has(id));
}

/** 留守组内 px 最高者 */
function stayGroupHighest(ctx: EngineContext): string | null {
  const group = stayGroup(ctx);
  if (group.length === 0) return secondNpc(ctx);
  return highestFrom(ctx, group);
}

/** 预选玩家的 NPC 名单（day6_early_declares JSON 中目标为 player 者） */
function earlyPreselectPlayer(ctx: EngineContext): string[] {
  const raw = fact(ctx, "day6_early_declares");
  if (!raw) return [];
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return ctx.npcIds.filter((id) => map[id] === "player");
  } catch {
    return [];
  }
}

/** day6_rejected_by ∪ day4_declined_by_player（custom d7_has_declined） */
function declinedUnion(ctx: EngineContext): string[] {
  const out: string[] = [];
  for (const id of factList(ctx, "day6_rejected_by")) {
    if (!out.includes(id)) out.push(id);
  }
  for (const id of factList(ctx, "day4_declined_by_player")) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// ============================================================
// 动态阈值替换（依恋 L3/L4 精确化，§四）
// ============================================================

type DynamicMinRule =
  | { kind: "l3"; target: (ctx: EngineContext, opts: EvalOptions) => string | null }
  | { kind: "l4"; target: (ctx: EngineContext, opts: EvalOptions) => string | null };

/** optionId → 动态阈值规则（命中则替换 requires 中的 min 并同步 lockLabel） */
const DYNAMIC_MIN_RULES: Record<string, DynamicMinRule> = {
  // day4 6.3 A「需 L3（按 {约会对象} 依恋阈值）」（T4 注记 7）
  a_private_story: {
    kind: "l3",
    target: (ctx) => factNpc(ctx, "day4_accepted_npc"),
  },
  // day5 7.3 A「需 L3（按 {听者} 依恋阈值）」（T4 注记 5）
  a_confront_listener: {
    kind: "l3",
    target: (ctx) => factNpc(ctx, "day5_leaked_listener"),
  },
  // day6 8.2 A1 告白阈值 = 目标依恋 L4（T4 注记 1）
  a_confess_highest: {
    kind: "l4",
    target: (_ctx, opts) => opts.focusNpcId ?? highestNpc(_ctx),
  },
  // day6 8.2 D 槽（零票者表白）同 L4
  d_pick_zero_vote: {
    kind: "l4",
    target: (ctx) =>
      factList(ctx, "day6_zero_vote").find(
        (id) => ctx.relationships[id] !== undefined && px(ctx, id) >= 85,
      ) ?? null,
  },
  // day7 9.2 A1 告白阈值 = 所选目标依恋 L4
  a_confess_target: {
    kind: "l4",
    target: (_ctx, opts) => opts.selectedNpcId ?? secondNpc(_ctx),
  },
};

/**
 * 返回 optionId 的动态阈值（未命中 → null，使用数据 min）。
 * buildOptions 与 EventFlow 的 9.2 复核共用。
 */
export function dynamicAffinityMin(
  optionId: string,
  ctx: EngineContext,
  opts?: EvalOptions,
): number | null {
  const rule = DYNAMIC_MIN_RULES[optionId];
  if (!rule) return null;
  const targetId = rule.target(ctx, opts ?? {});
  if (!targetId) return null;
  const t = attachmentOf(targetId);
  return rule.kind === "l3" ? attachmentL3(t) : attachmentL4(t);
}

// ============================================================
// 依恋修正表（optionId → Δ 规则，§四）
// ============================================================

const REJECT_DELTA = (att: AttachmentType | undefined, ctx: EngineContext): number => {
  switch (att) {
    case "anxious":
      return -randInt(8, 10, ctx);
    case "avoidant":
      return -5;
    default:
      return -3;
  }
};

const ABSTAIN_DELTA = (att: AttachmentType | undefined, ctx: EngineContext): number => {
  switch (att) {
    case "anxious":
      return -randInt(12, 15, ctx);
    case "avoidant":
      return -7;
    default:
      return -5;
  }
};

interface OptionOverride {
  /** 按数据 effect 索引结算 Δ；返回 null = 不覆盖（走默认路径） */
  perEffect?: (
    effectIndex: number,
    target: string | null,
    ctx: EngineContext,
    opts: EvalOptions,
  ) => EngineDelta[] | null;
  /** 追加 Δ（数据 effects 之外） */
  extra?: (ctx: EngineContext, opts: EvalOptions) => EngineDelta[];
}

const DELTA_OVERRIDES: Record<string, OptionOverride> = {
  // day4 6.2 C 婉拒：两位邀请者按 §13 被拒行修正（from_npc）
  c_decline_stay: {
    perEffect: (_i, target, ctx) =>
      target
        ? [
            {
              npcId: target,
              direction: "from_npc",
              delta: REJECT_DELTA(attachmentOf(target), ctx),
            },
          ]
        : [],
  },
  // day4 6.2 D 叫住被拒者：anxious +6 / avoidant +3（别扭）/ 其他 +3
  d_call_back_rejected: {
    perEffect: (i, target, ctx) => {
      if (i !== 0 || !target) return null;
      const att = attachmentOf(target);
      const delta = att === "anxious" ? 6 : att === "avoidant" ? 3 : 3;
      return [{ npcId: target, direction: "from_npc", delta }];
    },
  },
  // day4 6.3 C 安静待着：avoidant +2 / 其他 -1
  c_quiet_stay: {
    perEffect: (i, target, ctx) => {
      if (i !== 0 || !target) return null;
      const att = attachmentOf(target);
      return [
        {
          npcId: target,
          direction: "from_npc",
          delta: att === "avoidant" ? 2 : -1,
        },
      ];
    },
  },
  // day4 6.3 留守 A2 承认没被选：anxious 同伴 +5 / 其他 +4
  a_admit_not_chosen: {
    perEffect: (i, target, ctx) => {
      if (i !== 0 || !target) return null;
      const att = attachmentOf(target);
      return [
        {
          npcId: target,
          direction: "from_npc",
          delta: att === "anxious" ? 5 : 4,
        },
      ];
    },
  },
  // day5 7.3 A1 问{听者}：avoidant -4（被抓包）/ 其他 +2（坦白）
  a_confront_listener: {
    perEffect: (i, target, ctx) => {
      if (i !== 0 || !target) return null;
      const att = attachmentOf(target);
      return [
        {
          npcId: target,
          direction: "from_npc",
          delta: att === "avoidant" ? -4 : 2,
        },
      ];
    },
  },
  // day5 7.3 A2 问{焦点NPC}：avoidant -1 / 其他 +1
  a_ask_focus_npc: {
    perEffect: (i, target, ctx) => {
      if (i !== 0 || !target) return null;
      const att = attachmentOf(target);
      return [
        {
          npcId: target,
          direction: "from_npc",
          delta: att === "avoidant" ? -1 : 1,
        },
      ];
    },
  },
  // day5 7.3 D 摊开：{听者} -6（from_npc 颜面）+ 知情旁观者 +2（exchange_pair 另一方，T4 注记 6）
  d_expose_openly: {
    perEffect: (i, target, ctx) => {
      if (i !== 0 || !target) return null;
      return [{ npcId: target, direction: "from_npc", delta: -6 }];
    },
    extra: (ctx) => {
      const pair = factList(ctx, "day5_exchange_pair");
      const listener = factNpc(ctx, "day5_leaked_listener");
      const other = pair.find((id) => id !== listener);
      return other ? [{ npcId: other, direction: "from_npc", delta: 2 }] : [];
    },
  },
  // day6 8.2 C 弃权：负向 Δ 由 d6_recompute_votes 按 §13 弃权行结算（本处抑制）
  c_abstain: {
    perEffect: () => [],
  },
  // day6 8.3 A 安抚被拒者：补偿按 §13 端点减半（anxious -8~-10→+4~+5 / avoidant -5→+2 / secure -3→+2）
  a_comfort_rejected: {
    extra: (ctx) => {
      const target = factList(ctx, "day6_rejected_by")[0] ?? null;
      if (!target) return [];
      const att = attachmentOf(target);
      const delta = att === "anxious" ? randInt(4, 5, ctx) : 2;
      return [{ npcId: target, direction: "from_npc", delta }];
    },
  },
  // day3 5.1 B 反问提问者：anxious +4 / secure +2 / avoidant -2（T3 注记 9）
  b_counter: {
    perEffect: (i, target, ctx) => {
      if (i !== 0 || !target) return null;
      const att = attachmentOf(target);
      const delta = att === "anxious" ? 4 : att === "avoidant" ? -2 : 2;
      return [{ npcId: target, direction: "from_npc", delta }];
    },
  },
  // day7 9.3 A2 体面结束：对方（场景对象） -2（落空感，from_npc）
  a_end_gracefully: {
    perEffect: (i, _target, ctx, opts) => {
      if (i !== 0) return null;
      const scene = confessionSceneTarget(ctx, opts);
      return scene ? [{ npcId: scene, direction: "from_npc", delta: -2 }] : [];
    },
  },
};

// ============================================================
// {target} 选项级解析覆盖（T4 注记 8 / day4 注记 2、8 / day5 注记 2）
// ============================================================

/** optionId → {target} 特殊解析（留守组 / 被拒者 / 被拒绝者等） */
const TARGET_OVERRIDES: Record<string, (ctx: EngineContext) => string | null> = {
  // day6 8.3 A / C：{target} = day6_rejected_by 第一个（不是第二好感）
  a_comfort_rejected: (ctx) => factList(ctx, "day6_rejected_by")[0] ?? null,
  c_walk_away: (ctx) => factList(ctx, "day6_rejected_by")[0] ?? null,
  // day4 6.2 no_invite B：{target} = 留守组内
  b_turn_target: (ctx) => stayGroupHighest(ctx),
  // day4 6.3 留守 A1：{target} = 另一个留守者
  a_talk_to_stayer: (ctx) => stayGroupHighest(ctx),
  // day4 6.3 约会 B：{target} = 留守组内（被惦记者）
  b_mention_left_behind: (ctx) => stayGroupHighest(ctx),
  // day5 7.1 A 变体 b：{target} = 留守期间最亲近 NPC
  a_to_closest_stayer: (ctx) => stayGroupHighest(ctx),
  // day4 6.2 D 槽：{target} = 被拒绝者（declined_by_player 第一个）
  d_call_back_rejected: (ctx) => factList(ctx, "day4_declined_by_player")[0] ?? null,
};

/**
 * 选项的 {target} 解析：选项级覆盖 > 选择器已选 > 第二好感（§2.5 默认）。
 */
export function resolveOptionTarget(
  option: EventOption,
  ctx: EngineContext,
  selectedNpcId: string | null,
): string | null {
  const over = TARGET_OVERRIDES[option.id];
  if (over) return over(ctx);
  return selectedNpcId ?? secondNpc(ctx);
}

/**
 * 选项的候选 NPC 集合约束（T4 day7 注记 4 第一选项实现）：
 * b_speak_to_rejected → day6_rejected_by ∪ day4_declined_by_player（去重，玩家侧在前）；
 * 其余选项返回 null = 全员可选。EventFlow 选择器弹窗据此过滤候选，
 * 使 b_speak_to_rejected 的效果目标必然落在被拒集合内。
 */
export function selectorCandidates(option: EventOption, ctx: EngineContext): string[] | null {
  if (option.id !== "b_speak_to_rejected") return null;
  return declinedUnion(ctx);
}

// ============================================================
// custom 条件（12 个 CustomCondId，§五）
// ============================================================

/** D7 告白触发判定（§9.3）：①9.2 选了告白 ②∃Y：Y→玩家≥85 ∧ 玩家→Y≥60 */
export function confessionTriggered(ctx: EngineContext): boolean {
  const solo = factNpc(ctx, "day7_solo_target");
  if (solo && ctx.eventLog.some((e) => e.optionId === "a_confess_target")) {
    return true;
  }
  return confessionPartner(ctx) !== null;
}

/** 场景对象：玩家主动告白 → day7_solo_target；被告白 → Y（§9.3 注记 7） */
function confessionSceneTarget(ctx: EngineContext, _opts?: EvalOptions): string | null {
  const solo = factNpc(ctx, "day7_solo_target");
  if (solo && ctx.eventLog.some((e) => e.optionId === "a_confess_target")) {
    return solo;
  }
  return confessionPartner(ctx);
}

/** 向玩家告白的 Y（nx≥85 ∧ px≥60，并列按 npcIds 顺序） */
export function confessionPartner(ctx: EngineContext): string | null {
  for (const id of ctx.npcIds) {
    if (nx(ctx, id) >= 85 && px(ctx, id) >= 60) return id;
  }
  return null;
}

/** 告白成功判定（§9.3）：①双向达 L4 ②被告白 → px≥60 */
function confessionPossible(ctx: EngineContext): boolean {
  const solo = factNpc(ctx, "day7_solo_target");
  if (solo && ctx.eventLog.some((e) => e.optionId === "a_confess_target")) {
    if (!ctx.relationships[solo]) return false;
    const l4 = attachmentL4(attachmentOf(solo));
    return px(ctx, solo) >= l4 && nx(ctx, solo) >= l4;
  }
  const y = confessionPartner(ctx);
  return y !== null && px(ctx, y) >= 60;
}

/** D3 问题层级（d3_generate_question_level 写入） */
function questionLevel(ctx: EngineContext): string | null {
  return fact(ctx, "day3_question_level");
}

/** 求值 custom 条件 */
export function evalCustomCondition(
  id: CustomCondId,
  ctx: EngineContext,
  opts?: EvalOptions,
): boolean {
  switch (id) {
    case "d1_three_silent":
      return silentCount(ctx) >= 3;
    case "d2_someone_about_to_be_unpicked":
      return hasSomeoneAboutToBeUnpicked(ctx);
    case "d2_pick_round_early":
      return pickRoundOfPlayer(ctx) <= 2;
    case "d3_question_at_most_l2":
      return questionLevel(ctx) !== null && questionLevel(ctx) !== "L3";
    case "d3_question_is_l3":
      return questionLevel(ctx) === "L3";
    case "d3_two_silent":
      return silentCount(ctx) >= 2;
    case "d6_has_zero_vote":
      return factList(ctx, "day6_zero_vote").length > 0;
    case "d6_has_rejected":
      return factList(ctx, "day6_rejected_by").length > 0;
    case "d7_has_declined":
      return declinedUnion(ctx).length > 0;
    case "d7_confession_triggered":
      return confessionTriggered(ctx);
    case "d7_confession_possible":
      return confessionTriggered(ctx) && confessionPossible(ctx);
    case "d7_confession_not_possible":
      return confessionTriggered(ctx) && !confessionPossible(ctx);
  }
}

// ============================================================
// evaluateRequire（§2.1 硬规则 3 + §六 lockLabel 生成）
// ============================================================

export interface RequireEval {
  pass: boolean;
  /** 未通过时建议的 lockLabel（动态阈值已替换数字） */
  lockLabel?: string;
}

const RESOURCE_LOCK_LABELS: Record<ResourceKey, string> = {
  exemption: "豁免权已使用",
  trust_points: "信任额度已用完",
  declaration: "表态权已使用",
  solo_chance: "单独机会已使用",
};

/** 生成 affinity 条件的 lockLabel（min 已按动态阈值替换） */
function affinityLabel(min: number): string {
  return `好感≥${min}解锁`;
}

/**
 * 求值一条条件。
 * 动态阈值（a_private_story / a_confront_listener / a_confess_highest /
 * d_pick_zero_vote / a_confess_target）经 opts.affinityMinOverride 注入。
 */
export function evaluateRequire(
  cond: OptionRequire,
  ctx: EngineContext,
  opts?: EvalOptions,
): RequireEval {
  switch (cond.kind) {
    case "affinity": {
      const npcId = resolveNpcRef(cond.npc, ctx, opts);
      const min = opts?.affinityMinOverride ?? cond.min;
      const value = npcId ? px(ctx, npcId) : -1;
      const pass = npcId !== null && value >= min;
      return pass ? { pass: true } : { pass: false, lockLabel: affinityLabel(min) };
    }
    case "relationship_metric": {
      const npcId = resolveNpcRef(cond.npc, ctx, opts);
      const context = npcId ? eventChoiceContext(ctx, npcId) : null;
      if (!context) return { pass: false, lockLabel: "关系状态尚未建立" };
      const value = readRelationshipMetric(context, cond.metric);
      const pass =
        (cond.min === undefined || value >= cond.min) &&
        (cond.max === undefined || value <= cond.max);
      if (pass) return { pass: true };
      const bounds = [
        cond.min === undefined ? null : `≥${cond.min}`,
        cond.max === undefined ? null : `≤${cond.max}`,
      ]
        .filter((part): part is string => part !== null)
        .join(" ");
      return { pass: false, lockLabel: `关系条件 ${bounds} 未满足` };
    }
    case "memory_tag": {
      const npcId = resolveNpcRef(cond.npc, ctx, opts);
      const context = npcId ? eventChoiceContext(ctx, npcId) : null;
      const pass = context !== null && hasMemoryTag(context, cond.tag);
      return pass ? { pass: true } : { pass: false, lockLabel: "尚未共同经历相关事件" };
    }
    case "attachment_is": {
      const npcId = resolveNpcRef(cond.npc, ctx, opts);
      const pass = npcId !== null && attachmentOf(npcId) === cond.attachment;
      return { pass };
    }
    case "resource": {
      const pass = (ctx.resources[cond.resource] ?? 0) >= cond.min;
      return pass
        ? { pass: true }
        : {
            pass: false,
            lockLabel: RESOURCE_LOCK_LABELS[cond.resource] ?? "资源不足",
          };
    }
    case "fact": {
      const pass =
        hasFact(ctx.worldFacts, cond.key) &&
        (cond.value === undefined || readFact(ctx.worldFacts, cond.key) === cond.value);
      return { pass };
    }
    case "not_fact": {
      return { pass: !hasFact(ctx.worldFacts, cond.key) };
    }
    case "all_of": {
      for (const sub of cond.of) {
        const r = evaluateRequire(sub, ctx, opts);
        if (!r.pass) return r;
      }
      return { pass: true };
    }
    case "any_of": {
      for (const sub of cond.of) {
        if (evaluateRequire(sub, ctx, opts).pass) return { pass: true };
      }
      return { pass: false };
    }
    case "custom": {
      return { pass: evalCustomCondition(cond.id, ctx, opts) };
    }
  }
}

// ============================================================
// 隐藏 vs 灰显（T4 注记 1 / day5 注记 1 / day6 注记 4）
// ============================================================

/** 变体选择型 custom：失败 → 该变体隐藏（不参与候选） */
const HIDE_CUSTOMS = new Set<CustomCondId>([
  "d3_question_at_most_l2",
  "d3_question_is_l3",
  "d6_has_zero_vote",
]);

/** 变体选择型 fact 键：失败 → 隐藏（day4_went_date / day5_leaked） */
const HIDE_FACTS = new Set<string>(["day4_went_date", "day5_leaked"]);

/**
 * 判定条件失败是否导致「隐藏」（而非灰显）。
 * 递归检查 all_of/any_of 内的子条件。
 */
function isHideFailure(cond: OptionRequire, ctx: EngineContext, opts?: EvalOptions): boolean {
  const r = evaluateRequire(cond, ctx, opts);
  if (r.pass) return false;
  switch (cond.kind) {
    case "fact":
      return HIDE_FACTS.has(cond.key);
    case "custom":
      return HIDE_CUSTOMS.has(cond.id);
    case "all_of":
      return cond.of.some((sub) => isHideFailure(sub, ctx, opts));
    case "any_of":
      return cond.of.some((sub) => isHideFailure(sub, ctx, opts));
    default:
      return false;
  }
}

// ============================================================
// buildOptions（分支择一 / 变体互斥 / fallback / C 槽 / D 槽门禁）
// ============================================================

export interface RenderedOption {
  /** 渲染用选项（fallback 替换后） */
  option: EventOption;
  /** 填充占位符后的文案 */
  text: string;
  /** 可点击（requires 满足） */
  enabled: boolean;
  /** 灰显提示（未启用时展示；动态阈值已同步） */
  lockLabel: string | null;
  /** 隐藏变体（调用方不渲染） */
  hidden: boolean;
  /** 选项主目标（结算 / {target} 用） */
  mainTargetId: string | null;
}

export interface BuildOptionsResult {
  /** 命中的分支 id（无分支 → null） */
  branchId: string | null;
  /** 可见选项（隐藏变体已剔除） */
  options: RenderedOption[];
  warnings: string[];
}

/**
 * 构建选项组：
 * - branches 按 when 择一；无分支用 event.options；全不命中 → 第一分支 + warning
 * - 同槽变体：变体选择型条件（fact day4_went_date/day5_leaked、custom
 *   question-level/zero-vote）失败 → 隐藏；其余条件失败 → 灰显 + lockLabel
 * - fallback：requires 不满足且带 fallback → 渲染 fallback（替代原选项）
 * - C 槽强制（张力 ≥high 必须有 C，缺了记 warning）
 * - D 槽门禁：仅 allowRiskSlot 事件渲染 D
 */
export function buildOptions(
  event: DecisionEventSpec,
  ctx: EngineContext,
  opts?: EvalOptions,
): BuildOptionsResult {
  const warnings: string[] = [];
  const focus = focusNpcId(ctx, event.focus);

  // ---- 分支择一 ----
  let branchId: string | null = null;
  let rawOptions: EventOption[] | undefined = event.options;
  if (event.branches && event.branches.length > 0) {
    const hit = event.branches.find(
      (b) => evaluateRequire(b.when, ctx, { focusNpcId: focus }).pass,
    );
    if (hit) {
      branchId = hit.id;
      rawOptions = hit.options;
    } else {
      const first = event.branches[0];
      branchId = first?.id ?? null;
      rawOptions = first?.options;
      warnings.push(`无分支命中（${event.id}），回退第一分支「${branchId ?? "?"}」`);
    }
  }
  if (!rawOptions) {
    return { branchId, options: [], warnings: [...warnings, "选项组为空"] };
  }

  // ---- D 槽门禁 ----
  const allowed = rawOptions.filter((o) => event.allowRiskSlot || o.slot !== "D");
  if (allowed.length !== rawOptions.length) {
    warnings.push(
      `D 槽门禁：${event.id} allowRiskSlot=false，已剔除 ${rawOptions.length - allowed.length} 个 D 槽选项`,
    );
  }

  // ---- 逐选项渲染 ----
  const rendered: RenderedOption[] = [];
  for (const option of allowed) {
    const evalOpts: EvalOptions = {
      focusNpcId: focus,
      selectedNpcId: opts?.selectedNpcId ?? null,
      resolvedTarget: resolveOptionTarget(option, ctx, opts?.selectedNpcId ?? null),
    };
    const dynamicMin = dynamicAffinityMin(option.id, ctx, evalOpts);
    if (dynamicMin !== null) evalOpts.affinityMinOverride = dynamicMin;

    const req = option.requires ? evaluateRequire(option.requires, ctx, evalOpts) : { pass: true };
    const hidden = !req.pass && isHideFailure(option.requires as OptionRequire, ctx, evalOpts);

    // fallback 替换：requires 不满足且非隐藏且带 fallback
    if (!req.pass && !hidden && option.fallback) {
      const fb = option.fallback;
      const fbOpts: EvalOptions = {
        focusNpcId: focus,
        selectedNpcId: opts?.selectedNpcId ?? null,
        resolvedTarget: resolveOptionTarget(fb, ctx, opts?.selectedNpcId ?? null),
      };
      const fbReq = fb.requires ? evaluateRequire(fb.requires, ctx, fbOpts) : { pass: true };
      rendered.push({
        option: fb,
        text: fillText(fb.text, ctx, fbOpts),
        enabled: fbReq.pass,
        lockLabel: fbReq.pass ? null : (fb.lockLabel ?? fbReq.lockLabel ?? null),
        hidden: false,
        mainTargetId: resolveMainTarget(event, fb, null, ctx),
      });
      continue;
    }

    const mainTarget = resolveMainTarget(event, option, opts?.selectedNpcId ?? null, ctx);
    // lockLabel：显式 > 动态阈值同步 > 失败原因生成
    let lockLabel: string | null = null;
    if (!req.pass) {
      if (option.lockLabel) {
        lockLabel = dynamicMin !== null && req.lockLabel ? req.lockLabel : option.lockLabel;
      } else {
        lockLabel = req.lockLabel ?? null;
      }
    }

    rendered.push({
      option,
      text: fillText(option.text, ctx, evalOpts),
      enabled: req.pass,
      lockLabel,
      hidden,
      mainTargetId: mainTarget,
    });
  }

  // ---- C 槽强制（§2.2：张力 ≥high 必出现） ----
  const visible = rendered.filter((r) => !r.hidden);
  if (
    (event.tension === "high" || event.tension === "very-high") &&
    !visible.some((r) => r.option.slot === "C")
  ) {
    warnings.push(`C 槽缺失（${event.id} tension=${event.tension}）`);
  }

  return { branchId, options: visible, warnings };
}

/**
 * 选项主目标：选择器已选 > 首个解析为单个 NPC 的效果目标 > {target} 默认。
 */
function resolveMainTarget(
  event: DecisionEventSpec,
  option: EventOption,
  selectedNpcId: string | null,
  ctx: EngineContext,
): string | null {
  if (selectedNpcId) return selectedNpcId;
  const focus = focusNpcId(ctx, event.focus);
  const first = option.effects?.[0];
  if (first) {
    const targets = resolveEffectTarget(first.npc, ctx, {
      focusNpcId: focus,
      selectedNpcId: null,
      resolvedTarget: resolveOptionTarget(option, ctx, null),
      note: first.note,
      mainTargetId: null,
    });
    if (targets.length === 1) return targets[0] ?? null;
  }
  return resolveOptionTarget(option, ctx, null);
}

// ============================================================
// resolveOption（结算：settle 主目标 + 数据原值 + 依恋修正表）
// ============================================================

export interface ResolvedOption {
  deltas: EngineDelta[];
  factsWrites: WorldFactWrite[];
  resourceCosts: { resource: ResourceKey; amount: number }[];
  reply: string | null;
  mainTargetId: string | null;
}

/** 主目标 settle 请求构造（照抄根 src/ 的 canonical 用法；不传 textContract） */
function settleForMain(
  npcId: string,
  option: EventOption,
  optionText: string,
  ctx: EngineContext,
): number {
  const npc = getNpcById(npcId);
  const currentHeart = px(ctx, npcId);
  const result = settle({
    actorOutput: buildActorOutput(npcId, optionText, option.intent),
    targetNpcId: npcId,
    currentHeart,
    scene: "public",
    relationshipStage: getStageFromValue(currentHeart),
    personalityVector: npc
      ? buildPersonalityVector(npc)
      : buildPersonalityVector(getNpcById("guyan") as NonNullable<ReturnType<typeof getNpcById>>),
  });
  return result.delta;
}

/**
 * 结算一个选项：
 * - 主目标（首个单目标效果）Δ 用 settle()；次要目标用数据 Δ + 依恋修正表
 * - facts value 占位符/特殊值解析（{队长}/{选中者}/{culprit}/{邀请者A} 等）
 * - day1_seat_neighbor="" 覆写为实际邻座（T3 注记 2）
 * - selector storeAs 合并写入（选择器已选结果）
 */
export function resolveOption(
  event: DecisionEventSpec,
  option: EventOption,
  targetNpcId: string | null,
  ctx: EngineContext,
): ResolvedOption {
  // "none"（allowNone 放弃选择）不参与目标解析，但 storeAs 仍写入 "none"
  const picked = targetNpcId && targetNpcId !== "none" ? targetNpcId : null;
  const focus = focusNpcId(ctx, event.focus);
  const resolvedTarget = resolveOptionTarget(option, ctx, picked);
  const evalOpts: EvalOptions = {
    focusNpcId: focus,
    selectedNpcId: picked,
    resolvedTarget,
  };
  const mainTargetId = picked ?? resolveMainTarget(event, option, picked, ctx);
  const override = DELTA_OVERRIDES[option.id];

  // 选择器已选 → 效果目标可引用 storeAs key（如 cap_b_surprise 的
  // fact day2_player_picked；不污染 ctx，仅结算时临时可见）
  let effectCtx = ctx;
  if (option.selector?.storeAs && targetNpcId) {
    effectCtx = {
      ...ctx,
      worldFacts: writeFacts(
        ctx.worldFacts,
        [{ key: option.selector.storeAs, value: targetNpcId }],
        ctx.day,
        `selector:${option.id}`,
      ),
    };
  }

  const deltas: EngineDelta[] = [];
  const effects = option.effects ?? [];
  for (let i = 0; i < effects.length; i++) {
    const eff = effects[i];
    if (!eff) continue;
    const targets = resolveEffectTarget(eff.npc, effectCtx, {
      ...evalOpts,
      note: eff.note,
      mainTargetId,
    });

    // 依恋修正表优先
    const overridden = override?.perEffect
      ? override.perEffect(i, targets[0] ?? null, ctx, evalOpts)
      : null;
    if (overridden) {
      for (const d of overridden) pushDelta(deltas, d);
      continue;
    }

    const isMain =
      i === 0 &&
      targets.length === 1 &&
      targets[0] !== null &&
      targets[0] === mainTargetId &&
      mainTargetId !== null;
    for (const t of targets) {
      if (isMain) {
        pushDelta(deltas, {
          npcId: t,
          direction: "to_npc",
          delta: settleForMain(t, option, option.text, ctx),
        });
      } else {
        pushDelta(deltas, {
          npcId: t,
          direction: "to_npc",
          delta: eff.delta,
        });
      }
    }
  }

  // 依恋修正表追加 Δ
  if (override?.extra) {
    for (const d of override.extra(ctx, evalOpts)) pushDelta(deltas, d);
  }

  // ---- facts：占位符解析 + day1_seat_neighbor 覆写 + selector storeAs ----
  const factsWrites: WorldFactWrite[] = [];
  // 覆写用的 side 优先取本选项自身 facts（a_left/b_right 在同一结算内写
  // day1_seat_side，此时 ctx 尚不可见），再回退 ctx 已有值
  const side =
    option.facts?.find((f) => f.key === "day1_seat_side")?.value ?? fact(ctx, "day1_seat_side");
  for (const w of option.facts ?? []) {
    let value = resolveFactValue(w.value, ctx, evalOpts);
    if (w.key === "day1_seat_neighbor" && value === "") {
      value =
        side === "left"
          ? (factNpc(ctx, "day1_seat_left") ?? "")
          : side === "right"
            ? (factNpc(ctx, "day1_seat_right") ?? "")
            : "";
    }
    if (w.confirmed === false) {
      factsWrites.push({ key: w.key, value, confirmed: false });
    } else {
      factsWrites.push({ key: w.key, value });
    }
  }
  if (option.selector?.storeAs && targetNpcId) {
    factsWrites.push({ key: option.selector.storeAs, value: targetNpcId });
  }

  return {
    deltas,
    factsWrites,
    resourceCosts: option.consumes ?? [],
    reply: option.reply ? fillText(option.reply, ctx, evalOpts) : null,
    mainTargetId,
  };
}

function pushDelta(list: EngineDelta[], d: EngineDelta): void {
  if (d.delta === 0) return;
  const existing = list.find((x) => x.npcId === d.npcId && x.direction === d.direction);
  if (existing) {
    existing.delta += d.delta;
  } else {
    list.push({ ...d });
  }
}

// ============================================================
// 引擎钩子（12 个 EngineHookId，§三）
// ============================================================

/** 幂等守卫：输出 fact 已存在 → 跳过 */
function idempotent(ctx: EngineContext, outputKeys: string[]): boolean {
  return outputKeys.some((k) => hasFact(ctx.worldFacts, k));
}

/**
 * 运行引擎钩子。
 * 每个钩子先检查自己的输出 fact 是否已存在（幂等，防刷新/重渲染重复随机）。
 */
export function runEngineHook(hookId: EngineHookId, ctx: EngineContext): EngineResult {
  switch (hookId) {
    case "d1_seed_seats":
      return hookD1SeedSeats(ctx);
    case "d1_roll_approacher":
      return hookD1RollApproacher(ctx);
    case "d2_determine_captains":
      return hookD2DetermineCaptains(ctx);
    case "d2_resolve_groups":
      return hookD2ResolveGroups(ctx);
    case "d2_resolve_last_picked":
      return hookD2ResolveLastPicked(ctx);
    case "d3_generate_question_level":
      return hookD3GenerateQuestionLevel(ctx);
    case "d4_generate_invites":
      return hookD4GenerateInvites(ctx);
    case "d5_resolve_exchange":
      return hookD5ResolveExchange(ctx);
    case "d6_generate_order":
      return hookD6GenerateOrder(ctx);
    case "d6_generate_early_declares":
      return hookD6GenerateEarlyDeclares(ctx);
    case "d6_recompute_votes":
      return hookD6RecomputeVotes(ctx);
    case "d7_resolve_confession":
      return hookD7ResolveConfession(ctx);
  }
}

/** d1_seed_seats：固定种子生成左右邻座 + 打破沉默者 + 沉默 NPC */
function hookD1SeedSeats(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day1_seat_left"])) return { factWrites: [], deltas: [] };
  if (ctx.npcIds.length < 2) {
    return { factWrites: [], deltas: [] };
  }
  const a = pickOne(ctx.npcIds, ctx);
  const b = pickOne(
    ctx.npcIds.filter((id) => id !== a),
    ctx,
  );
  if (!a || !b) return { factWrites: [], deltas: [] };

  const firstSpeaker = pickOne(ctx.npcIds, ctx) ?? a;
  // 沉默 NPC = 非 firstSpeaker 中 px 最高者
  const silentPool = ctx.npcIds.filter((id) => id !== firstSpeaker);
  let silentNpc: string | null = null;
  let best = -Infinity;
  for (const id of silentPool) {
    const v = px(ctx, id);
    if (v > best) {
      best = v;
      silentNpc = id;
    }
  }

  return {
    factWrites: [
      { key: "day1_seat_left", value: a },
      { key: "day1_seat_right", value: b },
      { key: "day1_first_speaker", value: firstSpeaker },
      ...(silentNpc ? [{ key: "day1_silent_npc", value: silentNpc }] : []),
    ],
    deltas: [],
  };
}

/** d1_roll_approacher：仅 3.1 选 C（day1_seat_side="stand"）时写入 */
function hookD1RollApproacher(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day1_approacher"])) return { factWrites: [], deltas: [] };
  if (fact(ctx, "day1_seat_side") !== "stand") return { factWrites: [], deltas: [] };
  const approacher = pickOne(ctx.npcIds, ctx);
  return approacher
    ? { factWrites: [{ key: "day1_approacher", value: approacher }], deltas: [] }
    : { factWrites: [], deltas: [] };
}

/** d2_determine_captains：队长判定 + 选人轮次模拟 */
function hookD2DetermineCaptains(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day2_player_is_captain"])) {
    return { factWrites: [], deltas: [] };
  }
  if (ctx.npcIds.length < 2) {
    return {
      factWrites: [{ key: "day2_player_is_captain", value: "false" }],
      deltas: [],
    };
  }
  const sim = simulateDay2Picks(ctx);

  // 构造 7 轮选人序列（目标 = 未被选 NPC 中 nx 最高者；玩家位置留 "player"/"none"）
  const seq = ["c1", "c2", "c3", "c1", "c2", "c3", "c1"] as const;
  const pickEntries: PickEntry[] = [];
  const pickedNpcs = new Set<string>();
  // 玩家自己的选人目标：队长情况下占位（后续由 day2_player_picked 事实补齐）
  const playerCaptainIdx = sim.playerIsCaptain ? sim.captains.indexOf("player") : -1;
  for (let i = 0; i < 7; i++) {
    const key = seq[i];
    const pickerIdx = key === "c1" ? 0 : key === "c2" ? 1 : 2;
    const picker = sim.captains[pickerIdx] ?? null;
    if (!picker) continue;
    let target: string = "none";
    if (picker === "player") {
      target = "player"; // 玩家自己的选人位置（选项结算时写入实际目标）
    } else if (i + 1 === sim.playerPos && !sim.playerIsCaptain) {
      target = "player"; // 非队长：玩家在这个位置被选
    } else {
      // 队长选人：未被选且非队长 NPC 中 nx 最高（并列 npcId 字典序）
      const unpickable = new Set(sim.captains);
      const candidates = ctx.npcIds
        .filter((id) => !unpickable.has(id) && !pickedNpcs.has(id))
        .sort((x, y) => {
          const d = nx(ctx, y) - nx(ctx, x);
          if (d !== 0) return d;
          return x < y ? -1 : x > y ? 1 : 0;
        });
      const t = candidates[0] ?? null;
      if (t) {
        target = t;
        pickedNpcs.add(t);
      }
    }
    pickEntries.push({ pickIdx: i + 1, picker, target });
  }

  const facts: WorldFactWrite[] = [
    {
      key: "day2_player_is_captain",
      value: sim.playerIsCaptain ? "true" : "false",
    },
    { key: "day2_captains", value: JSON.stringify(sim.captains) },
    { key: "day2_pick_order", value: JSON.stringify(pickEntries) },
    { key: "day2_player_pick_position", value: String(sim.playerPos) },
    ...(sim.playerPickCaptain
      ? [{ key: "day2_player_pick_captain", value: sim.playerPickCaptain }]
      : []),
  ];
  return { factWrites: facts, deltas: [] };
}

/** d2_resolve_groups：分组 + 某组必然翻车 + 责任人 */
function hookD2ResolveGroups(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day2_player_group_failed"])) {
    return { factWrites: [], deltas: [] };
  }
  const captains = parseCaptains(ctx);
  if (captains.length < 2) {
    return {
      factWrites: [{ key: "day2_player_group_failed", value: "false" }],
      deltas: [],
    };
  }
  const order = parsePickOrder(ctx);
  const playerIsCaptain = fact(ctx, "day2_player_is_captain") === "true";
  const playerPickedBy = factNpc(ctx, "day2_player_pick_captain");
  const playerPicked = factNpc(ctx, "day2_player_picked");

  // 组：{captain: [members]}（member 不含队长本人）
  const groups: Record<string, string[]> = {};
  for (const c of captains) groups[c] = [];
  let playerGroup: string | null = null;

  for (const entry of order) {
    const { picker, target } = entry;
    if (target === "none" || target === "player") continue;
    const g = groups[picker];
    if (g) g.push(target);
  }
  // 玩家归属
  if (playerIsCaptain) {
    playerGroup = "player";
    groups["player"] = groups["player"] ?? [];
    if (playerPicked && groups["player"]) groups["player"].push(playerPicked);
  } else if (playerPickedBy) {
    playerGroup = playerPickedBy;
    // 玩家归入其被指派组（cap 分支时 playerPickedBy 不存在 → 玩家未入组，保守不写）
  }
  // 队长本人也计入组员集合（供「组员」效果；玩家组员排除 player 自身）
  for (const c of captains) {
    if (c !== "player") groups[c] = [c, ...(groups[c] ?? [])];
  }

  // 某组必然翻车（固定随机种子）：从 3 个组中随机一组
  const groupIds = captains.filter((c) => c !== "player");
  if (groupIds.length === 0) {
    return {
      factWrites: [{ key: "day2_player_group_failed", value: "false" }],
      deltas: [],
    };
  }
  const failedGroup = pickOne(groupIds, ctx) ?? groupIds[0];
  if (!failedGroup) {
    return {
      factWrites: [{ key: "day2_player_group_failed", value: "false" }],
      deltas: [],
    };
  }
  const members = groups[failedGroup] ?? [];
  const npcMembers = members.filter((m) => m !== "player");
  const culprit = pickOne(npcMembers, ctx) ?? failedGroup;

  const facts: WorldFactWrite[] = [
    { key: "day2_groups", value: JSON.stringify(groups) },
    { key: "day2_failed_group", value: failedGroup },
    {
      key: "day2_player_group_failed",
      value: playerGroup === failedGroup ? "true" : "false",
    },
    { key: "day2_failed_culprit", value: culprit },
    ...(playerGroup ? [{ key: "day2_player_group", value: playerGroup }] : []),
  ];
  return { factWrites: facts, deltas: [] };
}

function parseCaptains(ctx: EngineContext): string[] {
  const raw = fact(ctx, "day2_captains");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

/** d2_resolve_last_picked：lastPicked + comforter（渲染前先行结算） */
function hookD2ResolveLastPicked(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day2_last_picked"])) return { factWrites: [], deltas: [] };
  const order = parsePickOrder(ctx);
  // 最后被选中的 NPC（跳过 player/none 占位）
  const pickedNpcs = order
    .map((o) => o.target)
    .filter((t) => t !== "player" && t !== "none" && t !== "");
  const lastPicked = pickedNpcs[pickedNpcs.length - 1] ?? null;
  if (!lastPicked) return { factWrites: [], deltas: [] };

  // comforter = 与 lastPicked 同组、px 最高者（非 lastPicked）；无 → 全岛 px 最高
  let comforter: string | null = null;
  let best = -Infinity;
  const groupsRaw = fact(ctx, "day2_groups");
  const sameGroup: string[] = [];
  if (groupsRaw) {
    try {
      const groups = JSON.parse(groupsRaw) as Record<string, string[]>;
      for (const members of Object.values(groups)) {
        if (members.includes(lastPicked)) {
          sameGroup.push(...members.filter((m) => m !== lastPicked));
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const pool = sameGroup.length > 0 ? sameGroup : ctx.npcIds.filter((id) => id !== lastPicked);
  for (const id of pool) {
    const v = px(ctx, id);
    if (v > best) {
      best = v;
      comforter = id;
    }
  }

  return {
    factWrites: [
      { key: "day2_last_picked", value: lastPicked },
      ...(comforter ? [{ key: "day2_comforter", value: comforter }] : []),
    ],
    deltas: [],
  };
}

/** d3_generate_question_level：L1~L3 + 提问者（引擎私有） */
function hookD3GenerateQuestionLevel(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day3_question_level"])) return { factWrites: [], deltas: [] };
  const level = `L${randInt(1, 3, ctx)}` as const;
  const questioner = pickOne(ctx.npcIds, ctx);
  return {
    factWrites: [
      { key: "day3_question_level", value: level },
      ...(questioner ? [{ key: "day3_questioner", value: questioner }] : []),
    ],
    deltas: [],
  };
}

/** d4_generate_invites：§6.1 名额生成（渲染前先行结算） */
function hookD4GenerateInvites(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day4_invite_count"])) return { factWrites: [], deltas: [] };
  if (ctx.npcIds.length < 2) return { factWrites: [], deltas: [] };

  const ATTACH_COEF: Record<AttachmentType, number> = {
    anxious: 1.15,
    secure: 1.0,
    avoidant: 0.7,
  };
  const ATTACH_ORDER: Record<AttachmentType, number> = {
    anxious: 0,
    secure: 1,
    avoidant: 2,
  };

  // 1. 生成全屋配对顺序；真正邀请玩家者另按 Relationship Engine 门槛筛选。
  const candidates = ctx.npcIds
    .filter((id) => nx(ctx, id) >= 50)
    .map((id) => ({
      id,
      score:
        nx(ctx, id) * (ATTACH_COEF[attachmentOf(id) ?? "secure"] ?? 1) * (0.9 + 0.2 * ctx.random()),
    }));
  const rest = ctx.npcIds.filter((id) => nx(ctx, id) < 50);
  const fillers = rest
    .sort((x, y) => nx(ctx, y) - nx(ctx, x))
    .map((id) => ({ id, score: nx(ctx, id) }));
  const pool = [...candidates.sort((a, b) => b.score - a.score), ...fillers];

  const inviters = pool.slice(0, 2).map((s) => s.id);
  const rankOf = (id: string): number => {
    const idx = pool.findIndex((s) => s.id === id);
    return idx === -1 ? 999 : idx;
  };

  // 2. 邀请玩家：旧上下文用双向阈值；新上下文使用派生 inviter，允许 0/1/2 位。
  const wantsPlayer = inviters.filter((id) => nx(ctx, id) >= 55 && px(ctx, id) >= 40);
  const contexts = ctx.outputContexts?.eventCast;
  const playerInviters = (
    contexts
      ? deriveRelationshipRoles(ctx.npcIds, contexts).inviters.map((role) => role.npcId)
      : wantsPlayer
  ).slice(0, 2);

  // 发出顺序：依恋类型（anxious 先 / secure 中 / avoidant 后）内按排序分降序
  const emitOrder = (ids: string[]): string[] =>
    [...ids].sort((x, y) => {
      const ax = ATTACH_ORDER[attachmentOf(x) ?? "secure"] ?? 1;
      const ay = ATTACH_ORDER[attachmentOf(y) ?? "secure"] ?? 1;
      if (ax !== ay) return ax - ay;
      return rankOf(y) - rankOf(x);
    });

  const count = playerInviters.length;
  const orderedPlayerInviters = emitOrder(playerInviters);
  const inviterA = orderedPlayerInviters[0] ?? null;
  const inviterB = orderedPlayerInviters[1] ?? null;

  // 配对：玩家邀请者 → "player"；其余 → 好感最高其他 NPC（px 降序）
  const playerInviteSet = new Set(playerInviters);
  const pairs: Array<[string, string]> = [];
  const emitters = [...new Set([...playerInviters, ...inviters])].slice(0, 2);
  for (const inviter of emitters) {
    if (playerInviteSet.has(inviter)) {
      pairs.push([inviter, "player"]);
    } else {
      const target =
        ctx.npcIds
          .filter((id) => id !== inviter && !pairs.some((p) => p[1] === id))
          .sort((x, y) => {
            const d = px(ctx, y) - px(ctx, x);
            if (d !== 0) return d;
            return x < y ? -1 : x > y ? 1 : 0;
          })[0] ?? null;
      if (target) pairs.push([inviter, target]);
    }
  }

  const facts: WorldFactWrite[] = [
    { key: "day4_invite_count", value: String(count) },
    { key: "day4_invited_by", value: orderedPlayerInviters.join(",") },
    { key: "day4_date_pairs", value: JSON.stringify(pairs) },
    ...(inviterA ? [{ key: "day4_inviter_a", value: inviterA }] : []),
    ...(inviterB ? [{ key: "day4_inviter_b", value: inviterB }] : []),
  ];
  return { factWrites: facts, deltas: [] };
}

/** d5_resolve_exchange：day5_exchange_pair + 转述判定（渲染前先行结算） */
function hookD5ResolveExchange(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day5_exchange_pair"])) return { factWrites: [], deltas: [] };
  const secretTarget = factNpc(ctx, "day5_secret_target");
  const usedPoints = parseInt(fact(ctx, "day5_used_points") ?? "0", 10);

  let leaked = false;
  let relayer: string | null = null;
  let listener: string | null = null;

  if (secretTarget && usedPoints >= 1) {
    const prob = usedPoints >= 2 ? 0.5 : 0.3;
    leaked = ctx.random() < prob;
    if (leaked) {
      // 转述者 = 与讲述目标关系最近的 NPC（proxy：非 T 中 nx 最高者，解释性裁定）
      let best: string | null = null;
      let bestValue = -Infinity;
      for (const id of ctx.npcIds) {
        if (id === secretTarget) continue;
        const v = nx(ctx, id);
        if (v > bestValue) {
          bestValue = v;
          best = id;
        }
      }
      relayer = best;
      const others = ctx.npcIds.filter((id) => id !== relayer && id !== secretTarget);
      listener = pickOne(others, ctx);
    }
  }

  const pairA = relayer ?? pickOne(ctx.npcIds, ctx);
  const pairB =
    listener ??
    pickOne(
      ctx.npcIds.filter((id) => id !== pairA),
      ctx,
    );

  const facts: WorldFactWrite[] = [
    { key: "day5_exchange_pair", value: [pairA, pairB].filter(Boolean).join(",") },
    { key: "day5_leaked", value: leaked ? "true" : "false" },
    ...(leaked && listener ? [{ key: "day5_leaked_listener", value: listener }] : []),
  ];
  return { factWrites: facts, deltas: [] };
}

/** d6_generate_order：表态顺序（nx 升序 + lastPicked 优先 + id 字典序） */
function hookD6GenerateOrder(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day6_order"])) return { factWrites: [], deltas: [] };
  const lastPicked = factNpc(ctx, "day2_last_picked");
  const ordered = [...ctx.npcIds].sort((x, y) => {
    const dx = nx(ctx, x) - nx(ctx, y);
    if (dx !== 0) return dx;
    const lx = x === lastPicked ? 0 : 1;
    const ly = y === lastPicked ? 0 : 1;
    if (lx !== ly) return lx - ly;
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return {
    factWrites: [{ key: "day6_order", value: ordered.join(",") }],
    deltas: [],
  };
}

/** d6_generate_early_declares：预生成表态目标 + 零票者 */
function hookD6GenerateEarlyDeclares(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day6_early_declares"])) return { factWrites: [], deltas: [] };
  const map: Record<string, string> = {};
  for (const x of ctx.npcIds) {
    if (nx(ctx, x) < 30) {
      map[x] = "none"; // NPC 对玩家好感 <30 → 弃权
    } else if (nx(ctx, x) >= 40 && ctx.random() < 0.6) {
      map[x] = "player"; // 60% 预选玩家
    } else {
      // 选各自最高好感对象（proxy：nx × 扰动，并列 npcId 字典序）
      const best = ctx.npcIds
        .filter((id) => id !== x)
        .sort((a, b) => {
          const da = nx(ctx, a) * (0.75 + 0.25 * ctx.random());
          const db = nx(ctx, b) * (0.75 + 0.25 * ctx.random());
          if (da !== db) return db - da;
          return a < b ? -1 : a > b ? 1 : 0;
        })[0];
      map[x] = best ?? "none";
    }
  }
  const chosen = new Set(Object.values(map).filter((v) => v !== "none" && v !== "player"));
  const zeroVote = ctx.npcIds.filter((id) => !chosen.has(id));
  return {
    factWrites: [
      { key: "day6_early_declares", value: JSON.stringify(map) },
      { key: "day6_zero_vote", value: zeroVote.join(",") },
    ],
    deltas: [],
  };
}

/** d6_recompute_votes：表态后重算（互选 / 被拒 / 零票 / 弃权惩罚） */
function hookD6RecomputeVotes(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day6_mutual"])) return { factWrites: [], deltas: [] };
  const raw = fact(ctx, "day6_early_declares");
  if (!raw) return { factWrites: [], deltas: [] };
  let early: Record<string, string>;
  try {
    early = JSON.parse(raw) as Record<string, string>;
  } catch {
    return { factWrites: [], deltas: [] };
  }
  const playerDeclared = factNpc(ctx, "day6_player_declared");
  const abstained = playerDeclared === null;
  const order = factList(ctx, "day6_order");
  const late = order.slice(5); // 第 6~8 位

  const final: Record<string, string> = { ...early };
  const pickFallback = (x: string): string | null =>
    ctx.npcIds
      .filter((id) => id !== x)
      .sort((a, b) => {
        const d = nx(ctx, b) - nx(ctx, a);
        if (d !== 0) return d;
        return a < b ? -1 : a > b ? 1 : 0;
      })[0] ?? null;

  for (const x of late) {
    const target = final[x];
    if (target === "player") {
      if (playerDeclared !== x) {
        // 玩家表态他人/弃权 → 后段改选次高
        final[x] = pickFallback(x) ?? "none";
      }
    } else if (target === playerDeclared && target !== undefined) {
      // 预选玩家所选者 → 改选次高（避免竞争）
      final[x] = pickFallback(x) ?? "none";
    }
  }

  // 互选：玩家选 P ∧ P 预选玩家
  const mutual: string[] = [];
  if (playerDeclared && early[playerDeclared] === "player") {
    mutual.push(playerDeclared);
  }

  // 零票重算（玩家选零票者后其不再零票）
  const chosen = new Set(Object.values(final).filter((v) => v !== "none" && v !== "player"));
  const zeroVote = ctx.npcIds.filter((id) => id !== playerDeclared && !chosen.has(id));

  // 玩家侧被拒 = 预选玩家但玩家未选（弃权 = 全部预选玩家者）
  const preSelectPlayer = ctx.npcIds.filter((id) => early[id] === "player");
  const playerRejected = preSelectPlayer.filter(
    (id) => !(playerDeclared === id && early[id] === "player"),
  );

  // NPC 间被拒：X 选 Y（NPC），Y 未回选 X
  const npcRejected: string[] = [];
  for (const [x, y] of Object.entries(final)) {
    if (y === "none" || y === "player") continue;
    if (y === x) continue;
    if (final[y] !== x) npcRejected.push(x);
  }
  const combined = [...playerRejected, ...npcRejected.filter((id) => !playerRejected.includes(id))];

  // 弃权/被拒 Δ（from_npc，§13；弃权上浮）
  const deltas: EngineDelta[] = [];
  if (abstained) {
    for (const id of preSelectPlayer) {
      deltas.push({
        npcId: id,
        direction: "from_npc",
        delta: ABSTAIN_DELTA(attachmentOf(id), ctx),
      });
    }
  } else {
    for (const id of playerRejected) {
      deltas.push({
        npcId: id,
        direction: "from_npc",
        delta: REJECT_DELTA(attachmentOf(id), ctx),
      });
    }
  }

  const facts: WorldFactWrite[] = [
    { key: "day6_early_declares", value: JSON.stringify(final) },
    { key: "day6_zero_vote", value: zeroVote.join(",") },
    {
      key: "day6_mutual",
      value: mutual.length > 0 ? mutual.join("=true,") + "=true" : "none",
    },
    // 契约：名单为空则不写该 key（8.3 no_rejected 分支用 not_fact 判定）
    ...(combined.length > 0 ? [{ key: "day6_rejected_by", value: combined.join(",") }] : []),
    ...(npcRejected.length > 0 ? [{ key: "day6_npc_rejected", value: npcRejected.join(",") }] : []),
  ];
  return { factWrites: facts, deltas };
}

/** d7_resolve_confession：告白成败（跳过时也要跑，结局锁定前置） */
function hookD7ResolveConfession(ctx: EngineContext): EngineResult {
  if (idempotent(ctx, ["day7_confession_success"])) {
    return { factWrites: [], deltas: [] };
  }
  const triggered = confessionTriggered(ctx);
  let result = "none";
  let successId: string | null = null;

  if (triggered) {
    const solo = factNpc(ctx, "day7_solo_target");
    const playerConfessed =
      solo !== null && ctx.eventLog.some((e) => e.optionId === "a_confess_target");
    if (playerConfessed) {
      const l4 = attachmentL4(attachmentOf(solo));
      const ok = px(ctx, solo) >= l4 && nx(ctx, solo) >= l4;
      result = ok ? "success" : "rejected";
      if (ok) successId = solo;
    } else {
      const y = confessionPartner(ctx);
      const ok = y !== null && px(ctx, y) >= 60;
      result = ok ? "success" : "rejected";
      if (ok && y) successId = y;
    }
  }

  const facts: WorldFactWrite[] = [
    // 选项 facts 已写 day7_confession_result 时保持选项决定（不覆盖）
    ...(hasFact(ctx.worldFacts, "day7_confession_result")
      ? []
      : [{ key: "day7_confession_result", value: result }]),
    {
      key: "day7_confession_success",
      // "npcId=true" 逗号列表格式（ending.ts listMarkTrue 兼容：裸 id 即 true）
      value: successId ? `${successId}=true` : "none",
    },
  ];
  return { factWrites: facts, deltas: [] };
}

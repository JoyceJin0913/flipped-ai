/**
 * useIslandStore —— 七日公共事件玩法的持久化状态
 *
 * 生命周期：initFromOnboarding()（幂等，从 onboarding 交接名单）
 * → applyResolvedOption()（turnRunner 结算结果落库）
 * → advanceEvent() / advanceDay()（D3/D5/D6/D7 进天发资源，§11）
 * → resolveEnding()（D7 篝火熄灭时锁定结局，§9.3）→ resetRun()（重开一局）。
 *
 * persist：key "flipped-ai-island"，version 2（浏览器端 localStorage 自动恢复）。
 *
 * 依赖面刻意保持最小：zustand、core/{worldTypes,worldFacts,ending}、
 * data/events/types（只用 ResourceKey / DAY_RESOURCE_GRANTS）、useOnboardingStore。
 * 不引入 turnRunner / settle / 事件数据依赖（T5 接入）。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { WorldFacts } from "../core/worldTypes";
import { createEmptyFacts, writeFacts, type WorldFactWrite } from "../core/worldFacts";
import { resolveEndingDetail, type EndingId } from "../core/ending";
import {
  parseInteractionSignal,
  type InteractionSignal,
  type InteractionStrength,
  type InteractionValence,
} from "../core/interactionSignal";
import {
  applySignalToNpcState,
  createNpcStateCard,
  projectRelationships,
  type NpcStateCard,
} from "../core/npcState";
import { DAY_RESOURCE_GRANTS, type ResourceKey } from "../data/events/types";
import { useGameStore } from "./useOnboardingStore";

// ============================================================
// 类型
// ============================================================

/** 玩法阶段：day_loop 七日循环 / finale 结局已锁定 */
export type IslandPhase = "day_loop" | "finale";

/** 单个 NPC 的双向好感 */
export interface IslandRelationship {
  /** 玩家→NPC（px） */
  toNpc: number;
  /** NPC→玩家（nx） */
  fromNpc: number;
}

/** 好感变化（direction 相对玩家视角） */
export interface IslandDelta {
  npcId: string;
  direction: "to_npc" | "from_npc";
  delta: number;
}

/** 回放用单条事件记录 */
export interface IslandEventLogEntry {
  /** 自增序号（seq） */
  seq: number;
  day: number;
  eventId: string;
  kind: "decision" | "open";
  optionId: string | null;
  optionText: string | null;
  targetNpcId: string | null;
  risk: string | null;
  deltas: IslandDelta[] | null;
  facts: WorldFactWrite[] | null;
}

/** applyResolvedOption 的输入（由 turnRunner 计算后传入） */
export interface ResolvedOptionResult {
  day: number;
  eventId: string;
  kind: "decision" | "open";
  optionId: string;
  optionText: string;
  risk: string | null;
  targetNpcId: string | null;
  deltas: IslandDelta[] | null;
  factsWrites: WorldFactWrite[];
  resourceCosts: { resource: ResourceKey; amount: number }[];
}

export type ApplySignalResult =
  | { status: "applied"; signalId: string }
  | { status: "duplicate"; signalId: string }
  | { status: "invalid"; signalId: string | null; error: string };

export interface IslandState {
  phase: IslandPhase;
  /** 当前天数 1-7 */
  day: number;
  /** 当天第几个事件 0-2 */
  eventIndex: number;
  /** 岛上 NPC 名单（onboarding islandNpcs 5 + competitors 4） */
  npcIds: string[];
  /** v2 权威关系数据；relationships 仅为旧消费端的同步投影。 */
  npcStateCards: Record<string, NpcStateCard>;
  relationships: Record<string, IslandRelationship>;
  /** 七日局内的轻量幂等集合。 */
  appliedSignalIds: string[];
  worldFacts: WorldFacts;
  resources: Record<ResourceKey, number>;
  eventLog: IslandEventLogEntry[];
  ending: EndingId | null;
  /** eventLog 自增序号 */
  seq: number;

  /** 幂等初始化：从 onboarding 取名单；名单变化（重开换人）→ 整局重建 */
  initFromOnboarding: () => void;
  /** 把 turnRunner 结算结果应用到状态（好感/事实/资源/回放） */
  applyResolvedOption: (result: ResolvedOptionResult) => void;
  applyInteractionSignal: (signal: unknown) => ApplySignalResult;
  applyInteractionSignals: (signals: unknown[]) => ApplySignalResult[];
  /** 推进到当天下一个事件（钳位 ≤2） */
  advanceEvent: () => void;
  /** 进下一天：发资源；day=7 时不动（UI 负责切 finale） */
  advanceDay: () => void;
  /** 篝火熄灭：按 core/ending 锁定结局，切 finale */
  resolveEnding: () => void;
  /** 重开一局（保留 npcIds，重建 30/30 与全部初始状态） */
  resetRun: () => void;
  /** 玩家好感最高的 NPC（toNpc 最大，并列取 npcIds 顺序靠前） */
  highestNpcId: () => string | null;
  /** 玩家好感第二的 NPC */
  secondNpcId: () => string | null;
  getHeart: (npcId: string) => { toNpc: number; fromNpc: number } | null;
}

// ============================================================
// 工具函数
// ============================================================

/** 好感钳位 0-100 */
function clampAffinity(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** 全员 30/30 初始关系表 */
function freshRelationships(npcIds: string[]): Record<string, IslandRelationship> {
  const out: Record<string, IslandRelationship> = {};
  for (const npcId of npcIds) {
    out[npcId] = { toNpc: 30, fromNpc: 30 };
  }
  return out;
}

function freshNpcStateCards(npcIds: string[]): Record<string, NpcStateCard> {
  return Object.fromEntries(npcIds.map((npcId) => [npcId, createNpcStateCard(npcId)]));
}

function signalIdOf(input: unknown): string | null {
  if (typeof input !== "object" || input === null || !("id" in input)) return null;
  const id = (input as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

interface SignalStateSlice {
  npcIds: string[];
  npcStateCards: Record<string, NpcStateCard>;
  appliedSignalIds: string[];
}

function reduceInteractionSignals(
  state: SignalStateSlice,
  inputs: readonly unknown[],
): {
  npcStateCards: Record<string, NpcStateCard>;
  relationships: Record<string, IslandRelationship>;
  appliedSignalIds: string[];
  results: ApplySignalResult[];
} {
  const parsedInputs = inputs.map((input) => ({
    input,
    parsed: parseInteractionSignal(input, state.npcIds),
  }));
  const batchError = parsedInputs.find(({ parsed }) => !parsed.success);
  if (batchError) {
    return {
      npcStateCards: state.npcStateCards,
      relationships: projectRelationships(state.npcStateCards),
      appliedSignalIds: state.appliedSignalIds,
      results: parsedInputs.map(({ input, parsed }) => ({
        status: "invalid" as const,
        signalId: signalIdOf(input),
        error: parsed.success ? "batch rejected because another signal is invalid" : parsed.error,
      })),
    };
  }

  const missingCard = parsedInputs.find(
    ({ parsed }) => parsed.success && state.npcStateCards[parsed.signal.targetNpcId] === undefined,
  );
  if (missingCard) {
    const missingNpcId = missingCard.parsed.success ? missingCard.parsed.signal.targetNpcId : "";
    return {
      npcStateCards: state.npcStateCards,
      relationships: projectRelationships(state.npcStateCards),
      appliedSignalIds: state.appliedSignalIds,
      results: parsedInputs.map(({ input }) => ({
        status: "invalid" as const,
        signalId: signalIdOf(input),
        error: `batch rejected because state card is missing: ${missingNpcId}`,
      })),
    };
  }

  let cards = state.npcStateCards;
  const appliedIds = new Set(state.appliedSignalIds);
  const results: ApplySignalResult[] = [];

  parsedInputs.forEach(({ parsed }, index) => {
    if (!parsed.success) return;
    const { signal } = parsed;
    if (appliedIds.has(signal.id)) {
      results.push({ status: "duplicate", signalId: signal.id });
      return;
    }
    const current = cards[signal.targetNpcId]!;
    cards = {
      ...cards,
      [signal.targetNpcId]: applySignalToNpcState(current, signal, Date.now() + index),
    };
    appliedIds.add(signal.id);
    results.push({ status: "applied", signalId: signal.id });
  });

  return {
    npcStateCards: cards,
    relationships: projectRelationships(cards),
    appliedSignalIds: [...appliedIds],
    results,
  };
}

function strengthForDeltas(values: readonly number[]): InteractionStrength {
  const magnitude = Math.max(0, ...values.map((value) => Math.abs(value)));
  if (magnitude === 0) return 0;
  if (magnitude <= 3) return 1;
  if (magnitude <= 8) return 2;
  return 3;
}

function valenceForDeltas(values: readonly number[]): InteractionValence {
  const hasPositive = values.some((value) => value > 0);
  const hasNegative = values.some((value) => value < 0);
  if (hasPositive && hasNegative) return "mixed";
  if (hasPositive) return "positive";
  if (hasNegative) return "negative";
  return "neutral";
}

/** 把旧事件 delta 按 NPC 合并，一次事件互动只计数一次。 */
function signalsFromResolvedOption(
  result: ResolvedOptionResult,
  npcIds: readonly string[],
): InteractionSignal[] {
  const grouped = new Map<string, { playerInterest: number; npcInterest: number }>();
  for (const delta of result.deltas ?? []) {
    if (!npcIds.includes(delta.npcId) || !Number.isFinite(delta.delta)) continue;
    const current = grouped.get(delta.npcId) ?? { playerInterest: 0, npcInterest: 0 };
    if (delta.direction === "to_npc") current.playerInterest += Math.round(delta.delta);
    else current.npcInterest += Math.round(delta.delta);
    grouped.set(delta.npcId, current);
  }

  return [...grouped.entries()].map(([targetNpcId, delta]) => {
    const values = [delta.playerInterest, delta.npcInterest];
    const isHook = result.kind === "open" && result.optionId === "";
    const valence = valenceForDeltas(values);
    const strength = strengthForDeltas(values);
    const trust = valence === "positive" ? strength : valence === "negative" ? -strength : 0;
    const tension =
      valence === "negative" ? strength : valence === "mixed" ? 1 : valence === "positive" ? -1 : 0;
    const deltaKey = `${delta.playerInterest}:${delta.npcInterest}`;
    return {
      id: `event:${result.day}:${result.eventId}:${result.kind}:${result.optionId || "hook"}:${targetNpcId}:${deltaKey}`,
      source: "public_event",
      day: result.day,
      targetNpcId,
      intent: "event_effect",
      valence,
      strength,
      visibility: "public",
      relationshipDelta: {
        ...(delta.playerInterest !== 0 ? { playerInterest: delta.playerInterest } : {}),
        ...(delta.npcInterest !== 0 ? { npcInterest: delta.npcInterest } : {}),
        ...(trust !== 0 ? { trust } : {}),
        ...(tension !== 0 ? { tension } : {}),
      },
      ...((!isHook && result.optionText.trim()) ||
      (isHook && result.eventId === "day6_declare" && valence === "negative")
        ? {
            memory: {
              tag: isHook
                ? ("rejection" as const)
                : valence === "negative" || valence === "mixed"
                  ? ("conflict" as const)
                  : ("support" as const),
              text: isHook
                ? "玩家在公开表态中没有选择我"
                : `玩家在「${result.optionText.trim().slice(0, 140)}」中与我互动`,
              visibility: "public" as const,
            },
          }
        : {}),
      provenance: { eventId: result.eventId, optionId: result.optionId },
    };
  });
}

type PersistedV1 = Partial<
  Omit<IslandState, keyof Pick<IslandState, "npcStateCards" | "appliedSignalIds">>
> & {
  npcIds?: unknown;
  relationships?: unknown;
  eventLog?: unknown;
};

/** Pure v1→v2 migration; malformed/missing NPC data falls back per NPC. */
export function migrateIslandPersistedState(persisted: unknown, version: number): unknown {
  if (version >= 2 || typeof persisted !== "object" || persisted === null) return persisted;
  const old = persisted as PersistedV1;
  const npcIds = Array.isArray(old.npcIds)
    ? old.npcIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const oldRelationships =
    typeof old.relationships === "object" && old.relationships !== null
      ? (old.relationships as Record<string, unknown>)
      : {};
  const interactionCounts: Record<string, number> = Object.fromEntries(npcIds.map((id) => [id, 0]));
  if (Array.isArray(old.eventLog)) {
    for (const entry of old.eventLog) {
      if (typeof entry !== "object" || entry === null) continue;
      const deltas = (entry as { deltas?: unknown }).deltas;
      if (!Array.isArray(deltas)) continue;
      const countedNpcIds = new Set<string>();
      for (const delta of deltas) {
        if (typeof delta !== "object" || delta === null) continue;
        const { npcId, delta: amount } = delta as { npcId?: unknown; delta?: unknown };
        if (
          typeof npcId === "string" &&
          typeof amount === "number" &&
          amount !== 0 &&
          npcId in interactionCounts &&
          !countedNpcIds.has(npcId)
        ) {
          interactionCounts[npcId] = (interactionCounts[npcId] ?? 0) + 1;
          countedNpcIds.add(npcId);
        }
      }
    }
  }
  const npcStateCards = Object.fromEntries(
    npcIds.map((npcId) => {
      const candidate = oldRelationships[npcId];
      const relationship =
        typeof candidate === "object" &&
        candidate !== null &&
        typeof (candidate as { toNpc?: unknown }).toNpc === "number" &&
        Number.isFinite((candidate as { toNpc: number }).toNpc) &&
        typeof (candidate as { fromNpc?: unknown }).fromNpc === "number" &&
        Number.isFinite((candidate as { fromNpc: number }).fromNpc)
          ? (candidate as IslandRelationship)
          : { toNpc: 30, fromNpc: 30 };
      return [npcId, createNpcStateCard(npcId, relationship, interactionCounts[npcId] ?? 0)];
    }),
  );
  return {
    ...old,
    npcStateCards,
    relationships: projectRelationships(npcStateCards),
    appliedSignalIds: [],
  };
}

/** 资源初始值（全 0） */
function emptyResources(): Record<ResourceKey, number> {
  return { exemption: 0, trust_points: 0, declaration: 0, solo_chance: 0 };
}

/**
 * 进天发放数量（写死，§11 稀缺资源表）：
 * DAY_RESOURCE_GRANTS 只声明「哪天发哪些 key」，数量按规格——
 * 豁免权 1 次 / 信任额度 3 次 / 表态权 1 次 / 单独机会 1 人。
 */
const RESOURCE_GRANT_AMOUNTS: Record<ResourceKey, number> = {
  exemption: 1,
  trust_points: 3,
  declaration: 1,
  solo_chance: 1,
};

// ============================================================
// Store
// ============================================================

export const useIslandStore = create<IslandState>()(
  persist(
    (set, get) => ({
      phase: "day_loop",
      day: 1,
      eventIndex: 0,
      npcIds: [],
      npcStateCards: {},
      relationships: {},
      appliedSignalIds: [],
      worldFacts: createEmptyFacts(),
      resources: emptyResources(),
      eventLog: [],
      ending: null,
      seq: 0,

      initFromOnboarding: () => {
        const { islandNpcs, competitors } = useGameStore.getState();
        const ids = [...islandNpcs, ...competitors].map((npc) => npc.id);
        // 无 onboarding 数据（未完成 onboarding）→ 保持现状，安全跳过
        if (ids.length === 0) return;
        set((state) => {
          const sameIds =
            ids.length === state.npcIds.length && ids.every((id) => state.npcIds.includes(id));
          const initialized = ids.every((id) => state.npcStateCards[id] !== undefined);
          // 幂等：名单一致且已初始化 → 什么都不做
          if (sameIds && initialized) return {};
          // 名单变化（重开游戏换人）→ 整局重建
          return {
            phase: "day_loop",
            day: 1,
            eventIndex: 0,
            npcIds: ids,
            npcStateCards: freshNpcStateCards(ids),
            relationships: freshRelationships(ids),
            appliedSignalIds: [],
            worldFacts: createEmptyFacts(),
            resources: emptyResources(),
            eventLog: [],
            ending: null,
            seq: 0,
          };
        });
      },

      applyResolvedOption: (result) => {
        set((state) => {
          const sameEvent = (e: IslandEventLogEntry) =>
            e.day === result.day && e.eventId === result.eventId;
          // 幂等保护：同一 (day, eventId) 已有「真实结算」（optionId 非空）
          // 或「跳过记录」（decision）→ 不重复结算。
          // 触发路径：「重看今天的三件事」（eventIndex 归 0 重播）与刷新恢复
          // （第 3 事件结算后刷新，EventFlow 重挂载重放）——重看语义与旧
          // StoryFlow 一致：选项可点有反馈，但好感/资源/事实/回放不重复落库。
          // 注意：beforeHooks/afterHooks 的引擎写入（kind:"open" + optionId:""）
          // 与真实结算同 eventId——hook 写入是引擎状态演进（afterHooks 在
          // 结算后重算：d6_recompute_votes 的互选/被拒名单/弃权惩罚 Δ），
          // 必须放行，幂等只挡 decision 重复结算。
          const isHookWrite = result.kind === "open" && result.optionId === "";
          const alreadySettled =
            !isHookWrite &&
            state.eventLog.some(
              (e) => sameEvent(e) && ((e.optionId ?? "") !== "" || e.kind === "decision"),
            );
          if (alreadySettled) return state;

          // hook 写入去重：同事件已有任何记录（重看/刷新重播时钩子重跑、
          // 或真实结算后 afterHooks 首次写入）→ 只合并状态，不追加重复
          // eventLog 条目。引擎输出受钩子自身幂等键保护，合并始终安全。
          const hookLogged = state.eventLog.some(sameEvent);
          const skipLogEntry = isHookWrite && hookLogged;

          // 旧事件 delta 转成公共互动信号；状态卡是唯一权威写入。
          const signalUpdate = reduceInteractionSignals(
            state,
            signalsFromResolvedOption(result, state.npcIds),
          );
          if (signalUpdate.results.some((item) => item.status === "invalid")) return state;

          // 资源扣减（钳位 ≥0）
          const resources = { ...state.resources };
          for (const cost of result.resourceCosts) {
            const current = resources[cost.resource] ?? 0;
            resources[cost.resource] = Math.max(0, current - cost.amount);
          }

          // 事实写入（core/worldFacts.writeFacts，幂等覆盖）
          const worldFacts = writeFacts(
            state.worldFacts,
            result.factsWrites,
            result.day,
            result.eventId,
          );

          // 回放追加（seq 自增；hook 去重时不追加）
          const seq = state.seq + 1;
          const entry: IslandEventLogEntry = {
            seq,
            day: result.day,
            eventId: result.eventId,
            kind: result.kind,
            optionId: result.optionId,
            optionText: result.optionText,
            targetNpcId: result.targetNpcId,
            risk: result.risk,
            deltas: result.deltas,
            facts: result.factsWrites.length > 0 ? result.factsWrites : null,
          };

          return {
            npcStateCards: signalUpdate.npcStateCards,
            relationships: signalUpdate.relationships,
            appliedSignalIds: signalUpdate.appliedSignalIds,
            resources,
            worldFacts,
            eventLog: skipLogEntry ? state.eventLog : [...state.eventLog, entry],
            seq: skipLogEntry ? state.seq : seq,
          };
        });
      },

      applyInteractionSignal: (signal) => {
        let result: ApplySignalResult = {
          status: "invalid",
          signalId: signalIdOf(signal),
          error: "signal was not processed",
        };
        if ((signal as { source?: unknown } | null)?.source === "public_event") {
          return {
            status: "invalid",
            signalId: signalIdOf(signal),
            error: "public_event signals may only be created by applyResolvedOption",
          };
        }
        set((state) => {
          const update = reduceInteractionSignals(state, [signal]);
          result = update.results[0] ?? result;
          return {
            npcStateCards: update.npcStateCards,
            relationships: update.relationships,
            appliedSignalIds: update.appliedSignalIds,
          };
        });
        return result;
      },

      applyInteractionSignals: (signals) => {
        if (
          signals.some(
            (signal) => (signal as { source?: unknown } | null)?.source === "public_event",
          )
        ) {
          return signals.map((signal) => ({
            status: "invalid" as const,
            signalId: signalIdOf(signal),
            error: "batch rejected because public_event signals are internal",
          }));
        }
        let results: ApplySignalResult[] = [];
        set((state) => {
          const update = reduceInteractionSignals(state, signals);
          results = update.results;
          return {
            npcStateCards: update.npcStateCards,
            relationships: update.relationships,
            appliedSignalIds: update.appliedSignalIds,
          };
        });
        return results;
      },

      advanceEvent: () => {
        set((state) => (state.eventIndex < 2 ? { eventIndex: state.eventIndex + 1 } : {}));
      },

      advanceDay: () => {
        set((state) => {
          // day=7 已是最后一天，不动（UI 层负责切 finale）
          if (state.day >= 7) return {};
          const nextDay = state.day + 1;
          const resources = { ...state.resources };
          // 进天发放稀缺资源（§11）：D3 豁免 / D5 信任额度 / D6 表态 / D7 单独机会
          const grants = DAY_RESOURCE_GRANTS[nextDay as keyof typeof DAY_RESOURCE_GRANTS];
          if (grants) {
            for (const key of grants) {
              resources[key] = (resources[key] ?? 0) + RESOURCE_GRANT_AMOUNTS[key];
            }
          }
          return { day: nextDay, eventIndex: 0, resources };
        });
      },

      resolveEnding: () => {
        set((state) => {
          const detail = resolveEndingDetail({
            relationships: projectRelationships(state.npcStateCards),
            facts: state.worldFacts,
          });
          return { ending: detail.id, phase: "finale" };
        });
      },

      resetRun: () => {
        set((state) => ({
          phase: "day_loop",
          day: 1,
          eventIndex: 0,
          npcStateCards: freshNpcStateCards(state.npcIds),
          relationships: freshRelationships(state.npcIds),
          appliedSignalIds: [],
          worldFacts: createEmptyFacts(),
          resources: emptyResources(),
          eventLog: [],
          ending: null,
          seq: 0,
        }));
      },

      highestNpcId: () => {
        const { npcIds, npcStateCards } = get();
        let best: string | null = null;
        let bestValue = -Infinity;
        for (const npcId of npcIds) {
          const card = npcStateCards[npcId];
          if (!card) continue;
          if (card.interest.playerToNpc > bestValue) {
            bestValue = card.interest.playerToNpc;
            best = npcId;
          }
        }
        return best;
      },

      secondNpcId: () => {
        const { npcIds, npcStateCards } = get();
        let first: string | null = null;
        let firstValue = -Infinity;
        let second: string | null = null;
        let secondValue = -Infinity;
        for (const npcId of npcIds) {
          const card = npcStateCards[npcId];
          if (!card) continue;
          const value = card.interest.playerToNpc;
          if (value > firstValue) {
            second = first;
            secondValue = firstValue;
            first = npcId;
            firstValue = value;
          } else if (value > secondValue) {
            second = npcId;
            secondValue = value;
          }
        }
        return second;
      },

      getHeart: (npcId) => {
        const card = get().npcStateCards[npcId];
        return card
          ? { toNpc: card.interest.playerToNpc, fromNpc: card.interest.npcToPlayer }
          : null;
      },
    }),
    {
      name: "flipped-ai-island",
      version: 2,
      migrate: migrateIslandPersistedState,
    },
  ),
);

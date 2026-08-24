/**
 * useIslandStore —— 七日公共事件玩法的持久化状态
 *
 * 生命周期：initFromOnboarding()（幂等，从 onboarding 交接名单）
 * → applyResolvedOption()（turnRunner 结算结果落库）
 * → advanceEvent() / advanceDay()（D3/D5/D6/D7 进天发资源，§11）
 * → resolveEnding()（D7 篝火熄灭时锁定结局，§9.3）→ resetRun()（重开一局）。
 *
 * persist：key "flipped-ai-island"，version 1（浏览器端 localStorage 自动恢复）。
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

interface IslandState {
  phase: IslandPhase;
  /** 当前天数 1-7 */
  day: number;
  /** 当天第几个事件 0-2 */
  eventIndex: number;
  /** 岛上 NPC 名单（onboarding islandNpcs 5 + competitors 4） */
  npcIds: string[];
  relationships: Record<string, IslandRelationship>;
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
      relationships: {},
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
          const initialized = ids.every((id) => state.relationships[id] !== undefined);
          // 幂等：名单一致且已初始化 → 什么都不做
          if (sameIds && initialized) return {};
          // 名单变化（重开游戏换人）→ 整局重建
          return {
            phase: "day_loop",
            day: 1,
            eventIndex: 0,
            npcIds: ids,
            relationships: freshRelationships(ids),
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

          // 好感按方向应用并钳位 0-100
          const relationships = { ...state.relationships };
          for (const delta of result.deltas ?? []) {
            const rel = relationships[delta.npcId];
            if (!rel) continue; // 名单外 NPC 忽略
            const current = delta.direction === "to_npc" ? rel.toNpc : rel.fromNpc;
            const next = clampAffinity(current + delta.delta);
            relationships[delta.npcId] =
              delta.direction === "to_npc" ? { ...rel, toNpc: next } : { ...rel, fromNpc: next };
          }

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
            relationships,
            resources,
            worldFacts,
            eventLog: skipLogEntry ? state.eventLog : [...state.eventLog, entry],
            seq: skipLogEntry ? state.seq : seq,
          };
        });
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
            relationships: state.relationships,
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
          relationships: freshRelationships(state.npcIds),
          worldFacts: createEmptyFacts(),
          resources: emptyResources(),
          eventLog: [],
          ending: null,
          seq: 0,
        }));
      },

      highestNpcId: () => {
        const { npcIds, relationships } = get();
        let best: string | null = null;
        let bestValue = -Infinity;
        for (const npcId of npcIds) {
          const rel = relationships[npcId];
          if (!rel) continue;
          if (rel.toNpc > bestValue) {
            bestValue = rel.toNpc;
            best = npcId;
          }
        }
        return best;
      },

      secondNpcId: () => {
        const { npcIds, relationships } = get();
        let first: string | null = null;
        let firstValue = -Infinity;
        let second: string | null = null;
        let secondValue = -Infinity;
        for (const npcId of npcIds) {
          const rel = relationships[npcId];
          if (!rel) continue;
          const value = rel.toNpc;
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

      getHeart: (npcId) => get().relationships[npcId] ?? null,
    }),
    {
      name: "flipped-ai-island",
      version: 1,
    },
  ),
);

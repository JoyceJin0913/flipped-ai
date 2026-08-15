/**
 * 心动岛 · Zustand 全局游戏状态管理
 * 基于 localStorage 持久化，刷新不丢进度
 *
 * 状态结构对齐 PRD §4 全部类型定义。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GamePhase,
  PlayerProfile,
  Relationship,
  DayCycleState,
  EconomyState,
  HeartVote,
  NPC,
  ActKey,
  IntentType,
  SceneKey,
  ResolveResult,
} from "../core/types";
import {
  resolveInteraction,
  getStageFromValue,
  calcTestResult,
  calculateMatchingPool,
  VOTE_CONFIG,
  ECONOMY_CONFIG,
} from "../core/scoring";
import { getNpcById, getOppositeGenderNpcs } from "../core/npcLibrary";
import type { TestResult, CandidateInfo } from "../core/types";
import type { WorldState, WorldEvent } from "../core/state/worldTypes";
import { createInitialWorldState } from "../core/state/worldStore";
import { createPublicEvent, createPrivateEvent, appendEvent as appendEv } from "../core/state/eventLog";
import { evolveRelation } from "../core/state/relationMatrix";
import { createEmptyFacts, writeFacts as writeFactsUtil } from "../core/state/worldFacts";

// ============================================================
// Store State 类型
// ============================================================

interface GameState {
  // ---- 游戏阶段 ----
  phase: GamePhase;
  setPhase: (phase: GamePhase) => void;

  // ---- 玩家档案 ----
  playerProfile: PlayerProfile | null;
  setPlayerProfile: (profile: PlayerProfile) => void;

  // ---- 测试结果 ----
  testResult: TestResult | null;
  setTestResult: (result: TestResult) => void;

  // ---- 匹配池 ----
  matchingPool: CandidateInfo[];
  selectedNpcIds: string[]; // 8选5 选中的 ID
  setMatchingPool: (pool: CandidateInfo[]) => void;
  setSelectedNpcs: (ids: string[]) => void;

  // ---- 入岛 NPC 列表（5 异性 + 4 同性竞争者）----
  islandNpcs: NPC[];
  competitors: NPC[];
  setIslandNpcs: (npcs: NPC[], competitors: NPC[]) => void;

  // ---- 关系状态 ----
  relationships: Record<string, Relationship>;
  updateRelationship: (npcId: string, updater: (r: Relationship) => Relationship) => void;
  initRelationships: (npcIds: string[]) => void;

  // ---- 日循环 ----
  dayCycle: DayCycleState;
  advanceAct: () => void;
  advanceDay: () => void;
  completeCurrentAct: () => void;
  addEvent: (event: DayCycleState["events"][0]) => void;
  markChatted: (npcId: string) => void;
  processPublicEvent: (eventId: string, description: string, affectedNpcIds?: string[]) => Record<string, Partial<Relationship>>;
  getHeartSignal: (npcId: string) => "none" | "micro" | "crush" | "critical" | "jealous";
  resetGame: () => void;

  // ---- 对话系统 ----
  currentChatPartner: string | null;
  setCurrentChatPartner: (id: string | null) => void;
  processInteraction: (intent: IntentType, npcId: string, scene?: SceneKey) => ResolveResult;

  // ---- 心动投票 ----
  votes: HeartVote[];
  castVote: (targetId: string) => void;
  revokeVote: () => void;
  remainingVotes: number;

  // ---- 经济系统 ----
  economy: EconomyState;
  addPoints: (amount: number) => void;
  spendPoints: (amount: number) => boolean;
  usePeekCoupon: () => boolean;
  useIntrudeCoupon: () => boolean;

  // ---- 世界状态（三层架构） ----
  worldState: WorldState;
  appendWorldEvent: (event: WorldEvent) => void;
  initWorldState: (npcIds: string[]) => void;
  /** v1.1：写入跨天事实 */
  writeWorldFacts: (writes: import("../core/director/beatTypes").WorldFactWrite[], day: number, beatId: string) => void;

  // ---- 复用 lovable 式的 picked/progress ----
  storyPicked: Record<string, string>;
  setStoryPicked: (sceneId: string, choiceKey: string) => void;
}

// ============================================================
// 默认状态工厂
// ============================================================

function createInitialRelationship(npcId: string): Relationship {
  return {
    npcId,
    heartValue: 30, // 初始值
    stage: "stranger",
    interactionCount: 0,
    lastInteractionAct: null,
    icebergCluesUnlocked: 0,
    moments: [],
  };
}

function createInitialDayCycle(): DayCycleState {
  return {
    currentDay: 1,
    currentAct: "daytime",
    actCompleted: {},
    chattedToday: [],
    remainingVotes: VOTE_CONFIG.DAILY_VOTE_LIMIT,
    events: [],
  };
}

function createInitialEconomy(): EconomyState {
  return {
    points: ECONOMY_CONFIG.STARTING_POINTS,
    peekCoupons: 0,
    intrudeCoupons: 0,
    freePeekGrantedOn: [],
    freeIntrudeGrantedOn: [],
  };
}

// ============================================================
// Store 创建
// ============================================================

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      // ---- 阶段 ----
      phase: "profile_setup" as GamePhase,
      setPhase: (phase) => set({ phase }),

      // ---- 玩家档案 ----
      playerProfile: null,
      setPlayerProfile: (profile) => set({ playerProfile: profile }),

      // ---- 测试结果 ----
      testResult: null,
      setTestResult: (result) => set({ testResult: result }),

      // ---- 匹配池 ----
      matchingPool: [],
      selectedNpcIds: [],
      setMatchingPool: (pool) => set({ matchingPool: pool }),
      setSelectedNpcs: (ids) => set({ selectedNpcIds: ids }),

      // ---- 入岛 NPC ----
      islandNpcs: [],
      competitors: [],
      setIslandNpcs: (npcs, competitors) => {
        const allNpcIds = [...npcs, ...competitors].map((n) => n.id);
        set({
          islandNpcs: npcs,
          competitors,
          worldState: createInitialWorldState(allNpcIds),
        });
      },

      // ---- 关系状态 ----
      relationships: {},
      updateRelationship: (npcId, updater) => {
        const { relationships } = get();
        const existing = relationships[npcId] || createInitialRelationship(npcId);
        set({ relationships: { ...relationships, [npcId]: updater(existing) } });
      },
      initRelationships: (npcIds) => {
        const relationships: Record<string, Relationship> = {};
        npcIds.forEach((id) => { relationships[id] = createInitialRelationship(id); });
        set({ relationships });
      },

      // ---- 日循环 ----
      dayCycle: createInitialDayCycle(),
      advanceAct: () => {
        const { dayCycle } = get();
        const actOrder: ActKey[] = ["daytime", "private_chat", "solo_review"];
        const currentIdx = actOrder.indexOf(dayCycle.currentAct);
        if (currentIdx < actOrder.length - 1) {
          set({ dayCycle: { ...dayCycle, currentAct: actOrder[currentIdx + 1]! } });
        }
      },
      advanceDay: () => {
        const { dayCycle, economy } = get();
        const newDay = Math.min(dayCycle.currentDay + 1, 7);
        const newEconomy = { ...economy };

        // 发放免费券
        if (ECONOMY_CONFIG.FREE_PEEK_DAYS.includes(newDay)) {
          newEconomy.freePeekGrantedOn = [...economy.freePeekGrantedOn, newDay];
        }
        if (ECONOMY_CONFIG.FREE_INTRUDE_DAYS.includes(newDay)) {
          newEconomy.freeIntrudeGrantedOn = [...economy.freeIntrudeGrantedOn, newDay];
        }

        set({
          dayCycle: {
            currentDay: newDay,
            currentAct: "daytime",
            actCompleted: { ...dayCycle.actCompleted, [newDay]: {} },
            chattedToday: [],
            remainingVotes: VOTE_CONFIG.DAILY_VOTE_LIMIT,
            events: [],
          },
          economy: newEconomy,
        });
      },
      completeCurrentAct: () => {
        const { dayCycle } = get();
        set({
          dayCycle: {
            ...dayCycle,
            actCompleted: {
              ...dayCycle.actCompleted,
              [dayCycle.currentDay]: {
                ...(dayCycle.actCompleted[dayCycle.currentDay] || {}),
                [dayCycle.currentAct]: true,
              },
            },
          },
        });
      },
      addEvent: (event) => {
        const { dayCycle } = get();
        set({ dayCycle: { ...dayCycle, events: [...dayCycle.events, event] } });
      },
      // ---- 共同记忆引擎（PRD §3.4）----
      // 公共事件发生时，在场全员各依人格重算态度
      processPublicEvent: (eventId: string, description: string, affectedNpcIds?: string[]) => {
        const { islandNpcs, relationships, dayCycle } = get();
        const targets = affectedNpcIds || islandNpcs.map((n) => n.id);
        const updates: Record<string, Partial<Relationship>> = {};

        targets.forEach((npcId) => {
          const npc = getNpcById(npcId);
          if (!npc || !relationships[npcId]) return;

          // 根据NPC依恋类型决定反应强度
          const attachment = npc.attachment;
          let delta = 0;
          let reaction = "";

          switch (attachment) {
            case "anxious":
              // 焦虑型：公共事件中容易产生强烈情绪波动
              delta = Math.random() > 0.5 ? 3 : -1;
              reaction = delta > 0
                ? `（${npc.name}在人群中看了你一眼，眼神有些复杂）`
                : `（${npc.name}似乎在故意避开你的目光）`;
              break;
            case "avoidant":
              // 回避型：公共场合装作不在意
              delta = Math.random() > 0.7 ? 1 : 0;
              reaction = delta > 0
                ? `（${npc.name}面无表情地扫过你，但你注意到TA的耳朵红了）`
                : `（${npc.name}像没事人一样聊着天）`;
              break;
            case "secure":
            default:
              // 安全型：自然应对
              delta = Math.random() > 0.5 ? 2 : 0;
              reaction = delta > 0
                ? `（${npc.name}笑着朝你点了点头）`
                : `（${npc.name}自然地参与着对话）`;
              break;
          }

          updates[npcId] = {
            heartValue: Math.max(0, Math.min(100, relationships[npcId].heartValue + delta)),
            moments: [
              ...relationships[npcId].moments,
              {
                day: dayCycle.currentDay,
                time: new Date().toTimeString().slice(0, 5),
                place: "公共事件",
                text: `${description}${reaction ? "\n" + reaction : ""}`,
                delta,
                intent: "probe", // 公共事件默认记为试探类
              },
            ],
          };
        });

        // 批量更新关系
        const newRelationships = { ...relationships };
        Object.entries(updates).forEach(([npcId, update]) => {
          newRelationships[npcId] = { ...newRelationships[npcId]!, ...update };
        });
        set({ relationships: newRelationships });

        return updates;
      },

      // ---- 心动分级视觉信号（PRD §11.3）----
      getHeartSignal: (npcId: string): "none" | "micro" | "crush" | "critical" | "jealous" => {
        const rel = get().relationships[npcId];
        if (!rel) return "none";
        const { heartValue, interactionCount } = rel;

        // 暴击：单次大增或高心动值 + 高互动
        const lastMoment = rel.moments[rel.moments.length - 1];
        if (lastMoment && lastMoment.delta >= 8) return "critical";
        if (heartValue >= 75 && interactionCount >= 5) return "critical";
        if (heartValue >= 60) return "crush";
        if (heartValue >= 40 && lastMoment && lastMoment.delta > 0) return "micro";

        // 吃醋检测：玩家给其他人投了票但没给 TA
        const todayVotes = get().votes.filter(
          (v) => v.day === get().dayCycle.currentDay && !v.isRevoke && v.targetId !== npcId
        );
        if (todayVotes.length > 0 && heartValue >= 45) return "jealous";

        return "none";
      },

      markChatted: (npcId) => {
        const { dayCycle } = get();
        if (!dayCycle.chattedToday.includes(npcId)) {
          set({
            dayCycle: { ...dayCycle, chattedToday: [...dayCycle.chattedToday, npcId] },
          });
        }
      },

      // ---- 对话系统 ----
      currentChatPartner: null,
      setCurrentChatPartner: (id) => set({ currentChatPartner: id }),
      processInteraction: (intent, npcId, scene = "private_day") => {
        const npc = getNpcById(npcId);
        if (!npc) throw new Error(`NPC not found: ${npcId}`);

        const rel = get().relationships[npcId];
        if (!rel) throw new Error(`No relationship for ${npcId}`);

        const result = resolveInteraction(
          {
            intent,
            npcId,
            scene,
            isNight: scene === "private_night",
            isInitiator: true,
          },
          npc,
          rel.heartValue,
        );

        // 更新关系
        const newValue = Math.max(0, Math.min(100, rel.heartValue + result.delta));
        get().updateRelationship(npcId, (r) => ({
          ...r,
          heartValue: newValue,
          stage: result.newStage,
          interactionCount: r.interactionCount + 1,
          lastInteractionAct: get().dayCycle.currentAct,
          icebergCluesUnlocked: result.unlocksIcebergClue
            ? r.icebergCluesUnlocked + 1
            : r.icebergCluesUnlocked,
          moments: [
            ...r.moments,
            {
              day: get().dayCycle.currentDay,
              time: new Date().toTimeString().slice(0, 5),
              place: scene === "private_night" ? "深夜私聊" : "日常私聊",
              text: result.npcReaction,
              delta: result.delta,
              intent,
            },
          ],
        }));

        // 标记已聊天
        get().markChatted(npcId);

        return result;
      },

      // ---- 心动投票 ----
      votes: [],
      castVote: (targetId) => {
        const { dayCycle } = get();
        if (dayCycle.remainingVotes <= 0) return;

        const vote: HeartVote = {
          day: dayCycle.currentDay,
          targetId,
          isRevoke: false,
        };

        // 给目标加心动值
        get().updateRelationship(targetId, (r) => ({
          ...r,
          heartValue: Math.min(100, r.heartValue + VOTE_CONFIG.VOTE_VALUE),
          moments: [
            ...r.moments,
            {
              day: dayCycle.currentDay,
              time: new Date().toTimeString().slice(0, 5),
              place: "心动投票",
              text: "你投出了今日的一票心动",
              delta: VOTE_CONFIG.VOTE_VALUE,
            },
          ],
        }));

        set({
          votes: [...get().votes, vote],
          remainingVotes: dayCycle.remainingVotes - 1,
          dayCycle: { ...dayCycle, remainingVotes: dayCycle.remainingVotes - 1 },
        });

        // 加点数
        get().addPoints(VOTE_CONFIG.VOTE_REWARD);
      },
      revokeVote: () => {
        const { votes, dayCycle } = get();
        const todayVotes = votes.filter((v) => v.day === dayCycle.currentDay && !v.isRevoke);
        if (todayVotes.length === 0) return;

        const lastVote = todayVotes[todayVotes.length - 1]!;
        const revokedTarget = lastVote.targetId;

        // 撤回：扣回之前加的心动值
        get().updateRelationship(revokedTarget, (r) => ({
          ...r,
          heartValue: Math.max(0, r.heartValue - VOTE_CONFIG.VOTE_VALUE),
          moments: [
            ...r.moments,
            {
              day: dayCycle.currentDay,
              time: new Date().toTimeString().slice(0, 5),
              place: "撤回投票",
              text: "你撤回了刚才的心动票",
              delta: -VOTE_CONFIG.VOTE_VALUE,
            },
          ],
        }));

        const revokeVote: HeartVote = {
          day: dayCycle.currentDay,
          targetId: "",
          isRevoke: true,
          revokedPreviousTarget: revokedTarget,
        };

        set({
          votes: [...get().votes, revokeVote],
          remainingVotes: dayCycle.remainingVotes + 1,
          dayCycle: { ...dayCycle, remainingVotes: dayCycle.remainingVotes + 1 },
        });
      },
      remainingVotes: VOTE_CONFIG.DAILY_VOTE_LIMIT,

      // ---- 经济系统 ----
      economy: createInitialEconomy(),
      addPoints: (amount) => {
        const { economy } = get();
        set({ economy: { ...economy, points: economy.points + amount } });
      },
      spendPoints: (amount) => {
        const { economy } = get();
        if (economy.points < amount) return false;
        set({ economy: { ...economy, points: economy.points - amount } });
        return true;
      },
      usePeekCoupon: () => {
        const { economy, dayCycle } = get();
        // 检查免费券
        if (economy.freePeekGrantedOn.includes(dayCycle.currentDay)) {
          return true; // 今日免费
        }
        if (economy.peekCoupons > 0) {
          set({ economy: { ...economy, peekCoupons: economy.peekCoupons - 1 } });
          return true;
        }
        if (economy.points >= ECONOMY_CONFIG.PEEK_COST) {
          set({ economy: { ...economy, points: economy.points - ECONOMY_CONFIG.PEEK_COST } });
          return true;
        }
        return false;
      },
      useIntrudeCoupon: () => {
        const { economy, dayCycle } = get();
        if (economy.freeIntrudeGrantedOn.includes(dayCycle.currentDay)) {
          return true;
        }
        if (economy.intrudeCoupons > 0) {
          set({ economy: { ...economy, intrudeCoupons: economy.intrudeCoupons - 1 } });
          return true;
        }
        if (economy.points >= ECONOMY_CONFIG.INTRUDE_COST) {
          set({ economy: { ...economy, points: economy.points - ECONOMY_CONFIG.INTRUDE_COST } });
          return true;
        }
        return false;
      },

      // ---- 重置游戏 ----
      resetGame: () => {
        set({
          phase: "profile_setup",
          playerProfile: null,
          testResult: null,
          matchingPool: [],
          selectedNpcIds: [],
          islandNpcs: [],
          competitors: [],
          relationships: {},
          dayCycle: createInitialDayCycle(),
          votes: [],
          remainingVotes: VOTE_CONFIG.DAILY_VOTE_LIMIT,
          economy: createInitialEconomy(),
          currentChatPartner: null,
          storyPicked: {},
        });
      },

      // ---- 世界状态（三层架构） ----
      worldState: createInitialWorldState([]),
      appendWorldEvent: (event) =>
        set((state: any) => ({
          worldState: {
            ...state.worldState,
            eventLog: appendEv(state.worldState.eventLog, event),
            relations: evolveRelation(state.worldState.relations, event),
          },
        })),
      initWorldState: (npcIds) =>
        set({ worldState: createInitialWorldState(npcIds) }),

      writeWorldFacts: (writes, day, beatId) =>
        set((state) => ({
          worldState: {
            ...state.worldState,
            worldFacts: writeFactsUtil(
              state.worldState.worldFacts ?? createEmptyFacts(),
              writes,
              day,
              beatId
            ),
          },
        })),

      // ---- Story picked state (lovable 兼容) ----
      storyPicked: {},
      setStoryPicked: (sceneId, choiceKey) => {
        const { storyPicked } = get();
        set({ storyPicked: { ...storyPicked, [sceneId]: choiceKey } });
      },
    }),
    {
      name: "heart-signal-island-storage",
      version: 2,
      // 只持久化关键状态，过滤掉函数
      partialize: (state) => ({
        phase: state.phase,
        playerProfile: state.playerProfile,
        testResult: state.testResult,
        matchingPool: state.matchingPool,
        selectedNpcIds: state.selectedNpcIds,
        islandNpcs: state.islandNpcs,
        competitors: state.competitors,
        relationships: state.relationships,
        dayCycle: state.dayCycle,
        votes: state.votes,
        remainingVotes: state.remainingVotes,
        economy: state.economy,
        storyPicked: state.storyPicked,
        worldState: state.worldState,
      }),
      // v1.1 兼容：老存档无 worldFacts 字段，补空表
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const ws = p["worldState"] as Record<string, unknown> | undefined;
        if (ws && typeof ws === "object" && !ws["worldFacts"]) {
          ws["worldFacts"] = createEmptyFacts();
        }
        return { ...current, ...(p as object) };
      },
    }
  )
);

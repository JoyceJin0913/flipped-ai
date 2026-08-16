/**
 * 世界状态 Zustand Slice
 *
 * 挂载到 useGameStore，提供世界状态的读写接口
 */

import type { WorldState } from "./worldTypes";
import type { WorldEvent } from "./worldTypes";
import type { TensionState, BeatProgress } from "../director/types";
import type { PersonalityVector, EvolutionTriggerType, TextContract } from "../actor/types";
import { createEmptyLog, appendEvent } from "./eventLog";
import { initRelationMatrix, evolveRelation } from "./relationMatrix";
import { initAllPersonalityVectors } from "../actor/personalityVector";
import { deriveAllTextContracts } from "../actor/textContracts";
import { evolveVector } from "../actor/personalityVector";
import { createEmptyFacts, writeFacts as writeFactsUtil } from "./worldFacts";
import type { WorldFactWrite } from "../director/beatTypes";

/** 创建初始世界状态 */
export function createInitialWorldState(npcIds: string[]): WorldState {
  return {
    day: 1,
    act: "daytime",
    tension: { current: 30, trend: "stable", lastDelta: 0 },
    eventLog: createEmptyLog(),
    relations: initRelationMatrix(npcIds),
    playerRelations: {},
    personalityVectors: initAllPersonalityVectors(npcIds),
    textContracts: deriveAllTextContracts(npcIds),
    beatProgress: {
      beatIndex: 0,
      allSpeakers: [],
      silenceMap: {},
      cooldownMap: {},
      turns: [],
    },
    worldFacts: createEmptyFacts(),
  };
}

/** 世界状态 Slice 接口 */
export interface WorldStateSlice {
  worldState: WorldState;
  appendWorldEvent: (event: WorldEvent) => void;
  appendWorldEvents: (events: WorldEvent[]) => void;
  evolvePersonality: (npcId: string, trigger: EvolutionTriggerType) => void;
  setTension: (tension: TensionState) => void;
  advanceBeat: (speakers: string[], allNpcIds: string[]) => void;
  resetBeatProgress: () => void;
  initWorldState: (npcIds: string[]) => void;
  /** v1.1：写入跨天事实 */
  writeWorldFacts: (writes: WorldFactWrite[], day: number, beatId: string) => void;
}

/** 创建世界状态 Slice */
export function createWorldStateSlice(
  set: (fn: (state: any) => any) => void,
  _get: () => any
): WorldStateSlice {
  return {
    worldState: createInitialWorldState([]),

    appendWorldEvent: (event) =>
      set((state: any) => ({
        worldState: {
          ...state.worldState,
          eventLog: appendEvent(state.worldState.eventLog, event),
          relations: evolveRelation(state.worldState.relations, event),
        },
      })),

    appendWorldEvents: (events) =>
      set((state: any) => {
        let log = state.worldState.eventLog;
        let relations = state.worldState.relations;
        for (const e of events) {
          log = appendEvent(log, e);
          relations = evolveRelation(relations, e);
        }
        return {
          worldState: { ...state.worldState, eventLog: log, relations },
        };
      }),

    evolvePersonality: (npcId, trigger) =>
      set((state: any) => {
        const pv = state.worldState.personalityVectors[npcId];
        if (!pv) return state;
        const newPv = evolveVector(pv, trigger);
        return {
          worldState: {
            ...state.worldState,
            personalityVectors: {
              ...state.worldState.personalityVectors,
              [npcId]: newPv,
            },
          },
        };
      }),

    setTension: (tension) =>
      set((state: any) => ({
        worldState: { ...state.worldState, tension },
      })),

    advanceBeat: (speakers, allNpcIds) =>
      set((state: any) => {
        const bp = state.worldState.beatProgress;
        const newSilenceMap: Record<string, number> = {};
        const newCooldownMap: Record<string, number> = {};

        for (const id of allNpcIds) {
          // 沉默轮数：本轮没发言的 +1，发言的归零
          newSilenceMap[id] = speakers.includes(id) ? 0 : (bp.silenceMap[id] ?? 0) + 1;
          // 冷却轮数：本轮发言的设为 2（接下来2轮有冷却），其他人 -1
          newCooldownMap[id] = speakers.includes(id) ? 2 : Math.max(0, (bp.cooldownMap[id] ?? 0) - 1);
        }

        return {
          worldState: {
            ...state.worldState,
            beatProgress: {
              ...bp,
              beatIndex: bp.beatIndex + 1,
              allSpeakers: [...new Set([...bp.allSpeakers, ...speakers])],
              silenceMap: newSilenceMap,
              cooldownMap: newCooldownMap,
            },
          },
        };
      }),

    resetBeatProgress: () =>
      set((state: any) => ({
        worldState: {
          ...state.worldState,
          beatProgress: {
            beatIndex: 0,
            allSpeakers: [],
            silenceMap: {},
            cooldownMap: {},
            turns: [],
          },
        },
      })),

    initWorldState: (npcIds) =>
      set((state: any) => ({
        worldState: createInitialWorldState(npcIds),
      })),

    writeWorldFacts: (writes, day, beatId) =>
      set((state: any) => ({
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
  };
}

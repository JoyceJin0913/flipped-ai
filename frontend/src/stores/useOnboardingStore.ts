/**
 * useOnboardingStore —— 精简版 Zustand，只负责 onboarding 4 阶段
 *
 * 从她的 useGameStore（608 行）里挑出 onboarding 用得到的最小集合。
 * 命名保持 useGameStore（不用 rename）以便她的 UI 代码一行不改。
 *
 * 完成 onboarding 后，调 applyToHouseState() 把玩家数据交接给你的 useHouseState。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayerProfile, NPC, TestResult, CandidateInfo } from "../onboarding/types";

export type OnboardingPhase = "profile_setup" | "personality_test" | "matching" | "intro" | "done";

interface State {
  phase: OnboardingPhase;
  playerProfile: PlayerProfile | null;
  testResult: TestResult | null;
  matchingPool: CandidateInfo[];
  selectedNpcIds: string[];
  islandNpcs: NPC[];
  competitors: NPC[];

  setPhase: (p: OnboardingPhase) => void;
  setPlayerProfile: (p: PlayerProfile) => void;
  setTestResult: (r: TestResult) => void;
  setMatchingPool: (pool: CandidateInfo[]) => void;
  setSelectedNpcs: (ids: string[]) => void;
  setIslandNpcs: (npcs: NPC[], competitors: NPC[]) => void;
  initRelationships: (npcIds: string[]) => void;
  reset: () => void;
}

const initialState = {
  phase: "profile_setup" as OnboardingPhase,
  playerProfile: null,
  testResult: null,
  matchingPool: [] as CandidateInfo[],
  selectedNpcIds: [] as string[],
  islandNpcs: [] as NPC[],
  competitors: [] as NPC[],
};

export const useGameStore = create<State>()(
  persist(
    (set) => ({
      ...initialState,
      setPhase: (phase) => set({ phase }),
      setPlayerProfile: (playerProfile) => set({ playerProfile }),
      setTestResult: (testResult) => set({ testResult }),
      setMatchingPool: (matchingPool) => set({ matchingPool }),
      setSelectedNpcs: (selectedNpcIds) => set({ selectedNpcIds }),
      setIslandNpcs: (islandNpcs, competitors) => set({ islandNpcs, competitors }),
      // 关系值初始化交给你的 useHouseState 处理，这里空实现
      initRelationships: () => {},
      reset: () => set(initialState),
    }),
    {
      name: "flipped-ai-onboarding",
      version: 1,
    },
  ),
);

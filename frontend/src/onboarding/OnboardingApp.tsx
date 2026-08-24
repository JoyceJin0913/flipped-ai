/**
 * OnboardingApp —— 冷启动 4 阶段路由
 *
 * 按 useOnboardingStore.phase 值渲染对应组件：
 *   profile_setup    → 建档
 *   personality_test → 12 题人格测试
 *   matching         → 8 选 5 匹配池
 *   intro            → 入岛开场
 *   done             → 由外层 AppRoot 切到 HouseApp（本组件不处理）
 */
import { useGameStore } from "../stores/useOnboardingStore";
import { ProfileSetup, PersonalityTest, MatchingSelection, IntroScene } from "./OnboardingScreens";

export function OnboardingApp() {
  const phase = useGameStore((s) => s.phase);
  if (phase === "profile_setup") return <ProfileSetup />;
  if (phase === "personality_test") return <PersonalityTest />;
  if (phase === "matching") return <MatchingSelection />;
  if (phase === "intro") return <IntroScene />;
  return null;
}

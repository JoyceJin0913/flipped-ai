/**
 * AppRoot —— 顶层 Phase Router
 *
 * 判断 onboarding 是否完成：
 *   phase === "done"  →  <HouseApp />（原有小屋）
 *   其他              →  <OnboardingApp />（她的 4 阶段）
 *
 * onboarding 完成后自动切换，无需刷新。
 */
import { useGameStore } from "@/stores/useOnboardingStore";
import { HouseApp } from "@/components/HouseApp";
import { OnboardingApp } from "@/onboarding/OnboardingApp";

export function AppRoot() {
  const phase = useGameStore((s) => s.phase);
  return phase === "done" ? <HouseApp /> : <OnboardingApp />;
}

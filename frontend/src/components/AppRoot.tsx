/**
 * AppRoot —— 顶层 Phase Router
 *
 * 判断 onboarding 是否完成：
 *   phase === "done"  →  <HouseApp />（原有小屋）
 *   其他              →  <OnboardingApp />（她的 4 阶段）
 *
 * onboarding 完成后自动切换，无需刷新。
 */
import { useEffect } from "react";
import { useGameStore } from "@/stores/useOnboardingStore";
import { useIslandStore } from "@/stores/useIslandStore";
import { HouseApp } from "@/components/HouseApp";
import { OnboardingApp } from "@/onboarding/OnboardingApp";

export function AppRoot() {
  const phase = useGameStore((s) => s.phase);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("restart") !== "1") return;

    useGameStore.getState().reset();
    useIslandStore.getState().resetRun();
    url.searchParams.delete("restart");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return phase === "done" ? <HouseApp /> : <OnboardingApp />;
}

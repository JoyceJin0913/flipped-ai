/**
 * 心动岛 · 主应用入口（Phase Router）
 *
 * 阶段流转（PRD §5 冷启流程 + §3 日循环 + §7 终选 + §14 复盘）：
 *   profile_setup → personality_test → matching → intro
 *   → day_loop（三幕 × 7 天）→ finale → review
 *
 * 三 Tab 布局仅在 day_loop / finale / review 阶段启用（Lovable 交互模式）。
 */

import { useState } from "react";
import { useGameStore } from "../stores/useGameStore";
import { TabBar } from "./game/shared";
import { ProfileSetup, PersonalityTest, MatchingSelection, IntroScene } from "./game/onboarding";
import { HouseView, ChatSheet } from "./game/dayloop";
import { RelationshipsView, MeView, FinaleNight, ReviewPortrait } from "./game/observation";

type TabKey = "house" | "relationships" | "me";

export function GameApp() {
  const phase = useGameStore((s) => s.phase);
  const [tab, setTab] = useState<TabKey>("house");
  const [chatNpcId, setChatNpcId] = useState<string | null>(null);

  // ---- 冷启动阶段：全屏单页，无 Tab ----
  if (phase === "profile_setup") return <ProfileSetup />;
  if (phase === "personality_test") return <PersonalityTest />;
  if (phase === "matching") return <MatchingSelection />;
  if (phase === "intro") return <IntroScene />;

  // ---- 主玩法阶段：三 Tab 布局 ----
  const renderHouseTab = () => {
    if (phase === "finale") return <FinaleNight />;
    if (phase === "review") return <ReviewPortrait />;
    return <HouseView onOpenChat={setChatNpcId} />;
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className="flex-1 pb-28">
        {tab === "house" && renderHouseTab()}
        {tab === "relationships" && <RelationshipsView />}
        {tab === "me" && <MeView />}
      </div>

      <TabBar active={tab} onChange={setTab} />

      <ChatSheet
        npcId={chatNpcId}
        open={chatNpcId !== null}
        onClose={() => setChatNpcId(null)}
      />
    </div>
  );
}

export default GameApp;

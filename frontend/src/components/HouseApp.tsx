import { useEffect, useRef, useState } from "react";

import { Home, Heart, User, ChevronLeft, Check, ChevronRight, MessageCircle } from "lucide-react";
import {
  scenes,
  storySequence,
  storyTransitions,
  members,
  hotspots,
  dateCard,
  genderOf,
  affinities,
  meAvatar,
  profile,
  storyTimeline,
  chatTopics as fallbackChatTopics,
  replyOf,
  journey,
  type Scene,
  type Choice,
  type Member,
} from "@/data/house";
import { RoomNight } from "@/components/RoomNight";
import { FinaleReport } from "@/components/FinaleReport";
import { EventFlow } from "@/components/EventFlow";
import { getDay } from "@/data/events";
import { getDaySceneImage } from "@/data/daySceneImages";
import { useIslandStore } from "@/stores/useIslandStore";
import { useGameStore } from "@/stores/useOnboardingStore";
import { getHeartSignal, type HeartSignal } from "@/core/heartSignal";
import { getNpcOutputContext } from "@/core/outputContext";
import { planChatSuggestionSlots } from "@/data/chatTopics";
import {
  mergeGeneratedSuggestions,
  type ChatSuggestion,
  type SuggestionDirection,
  type SuggestionIntent,
  type SuggestionSignal,
  type SuggestionSlot,
} from "@/lib/chatSuggestions";
import { getNpcById } from "@/onboarding/npcLibrary";
import { useHouseState } from "@/hooks/useHouseState";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { postChat, postChoice, type ChatRequest } from "@/lib/api";

type TabKey = "house" | "relationships" | "me";
type Picked = Record<string, Choice["key"]>;
export type ChatLogEntry = { name: string; label: string; say: string; reply: string };

const STORY_KEY = "house-story-progress-day04";

type StoryProgress = { index: number; done: boolean };

function loadProgress(): StoryProgress {
  if (typeof window === "undefined") return { index: 0, done: false };
  try {
    const raw = window.localStorage.getItem(STORY_KEY);
    if (!raw) return { index: 0, done: false };
    const p = JSON.parse(raw) as StoryProgress;
    return { index: Math.min(p.index ?? 0, storySequence.length - 1), done: !!p.done };
  } catch {
    return { index: 0, done: false };
  }
}

export function HouseApp() {
  const [tab, setTab] = useState<TabKey>("house");
  const [openScene, setOpenScene] = useState<Scene | null>(null);
  const [picked, setPicked] = useState<Picked>({});
  const [chatLog, setChatLog] = useState<ChatLogEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [progress, setProgress] = useState<StoryProgress>({ index: 0, done: false });
  const [inRoom, setInRoom] = useState(false);
  const [dayEndSeen, setDayEndSeen] = useState(false);
  /** 当天 3 事件已播完（EventFlow onDayFinished 已触发，等待进入房间/次日） */
  const [eventDayDone, setEventDayDone] = useState(false);
  /** 从小屋事件卡片进入时，仅查看这一件；结束或返回后回到小屋。 */
  const [singleEventIndex, setSingleEventIndex] = useState<number | null>(null);
  /** 结局档案是否展示（phase==="finale" 时自动打开） */
  const [finaleOpen, setFinaleOpen] = useState(false);

  const houseState = useHouseState();
  const island = useIslandStore();
  const [dynamicResults, setDynamicResults] = useState<Record<string, { resultText: string }>>({});
  const [loadingSceneId, setLoadingSceneId] = useState<string | null>(null);
  // 后端 scene 覆盖：拉 /api/scenes/:id 拿新 dialogue/choices，key = scene id
  const [backendScenes, setBackendScenes] = useState<
    Record<
      string,
      {
        dialogue: { who: string; line: string }[];
        question: string;
        choices: { key: "A" | "B" | "C"; label: string }[];
      }
    >
  >({});

  useEffect(() => {
    (async () => {
      const ids = ["kitchen", "living", "balcony"];
      const next: Record<
        string,
        {
          dialogue: { who: string; line: string }[];
          question: string;
          choices: { key: "A" | "B" | "C"; label: string }[];
        }
      > = {};
      for (const id of ids) {
        try {
          const res = await fetch(`/api/scenes/${id}`);
          if (res.ok) {
            const s = await res.json();
            next[id] = { dialogue: s.dialogue, question: s.question, choices: s.choices };
          }
        } catch {
          /* backend 未启动就用 house.ts */
        }
      }
      setBackendScenes(next);
    })();
  }, []);

  useEffect(() => {
    setProgress(loadProgress());
    setHydrated(true);
  }, []);

  // 挂载时把 onboarding 名单接进 island store（幂等：名单一致时什么都不做）
  useEffect(() => {
    useIslandStore.getState().initFromOnboarding();
  }, []);

  // finale 时自动展示结局档案（覆盖：Day 7 事件播完 / 刷新后恢复 finale 状态）
  useEffect(() => {
    if (island.phase === "finale") setFinaleOpen(true);
  }, [island.phase]);

  const saveProgress = (p: StoryProgress) => {
    setProgress(p);
    try {
      window.localStorage.setItem(STORY_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };

  const handlePick = async (id: string, k: Choice["key"]) => {
    setPicked((p) => ({ ...p, [id]: k }));
    setLoadingSceneId(id);
    try {
      const scene = scenes.find((s) => s.id === id);
      if (!scene) throw new Error("scene not found");
      const chosenChoice = scene.choices.find((c) => c.key === k);
      if (!chosenChoice) throw new Error("choice not found");

      const res = await postChoice({
        sceneId: id,
        choiceKey: k,
        worldState: {
          relationships: houseState.relationships,
          recentHistory: houseState.history,
        },
      });
      setDynamicResults((prev) => ({ ...prev, [id]: { resultText: res.resultText } }));
      houseState.applyEffects(res.effects);
      houseState.pushHistory({
        time: scene.time,
        place: scene.place,
        summary: `选了 ${k}（${chosenChoice.label}）`,
      });
    } catch (err) {
      console.error("[choice] failed:", err);
      setDynamicResults((prev) => ({
        ...prev,
        [id]: { resultText: "（剧情判定失败，请重试）" },
      }));
    } finally {
      setLoadingSceneId(null);
    }
  };

  const hasIslandData = island.npcIds.length > 0;
  // 事件流播放中：island 七日主线（phase day_loop + 当天 3 事件未播完）；
  // 无 island 数据时回退旧 StoryFlow（progress.done 控制回退完成态）
  const inStory =
    hydrated &&
    tab === "house" &&
    island.phase === "day_loop" &&
    !inRoom &&
    (singleEventIndex !== null || !eventDayDone) &&
    (hasIslandData || !progress.done);
  const pageKey = [
    tab,
    openScene?.id ?? "home",
    inStory ? "event" : inRoom ? "room" : "house",
    island.day,
    island.eventIndex,
    progress.index,
  ].join(":");
  useScrollToTop(pageKey);
  // 公共事件结束后会先回到自由小屋。只有当天与 3 位不同嘉宾
  // 完成私聊后，才进入回房复盘阶段；重复聊同一人不重复计数。
  const talkedCount = new Set(chatLog.map((entry) => entry.name)).size;
  const showDayEnd =
    tab === "house" &&
    island.phase === "day_loop" &&
    !inRoom &&
    !dayEndSeen &&
    eventDayDone &&
    talkedCount >= 3;

  // Day 7 三件事播完时 store.phase 已被 EventFlow 切为 "finale" → 直接进结局页；
  // 1-6 天 → 先回自由小屋，完成 3 位不同嘉宾的私聊后再弹 DayEnd overlay。
  const handleDayFinished = () => {
    if (useIslandStore.getState().phase === "finale") {
      setFinaleOpen(true);
    } else {
      setEventDayDone(true);
      setDayEndSeen(false);
    }
  };

  // 离开房间 → 进下一天：advanceDay 重置 eventIndex=0，自动进入次日事件流
  const handleRoomLeave = () => {
    useIslandStore.getState().advanceDay();
    setChatLog([]);
    setDayEndSeen(false);
    setEventDayDone(false);
    setInRoom(false);
  };

  // 重看今天的三件事：回到当天第一个事件
  const handleReplayDay = () => {
    setSingleEventIndex(null);
    useIslandStore.setState({ eventIndex: 0 });
    setEventDayDone(false);
    setDayEndSeen(false);
  };

  // 从小屋卡片重看当天指定事件；结算层按事件 id 幂等处理，不会重复累加数值。
  const handleReplayEvent = (index: number) => {
    const nextIndex = Math.max(0, Math.min(2, index));
    useIslandStore.setState({ eventIndex: nextIndex });
    setSingleEventIndex(nextIndex);
    setDayEndSeen(false);
  };

  const handleSingleEventExit = () => {
    setSingleEventIndex(null);
    setEventDayDone(true);
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className={inStory ? "flex-1" : "flex-1 pb-24"}>
        {tab === "house" &&
          (inStory ? (
            hasIslandData ? (
              <EventFlow
                onDayFinished={handleDayFinished}
                singleEvent={singleEventIndex !== null}
                onSingleEventExit={handleSingleEventExit}
              />
            ) : (
              // 回退：island 未初始化时走旧 StoryFlow 主线
              <StoryFlow
                startIndex={progress.index}
                picked={picked}
                onPick={handlePick}
                onStep={(i) => saveProgress({ index: i, done: false })}
                onFinish={() => saveProgress({ index: storySequence.length - 1, done: true })}
                dynamicResults={dynamicResults}
                loadingSceneId={loadingSceneId}
                backendScenes={backendScenes}
              />
            )
          ) : inRoom ? (
            <RoomNight onLeave={handleRoomLeave} />
          ) : (
            <HouseContent
              openScene={openScene}
              picked={picked}
              chatLog={chatLog}
              onLog={(e) => setChatLog((l) => [...l, e])}
              onOpen={(s) => setOpenScene(s)}
              onPick={handlePick}
              onBack={() => setOpenScene(null)}
              onReplay={handleReplayDay}
              onReplayEvent={handleReplayEvent}
              canEnterRoom={island.phase === "day_loop" && eventDayDone && talkedCount >= 3}
              onEnterRoom={() => {
                setOpenScene(null);
                setInRoom(true);
              }}
              onOpenFinale={() => setFinaleOpen(true)}
              dynamicResults={dynamicResults}
              loadingSceneId={loadingSceneId}
              backendScenes={backendScenes}
            />
          ))}
        {tab === "relationships" && <RelationshipsView />}
        {tab === "me" && <MeView />}
      </div>
      {!inStory && <TabBar active={tab} onChange={setTab} />}

      {showDayEnd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 px-8 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl glass-card p-6 text-center">
            <p className="text-[11px] tracking-[0.3em] text-muted-foreground">23:00</p>
            <h2 className="mt-3 text-lg font-medium">今天结束了</h2>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              今天的三件事已经发生完。
              <br />
              灯一盏盏灭掉，回到自己的房间，把今天收个尾。
            </p>
            <ul className="mt-4 space-y-1.5 text-left text-xs text-muted-foreground">
              <li>· 发送心动短信</li>
              <li>· 玩心动小游戏增加心动值</li>
              <li>· 复盘思考</li>
            </ul>
            <button
              onClick={() => {
                setDayEndSeen(true);
                setOpenScene(null);
                setInRoom(true);
              }}
              className="mt-6 w-full rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
            >
              回到自己的房间
            </button>
            <button
              onClick={() => setDayEndSeen(true)}
              className="mt-2 w-full py-2 text-xs text-muted-foreground"
            >
              再在小屋待一会儿
            </button>
          </div>
        </div>
      )}

      {finaleOpen && <FinaleReport onClose={() => setFinaleOpen(false)} />}
    </div>
  );
}

/** 主线：三件事依次播放，中间用文字淡入淡出过渡，播完自动进入自由小屋 */
function StoryFlow({
  startIndex,
  picked,
  onPick,
  onStep,
  onFinish,
  dynamicResults,
  loadingSceneId,
  backendScenes,
}: {
  startIndex: number;
  picked: Picked;
  onPick: (id: string, k: Choice["key"]) => void;
  onStep: (i: number) => void;
  onFinish: () => void;
  dynamicResults: Record<string, { resultText: string }>;
  loadingSceneId: string | null;
  backendScenes: Record<
    string,
    {
      dialogue: { who: string; line: string }[];
      question: string;
      choices: { key: "A" | "B" | "C"; label: string }[];
    }
  >;
}) {
  const [index, setIndex] = useState(startIndex);
  const [transition, setTransition] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const scene = scenes.find((s) => s.id === storySequence[index]);
  const mergedScene: Scene | undefined =
    scene && backendScenes[scene.id]
      ? {
          ...scene,
          dialogue: backendScenes[scene.id]!.dialogue,
          question: backendScenes[scene.id]!.question,
          choices: backendScenes[scene.id]!.choices.map((c) => ({ ...c, result: "", effects: [] })),
        }
      : scene;

  const next = () => {
    const text = storyTransitions[index] ?? "……";
    setTransition(text);
    window.setTimeout(() => {
      if (index >= storySequence.length - 1) {
        setTransition(null);
        setEnding(true);
      } else {
        const n = index + 1;
        setIndex(n);
        onStep(n);
        setTransition(null);
      }
    }, 2200);
  };

  if (ending) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-8 animate-fade-in">
        <div className="text-center">
          <p className="text-xs tracking-[0.3em] text-muted-foreground">22:30</p>
          <h2 className="mt-4 text-xl font-medium leading-relaxed text-foreground">
            小屋安静下来了
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            今天的三件事已经发生完。
            <br />
            现在你可以主动找想私聊的同学聊聊天。
          </p>
          <button
            onClick={onFinish}
            className="mt-8 w-full rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            回到小屋
          </button>
        </div>
      </div>
    );
  }

  if (!mergedScene) return null;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 z-10 px-5 pt-3">
        <div className="flex items-center justify-center gap-1.5">
          {storySequence.map((id, i) => (
            <span
              key={id}
              className={`h-1 w-8 rounded-full transition-colors ${
                i <= index ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      <SceneView
        scene={mergedScene}
        picked={picked[mergedScene.id]}
        onPick={(k) => onPick(mergedScene.id, k)}
        onBack={next}
        storyMode
        dynamicResult={dynamicResults[mergedScene.id]}
        loading={loadingSceneId === mergedScene.id}
      />

      {transition && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background animate-fade-in">
          <p className="animate-fade-in text-lg tracking-[0.3em] text-muted-foreground">
            {transition}
          </p>
        </div>
      )}
    </div>
  );
}

function HouseContent({
  openScene,
  picked,
  chatLog,
  onLog,
  onOpen,
  onPick,
  onBack,
  onReplay,
  onReplayEvent,
  canEnterRoom,
  onEnterRoom,
  onOpenFinale,
  dynamicResults,
  loadingSceneId,
  backendScenes,
}: {
  openScene: Scene | null;
  picked: Picked;
  chatLog: ChatLogEntry[];
  onLog: (e: ChatLogEntry) => void;
  onOpen: (s: Scene) => void;
  onPick: (id: string, k: Choice["key"]) => void;
  onBack: () => void;
  onReplay: () => void;
  onReplayEvent: (index: number) => void;
  canEnterRoom: boolean;
  onEnterRoom: () => void;
  onOpenFinale: () => void;
  dynamicResults: Record<string, { resultText: string }>;
  loadingSceneId: string | null;
  backendScenes: Record<
    string,
    {
      dialogue: { who: string; line: string }[];
      question: string;
      choices: { key: "A" | "B" | "C"; label: string }[];
    }
  >;
}) {
  if (openScene) {
    const merged: Scene = backendScenes[openScene.id]
      ? {
          ...openScene,
          dialogue: backendScenes[openScene.id]!.dialogue,
          question: backendScenes[openScene.id]!.question,
          choices: backendScenes[openScene.id]!.choices.map((c) => ({
            ...c,
            result: "",
            effects: [],
          })),
        }
      : openScene;
    return (
      <SceneView
        scene={merged}
        picked={picked[merged.id]}
        onPick={(k) => onPick(merged.id, k)}
        onBack={onBack}
        dynamicResult={dynamicResults[merged.id]}
        loading={loadingSceneId === merged.id}
      />
    );
  }

  return (
    <HomeView
      chatLog={chatLog}
      onLog={onLog}
      onOpen={onOpen}
      onReplay={onReplay}
      onReplayEvent={onReplayEvent}
      canEnterRoom={canEnterRoom}
      onEnterRoom={onEnterRoom}
      onOpenFinale={onOpenFinale}
    />
  );
}

const ROOMS = ["客厅", "厨房", "阳台"] as const;

function eventImageFor(day: number) {
  return getDaySceneImage(day);
}

function compactChatText(text: string, maxLength = 44) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function summarizeChatsByMember(chatLog: ChatLogEntry[]) {
  const summaries = new Map<
    string,
    { name: string; labels: string[]; rounds: number; firstSay: string; lastReply: string }
  >();

  chatLog.forEach((entry) => {
    const current = summaries.get(entry.name);
    if (!current) {
      summaries.set(entry.name, {
        name: entry.name,
        labels: [entry.label],
        rounds: 1,
        firstSay: entry.say,
        lastReply: entry.reply,
      });
      return;
    }

    current.rounds += 1;
    current.lastReply = entry.reply;
    if (!current.labels.includes(entry.label)) current.labels.push(entry.label);
  });

  return Array.from(summaries.values());
}

function HomeView({
  chatLog,
  onLog,
  onOpen,
  onReplay,
  onReplayEvent,
  canEnterRoom,
  onEnterRoom,
  onOpenFinale,
}: {
  chatLog: ChatLogEntry[];
  onLog: (e: ChatLogEntry) => void;
  onOpen: (s: Scene) => void;
  onReplay: () => void;
  onReplayEvent: (index: number) => void;
  canEnterRoom: boolean;
  onEnterRoom: () => void;
  onOpenFinale: () => void;
}) {
  const hero = scenes[1]!;
  const day = useIslandStore((s) => s.day);
  const appliedSignalIds = useIslandStore((s) => s.appliedSignalIds);
  const islandNpcs = useGameStore((s) => s.islandNpcs);
  const competitors = useGameStore((s) => s.competitors);
  const playerProfile = useGameStore((s) => s.playerProfile);
  const todayEvents = getDay(day)?.events ?? [];
  const chatSummaries = summarizeChatsByMember(chatLog);
  const [who, setWho] = useState<Member | null>(null);
  const [chatWith, setChatWith] = useState<{ member: Member; sessionId: string } | null>(null);
  const onboardingRoster = [...islandNpcs, ...competitors];
  const hasOnboardingRoster = onboardingRoster.length > 0;
  const houseMembers: Member[] = hasOnboardingRoster
    ? onboardingRoster.map((storedNpc, index) => {
        const npc = getNpcById(storedNpc.id) ?? storedNpc;
        return {
          id: npc.id,
          name: npc.name,
          gender: npc.gender === "male" ? "m" : "f",
          where: `在${ROOMS[index % ROOMS.length]}`,
          top: "",
          left: "",
          ...(npc.avatar ? { avatar: npc.avatar } : {}),
        };
      })
    : members;
  const inferredPlayerGender =
    playerProfile?.gender ??
    competitors[0]?.gender ??
    (islandNpcs[0] ? (islandNpcs[0].gender === "male" ? "female" : "male") : null);
  const genderCounts = houseMembers.reduce(
    (counts, member) => {
      counts[member.gender] += 1;
      return counts;
    },
    { m: 0, f: 0 },
  );
  if (hasOnboardingRoster && inferredPlayerGender) {
    genderCounts[inferredPlayerGender === "male" ? "m" : "f"] += 1;
  }

  return (
    <div>
      <header className="px-5 pt-8 text-center">
        <h1 className="text-3xl font-semibold tracking-[0.3em] text-primary">小屋</h1>
        <p className="mt-2 text-sm text-muted-foreground">今天的小屋生活</p>
      </header>

      <section className="relative mt-5 overflow-hidden rounded-3xl mx-4 shadow-glow">
        <img
          src={hero.image}
          alt="小屋客厅的夜晚，成员们围坐聊天"
          width={1024}
          height={1280}
          className="h-[300px] w-full object-cover"
        />
        <div className="absolute inset-0 bg-night-fade" />

        <div className="absolute inset-x-0 top-5 text-center">
          <p className="text-2xl font-semibold text-foreground drop-shadow">
            Day {String(day).padStart(2, "0")}
          </p>
          <p className="mt-1 text-sm text-foreground/80">20:37 🌙</p>
        </div>

        {hotspots.map((h) => {
          const s = scenes.find((x) => x.id === h.sceneId);
          if (!s) return null;
          return (
            <button
              key={h.sceneId}
              onClick={() => onOpen(s)}
              style={{ top: h.top, left: h.left }}
              className="absolute inline-flex items-center gap-2 rounded-full glass-card px-3 py-1.5 text-xs text-foreground transition-transform hover:scale-105 active:scale-95"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              {h.label}
            </button>
          );
        })}
      </section>

      <JourneyTimeline onOpenFinale={onOpenFinale} />

      {/* 成员名单：按房间分组，图外展示 */}
      <section className="mt-4 px-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">此刻他们在哪</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">每天可以和三个人发起私聊</p>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {genderCounts.m} 男 · {genderCounts.f} 女
          </span>
        </div>
        <div className="mt-3 space-y-2.5">
          {ROOMS.map((room) => {
            const list = houseMembers.filter((m) => m.where.slice(1) === room);
            return (
              <div key={room} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-[11px] text-muted-foreground">{room}</span>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => setWho(m)}
                      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] transition-colors ${
                        m.gender === "m"
                          ? "border-male/40 text-male hover:bg-male/10"
                          : "border-female/40 text-female hover:bg-female/10"
                      }`}
                    >
                      {m.avatar ? (
                        <img
                          src={m.avatar}
                          alt=""
                          loading="lazy"
                          width={24}
                          height={24}
                          className="size-6 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid size-6 place-items-center rounded-full bg-secondary/80 text-[10px]">
                          {m.name[0]}
                        </span>
                      )}
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 三件事 */}
      <section className="mt-6 px-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">今天发生了</h2>
        </div>

        <h3 className="mt-3 text-sm font-medium text-accent">三件事</h3>
        <ul className="mt-2 space-y-3">
          {todayEvents.map((event, index) => (
            <li key={event.id}>
              <button
                onClick={() => onReplayEvent(index)}
                className="flex w-full items-center gap-3 rounded-2xl glass-card p-3 text-left transition-colors hover:bg-secondary/60"
              >
                <img
                  src={eventImageFor(day)}
                  alt={event.title}
                  loading="lazy"
                  width={1024}
                  height={1280}
                  className="size-14 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {event.location} · {event.timeLabel}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] text-accent">
                  {event.kind === "decision" ? "选择事件" : "剧情事件"}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>

        <h3 className="mt-6 text-sm font-medium text-accent">发生的私聊记录</h3>
        {chatSummaries.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
            还没有私聊。点上面的名字，去和 TA 说句话。
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {chatSummaries.map((summary) => {
              const chatGender = houseMembers.find(
                (member) => member.name === summary.name,
              )?.gender;
              const chatTone =
                chatGender === "m"
                  ? "text-male"
                  : chatGender === "f"
                    ? "text-female"
                    : "text-muted-foreground";
              return (
                <li key={summary.name} className="rounded-2xl glass-card p-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${chatTone}`}>你 × {summary.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {summary.rounds} 轮私聊
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    你们聊到{summary.labels.join("、")}。你从「
                    {compactChatText(summary.firstSay)}」说起，
                    {summary.name}最后回应：「{compactChatText(summary.lastReply)}」
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6 px-5">
        <div className="rounded-2xl glass-card p-4">
          <p className="text-xs tracking-widest text-accent">约会</p>
          <p className="mt-1 text-sm font-medium">{dateCard.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{dateCard.time}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{dateCard.desc}</p>
        </div>
      </section>

      <div className="space-y-2 px-5 pt-6">
        {canEnterRoom && (
          <button
            onClick={onEnterRoom}
            className="w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            回到自己的房间
          </button>
        )}
        <button
          onClick={onReplay}
          className="w-full rounded-full border border-border py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60"
        >
          重看今天的三件事
        </button>
      </div>

      <p className="px-5 py-6 text-center text-[11px] text-muted-foreground">
        自由活动中 · 可以私聊、逛小屋
      </p>

      {who && !chatWith && (
        <MemberSheet
          member={who}
          onClose={() => setWho(null)}
          onOpen={onOpen}
          onChat={() => {
            const npcKey = who.id ?? who.name;
            const prefix = `private-chat:d${day}:${npcKey}:`;
            const nextSession =
              appliedSignalIds.filter((signalId) => signalId.startsWith(prefix)).length + 1;
            setChatWith({ member: who, sessionId: `${prefix}s${nextSession}` });
          }}
        />
      )}
      {chatWith && (
        <ChatSheet
          member={chatWith.member}
          chatSessionId={chatWith.sessionId}
          onLog={onLog}
          onClose={() => {
            setChatWith(null);
            setWho(null);
          }}
        />
      )}
    </div>
  );
}

function MemberSheet({
  member,
  onClose,
  onOpen,
  onChat,
}: {
  member: Member;
  onClose: () => void;
  onOpen: (s: Scene) => void;
  onChat: () => void;
}) {
  const room = member.where.slice(1);
  const scene = scenes.find((s) => s.place === room);
  const aff = affinities.find((a) => a.name === member.name);
  const rel = aff
    ? { desc: aff.status, meta: aff.moments[aff.moments.length - 1]?.text ?? "", value: aff.value }
    : undefined;
  const tone = member.gender === "m" ? "text-male" : "text-female";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/70 backdrop-blur-sm">
      <button className="absolute inset-0" aria-label="关闭" onClick={onClose} />
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card p-5 pb-28">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center gap-3">
          {member.avatar ? (
            <img
              src={member.avatar}
              alt={member.name}
              className="size-14 rounded-full object-cover"
            />
          ) : (
            <span
              className={`grid size-14 place-items-center rounded-full bg-secondary text-lg ${tone}`}
            >
              {member.name[0]}
            </span>
          )}
          <div>
            <p className={`text-lg font-semibold ${tone}`}>{member.name}</p>
            <p className="text-xs text-muted-foreground">
              {member.where} · {member.gender === "m" ? "男生" : "女生"}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-secondary/50 p-3">
          <p className="text-[11px] text-muted-foreground">今日互动</p>
          <p className="mt-1 text-sm">{rel ? rel.desc : "你今天还没有和 TA 说过话"}</p>
          {rel && <p className="mt-1 text-[11px] text-muted-foreground">{rel.meta}</p>}
        </div>

        {rel && (
          <div className="mt-3 flex items-center gap-2">
            <Heart className="size-4 text-primary" />
            <span className="text-sm">心动值 {rel.value}</span>
          </div>
        )}

        <button
          onClick={onChat}
          className="mt-5 w-full rounded-full bg-romance py-3 text-sm font-semibold text-primary-foreground"
        >
          <span className="inline-flex items-center gap-2">
            <MessageCircle className="size-4" /> 和 {member.name} 发起对话
          </span>
        </button>

        {scene && (
          <button
            onClick={() => {
              onClose();
              onOpen(scene);
            }}
            className="mt-2 w-full rounded-full border border-border py-3 text-sm text-foreground"
          >
            查看 TA 所在的事件 · {scene.title}
          </button>
        )}
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-full border border-border py-3 text-sm text-muted-foreground"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

type ChatMsg = { from: "me" | "ta"; text: string };

/** 一轮「三个选项」的完整快照：本地确定性 slot 与合并后的展示文案（含客户端兜底）。 */
type SuggestionGeneration = {
  slots: SuggestionSlot[];
  suggestions: ChatSuggestion[];
};

/** 自由输入在服务端不可用时的 NPC 兜底回复（沿用历史文案）。 */
const FREE_INPUT_FALLBACK_REPLY = "我听见了。只是这句话，我想再想一会儿。";

/** 自由输入结算用的保守信号（spec §6.1：free_chat / neutral / strength 1 / chat）。 */
const FREE_INPUT_SIGNAL: SuggestionSignal = {
  intent: "free_chat",
  valence: "neutral",
  strength: 1,
  memoryTag: "chat",
};

/** fetch 是否被 AbortController 取消（竞态保护用：取消不算失败，不触发兜底回退）。 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** 旧名单分支（成员没有 NPC id → 读不到状态卡，chatChoiceContext 为空）的静态 slot 元数据。 */
const STATIC_SLOT_META: Record<
  string,
  { direction: SuggestionDirection; intent: SuggestionIntent; guidance: string }
> = {
  greet: {
    direction: "continue",
    intent: "greet",
    guidance: "承接开场：先回应 NPC 刚打的招呼、自然说明来意；不要引用记忆、不要追问私事。",
  },
  today: {
    direction: "express",
    intent: "check_in",
    guidance: "表达关心：温和地问问 NPC 今天的感受，语气真诚克制；不替玩家承诺或替他表态。",
  },
  invite: {
    direction: "advance",
    intent: "playful_shift",
    guidance: "轻松推进：自然地把话题引向明天的安排，带一点期待但不施压；不替玩家承诺。",
  },
};

/**
 * 无 NPC 上下文的静态兜底 slot：文案沿用 house.ts 的兜底话题与逐人回复（replyOf），
 * 保证旧名单成员也能走同一条「兜底文案 → 动态刷新」链路而不依赖状态卡。
 */
function staticFallbackSlotsFor(name: string): SuggestionSlot[] {
  return fallbackChatTopics.slice(0, 3).map((topic) => {
    const meta = STATIC_SLOT_META[topic.key];
    return {
      slotId: `static_${topic.key}`,
      direction: meta?.direction ?? "continue",
      intent: meta?.intent ?? "get_to_know",
      guidance:
        meta?.guidance ?? "推进话题：顺着刚才的话自然地把话题聊下去；不要引用记忆、不要泄露数值。",
      fallbackLabel: topic.label,
      fallbackText: topic.say,
      fallbackReply: replyOf(topic, name),
      signal: { intent: "chat", valence: "neutral", strength: 1, memoryTag: "chat" },
    };
  });
}

function ChatSheet({
  member,
  chatSessionId,
  onClose,
  onLog,
}: {
  member: Member;
  chatSessionId: string;
  onClose: () => void;
  onLog: (e: ChatLogEntry) => void;
}) {
  const day = useIslandStore((state) => state.day);
  const npcStateCards = useIslandStore((state) => state.npcStateCards);
  const worldFacts = useIslandStore((state) => state.worldFacts);
  const applyInteractionSignal = useIslandStore((state) => state.applyInteractionSignal);
  const playerName = useGameStore((state) => state.playerProfile?.name);
  const tone = member.gender === "m" ? "text-male" : "text-female";
  const maxRounds = 20;
  // 聊天区消息：初始为 NPC 开场白；发给服务端的 history 不含刚追加的玩家消息（走 userMessage）。
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { from: "ta", text: `（${member.where}）嗯？你怎么过来了。` },
  ]);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [rounds, setRounds] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const chatChoiceContext = member.id
    ? getNpcOutputContext({ npcStateCards, worldFacts, day }, member.id, "chat_choices")
    : null;
  const chatContentContext = member.id
    ? getNpcOutputContext({ npcStateCards, worldFacts, day }, member.id, "chat_content")
    : null;

  // §10.3 竞态保护：单调递增的 requestId + AbortController。
  // 新请求先作废旧请求；响应回来时 requestId 不是最新的一律丢弃；卸载时 abort。
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  /** 以最新 NPC 上下文与对话规划下一轮三个 slot；成员无上下文（旧名单）时用静态兜底。 */
  const planFor = (recent: readonly ChatMsg[]): SuggestionSlot[] =>
    chatChoiceContext
      ? planChatSuggestionSlots(chatChoiceContext, recent)
      : staticFallbackSlotsFor(member.name);

  // §10.1.1：首帧就用本地 slot fallback 渲染三个可点选项，不等网络。
  const [optionGen, setOptionGen] = useState<SuggestionGeneration>(() => {
    const initialMsgs: ChatMsg[] = [{ from: "ta", text: `（${member.where}）嗯？你怎么过来了。` }];
    const slots = planFor(initialMsgs);
    return { slots, suggestions: mergeGeneratedSuggestions(slots, []) };
  });

  /** 组装 /api/chat 请求体：history 为不含刚追加玩家消息的对话，slots 只上 wire 字段。 */
  const chatRequestBody = (
    history: readonly ChatMsg[],
    slots: readonly SuggestionSlot[],
    userMessage?: string,
  ): ChatRequest => ({
    member: {
      ...(member.id ? { id: member.id } : {}),
      name: member.name,
      where: member.where,
      gender: member.gender,
    },
    history: [...history],
    ...(userMessage !== undefined ? { userMessage } : {}),
    context: {
      day,
      ...(playerName ? { playerName } : {}),
      ...(chatContentContext ? { npcContext: chatContentContext.llm.promptText } : {}),
    },
    slots: slots.map(({ slotId, direction, guidance, fallbackLabel, fallbackText }) => ({
      slotId,
      direction,
      guidance,
      fallbackLabel,
      fallbackText,
    })),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // §10.3：关闭面板 / 切换 NPC（卸载）时取消在途请求，避免过期 setState。
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  // §10.1.2-3：挂载时发一次开场请求（不带 userMessage → 只生成选项）。
  // 成功后若会话仍是当前代（期间玩家未行动），用服务端文案整组原子替换本地兜底选项；
  // 失败则保留兜底选项。严格模式重挂载的第一发已被上面 cleanup 的 abort 作废。
  useEffect(() => {
    if (!chatChoiceContext) return; // 无 NPC 上下文：不做开场刷新，保留静态兜底选项
    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void (async () => {
      try {
        const result = await postChat({
          ...chatRequestBody(msgs, planFor(msgs)),
          signal: controller.signal,
        });
        if (requestIdRef.current !== requestId) return; // 玩家已行动 / 已切换会话：丢弃过期结果
        setOptionGen((current) => ({
          slots: current.slots,
          suggestions: mergeGeneratedSuggestions(current.slots, result.suggestions ?? []),
        }));
      } catch (error) {
        // 被更新的请求或卸载取消时静默；网络失败时本地兜底选项本就可用，无需回退动作。
        if (!isAbortError(error)) {
          console.warn("[chat] 开场选项刷新失败，保留本地兜底", error);
        }
      }
    })();
    // 开场请求只在挂载时发一次：下方依赖数组刻意留空，只取挂载瞬间的会话上下文
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 发送一轮：点击选项或自由输入。把玩家消息追加进聊天区后，用最新对话规划下一轮
   * slots，一次 postChat 同时拿 NPC 回复与下一轮三个选项（§10.2）。
   * 服务端不可用时按本 slot 的 fallbackReply（自由输入用通用兜底）回复并退回本地选项，
   * 会话不中断（§2.2：断网仍可聊满 20 轮）。
   */
  const send = async (
    text: string,
    label: string,
    fallbackReply: string,
    signalMeta: SuggestionSignal,
  ) => {
    const message = text.trim();
    if (sending || rounds >= maxRounds || !message) return;

    const appended: ChatMsg[] = [...msgs, { from: "me", text: message }];
    setMsgs(appended);
    setDraft("");
    setSending(true);

    // §10.3：新请求作废在途旧请求（如开场请求），本轮以「追加后的对话」规划下一轮 slots。
    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const nextSlots = planFor(appended);

    let npcReply = fallbackReply;
    let nextSuggestions = mergeGeneratedSuggestions(nextSlots, []); // 失败时退回本地 fallback 文案
    try {
      const result = await postChat({
        ...chatRequestBody(msgs, nextSlots, message), // history 用未追加的 msgs，玩家消息走 userMessage
        signal: controller.signal,
      });
      if (requestIdRef.current !== requestId) return; // 过期响应：更新的请求 / 卸载已接管
      // 服务端 200（含 mode:"fallback" 降级）视为成功：用服务端 reply（存在时）+ 文案选项；
      // reply 缺失时退回本 slot 的本地兜底回复。
      npcReply = result.reply && result.reply.trim() !== "" ? result.reply : fallbackReply;
      nextSuggestions = mergeGeneratedSuggestions(nextSlots, result.suggestions ?? []);
    } catch (error) {
      if (isAbortError(error)) return; // 被更新的请求或卸载取消：不触碰任何状态
      if (requestIdRef.current !== requestId) return; // 双保险
      console.warn("[chat] 豆包不可用，使用本地兜底回复", error);
    }

    // 收尾在同一批次完成：追加 NPC 回复 + 整组替换下一轮三个选项（§10.2.4 / §10.3 原子替换）。
    setMsgs((current) => [...current, { from: "ta", text: npcReply }]);
    setOptionGen({ slots: nextSlots, suggestions: nextSuggestions });

    // §11 关系结算：用被点击 slot 的本地 signal（自由输入用保守映射），幂等 id 沿用历史格式。
    if (member.id) {
      const roundNumber = rounds + 1;
      const memory =
        rounds === 0
          ? {
              tag: signalMeta.memoryTag,
              text: `玩家在私聊中和我聊到「${compactChatText(message, 72)}」`,
              visibility: "private" as const,
            }
          : undefined;
      const result = applyInteractionSignal({
        id: `${chatSessionId}:r${roundNumber}`,
        source: "private_chat",
        day,
        targetNpcId: member.id,
        intent: signalMeta.intent,
        valence: signalMeta.valence,
        strength: signalMeta.strength,
        visibility: "private",
        ...(memory ? { memory } : {}),
        provenance: { chatSessionId },
      });
      if (result.status === "invalid") {
        console.warn("[chat] 私聊信号未写入", result.error);
      }
    }
    onLog({ name: member.name, label, say: message, reply: npcReply });
    setRounds((value) => value + 1);
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm">
      <button className="absolute inset-0" aria-label="关闭" onClick={onClose} />
      <div className="relative mx-auto flex h-[80vh] w-full max-w-md flex-col rounded-t-3xl border-t border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
          {member.avatar ? (
            <img
              src={member.avatar}
              alt={member.name}
              className="size-9 rounded-full object-cover"
            />
          ) : (
            <span
              className={`grid size-9 place-items-center rounded-full bg-secondary text-sm ${tone}`}
            >
              {member.name[0]}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${tone}`}>{member.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {member.where} · 第 {rounds}/{maxRounds} 轮
            </p>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground">
            结束
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`flex items-end gap-2 ${m.from === "me" ? "justify-end" : "justify-start"}`}
            >
              {m.from === "ta" &&
                (member.avatar ? (
                  <img
                    src={member.avatar}
                    alt=""
                    width={28}
                    height={28}
                    className="size-7 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] ${tone}`}
                  >
                    {member.name[0]}
                  </span>
                ))}
              <p
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.from === "me"
                    ? "bg-romance text-primary-foreground"
                    : "bg-secondary text-foreground"
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="space-y-2 border-t border-border/60 px-5 pb-8 pt-3">
          {rounds >= maxRounds ? (
            <p className="py-3 text-center text-[11px] text-muted-foreground">
              今天和 {member.name} 已经聊了很多，明天再继续吧。
            </p>
          ) : sending ? (
            <p className="py-2 text-center text-[11px] text-muted-foreground">
              {member.name} 正在输入……
            </p>
          ) : (
            <>
              {/* 当前轮三个选项：发送中整块被「正在输入」取代，等价于禁用；开场的动态刷新不置 sending，
                  因此刷新期间的本地兜底选项保持可点（§10.3）。 */}
              {optionGen.suggestions.map((suggestion) => {
                const slot = optionGen.slots.find((item) => item.slotId === suggestion.slotId);
                return (
                  <button
                    key={suggestion.id}
                    onClick={() =>
                      send(
                        suggestion.text,
                        suggestion.label,
                        slot?.fallbackReply ?? FREE_INPUT_FALLBACK_REPLY,
                        suggestion.signal,
                      )
                    }
                    className="w-full rounded-full border border-border px-4 py-2.5 text-left text-xs transition-colors hover:bg-secondary/60"
                  >
                    {suggestion.label} · 「{suggestion.text}」
                  </button>
                );
              })}

              <form
                className="flex items-center gap-2 pt-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft, "自由输入", FREE_INPUT_FALLBACK_REPLY, FREE_INPUT_SIGNAL);
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 240))}
                  placeholder="也可以自己说点什么……"
                  maxLength={240}
                  className="min-w-0 flex-1 rounded-full border border-border bg-background/60 px-4 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="shrink-0 rounded-full bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
                >
                  发送
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneView({
  scene,
  picked,
  onPick,
  onBack,
  storyMode,
  dynamicResult,
  loading,
}: {
  scene: Scene;
  picked?: Choice["key"] | undefined;
  onPick: (k: Choice["key"]) => void;
  onBack: () => void;
  storyMode?: boolean;
  dynamicResult?: { resultText: string } | undefined;
  loading?: boolean;
}) {
  return (
    <div className="animate-fade-in">
      <div className="relative">
        <img
          src={scene.image}
          alt={scene.title}
          width={1024}
          height={1280}
          className="aspect-[4/5] w-full object-cover"
        />
        <div className="absolute inset-0 bg-night-fade" />
        <div className="absolute inset-x-0 top-6 flex items-center px-4">
          {storyMode ? (
            <span className="size-9" />
          ) : (
            <button
              onClick={onBack}
              aria-label="返回小屋"
              className="grid size-9 place-items-center rounded-full glass-card"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <p className="flex-1 text-center text-sm font-medium">
            {scene.place} · {scene.time}
          </p>
          <span className="size-9" />
        </div>

        <div className="absolute inset-x-4 bottom-4 rounded-2xl glass-card px-4 py-3">
          {scene.dialogue.map((d, i) => (
            <p key={i} className="py-0.5 text-sm text-foreground/90">
              <span className={genderOf(d.who) === "m" ? "text-male" : "text-female"}>
                {d.who}：
              </span>
              {d.line}
            </p>
          ))}
        </div>
      </div>

      {scene.observe ? (
        <div className="px-5 pt-6">
          <p className="text-xs tracking-widest text-accent">观察记录</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{scene.outcome}</p>
          <button
            onClick={() => {
              onPick(scene.choices[0]!.key);
              onBack();
            }}
            className="mt-6 w-full rounded-full bg-secondary py-3.5 text-sm font-medium transition-transform active:scale-[0.98]"
          >
            {storyMode ? "继续" : "继续观察"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {storyMode ? "时间还在往前走" : "这是观察事件，今天的选择留给核心时刻"}
          </p>
        </div>
      ) : (
        <div className="px-5 pt-6">
          <h2 className="text-lg font-semibold text-primary">{scene.question}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{scene.hint}</p>

          <div className="mt-4 space-y-3">
            {scene.choices
              .filter((c) => (dynamicResult ? picked === c.key : true))
              .map((c, i) => {
                const active = picked === c.key;

                return (
                  <button
                    key={c.key}
                    onClick={() => onPick(c.key)}
                    disabled={loading || !!dynamicResult}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                      active
                        ? "border-primary bg-secondary shadow-glow"
                        : "border-border bg-card/70 hover:bg-secondary/60"
                    } ${loading || dynamicResult ? "cursor-default" : ""} ${loading ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        active
                          ? "bg-romance text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {dynamicResult ? scene.choices.findIndex((x) => x.key === c.key) + 1 : i + 1}
                    </span>
                    <span className="text-sm">{c.label}</span>
                  </button>
                );
              })}
          </div>

          {loading && (
            <div className="mt-5 rounded-2xl glass-card p-4 text-center text-sm text-muted-foreground">
              …
            </div>
          )}
          {!loading && dynamicResult && (
            <>
              <div className="mt-5 rounded-2xl glass-card p-4">
                <p className="text-xs tracking-widest text-accent">剧情走向</p>
                <p className="mt-2 text-sm leading-relaxed">{dynamicResult.resultText}</p>
              </div>
              <button
                onClick={onBack}
                className="mt-6 w-full rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
              >
                {storyMode ? "下一件事" : "返回小屋"}
              </button>
            </>
          )}
          <div className="h-8" />
        </div>
      )}
    </div>
  );
}

/** 五档心动信号徽标样式（core/heartSignal.ts） */
const SIGNAL_META: Record<HeartSignal, { label: string; cls: string }> = {
  none: { label: "静默", cls: "border-border text-muted-foreground" },
  micro: { label: "微动", cls: "border-sky-400/40 text-sky-400" },
  crush: { label: "心动", cls: "border-romance/60 text-romance" },
  critical: { label: "暴击", cls: "border-red-400/50 text-red-400" },
  jealous: { label: "吃醋", cls: "border-amber-400/50 text-amber-400" },
};

/** 关系页：数据源 = island store（relationships + eventLog + npcIds），不显示数值 */
function RelationshipsView() {
  const island = useIslandStore();
  const { npcIds, relationships, eventLog } = island;

  // 按方向算五档信号：heartValue 取对应方向好感，moments 由 eventLog deltas 还原
  const signalOf = (npcId: string, direction: "to_npc" | "from_npc"): HeartSignal => {
    const rel = relationships[npcId];
    if (!rel) return "none";
    const moments: { delta: number }[] = [];
    for (const entry of eventLog) {
      for (const d of entry.deltas ?? []) {
        if (d.npcId === npcId && d.direction === direction) {
          moments.push({ delta: d.delta });
        }
      }
    }
    const heartValue = direction === "to_npc" ? rel.toNpc : rel.fromNpc;
    return getHeartSignal({
      heartValue,
      interactionCount: moments.length,
      moments,
      todayVotesForOthers: 0,
    });
  };

  // 按「你 → TA」好感降序展示；名单以 island store 为准
  const list = [...npcIds].sort(
    (a, b) => (relationships[b]?.toNpc ?? 0) - (relationships[a]?.toNpc ?? 0),
  );

  return (
    <div className="px-5 pt-8">
      <header className="text-center">
        <p className="text-xs tracking-widest text-accent">你的视角</p>
        <h1 className="mt-1 text-2xl font-semibold text-primary">心动观察</h1>
        <p className="mt-2 text-sm text-muted-foreground">你和 TA 们之间，走到哪一步了？</p>
      </header>

      {list.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
          名单还没生成，先完成入住吧。
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {list.map((id) => {
            const npc = getNpcById(id);
            const name = npc?.name ?? id;
            const male = npc?.gender === "male";
            const toMeta = SIGNAL_META[signalOf(id, "to_npc")];
            const fromMeta = SIGNAL_META[signalOf(id, "from_npc")];
            return (
              <div
                key={id}
                className="flex w-full items-center gap-4 rounded-2xl glass-card p-3 text-left"
              >
                {npc?.avatar ? (
                  <img
                    src={npc.avatar}
                    alt={name}
                    loading="lazy"
                    width={64}
                    height={64}
                    className="size-16 rounded-2xl object-cover"
                  />
                ) : (
                  <div
                    className={`grid size-16 shrink-0 place-items-center rounded-2xl bg-secondary text-lg font-medium ${
                      male ? "text-male" : "text-female"
                    }`}
                  >
                    {name.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-semibold ${male ? "text-male" : "text-female"}`}>
                      {name}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${toMeta.cls}`}>
                      你 → TA · {toMeta.label}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${fromMeta.cls}`}>
                      TA → 你 · {fromMeta.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="h-8" />
    </div>
  );
}

function MeView() {
  return (
    <div className="px-5 pt-8">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-[0.2em] text-primary">我的恋综档案</h1>
        <p className="mt-2 text-sm text-muted-foreground">记录你的心动旅程</p>
      </header>

      <section className="mt-6 rounded-3xl glass-card p-5">
        <div className="flex items-center gap-4">
          <img
            src={meAvatar}
            alt="你的头像"
            width={512}
            height={512}
            className="size-16 rounded-full border-2 border-card object-cover shadow"
          />
          <div className="flex-1">
            <p className="text-lg font-semibold text-primary">{profile.name}</p>
            <p className="text-xs text-muted-foreground">{profile.day}</p>
          </div>
          <div className="flex gap-3">
            <button className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground">
              <span className="text-sm">♀</span>
            </button>
            <button className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground">
              <span className="text-sm">⚙</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground">心动对象</p>
            <p className="mt-1 text-lg font-semibold text-primary">{profile.target}</p>
          </div>
          <div className="rounded-2xl bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground">心动值</p>
            <p className="mt-1 text-lg font-semibold text-primary">{profile.value}</p>
          </div>
          <div className="rounded-2xl bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground">戳心时刻</p>
            <p className="mt-1 text-lg font-semibold text-primary">{profile.moments}刻</p>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-base font-semibold">我的故事</h2>
        </div>

        <div className="relative mt-3 rounded-3xl glass-card p-5">
          <div className="absolute left-8 top-5 bottom-5 w-px bg-border" aria-hidden />

          <ul className="relative space-y-5">
            {storyTimeline.map((item, index) => (
              <li key={item.day} className="flex items-center gap-4">
                <span
                  className={`relative z-10 grid size-3 place-items-center rounded-full ${
                    index === storyTimeline.length - 1 ? "bg-romance" : "bg-border"
                  }`}
                  aria-hidden
                />
                <span className="w-12 text-xs text-muted-foreground">{item.day}</span>
                <span
                  className={`text-sm ${index === storyTimeline.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}
                >
                  {item.title}
                </span>
              </li>
            ))}
          </ul>

          <button className="mt-5 flex w-full items-center justify-center gap-1 rounded-2xl bg-secondary/70 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
            回顾全部故事
            <ChevronRight className="size-4" />
          </button>
        </div>
      </section>

      <div className="h-6" />
    </div>
  );
}

function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const items: { key: TabKey; icon: typeof Home; label: string }[] = [
    { key: "house", icon: Home, label: "小屋" },
    { key: "relationships", icon: Heart, label: "心动观察" },
    { key: "me", icon: User, label: "我的 · 沉淀故事" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-border bg-card/90 backdrop-blur">
      <ul className="flex items-stretch justify-around px-2 py-2">
        {items.map((it) => {
          const isActive = active === it.key;
          return (
            <li key={it.key}>
              <button
                onClick={() => onChange(it.key)}
                className={`flex flex-col items-center gap-1 rounded-xl py-1 px-2 text-[11px] ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <it.icon className="size-5" />
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 7 天旅程时间轴（currentDay 从 island store 读；主题文案仍用 house.ts journey） */
function JourneyTimeline({ onOpenFinale }: { onOpenFinale: () => void }) {
  const day = useIslandStore((s) => s.day);
  const [open, setOpen] = useState<number | null>(day);

  return (
    <section className="mt-5 px-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">7 天旅程</h2>
        <span className="text-[11px] text-muted-foreground">Day {day} / 7</span>
      </div>

      <div className="mt-3 flex items-center gap-1">
        {journey.map((d) => {
          const state = d.day < day ? "past" : d.day === day ? "now" : "future";
          return (
            <button
              key={d.day}
              onClick={() => setOpen(open === d.day ? null : d.day)}
              className="group flex flex-1 flex-col items-center gap-1.5"
            >
              <span className="flex w-full items-center">
                <span
                  className={`h-[2px] flex-1 ${state === "future" ? "bg-border" : "bg-primary/60"} ${
                    d.day === 1 ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`relative grid size-6 shrink-0 place-items-center rounded-full border text-[10px] transition-transform group-active:scale-95 ${
                    state === "now"
                      ? "border-primary bg-primary text-primary-foreground"
                      : state === "past"
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground"
                  } ${open === d.day ? "ring-2 ring-primary/40" : ""}`}
                >
                  {state === "past" ? <Check className="size-3" /> : d.day}
                  {state === "now" && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />
                  )}
                </span>
                <span
                  className={`h-[2px] flex-1 ${d.day < day ? "bg-primary/60" : "bg-border"} ${
                    d.day === journey.length ? "opacity-0" : ""
                  }`}
                />
              </span>
              <span
                className={`text-[10px] ${
                  state === "now" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {d.label}
              </span>
            </button>
          );
        })}
      </div>

      {open !== null && (
        <div className="mt-3 rounded-2xl glass-card p-4 animate-fade-in">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] tracking-[0.2em] text-muted-foreground">
              DAY {String(open).padStart(2, "0")}
            </span>
            <span className="text-sm font-medium">{journey[open - 1]!.title}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {journey[open - 1]!.desc}
          </p>
          <p className="mt-2 text-[11px] text-accent">
            {open < day ? "已经过去" : open === day ? "正在进行" : "还没发生"}
          </p>
          {open === journey.length && (
            <button
              onClick={onOpenFinale}
              className="mt-3 w-full rounded-xl bg-primary py-2.5 text-xs font-medium text-primary-foreground transition-transform active:scale-[0.98]"
            >
              查看七日结语 · 你的小屋档案
            </button>
          )}
        </div>
      )}
    </section>
  );
}

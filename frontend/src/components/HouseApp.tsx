import { useEffect, useRef, useState } from "react";

import {
  Home,
  Heart,
  User,
  ChevronLeft,
  Check,
  ChevronRight,
  MessageCircle,
} from "lucide-react";
import {
  scenes,
  storySequence,
  storyTransitions,
  members,
  hotspots,
  microEvents,
  dateCard,
  genderOf,
  avatarOf,
  affinities,
  heartTrend,
  playerGender,
  type Affinity,

  meAvatar,
  profile,
  storyTimeline,
  chatTopics,
  replyOf,
  type Scene,
  type Choice,
  type Member,
} from "@/data/house";
import { RoomNight } from "@/components/RoomNight";


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

  useEffect(() => {
    setProgress(loadProgress());
    setHydrated(true);
  }, []);

  const saveProgress = (p: StoryProgress) => {
    setProgress(p);
    try {
      window.localStorage.setItem(STORY_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };

  const inStory = hydrated && tab === "house" && !progress.done;
  const talkedCount = new Set(chatLog.map((c) => c.name)).size;
  const showDayEnd = tab === "house" && !inStory && !inRoom && !dayEndSeen && talkedCount >= 3;

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className={inStory ? "flex-1" : "flex-1 pb-24"}>
        {tab === "house" &&
          (inStory ? (
            <StoryFlow
              startIndex={progress.index}
              picked={picked}
              onPick={(id, k) => setPicked((p) => ({ ...p, [id]: k }))}
              onStep={(i) => saveProgress({ index: i, done: false })}
              onFinish={() => saveProgress({ index: storySequence.length - 1, done: true })}
            />
          ) : inRoom ? (
            <RoomNight chatLog={chatLog} onLeave={() => setInRoom(false)} />
          ) : (
            <HouseContent
              openScene={openScene}
              picked={picked}
              chatLog={chatLog}
              onLog={(e) => setChatLog((l) => [...l, e])}
              onOpen={(s) => setOpenScene(s)}
              onPick={(id, k) => setPicked((p) => ({ ...p, [id]: k }))}
              onBack={() => setOpenScene(null)}
              onReplay={() => saveProgress({ index: 0, done: false })}
              canEnterRoom={talkedCount >= 3}
              onEnterRoom={() => {
                setOpenScene(null);
                setInRoom(true);
              }}
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
              你已经和 3 个人聊过天。灯一盏盏灭掉，
              <br />
              回到自己的房间，把今天收个尾。
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
}: {
  startIndex: number;
  picked: Picked;
  onPick: (id: string, k: Choice["key"]) => void;
  onStep: (i: number) => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [transition, setTransition] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const scene = scenes.find((s) => s.id === storySequence[index]);

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


  if (!scene) return null;

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
        scene={scene}
        picked={picked[scene.id]}
        onPick={(k) => onPick(scene.id, k)}
        onBack={next}
        storyMode
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
  canEnterRoom,
  onEnterRoom,
}: {
  openScene: Scene | null;
  picked: Picked;
  chatLog: ChatLogEntry[];
  onLog: (e: ChatLogEntry) => void;
  onOpen: (s: Scene) => void;
  onPick: (id: string, k: Choice["key"]) => void;
  onBack: () => void;
  onReplay: () => void;
  canEnterRoom: boolean;
  onEnterRoom: () => void;
}) {
  if (openScene) {
    return (
      <SceneView
        scene={openScene}
        picked={picked[openScene.id]}
        onPick={(k) => onPick(openScene.id, k)}
        onBack={onBack}
      />
    );
  }

  return (
    <HomeView
      picked={picked}
      chatLog={chatLog}
      onLog={onLog}
      onOpen={onOpen}
      onReplay={onReplay}
      canEnterRoom={canEnterRoom}
      onEnterRoom={onEnterRoom}
    />
  );
}



const ROOMS = ["客厅", "厨房", "阳台"] as const;

function HomeView({
  picked,
  chatLog,
  onLog,
  onOpen,
  onReplay,
  canEnterRoom,
  onEnterRoom,
}: {
  picked: Picked;
  chatLog: ChatLogEntry[];
  onLog: (e: ChatLogEntry) => void;
  onOpen: (s: Scene) => void;
  onReplay: () => void;
  canEnterRoom: boolean;
  onEnterRoom: () => void;

}) {
  const allScenes = scenes;
  const hero = scenes[1]!;
  const [who, setWho] = useState<Member | null>(null);
  const [chatWith, setChatWith] = useState<Member | null>(null);



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
          <p className="text-2xl font-semibold text-foreground drop-shadow">Day 04</p>
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

      {/* 成员名单：按房间分组，图外展示 */}
      <section className="mt-4 px-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">此刻他们在哪</h2>
          <span className="text-[11px] text-muted-foreground">5 男 · 5 女</span>
        </div>
        <div className="mt-3 space-y-2.5">
          {ROOMS.map((room) => {
            const list = members.filter((m) => m.where.slice(1) === room);
            return (
              <div key={room} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-[11px] text-muted-foreground">{room}</span>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => setWho(m)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        m.gender === "m"
                          ? "border-male/40 text-male hover:bg-male/10"
                          : "border-female/40 text-female hover:bg-female/10"
                      }`}
                    >
                      {m.name}
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
          {allScenes.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onOpen(s)}
                className="flex w-full items-center gap-3 rounded-2xl glass-card p-3 text-left transition-colors hover:bg-secondary/60"
              >
                <img
                  src={s.image}
                  alt={s.title}
                  loading="lazy"
                  width={1024}
                  height={1280}
                  className="size-14 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.place} · {s.time}
                  </p>
                </div>
                {picked[s.id] ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] text-accent">
                    <Check className="size-3" /> 已看
                  </span>
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
          {microEvents.map((e) => (
            <li
              key={e.time}
              className="flex items-start gap-3 rounded-2xl border border-border/60 px-3 py-2.5"
            >
              <span className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{e.time}</span>
              <p className="text-xs leading-relaxed text-muted-foreground">{e.text}</p>
            </li>
          ))}
        </ul>

        <h3 className="mt-6 text-sm font-medium text-accent">发生的私聊记录</h3>
        {chatLog.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
            还没有私聊。点上面的名字，去和 TA 说句话。
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {chatLog.map((c, i) => (
              <li key={i} className="rounded-2xl glass-card p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${
                      genderOf(c.name) === "m" ? "text-male" : "text-female"
                    }`}
                  >
                    你 × {c.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{c.label}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  「{c.reply}」
                </p>
              </li>
            ))}
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
          onChat={() => setChatWith(who)}
        />
      )}
      {chatWith && (
        <ChatSheet
          member={chatWith}
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

function ChatSheet({
  member,
  onClose,
  onLog,
}: {
  member: Member;
  onClose: () => void;
  onLog: (e: ChatLogEntry) => void;
}) {
  const tone = member.gender === "m" ? "text-male" : "text-female";
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { from: "ta", text: `（${member.where}）嗯？你怎么过来了。` },
  ]);
  const [used, setUsed] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = (t: (typeof chatTopics)[number]) => {
    setUsed((u) => [...u, t.key]);
    setMsgs((m) => [...m, { from: "me", text: t.say }]);
    const reply = replyOf(t, member.name);
    window.setTimeout(() => {
      setMsgs((m) => [...m, { from: "ta", text: reply }]);
    }, 550);
    onLog({ name: member.name, label: t.label, say: t.say, reply });
  };


  const left = chatTopics.filter((t) => !used.includes(t.key));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm">
      <button className="absolute inset-0" aria-label="关闭" onClick={onClose} />
      <div className="relative mx-auto flex h-[80vh] w-full max-w-md flex-col rounded-t-3xl border-t border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
          {member.avatar ? (
            <img src={member.avatar} alt={member.name} className="size-9 rounded-full object-cover" />
          ) : (
            <span className={`grid size-9 place-items-center rounded-full bg-secondary text-sm ${tone}`}>
              {member.name[0]}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${tone}`}>{member.name}</p>
            <p className="text-[11px] text-muted-foreground">{member.where} · 正在对话</p>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground">
            结束
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
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
          {left.length ? (
            left.map((t) => (
              <button
                key={t.key}
                onClick={() => send(t)}
                className="w-full rounded-full border border-border px-4 py-2.5 text-left text-xs transition-colors hover:bg-secondary/60"
              >
                {t.label} · 「{t.say}」
              </button>
            ))
          ) : (
            <p className="py-2 text-center text-[11px] text-muted-foreground">
              今天能聊的都聊完了，明天再来找 TA。
            </p>
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
}: {
  scene: Scene;
  picked?: Choice["key"] | undefined;
  onPick: (k: Choice["key"]) => void;
  onBack: () => void;
  storyMode?: boolean;
}) {
  const chosen = scene.choices.find((c) => c.key === picked);

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
          {scene.choices.map((c, i) => {
            const active = picked === c.key;

            return (
              <button
                key={c.key}
                onClick={() => onPick(c.key)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                  active
                    ? "border-primary bg-secondary shadow-glow"
                    : "border-border bg-card/70 hover:bg-secondary/60"
                }`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    active ? "bg-romance text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-sm">{c.label}</span>
              </button>
            );
          })}
        </div>

        {chosen && (
          <div className="mt-5 rounded-2xl glass-card p-4">
            <p className="text-xs tracking-widest text-accent">剧情走向</p>
            <p className="mt-2 text-sm leading-relaxed">{chosen.result}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {chosen.effects.map((e) => (
                <span
                  key={e.name}
                  className="rounded-full bg-secondary px-3 py-1 text-[11px] text-foreground/90"
                >
                  {e.name} {e.delta > 0 ? `+${e.delta}` : e.delta}
                </span>
              ))}
            </div>
            <button
              onClick={onBack}
              className="mt-4 w-full rounded-full bg-romance py-3 text-sm font-semibold text-primary-foreground"
            >
              {storyMode ? "继续" : "回到小屋"}
            </button>
          </div>
        )}
        <div className="h-8" />
      </div>
      )}
    </div>

  );
}

function RelationshipsView() {
  const [openName, setOpenName] = useState<string | null>(null);
  const list = affinities.filter((a) => genderOf(a.name) !== playerGender);
  const open = list.find((a) => a.name === openName) ?? null;

  if (open) return <AffinityDetail affinity={open} onBack={() => setOpenName(null)} />;

  return (
    <div className="px-5 pt-8">
      <header className="text-center">
        <p className="text-xs tracking-widest text-accent">你的视角</p>
        <h1 className="mt-1 text-2xl font-semibold text-primary">心动观察</h1>
        <p className="mt-2 text-sm text-muted-foreground">你和 TA 们之间，心动值到哪了？</p>
      </header>

      <div className="mt-6 space-y-3">
        {list.map((a) => (
          <button
            key={a.name}
            onClick={() => setOpenName(a.name)}
            className="flex w-full items-center gap-4 rounded-2xl glass-card p-3 text-left transition-transform active:scale-[0.99]"
          >
            <Avatar name={a.name} size={64} className="size-16 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between">
                <span
                  className={`text-sm font-semibold ${
                    genderOf(a.name) === "f" ? "text-female" : "text-male"
                  }`}
                >
                  {a.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  心动值 <span className="text-romance">{a.value}</span>
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-foreground">{a.status}</p>
              <HeartBar value={a.value} />
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>

      <div className="h-8" />
    </div>
  );
}

function HeartBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-romance transition-all"
        style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function Avatar({
  name,
  size,
  className,
}: {
  name: string;
  size: number;
  className: string;
}) {
  const avatar = avatarOf(name);
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        loading="lazy"
        width={size}
        height={size}
        className={`${className} object-cover`}
      />
    );
  }
  return (
    <div className={`${className} grid place-items-center bg-secondary font-medium`}>
      {name[0]}
    </div>
  );
}

function AffinityDetail({
  affinity,
  onBack,
}: {
  affinity: Affinity;
  onBack: () => void;
}) {
  const trend = heartTrend(affinity);
  const max = Math.max(...trend.map((t) => t.value), affinity.value, 1);
  const isFemale = genderOf(affinity.name) === "f";

  return (
    <div className="px-5 pt-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" />
        心动观察
      </button>

      <div className="mt-4 flex items-center gap-4">
        <Avatar name={affinity.name} size={80} className="size-20 rounded-3xl" />
        <div>
          <p className={`text-lg font-semibold ${isFemale ? "text-female" : "text-male"}`}>
            {affinity.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{affinity.status}</p>
          <p className="mt-2 text-sm">
            当前心动值 <span className="text-xl font-semibold text-romance">{affinity.value}</span>
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-3xl glass-card p-4">
        <h2 className="text-sm font-semibold">心动值变化</h2>
        <div className="mt-4 flex h-32 items-end gap-3">
          {trend.map((t, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{t.value}</span>
              <div
                className="w-full rounded-t-lg bg-romance/70"
                style={{ height: `${(t.value / max) * 100}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{t.day}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">心动瞬间</h2>
        <ul className="relative mt-4 space-y-4 pl-4">
          <div className="absolute left-0 top-2 bottom-2 w-px bg-border" aria-hidden />
          {[...affinity.moments].reverse().map((m, i) => (
            <li key={i} className="relative rounded-2xl glass-card p-3">
              <span
                className="absolute -left-4 top-5 size-2 rounded-full bg-romance"
                aria-hidden
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {m.day} · {m.time} · {m.place}
                </span>
                <span className={m.delta >= 0 ? "text-romance" : "text-muted-foreground"}>
                  {m.delta >= 0 ? `+${m.delta}` : m.delta}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-foreground">{m.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="h-8" />
    </div>
  );
}



function MeView() {
  return (
    <div className="px-5 pt-8">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-[0.2em] text-primary">
          我的恋综档案
        </h1>
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
                <span className={`text-sm ${index === storyTimeline.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
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

function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
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

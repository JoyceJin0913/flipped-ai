import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Gamepad2,
  Sparkles,
  Eye,
  Check,
  Send,
} from "lucide-react";

import { useIslandStore } from "@/stores/useIslandStore";
import { getNpcById } from "@/onboarding/npcLibrary";
import roomNightImg from "@/assets/room-night.jpg";
import { useScrollToTop } from "@/hooks/useScrollToTop";

type Mode = "menu" | "choice" | "game";

const SMS_TEMPLATES = [
  { key: "goodnight", text: "今天最后一句话想说给你听：晚安。", gain: 4 },
  { key: "kitchen", text: "刚才那段对话，我回房间之后又想了一遍。", gain: 6 },
  { key: "tomorrow", text: "明天的约会，如果可以选，我还是想选你。", gain: 8 },
];

const SMS_REPLIES = [
  "……我也刚好在想同一件事。",
  "收到了。明天见，别熬太晚。",
  "你怎么总是挑我最没防备的时候说这种话。",
];

// 通用题：不依赖 house.ts 静态人名（温宁/沈知/林一/夏可/苏杳），
// 以房间玩法机制 + 事件流行为为素材，任何一天都成立。
const QUIZ = [
  {
    q: "今晚的心动短信，一晚最多能发给几个人？",
    options: ["1 个人", "2 个人", "想发给谁就发给谁"],
    answer: 0,
  },
  {
    q: "如果今天有某件事没有发生，小屋会怎么告诉你？",
    options: ["「这件事没有发生。」", "直接跳到第二天", "假装它发生过"],
    answer: 0,
  },
  {
    q: "在房间里做过的「心动 / 留意」标记，谁会看到？",
    options: ["心动节目组知道，留意只有自己知道", "只有自己能看到", "所有人都会看到"],
    answer: 0,
  },
];

type Mark = "heart" | "watch" | null;

export function RoomNight({ onLeave }: { onLeave: () => void }) {
  const [mode, setMode] = useState<Mode>("menu");
  const [heart, setHeart] = useState(0);
  useScrollToTop(mode);

  const island = useIslandStore();
  const { npcIds, eventLog, day } = island;

  // 目标名单：今天互动过的 NPC ∪ 玩家好感最高的 NPC（保证永远有可选对象）
  const talkedIdSet = new Set<string>();
  for (const entry of eventLog) {
    if (entry.targetNpcId) talkedIdSet.add(entry.targetNpcId);
    for (const d of entry.deltas ?? []) talkedIdSet.add(d.npcId);
  }
  const highestId = island.highestNpcId() ?? npcIds[0] ?? null;
  const targets = Array.from(new Set([...talkedIdSet, ...(highestId ? [highestId] : [])]));

  return (
    <div className="flex min-h-[100dvh] flex-col pb-8">
      <header className="flex items-center gap-2 px-5 pt-6">
        <button
          onClick={() => (mode === "menu" ? onLeave() : setMode("menu"))}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60"
          aria-label={mode === "menu" ? "回到小屋" : "返回房间"}
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex-1">
          <p className="text-[11px] tracking-[0.3em] text-muted-foreground">
            23:00 · Day {String(day).padStart(2, "0")}
          </p>
          <h1 className="text-lg font-semibold">我的房间</h1>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full glass-card px-2.5 py-1 text-xs text-primary">
          <Heart className="size-3.5 fill-current" /> +{heart}
        </span>
      </header>

      {mode === "menu" && (
        <div className="mt-4 flex flex-1 flex-col gap-3 px-5 animate-fade-in">
          <div className="relative shrink-0 overflow-hidden rounded-3xl">
            <img
              src={roomNightImg}
              alt="夜里的房间"
              width={896}
              height={1024}
              className="aspect-[16/10] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <p className="text-[11px] tracking-[0.25em] text-muted-foreground">TONIGHT</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                灯关了一半，今天你和 {talkedIdSet.size} 个人说过话。
              </p>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3">
            <RoomEntry
              icon={<Sparkles className="size-7 text-female" />}
              title="今晚的心动抉择"
              desc="给一个人发短信，其余可标记心动或留意"
              tag="1 次 / 每晚"
              tone="female"
              onClick={() => setMode("choice")}
            />
            <RoomEntry
              icon={<Gamepad2 className="size-7 text-male" />}
              title="玩心动小游戏"
              desc="回忆今天的三件事，答对越多心动值越高"
              tag="3 题 · 可得 +9"
              tone="male"
              onClick={() => setMode("game")}
            />
          </div>
        </div>
      )}

      {mode === "choice" && <ChoicePanel npcIds={targets} onGain={(g) => setHeart((h) => h + g)} />}
      {mode === "game" && <GamePanel onGain={(g) => setHeart((h) => h + g)} />}
    </div>
  );
}

function RoomEntry({
  icon,
  title,
  desc,
  tag,
  tone = "primary",
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag?: string;
  tone?: "female" | "male" | "primary";
  onClick: () => void;
}) {
  const toneClass =
    tone === "female"
      ? "bg-female/15 text-female"
      : tone === "male"
        ? "bg-male/15 text-male"
        : "bg-secondary/60 text-primary";
  const borderClass =
    tone === "female" ? "border-female/30" : tone === "male" ? "border-male/30" : "border-border";

  return (
    <button
      onClick={onClick}
      className={`group flex h-full w-full flex-col items-start gap-3 rounded-3xl border ${borderClass} p-4 text-left transition-colors hover:bg-secondary/60 active:scale-[0.99]`}
    >
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${toneClass}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold leading-tight">{title}</span>
          {tag && (
            <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          )}
        </span>
        <span className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">{desc}</span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
        进入 <ChevronRight className="size-3.5" />
      </span>
    </button>
  );
}

/** NPC 头像：npcLibrary 真名/头像，缺失时首字母占位 */
function NpcAvatar({ npcId, size = "size-9" }: { npcId: string; size?: string }) {
  const npc = getNpcById(npcId);
  const name = npc?.name ?? npcId;
  const male = npc?.gender === "male";
  if (npc?.avatar) {
    return <img src={npc.avatar} alt={name} className={`${size} rounded-full object-cover`} />;
  }
  return (
    <span
      className={`${size} inline-flex items-center justify-center rounded-full text-[11px] ${
        male ? "bg-male/20 text-male" : "bg-female/20 text-female"
      }`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function ChoicePanel({ npcIds, onGain }: { npcIds: string[]; onGain: (g: number) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [to, setTo] = useState<string | null>(null);
  const [sent, setSent] = useState<{ text: string; reply: string } | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  useScrollToTop(step);

  const others = npcIds.filter((n) => n !== to);

  if (npcIds.length === 0) {
    return (
      <p className="mt-10 px-8 text-center text-xs leading-relaxed text-muted-foreground animate-fade-in">
        今天还没有可发短信的人，明天再试试。
      </p>
    );
  }

  return (
    <div className="mt-5 px-5 animate-fade-in">
      {/* 步骤指示 */}
      <div className="flex items-center gap-2">
        {[1, 2].map((s) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              step > s || step === s ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-[11px] tracking-[0.2em] text-muted-foreground">
        {step === 1 ? "第一步 · 只能选一个人" : step === 2 ? "第二步 · 其余的人" : "今晚的答案"}
      </p>

      {step === 1 && (
        <div className="mt-3 animate-fade-in">
          <h2 className="text-base font-semibold">今晚，你的心动短信发给谁？</h2>
          <p className="mt-1 text-xs text-muted-foreground">一晚只能发一条，对方会收到。</p>

          <ul className="mt-4 space-y-2">
            {npcIds.map((id) => {
              const npc = getNpcById(id);
              const name = npc?.name ?? id;
              const male = npc?.gender === "male";
              return (
                <li key={id}>
                  <button
                    onClick={() => setTo(id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                      to === id
                        ? male
                          ? "border-male bg-male/10"
                          : "border-female bg-female/10"
                        : "border-border hover:bg-secondary/60"
                    }`}
                  >
                    <NpcAvatar npcId={id} />
                    <span className="flex-1 text-sm">{name}</span>
                    {to === id && <Check className="size-4 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {to && !sent && (
            <ul className="mt-4 space-y-2 animate-fade-in">
              <p className="text-[11px] text-muted-foreground">选一句想说的话</p>
              {SMS_TEMPLATES.map((t, i) => (
                <li key={t.key}>
                  <button
                    onClick={() => {
                      onGain(t.gain);
                      setSent({ text: t.text, reply: SMS_REPLIES[i]! });
                    }}
                    className="w-full rounded-2xl glass-card px-3 py-3 text-left text-xs leading-relaxed transition-colors hover:bg-secondary/60"
                  >
                    {t.text}
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                      <Send className="size-3" /> 心动 +{t.gain}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {to && sent && (
            <div className="mt-4 space-y-2 animate-fade-in">
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs leading-relaxed text-primary-foreground">
                {sent.text}
              </div>
              <div className="mr-auto max-w-[80%] rounded-2xl rounded-bl-sm glass-card px-3 py-2 text-xs leading-relaxed">
                {getNpcById(to)?.name ?? to}：{sent.reply}
              </div>
              <button
                onClick={() => setStep(2)}
                className="mt-4 w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
              >
                下一步
              </button>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="mt-3 animate-fade-in">
          <h2 className="text-base font-semibold">其余的人，你要留下记号吗？</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            「心动」只有节目组知道，「留意」是给自己看的。也可以什么都不选。
          </p>

          <ul className="mt-4 space-y-2">
            {others.map((id) => {
              const m = marks[id] ?? null;
              const name = getNpcById(id)?.name ?? id;
              return (
                <li key={id} className="flex items-center gap-3 rounded-2xl glass-card px-3 py-3">
                  <NpcAvatar npcId={id} />
                  <span className="flex-1 text-sm">{name}</span>
                  <button
                    onClick={() =>
                      setMarks((p) => ({ ...p, [id]: m === "heart" ? null : "heart" }))
                    }
                    aria-label={`标记心动 ${name}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      m === "heart"
                        ? "border-female bg-female/15 text-female"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <Heart className={`size-3 ${m === "heart" ? "fill-current" : ""}`} /> 心动
                  </button>
                  <button
                    onClick={() =>
                      setMarks((p) => ({ ...p, [id]: m === "watch" ? null : "watch" }))
                    }
                    aria-label={`留意 ${name}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      m === "watch"
                        ? "border-male bg-male/15 text-male"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <Eye className="size-3" /> 留意
                  </button>
                </li>
              );
            })}
            {others.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                今晚你只有一个人可以发短信。
              </p>
            )}
          </ul>

          <button
            onClick={() => {
              const marked = Object.values(marks).filter(Boolean).length;
              onGain(marked * 2);
              setStep(3);
            }}
            className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            就这样，收起手机
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 animate-fade-in">
          <p className="text-center text-[11px] tracking-[0.3em] text-muted-foreground">TONIGHT</p>
          <div className="mt-4 rounded-3xl glass-card p-5">
            <div className="flex items-center gap-3">
              {to && <NpcAvatar npcId={to} size="size-12" />}
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">心动短信发给了</p>
                <p className="text-base font-semibold">{to ? (getNpcById(to)?.name ?? to) : ""}</p>
              </div>
            </div>
            <p className="mt-3 rounded-2xl bg-secondary/40 px-3 py-2 text-xs leading-relaxed">
              {sent?.text}
            </p>

            {others.some((n) => marks[n]) && (
              <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
                {others
                  .filter((n) => marks[n])
                  .map((n) => (
                    <div key={n} className="flex items-center gap-2 text-xs">
                      <NpcAvatar npcId={n} size="size-6" />
                      <span className="flex-1">{getNpcById(n)?.name ?? n}</span>
                      <span className={marks[n] === "heart" ? "text-female" : "text-male"}>
                        {marks[n] === "heart" ? "心动" : "留意"}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            标记不会被别人看到，但会留在「我的 · 沉淀故事」里。
          </p>
        </div>
      )}
    </div>
  );
}

function GamePanel({ onGain }: { onGain: (g: number) => void }) {
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  useScrollToTop(step);

  const q = QUIZ[step];

  if (!q) {
    return (
      <div className="mt-10 px-8 text-center animate-fade-in">
        <p className="text-sm text-muted-foreground">今晚的回忆小游戏结束</p>
        <p className="mt-3 text-3xl font-semibold text-primary">
          {correct} / {QUIZ.length}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          你记住的细节，会变成明天你能说出口的话。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 px-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">心动小游戏 · 今天你记得多少</h2>
        <span className="text-[11px] text-muted-foreground">
          {step + 1}/{QUIZ.length}
        </span>
      </div>
      <p className="mt-4 text-sm leading-relaxed">{q.q}</p>
      <ul className="mt-3 space-y-2">
        {q.options.map((o, i) => {
          const revealed = chosen !== null;
          const isRight = i === q.answer;
          return (
            <li key={o}>
              <button
                disabled={revealed}
                onClick={() => {
                  setChosen(i);
                  if (isRight) {
                    setCorrect((c) => c + 1);
                    onGain(5);
                  }
                }}
                className={`w-full rounded-2xl border px-3 py-3 text-left text-xs leading-relaxed transition-colors ${
                  revealed && isRight
                    ? "border-primary bg-primary/10 text-foreground"
                    : revealed && chosen === i
                      ? "border-destructive/60 text-muted-foreground"
                      : "border-border hover:bg-secondary/60"
                }`}
              >
                {o}
              </button>
            </li>
          );
        })}
      </ul>
      {chosen !== null && (
        <button
          onClick={() => {
            setStep((s) => s + 1);
            setChosen(null);
          }}
          className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
        >
          {step === QUIZ.length - 1 ? "看看结果" : "下一题"}
        </button>
      )}
    </div>
  );
}

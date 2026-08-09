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

import { avatarOf, genderOf } from "@/data/house";
import roomNightImg from "@/assets/room-night.jpg";
import type { ChatLogEntry } from "@/components/HouseApp";

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

const QUIZ = [
  {
    q: "今晚厨房里，温宁把碗放回水槽前说了什么？",
    options: ["「我也不知道该怎么说。」", "「你先出去吧。」", "「明天再说。」"],
    answer: 0,
  },
  {
    q: "阳台上，沈知最后做了什么？",
    options: ["转身离开", "把烟火递了过去", "叫来了林一"],
    answer: 1,
  },
  {
    q: "客厅里，是谁提议抽签决定分组？",
    options: ["夏可", "沈知", "苏杳"],
    answer: 2,
  },
];

type Mark = "heart" | "watch" | null;

export function RoomNight({
  chatLog,
  onLeave,
}: {
  chatLog: ChatLogEntry[];
  onLeave: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [heart, setHeart] = useState(0);

  const talked = Array.from(new Set(chatLog.map((c) => c.name)));

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
          <p className="text-[11px] tracking-[0.3em] text-muted-foreground">23:00 · Day 04</p>
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
                灯关了一半，今天你和 {talked.length} 个人说过话。
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

      {mode === "choice" && (
        <ChoicePanel names={talked} onGain={(g) => setHeart((h) => h + g)} />
      )}
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
    tone === "female" ? "bg-female/15 text-female" : tone === "male" ? "bg-male/15 text-male" : "bg-secondary/60 text-primary";
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

function Avatar({ name, size = "size-9" }: { name: string; size?: string }) {
  const src = avatarOf(name);
  const g = genderOf(name);
  return src ? (
    <img src={src} alt={name} className={`${size} rounded-full object-cover`} />
  ) : (
    <span
      className={`${size} inline-flex items-center justify-center rounded-full text-[11px] ${
        g === "m" ? "bg-male/20 text-male" : "bg-female/20 text-female"
      }`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function ChoicePanel({ names, onGain }: { names: string[]; onGain: (g: number) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [to, setTo] = useState<string | null>(null);
  const [sent, setSent] = useState<{ text: string; reply: string } | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  const others = names.filter((n) => n !== to);

  if (names.length === 0) {
    return (
      <p className="mt-10 px-8 text-center text-xs leading-relaxed text-muted-foreground animate-fade-in">
        今天还没和谁说过话，明天再试试。
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
            {names.map((n) => (
              <li key={n}>
                <button
                  onClick={() => setTo(n)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                    to === n
                      ? genderOf(n) === "m"
                        ? "border-male bg-male/10"
                        : "border-female bg-female/10"
                      : "border-border hover:bg-secondary/60"
                  }`}
                >
                  <Avatar name={n} />
                  <span className="flex-1 text-sm">{n}</span>
                  {to === n && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))}
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
                {to}：{sent.reply}
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
            {others.map((n) => {
              const m = marks[n] ?? null;
              return (
                <li
                  key={n}
                  className="flex items-center gap-3 rounded-2xl glass-card px-3 py-3"
                >
                  <Avatar name={n} />
                  <span className="flex-1 text-sm">{n}</span>
                  <button
                    onClick={() =>
                      setMarks((p) => ({ ...p, [n]: m === "heart" ? null : "heart" }))
                    }
                    aria-label={`标记心动 ${n}`}
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
                      setMarks((p) => ({ ...p, [n]: m === "watch" ? null : "watch" }))
                    }
                    aria-label={`留意 ${n}`}
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
                今天你只和一个人说过话。
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
          <p className="text-center text-[11px] tracking-[0.3em] text-muted-foreground">
            TONIGHT
          </p>
          <div className="mt-4 rounded-3xl glass-card p-5">
            <div className="flex items-center gap-3">
              <Avatar name={to!} size="size-12" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">心动短信发给了</p>
                <p className="text-base font-semibold">{to}</p>
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
                      <Avatar name={n} size="size-6" />
                      <span className="flex-1">{n}</span>
                      <span
                        className={
                          marks[n] === "heart" ? "text-female" : "text-male"
                        }
                      >
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

/**
 * 冷启动流程（PRD §5）
 * 1. profile_setup    建立玩家档案
 * 2. personality_test 十二题人格测试
 * 3. matching         八选五匹配池
 * 4. intro            入岛开场
 */

import { useMemo, useState } from "react";
import { Heart, Sparkles, AlertTriangle, Check } from "lucide-react";
import { useGameStore } from "../stores/useOnboardingStore";
import {
  MBTI_QUESTIONS,
  MBTI_QUESTION_TITLES,
  ATTACHMENT_QUESTIONS,
  calcTestResult,
  calculateCandidatePool,
  MATCHING_CONFIG,
} from "./scoring";
import type { MbtiAnswer, AttachmentAnswer } from "./scoring";
import { getNpcById, getSameGenderNpcs } from "./npcLibrary";
import type { PlayerGender, Zodiac, MBTI } from "./types";
import {
  TopBar,
  PrimaryButton,
  GhostButton,
  Avatar,
  Chip,
  ATTACHMENT_LABELS,
  ATTACHMENT_DESC,
  TIER_LABELS,
  TIER_STYLES,
  SectionTitle,
} from "./shared";

const ZODIAC_LIST: { key: Zodiac; label: string }[] = [
  { key: "aries", label: "白羊" },
  { key: "taurus", label: "金牛" },
  { key: "gemini", label: "双子" },
  { key: "cancer", label: "巨蟹" },
  { key: "leo", label: "狮子" },
  { key: "virgo", label: "处女" },
  { key: "libra", label: "天秤" },
  { key: "scorpio", label: "天蝎" },
  { key: "sagittarius", label: "射手" },
  { key: "capricorn", label: "摩羯" },
  { key: "aquarius", label: "水瓶" },
  { key: "pisces", label: "双鱼" },
];

// ============================================================
// 1. 建立档案
// ============================================================

export function ProfileSetup() {
  const setPhase = useGameStore((s) => s.setPhase);
  const setPlayerProfile = useGameStore((s) => s.setPlayerProfile);

  const [name, setName] = useState("");
  const [gender, setGender] = useState<PlayerGender | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [agePrivate, setAgePrivate] = useState(false);
  const [zodiac, setZodiac] = useState<Zodiac | null>(null);

  const ready =
    name.trim().length > 0 && gender !== null && (age !== null || agePrivate) && zodiac !== null;

  const handleNext = () => {
    if (!ready) return;
    const profile = {
      name: name.trim(),
      gender: gender!,
      mbti: "INFP" as MBTI, // 测试后覆盖
      attachment: "secure" as const,
      weakAxes: [],
      zodiac: zodiac!,
      ...(age !== null ? { age } : {}),
    };
    setPlayerProfile(profile);
    setPhase("personality_test");
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className="bg-night-fade flex flex-1 flex-col px-6 pb-10 pt-16">
        <div className="animate-fade-in mb-10 text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-3xl bg-romance shadow-glow">
            <Heart className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-semibold tracking-[0.3em] text-primary">心动岛</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            七天，一座小屋，五个人。
            <br />
            你会先心动，还是先看清自己？
          </p>
        </div>

        <div className="animate-fade-in space-y-6">
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">你的名字</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="节目里大家怎么称呼你"
              maxLength={12}
              className="w-full rounded-2xl glass-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              你的性别（决定小屋里的异性阵容）
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "male" as PlayerGender, label: "男生", tone: "male" as const },
                { key: "female" as PlayerGender, label: "女生", tone: "female" as const },
              ].map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGender(g.key)}
                  className={`rounded-2xl border py-3.5 text-sm font-medium transition-colors active:scale-[0.97] ${
                    gender === g.key
                      ? "border-primary bg-secondary text-primary shadow-glow"
                      : "border-border bg-card/70 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">你的年龄</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={18}
                max={99}
                value={age ?? ""}
                placeholder="填入数字（选填）"
                onChange={(e) => {
                  const v = e.target.value;
                  setAgePrivate(false);
                  setAge(v === "" ? null : Math.max(18, Math.min(99, Number(v) || 0)));
                }}
                className="flex-1 rounded-2xl glass-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => {
                  setAgePrivate(true);
                  setAge(null);
                }}
                className={`shrink-0 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors active:scale-[0.97] ${
                  agePrivate
                    ? "border-primary bg-secondary text-primary shadow-glow"
                    : "border-border bg-card/70 text-muted-foreground hover:bg-secondary/60"
                }`}
              >
                保密
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">你的星座</label>
            <div className="grid grid-cols-4 gap-2">
              {ZODIAC_LIST.map((z) => (
                <button
                  key={z.key}
                  onClick={() => setZodiac(z.key)}
                  className={`rounded-xl border py-2.5 text-xs font-medium transition-colors active:scale-[0.96] ${
                    zodiac === z.key
                      ? "border-primary bg-secondary text-primary shadow-glow"
                      : "border-border bg-card/70 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-10">
          <PrimaryButton onClick={handleNext} disabled={!ready}>
            开始人格测试
          </PrimaryButton>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            12 道题 · 约 2 分钟 · 结果决定你的匹配池
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 2. 十二题人格测试（PRD §12.1）
// ============================================================

export function PersonalityTest() {
  const setPhase = useGameStore((s) => s.setPhase);
  const profile = useGameStore((s) => s.playerProfile);
  const setPlayerProfile = useGameStore((s) => s.setPlayerProfile);
  const setTestResult = useGameStore((s) => s.setTestResult);
  const setMatchingPool = useGameStore((s) => s.setMatchingPool);

  const [step, setStep] = useState(0); // 0-11
  const [mbtiAnswers, setMbtiAnswers] = useState<(MbtiAnswer | undefined)[]>(
    Array(8).fill(undefined),
  );
  const [attachAnswers, setAttachAnswers] = useState<(AttachmentAnswer | undefined)[]>(
    Array(4).fill(undefined),
  );
  const [done, setDone] = useState(false);

  const total = 12;
  const isMbti = step < 8;

  const result = useMemo(
    () => (done ? calcTestResult(mbtiAnswers, attachAnswers) : null),
    [done, mbtiAnswers, attachAnswers],
  );

  const pick = (value: MbtiAnswer | AttachmentAnswer) => {
    if (isMbti) {
      const next = [...mbtiAnswers];
      next[step] = value as MbtiAnswer;
      setMbtiAnswers(next);
    } else {
      const next = [...attachAnswers];
      next[step - 8] = value as AttachmentAnswer;
      setAttachAnswers(next);
    }
    setTimeout(() => {
      if (step === total - 1) setDone(true);
      else setStep(step + 1);
    }, 180);
  };

  const handleEnterMatching = () => {
    if (!result || !profile) return;
    const updated = {
      ...profile,
      mbti: result.mbti,
      attachment: result.attachment,
      weakAxes: result.weakAxes,
    };
    setPlayerProfile(updated);
    setTestResult(result);
    setMatchingPool(calculateCandidatePool(updated));
    setPhase("matching");
  };

  // ---- 结果页 ----
  if (done && result) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
        <TopBar title="你的恋爱人格" subtitle="这份画像会决定谁会出现在你的小屋" />
        <div className="bg-night-fade animate-fade-in flex-1 space-y-5 px-5 py-6">
          <div className="glass-card shadow-glow rounded-3xl p-6 text-center">
            <p className="text-[11px] tracking-widest text-muted-foreground">MBTI</p>
            <p className="mt-1 text-4xl font-semibold tracking-[0.2em] text-romance">
              {result.mbti}
            </p>
            {result.weakAxes.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {result.weakAxes.map((a) => (
                  <Chip key={a} tone="primary">
                    {a} 轴摇摆
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card rounded-3xl p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">依恋类型</span>
              <Chip tone="primary">{ATTACHMENT_LABELS[result.attachment]}</Chip>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {ATTACHMENT_DESC[result.attachment]}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-secondary/40 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">焦虑维度</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">{result.raw.anx}</p>
              </div>
              <div className="rounded-2xl bg-secondary/40 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">回避维度</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">{result.raw.avo}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-5">
            <SectionTitle hint="A / B 选择计分">四轴分布</SectionTitle>
            <div className="space-y-3">
              {(
                [
                  ["E", "I", "外向 / 内向"],
                  ["S", "N", "实感 / 直觉"],
                  ["T", "F", "思考 / 情感"],
                  ["J", "P", "判断 / 知觉"],
                ] as const
              ).map(([a, b, label]) => {
                const va = result.raw.axes[a] ?? 0;
                const vb = result.raw.axes[b] ?? 0;
                const totalAxis = Math.max(1, va + vb);
                return (
                  <div key={label}>
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>
                        {a} {va}
                      </span>
                      <span>{label}</span>
                      <span>
                        {vb} {b}
                      </span>
                    </div>
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary/70">
                      <div className="bg-male" style={{ width: `${(va / totalAxis) * 100}%` }} />
                      <div className="bg-female" style={{ width: `${(vb / totalAxis) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <PrimaryButton onClick={handleEnterMatching}>查看为你匹配的候选人</PrimaryButton>
        </div>
      </div>
    );
  }

  // ---- 答题页 ----
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className="bg-night-fade flex flex-1 flex-col px-6 pb-10 pt-12">
        <div className="mb-8">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">
              {isMbti ? "人格倾向" : "依恋模式"}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {step + 1} / {total}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-secondary/70">
            <div
              className="bg-romance h-full rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        {isMbti ? (
          <div key={step} className="animate-fade-in flex flex-1 flex-col">
            <h2 className="mb-8 text-xl font-semibold leading-relaxed text-foreground">
              {MBTI_QUESTION_TITLES[step + 1]!}
            </h2>
            <div className="space-y-3">
              {(["A", "B"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => pick(k)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left text-sm leading-relaxed transition-colors active:scale-[0.98] ${
                    mbtiAnswers[step] === k
                      ? "border-primary bg-secondary text-primary shadow-glow"
                      : "border-border bg-card/70 text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {MBTI_QUESTIONS[step]![k].label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div key={step} className="animate-fade-in flex flex-1 flex-col">
            <h2 className="mb-8 text-xl font-semibold leading-relaxed text-foreground">
              {ATTACHMENT_QUESTIONS[step - 8]!.title}
            </h2>
            <div className="space-y-3">
              {(["anx", "safe", "avo"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => pick(k)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left text-sm leading-relaxed transition-colors active:scale-[0.98] ${
                    attachAnswers[step - 8] === k
                      ? "border-primary bg-secondary text-primary shadow-glow"
                      : "border-border bg-card/70 text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {ATTACHMENT_QUESTIONS[step - 8]![k]}
                </button>
              ))}
            </div>
          </div>
        )}

        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="mt-6 text-center text-xs text-muted-foreground transition active:scale-[0.97]"
          >
            返回上一题
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 3. 八选五匹配池（PRD §12.4）
// ============================================================

export function MatchingSelection() {
  const setPhase = useGameStore((s) => s.setPhase);
  const profile = useGameStore((s) => s.playerProfile);
  const matchingPool = useGameStore((s) => s.matchingPool);
  const setSelectedNpcs = useGameStore((s) => s.setSelectedNpcs);
  const setIslandNpcs = useGameStore((s) => s.setIslandNpcs);
  const initRelationships = useGameStore((s) => s.initRelationships);

  const [selected, setSelected] = useState<string[]>([]);
  const need = MATCHING_CONFIG.REQUIRED_COUNT;

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < need ? [...prev, id] : prev,
    );
  };

  const handleConfirm = () => {
    if (selected.length !== need || !profile) return;
    const npcs = selected.map((id) => getNpcById(id)!).filter(Boolean);
    const competitors = getSameGenderNpcs(profile.gender).slice(0, 4);
    setSelectedNpcs(selected);
    setIslandNpcs(npcs, competitors);
    initRelationships(selected);
    setPhase("intro");
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <TopBar
        title="选出你的小屋阵容"
        subtitle={`根据你的人格画像生成 · 选 ${need} 位`}
        right={
          <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
            {selected.length}/{need}
          </span>
        }
      />

      <div className="bg-night-fade animate-fade-in flex-1 space-y-3 px-4 pb-32 pt-4">
        {matchingPool.map((c) => {
          const npc = getNpcById(c.npcId);
          if (!npc) return null;
          const on = selected.includes(c.npcId);
          return (
            <button
              key={c.npcId}
              onClick={() => toggle(c.npcId)}
              className={`w-full rounded-3xl border p-4 text-left transition-colors active:scale-[0.98] ${
                on
                  ? "border-primary bg-secondary shadow-glow"
                  : "border-border glass-card hover:bg-secondary/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`relative size-24 shrink-0 overflow-hidden rounded-2xl border bg-male/10 ${
                    npc.gender === "male" ? "border-male/40" : "border-female/40"
                  } ${on ? "ring-2 ring-primary/60 ring-offset-2 ring-offset-background" : ""}`}
                >
                  <span
                    className={`flex h-full w-full items-center justify-center text-2xl font-semibold ${
                      npc.gender === "male" ? "text-male" : "text-female"
                    }`}
                  >
                    {npc.name.slice(0, 1)}
                  </span>
                  {npc.avatar && (
                    <img
                      src={npc.avatar}
                      alt={`${npc.name}头像`}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition: "50% 30%" }}
                      draggable={false}
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-foreground">{npc.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {npc.age} · {npc.mbti}
                    </span>
                    {on && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        TIER_STYLES[c.tier]
                      }`}
                    >
                      {c.tier === "red_flag" && <AlertTriangle className="h-3 w-3" />}
                      {TIER_LABELS[c.tier]}
                    </span>
                    <Chip>契合{c.matchScore}</Chip>
                    <Chip>{ATTACHMENT_LABELS[npc.attachment]}</Chip>
                  </div>

                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {npc.personality.role}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {npc.traits.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-secondary/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  {c.reasons.length > 0 && (
                    <p className="mt-2 text-[10px] text-muted-foreground/70">
                      {c.reasons.join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-card/90 px-5 pb-7 pt-4 backdrop-blur">
        <PrimaryButton onClick={handleConfirm} disabled={selected.length !== need}>
          {selected.length === need ? "确认入岛" : `还需选择 ${need - selected.length} 位`}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ============================================================
// 4. 入岛开场
// ============================================================

export function IntroScene() {
  const setPhase = useGameStore((s) => s.setPhase);
  const profile = useGameStore((s) => s.playerProfile);
  const islandNpcs = useGameStore((s) => s.islandNpcs);
  const competitors = useGameStore((s) => s.competitors);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className="bg-night-fade animate-fade-in flex flex-1 flex-col px-6 pb-10 pt-14">
        <div className="mb-8 text-center">
          <Sparkles className="mx-auto mb-4 h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Day 1 · 入岛</h1>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {profile?.name}，欢迎来到心动岛。
            <br />
            接下来七天，你会和这些人住在同一间小屋。
            <br />
            每天有三幕：白天公共事件 · 20:00 私聊 · 22:00 独处复盘。
          </p>
        </div>

        <div className="glass-card mb-4 rounded-3xl p-5">
          <SectionTitle hint={`${islandNpcs.length} 位`}>你的心动候选</SectionTitle>
          <div className="space-y-3">
            {islandNpcs.map((npc) => (
              <div key={npc.id} className="flex items-center gap-3">
                <Avatar name={npc.name} gender={npc.gender} src={npc.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{npc.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {npc.personality.role}
                  </p>
                </div>
                <Chip>{npc.mbti}</Chip>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-5">
          <SectionTitle hint={`${competitors.length} 位`}>同性参与者</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {competitors.map((npc) => (
              <div key={npc.id} className="flex w-[72px] flex-col items-center gap-1.5">
                <div
                  className={`relative size-[72px] shrink-0 overflow-hidden rounded-2xl border bg-male/10 ${
                    npc.gender === "male" ? "border-male/40" : "border-female/40"
                  }`}
                >
                  <span
                    className={`flex h-full w-full items-center justify-center text-xl font-semibold ${
                      npc.gender === "male" ? "text-male" : "text-female"
                    }`}
                  >
                    {npc.name.slice(0, 1)}
                  </span>
                  {npc.avatar && (
                    <img
                      src={npc.avatar}
                      alt={`${npc.name}头像`}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition: "50% 30%" }}
                      draggable={false}
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{npc.name}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
            他们也会主动出击。你的犹豫，可能就是别人的机会。
          </p>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          <PrimaryButton onClick={() => setPhase("done")}>进入 Day 1</PrimaryButton>
          <GhostButton onClick={() => setPhase("matching")}>重新选择阵容</GhostButton>
        </div>
      </div>
    </div>
  );
}

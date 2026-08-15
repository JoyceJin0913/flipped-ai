import { useState } from "react";
import { ChevronLeft, Sparkles, Share2, X } from "lucide-react";

import {
  finaleStats,
  finaleMilestones,
  finaleBonds,
  finaleTraits,
  finaleSelfTags,
  finaleObservedTags,
  finaleVerdict,
  finaleSlogan,
  posterHighlights,
  meAvatar,
  avatarOf,
} from "@/data/house";

/** 7 天结束后的结语档案：客观记录 · 关系 · 性格分析 */
export function FinaleReport({ onClose }: { onClose: () => void }) {
  const [poster, setPoster] = useState(false);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background animate-fade-in">
      <div className="mx-auto min-h-full w-full max-w-md pb-16">
        {/* 封面 · Slogan */}
        <header className="relative px-6 pt-10 text-center">
          <button
            onClick={onClose}
            aria-label="返回"
            className="absolute left-4 top-9 grid size-9 place-items-center rounded-full glass-card"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="text-[11px] tracking-[0.35em] text-muted-foreground">DAY 01 — DAY 07</p>

          <h1 className="mt-6 text-[30px] font-semibold leading-[1.25] tracking-tight text-foreground">
            「{finaleSlogan.line}」
          </h1>
          <p className="mt-3 text-[10px] tracking-[0.3em] text-primary">{finaleSlogan.sub}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {finaleSlogan.desc}
          </p>

          <button
            onClick={() => setPoster(true)}
            className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-transform active:scale-95"
          >
            <Share2 className="size-3.5" />
            生成分享海报
          </button>

          <div className="mx-auto mt-6 h-px w-16 bg-primary/40" />
        </header>

        {poster && <SharePoster onClose={() => setPoster(false)} />}


        {/* 01 客观记录 */}
        <Section index="01" title="客观记录" desc="这七天里，确实发生过的数字。">
          <div className="grid grid-cols-3 gap-2">
            {finaleStats.map((s) => (
              <div key={s.label} className="rounded-2xl glass-card p-3 text-center">
                <p className="text-xl font-semibold text-primary">{s.value}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{s.label}</p>
                {s.sub && <p className="mt-0.5 text-[9px] text-muted-foreground/70">{s.sub}</p>}
              </div>
            ))}
          </div>

          <ol className="mt-4 space-y-0">
            {finaleMilestones.map((m, i) => (
              <li key={m.day} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {i < finaleMilestones.length - 1 && (
                    <span className="w-px flex-1 bg-border" />
                  )}
                </div>
                <div className="pb-4">
                  <p className="text-[10px] tracking-[0.2em] text-muted-foreground">{m.day}</p>
                  <p className="mt-0.5 text-xs leading-relaxed">{m.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* 02 关系 */}
        <Section index="02" title="你和他们" desc="七天之后，每段关系停在了哪里。">
          <div className="space-y-2.5">
            {finaleBonds.map((b, i) => (
              <div key={b.name} className="rounded-2xl glass-card p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={avatarOf(b.name)}
                    alt={b.name}
                    width={96}
                    height={96}
                    className="size-11 rounded-full object-cover ring-1 ring-primary/30"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{b.name}</span>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                        {b.tag}
                      </span>
                      {i === 0 && <Sparkles className="size-3 text-accent" />}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${b.value}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{b.value}</span>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{b.summary}</p>
                <p className="mt-2 border-l-2 border-primary/40 pl-2 text-[11px] italic text-foreground/80">
                  {b.key}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* 03 性格分析 */}
        <Section index="03" title="小屋看到的你" desc="入住前你怎么形容自己，七天后小屋看到了什么。">
          <div className="grid grid-cols-2 gap-2">
            <TagBox title="入住前 · 你说" tags={finaleSelfTags} tone="muted" />
            <TagBox title="七天后 · 小屋说" tags={finaleObservedTags} tone="primary" />
          </div>

          <div className="mt-3 space-y-2.5">
            {finaleTraits.map((t) => {
              const gap = t.observed - t.self;
              return (
                <div key={t.axis} className="rounded-2xl glass-card p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">{t.axis}</span>
                    <span
                      className={`text-[10px] ${gap >= 0 ? "text-primary" : "text-accent"}`}
                    >
                      {gap >= 0 ? `+${gap}` : gap} 与自我认知的偏差
                    </span>
                  </div>

                  <Row label="自评" value={t.self} word={t.selfWord} dim />
                  <Row label="观察" value={t.observed} word={t.observedWord} />

                  <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground/80">
                    依据：{t.evidence}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-3xl border border-primary/30 bg-primary/5 p-5">
            <p className="text-[11px] tracking-[0.25em] text-muted-foreground">最终画像</p>
            <h3 className="mt-2 text-lg font-semibold text-primary">{finaleVerdict.title}</h3>
            <p className="mt-2.5 text-xs leading-relaxed text-foreground/85">
              {finaleVerdict.body}
            </p>
          </div>
        </Section>

        <div className="px-6 pt-8 text-center">
          <p className="text-[11px] text-muted-foreground">小屋的灯关了。谢谢你住过这七天。</p>
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            收好这份记录
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  index,
  title,
  desc,
  children,
}: {
  index: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 px-5">
      <div className="mb-3 px-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] tracking-[0.25em] text-primary/70">{index}</span>
          <h2 className="text-base font-medium">{title}</h2>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>
      </div>
      {children}
    </section>
  );
}

function TagBox({
  title,
  tags,
  tone,
}: {
  title: string;
  tags: string[];
  tone: "muted" | "primary";
}) {
  return (
    <div className="rounded-2xl glass-card p-3">
      <p className="text-[10px] text-muted-foreground">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              tone === "primary"
                ? "bg-primary/15 text-primary"
                : "border border-border text-muted-foreground"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  word,
  dim,
}: {
  label: string;
  value: number;
  word: string;
  dim?: boolean;
}) {
  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <span className="w-7 shrink-0 text-[10px] text-muted-foreground">{label}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${dim ? "bg-muted-foreground/50" : "bg-primary"}`}
            style={{ width: `${value}%` }}
          />
        </div>
        <span className="w-6 text-right text-[10px] text-muted-foreground">{value}</span>
      </div>
      <p className={`mt-1 pl-9 text-[11px] ${dim ? "text-muted-foreground" : "text-foreground/85"}`}>
        {word}
      </p>
    </div>
  );
}

/** 一页式分享海报 */
function SharePoster({ onClose }: { onClose: () => void }) {
  const top = finaleBonds[0]!;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center overflow-y-auto bg-black/80 px-5 py-8 backdrop-blur-sm animate-fade-in">
      <button
        onClick={onClose}
        aria-label="关闭海报"
        className="self-end mb-3 grid size-9 place-items-center rounded-full glass-card"
      >
        <X className="size-4" />
      </button>

      {/* 海报本体 · 竖版 */}
      <div className="w-full max-w-[340px] overflow-hidden rounded-[28px] border border-primary/25 bg-gradient-to-b from-[hsl(var(--card))] via-background to-background shadow-glow">
        <div className="relative px-6 pt-7 text-center">
          <p className="text-[9px] tracking-[0.4em] text-muted-foreground">心动小屋 · 七日档案</p>

          <img
            src={meAvatar}
            alt="我的头像"
            width={160}
            height={160}
            className="mx-auto mt-5 size-16 rounded-full object-cover ring-2 ring-primary/40"
          />

          <h2 className="mt-5 text-[26px] font-semibold leading-[1.25] tracking-tight text-foreground">
            {finaleSlogan.line}
          </h2>
          <p className="mt-3 text-[9px] tracking-[0.32em] text-primary">{finaleSlogan.sub}</p>

          <div className="mx-auto my-6 h-px w-10 bg-primary/40" />
        </div>

        {/* 三个高光数字 */}
        <div className="grid grid-cols-3 gap-px bg-border/60">
          {posterHighlights.map((h) => (
            <div key={h.k} className="bg-background px-2 py-4 text-center">
              <p className="text-base font-semibold text-primary">{h.v}</p>
              <p className="mt-1 text-[9px] text-muted-foreground">{h.k}</p>
            </div>
          ))}
        </div>

        {/* 关系与画像 */}
        <div className="space-y-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <img
              src={avatarOf(top.name)}
              alt={top.name}
              width={96}
              height={96}
              className="size-10 rounded-full object-cover ring-1 ring-primary/30"
            />
            <div className="min-w-0">
              <p className="text-[9px] tracking-[0.25em] text-muted-foreground">走到最后的人</p>
              <p className="text-sm font-medium">
                {top.name} · 心动 {top.value}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.25em] text-muted-foreground">小屋看到的你</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {finaleObservedTags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <p className="border-l-2 border-primary/40 pl-2.5 text-[11px] leading-relaxed text-foreground/85">
            {finaleVerdict.title}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
          <span className="text-[9px] tracking-[0.28em] text-muted-foreground">DAY 01 — 07</span>
          <span className="text-[9px] tracking-[0.28em] text-primary">HEART COTTAGE</span>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">长按海报保存，分享给朋友</p>
    </div>
  );
}

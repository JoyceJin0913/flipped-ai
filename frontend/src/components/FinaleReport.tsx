import { useState } from "react";
import { ChevronLeft, Sparkles, Share2, X } from "lucide-react";

// ---- 实时数据源（七日事件流，T2/T5/T6 产出） ----
import { useIslandStore } from "@/stores/useIslandStore";
import type { IslandEventLogEntry, IslandRelationship } from "@/stores/useIslandStore";
import { useGameStore } from "@/stores/useOnboardingStore";
import { getEventById } from "@/data/events";
import { ENDINGS, type EndingCopy } from "@/data/endings";
import { getHeartSignal, type HeartSignal } from "@/core/heartSignal";
import { resolveEndingDetail, type EndingId } from "@/core/ending";
import type { WorldFacts } from "@/core/worldTypes";
import { getNpcById } from "@/onboarding/npcLibrary";
import type { AttachmentType, PlayerProfile, Zodiac } from "@/onboarding/types";

// ---- 静态回退数据源（onboarding 未走 / 结局未锁定的退化局面） ----
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

/**
 * 7 天结束后的结语档案：客观记录 · 关系 · 性格分析 · Day4-6 决策回放
 *
 * 实时模式（默认）：从 useIslandStore 的 eventLog / relationships / worldFacts
 * 计算全部数字与引文，文案（slogan / verdict / milestones / NPC 结语 / 海报高光）
 * 取自 data/endings.ts 的 6 套结局文案包。
 *
 * 静态回退（防御路径）：store.ending 为 null（结局未锁定）或 npcIds 为空
 * （onboarding 未走直接进入）时，整体回退 house.ts 旧静态数据。
 */
export function FinaleReport({ onClose }: { onClose: () => void }) {
  const [poster, setPoster] = useState(false);
  const island = useIslandStore();
  const profile = useGameStore((s) => s.playerProfile);
  const report = buildReport(island, profile);

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
            「{report.slogan.line}」
          </h1>
          <p className="mt-3 text-[10px] tracking-[0.3em] text-primary">{report.slogan.sub}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{report.slogan.desc}</p>

          <button
            onClick={() => setPoster(true)}
            className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-transform active:scale-95"
          >
            <Share2 className="size-3.5" />
            生成分享海报
          </button>

          <div className="mx-auto mt-6 h-px w-16 bg-primary/40" />
        </header>

        {poster && (
          <SharePoster
            onClose={() => setPoster(false)}
            slogan={report.slogan}
            highlights={report.posterHighlights}
            top={report.posterTop}
            observedTags={report.observedTags}
            verdictTitle={report.verdict.title}
            meAvatarSrc={meAvatar}
          />
        )}

        {/* 01 客观记录 */}
        <Section index="01" title="客观记录" desc="这七天里，确实发生过的数字。">
          <div className="grid grid-cols-3 gap-2">
            {report.stats.map((s) => (
              <div key={s.label} className="rounded-2xl glass-card p-3 text-center">
                <p className="text-xl font-semibold text-primary">{s.value}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{s.label}</p>
                {s.sub && <p className="mt-0.5 text-[9px] text-muted-foreground/70">{s.sub}</p>}
              </div>
            ))}
          </div>

          <ol className="mt-4 space-y-0">
            {report.milestones.map((m, i) => (
              <li key={`${m.day}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {i < report.milestones.length - 1 && <span className="w-px flex-1 bg-border" />}
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
        <Section
          index="02"
          title="你和他们"
          desc="七天之后，每段关系停在了哪里。（数值保密，小屋只说感觉）"
        >
          <div className="space-y-2.5">
            {report.bonds.map((b, i) => (
              <div key={`${b.name}-${i}`} className="rounded-2xl glass-card p-4">
                <div className="flex items-center gap-3">
                  {b.avatar ? (
                    <img
                      src={b.avatar}
                      alt={b.name}
                      width={96}
                      height={96}
                      className="size-11 rounded-full object-cover ring-1 ring-primary/30"
                    />
                  ) : (
                    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-medium text-primary ring-1 ring-primary/30">
                      {b.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{b.name}</span>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                        {b.tag}
                      </span>
                      {b.isTop && <Sparkles className="size-3 text-accent" />}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        你 → {b.name} · {b.fromMe}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        {b.name} → 你 · {b.toMe}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{b.summary}</p>
                {b.key && (
                  <p className="mt-2 border-l-2 border-primary/40 pl-2 text-[11px] italic text-foreground/80">
                    {b.key}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* 03 性格分析 */}
        <Section
          index="03"
          title="小屋看到的你"
          desc="入住前你怎么形容自己，七天后小屋看到了什么。"
        >
          <div className="grid grid-cols-2 gap-2">
            <TagBox title="入住前 · 你说" tags={report.selfTags} tone="muted" />
            <TagBox title="七天后 · 小屋说" tags={report.observedTags} tone="primary" />
          </div>

          <div className="mt-3 space-y-2.5">
            {report.traits.map((t) => {
              const gap = t.observed - t.self;
              return (
                <div key={t.axis} className="rounded-2xl glass-card p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">{t.axis}</span>
                    <span className={`text-[10px] ${gap >= 0 ? "text-primary" : "text-accent"}`}>
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
            <h3 className="mt-2 text-lg font-semibold text-primary">{report.verdict.title}</h3>
            <p className="mt-2.5 text-xs leading-relaxed text-foreground/85">
              {report.verdict.body}
            </p>
          </div>
        </Section>

        {/* 04 回放 · Day4-6 决策（实时模式专属；静态回退无 eventLog 不渲染） */}
        {report.replay !== null && (
          <Section index="04" title="回放 · Day 4–6" desc="那些真正改变结局的选择，按时间重放。">
            {report.replay.length === 0 ? (
              <div className="rounded-2xl glass-card p-4 text-center">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  那三天，你没有留下任何决定。
                </p>
                {report.replayEmpty?.map((m) => (
                  <p key={m.day} className="mt-2 text-xs leading-relaxed text-foreground/70">
                    {m.day} · {m.text}
                  </p>
                ))}
              </div>
            ) : (
              <ol className="space-y-2">
                {report.replay.map((r, i) => (
                  <li key={`${r.day}-${i}`} className="rounded-2xl glass-card p-3.5">
                    <p className="text-[10px] tracking-[0.18em] text-muted-foreground">
                      Day {r.day} · 《{r.title}》
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">
                      {r.text ? `「${r.text}」` : "这件事没有发生。"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

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

// ============================================================
// 报告数据模型（实时模式与静态回退共用一套渲染）
// ============================================================

type Stat = { label: string; value: string; sub?: string };
type Milestone = { day: string; text: string };
type TraitRow = {
  axis: string;
  self: number;
  observed: number;
  selfWord: string;
  observedWord: string;
  evidence: string;
};
type ReplayRow = { day: number; title: string; text: string | null };
type PosterTop = { name: string; avatar?: string; line: string };
type BondRow = {
  name: string;
  avatar?: string;
  tag: string;
  /** 你 → TA 的信号标签 */
  fromMe: string;
  /** TA → 你 的信号标签 */
  toMe: string;
  summary: string;
  key?: string;
  isTop: boolean;
};
type ReportData = {
  slogan: { line: string; sub: string; desc: string };
  stats: Stat[];
  milestones: Milestone[];
  bonds: BondRow[];
  selfTags: string[];
  observedTags: string[];
  traits: TraitRow[];
  verdict: { title: string; body: string };
  /** null = 静态回退模式（无 eventLog，不渲染回放区块） */
  replay: ReplayRow[] | null;
  /** 回放为空时的优雅空态文案（取对应结局 Day4-6 的模板行） */
  replayEmpty: Milestone[] | null;
  posterTop: PosterTop | null;
  posterHighlights: { k: string; v: string }[];
};

/** 五档信号中文标签（只定性，不显示数值） */
const HEART_SIGNAL_LABELS: Record<HeartSignal, string> = {
  critical: "心动临界",
  crush: "心动",
  micro: "微动",
  jealous: "吃醋",
  none: "平静",
};

const ATTACHMENT_LABELS: Record<AttachmentType, string> = {
  secure: "安全型",
  anxious: "焦虑型",
  avoidant: "回避型",
};

const ATTACHMENT_WORDS: Record<AttachmentType, string> = {
  secure: "该说的会说",
  anxious: "话在嘴边滚过很多遍",
  avoidant: "说不出口",
};

const ZODIAC_LABELS: Record<Zodiac, string> = {
  aries: "白羊座",
  taurus: "金牛座",
  gemini: "双子座",
  cancer: "巨蟹座",
  leo: "狮子座",
  virgo: "处女座",
  libra: "天秤座",
  scorpio: "天蝎座",
  sagittarius: "射手座",
  capricorn: "摩羯座",
  aquarius: "水瓶座",
  pisces: "双鱼座",
};

/** buildReport 所需的 store 状态视图（不依赖 zustand 钩子的重载类型） */
interface IslandView {
  day: number;
  npcIds: string[];
  relationships: Record<string, IslandRelationship>;
  worldFacts: WorldFacts;
  eventLog: IslandEventLogEntry[];
  ending: EndingId | null;
  highestNpcId: () => string | null;
}

/**
 * 防御路径：ending 未锁定或 npcIds 为空（onboarding 没走直接进入的退化局面）
 * → 整体回退 house.ts 静态数据；否则按 store.ending 走实时数据。
 */
function buildReport(island: IslandView, profile: PlayerProfile | null): ReportData {
  if (island.ending === null || island.npcIds.length === 0) {
    return buildStaticReport();
  }
  const copy = ENDINGS[island.ending];
  if (!copy) return buildStaticReport(); // 未知结局 id 兜底
  return buildLiveReport(island, profile, copy);
}

// ------------------------------------------------------------
// 实时模式：全部数字与引文来自 eventLog / relationships
// ------------------------------------------------------------

function buildLiveReport(
  island: IslandView,
  profile: PlayerProfile | null,
  copy: EndingCopy,
): ReportData {
  const log = island.eventLog;
  const decisions = log.filter((e) => e.kind === "decision");
  const openCount = log.length - decisions.length;

  // ---- 01 客观记录：从真实数据算 ----
  const days = Math.max(island.day, ...log.map((e) => e.day));
  let toNpcSum = 0;
  let fromNpcSum = 0;
  let dangerous = 0;
  let subtle = 0;
  let skipped = 0;
  let proactiveCount = 0; // 至少一次 玩家→NPC 好感变化的决策数
  for (const e of decisions) {
    if (e.risk === "dangerous") dangerous++;
    else if (e.risk === "subtle") subtle++;
    if (!e.optionText) skipped++;
    let pushed = false;
    for (const d of e.deltas ?? []) {
      if (d.direction === "to_npc") {
        toNpcSum += d.delta;
        pushed = true;
      } else {
        fromNpcSum += d.delta;
      }
    }
    if (pushed) proactiveCount++;
  }
  const stats: Stat[] = [
    stat("在小屋的天数", `${days}`, `${days * 24} 小时`),
    stat(
      "关键选择",
      `${decisions.length}`,
      openCount > 0 ? `另有 ${openCount} 个旁观时刻` : undefined,
    ),
    stat("主动的心动", signed(toNpcSum), "你发起的好感变化"),
    stat("收到的心意", signed(fromNpcSum), "流向你的好感变化"),
    stat("冒险时刻", `${dangerous}`, dangerous > 0 ? "你选过站上悬崖的路" : "你始终站在安全区"),
    stat("沉默的时刻", `${skipped}`, skipped > 0 ? "你让这些事没有发生" : "你没有错过任何选择"),
  ];

  // 里程碑：endings.ts 模板 + eventLog 关键条目（当天有真实决策 → 用真实决策）
  const milestones: Milestone[] = [];
  for (let day = 1; day <= 7; day++) {
    const entries = decisions.filter((e) => e.day === day).slice(0, 2);
    if (entries.length > 0) {
      milestones.push({
        day: `Day ${day}`,
        text: entries
          .map((e) => {
            const title = getEventById(e.eventId)?.title ?? e.eventId;
            return e.optionText
              ? `《${title}》你选择了「${e.optionText}」`
              : `《${title}》你没有做出选择`;
          })
          .join("；"),
      });
    } else {
      const tpl = copy.milestones.find((m) => m.day === `Day ${day}`);
      milestones.push({ day: `Day ${day}`, text: tpl?.text ?? `Day ${day} 没有留下记录。` });
    }
  }

  // ---- 02 你和他们：五档信号（不显示数值） ----
  // 结局主角：store 只持久化 ending id，matchNpcId 用同一输入重算
  //（resolveEndingDetail 是纯函数，finale 阶段状态不变 → 结果与锁定一致）。
  const detail = resolveEndingDetail({
    relationships: island.relationships,
    facts: island.worldFacts,
  });
  const topId = detail.matchNpcId ?? (island.ending === "solo" ? null : island.highestNpcId());
  const orderedNpcIds = [
    ...(topId ? [topId] : []),
    ...island.npcIds
      .filter((id) => id !== topId)
      .sort(
        (a, b) => (island.relationships[b]?.toNpc ?? 0) - (island.relationships[a]?.toNpc ?? 0),
      ),
  ];
  const bonds: BondRow[] = orderedNpcIds.map((npcId) => {
    const npc = getNpcById(npcId);
    const name = npc?.name ?? npcId;
    const rel = island.relationships[npcId] ?? { toNpc: 30, fromNpc: 30 };
    const { fromMe, toMe } = npcSignals(log, npcId, rel);
    const quote = [...log]
      .reverse()
      .find((e) => e.targetNpcId === npcId && e.optionText)?.optionText;
    const summary = npc
      ? copy.npcLineByAttachment[npc.attachment].replaceAll("{name}", name)
      : `你和 ${name} 之间，没有留下可供回忆的痕迹。`;
    const isTop = npcId === topId;
    return {
      name,
      ...(npc?.avatar ? { avatar: npc.avatar } : {}),
      tag: isTop ? "走到最后的人" : bondTag(fromMe, toMe),
      fromMe: HEART_SIGNAL_LABELS[fromMe],
      toMe: HEART_SIGNAL_LABELS[toMe],
      summary,
      ...(quote ? { key: `「${quote}」` } : {}),
      isTop,
    };
  });

  // ---- 03 性格分析 ----
  const selfTags: string[] = profile
    ? [profile.mbti, ATTACHMENT_LABELS[profile.attachment], ZODIAC_LABELS[profile.zodiac]]
    : [...finaleSelfTags];
  const observedTags: string[] = [];
  if (proactiveCount >= 5) observedTags.push("先靠近的人");
  else if (decisions.length > 0 && proactiveCount <= 1) observedTags.push("等待的人");
  if (dangerous >= 1) observedTags.push("敢走险棋");
  else if (decisions.length > 0) observedTags.push("稳妥派");
  if (skipped >= 1) observedTags.push("克制");
  if (fromNpcSum >= 30) observedTags.push("被喜欢的人");
  if (observedTags.length === 0) observedTags.push("旁观者");
  const observedTagsFinal = observedTags.slice(0, 4);

  const traits: TraitRow[] = [
    {
      axis: "主动性",
      self: profile ? (profile.mbti.charAt(0) === "E" ? 72 : 38) : finaleTraits[0]!.self,
      selfWord: profile
        ? profile.mbti.charAt(0) === "E"
          ? "我习惯先开始"
          : "我一般等别人先来"
        : finaleTraits[0]!.selfWord,
      observed: decisions.length > 0 ? Math.round((100 * proactiveCount) / decisions.length) : 0,
      observedWord:
        proactiveCount >= 5
          ? `${proactiveCount} 次主动，你几乎每次都先伸出手`
          : proactiveCount >= 2
            ? "你一半主动、一半观望"
            : "七天里你几乎没有主动推进过关系",
      evidence:
        quoteOf(decisions, (e) => (e.deltas ?? []).some((d) => d.direction === "to_npc")) ??
        "Day 4–6 你未曾在任何事件中主动选择谁。",
    },
    {
      axis: "表达",
      self: profile
        ? profile.attachment === "secure"
          ? 60
          : profile.attachment === "anxious"
            ? 45
            : 32
        : finaleTraits[1]!.self,
      selfWord: profile ? ATTACHMENT_WORDS[profile.attachment] : finaleTraits[1]!.selfWord,
      observed:
        decisions.length > 0
          ? Math.round((100 * (dangerous + subtle * 0.5)) / decisions.length)
          : 0,
      observedWord:
        dangerous > 0
          ? "你敢把话递到悬崖边"
          : subtle > 0
            ? "你试探着把话送出去"
            : "你的话都收在安全区",
      evidence:
        quoteOf(decisions, (e) => e.risk === "dangerous" || e.risk === "subtle") ??
        "你的每一次选择都落在「安全」档位上。",
    },
    {
      axis: "共情",
      self: profile ? (profile.mbti.charAt(2) === "F" ? 68 : 48) : finaleTraits[2]!.self,
      selfWord: profile
        ? profile.mbti.charAt(2) === "F"
          ? "我在意别人的感受"
          : "我更习惯讲道理"
        : finaleTraits[2]!.selfWord,
      observed: Math.max(0, Math.min(100, Math.round(50 + fromNpcSum / 2))),
      observedWord: fromNpcSum > 0 ? `七天里你收到了 ${fromNpcSum} 点好感` : "心意似乎没有流向你",
      evidence:
        quoteOf(decisions, (e) => (e.deltas ?? []).some((d) => d.direction === "from_npc")) ??
        "没有足够多的互动可供小屋观察。",
    },
  ];

  // ---- 回放区块：Day 4/5/6 的玩家决策（solo 等可能为空） ----
  const replay: ReplayRow[] = decisions
    .filter((e) => e.day === 4 || e.day === 5 || e.day === 6)
    .map((e) => ({
      day: e.day,
      title: getEventById(e.eventId)?.title ?? e.eventId,
      text: e.optionText,
    }));
  const replayEmpty: Milestone[] | null =
    replay.length === 0
      ? copy.milestones.filter((m) => m.day === "Day 4" || m.day === "Day 5" || m.day === "Day 6")
      : null;

  // ---- 分享海报：走到最后的人 = matchNpcId ?? highestNpcId（solo 显示「没有」） ----
  const topNpc = topId ? getNpcById(topId) : undefined;
  const topSignals = topId
    ? npcSignals(log, topId, island.relationships[topId] ?? { toNpc: 30, fromNpc: 30 })
    : null;
  const posterTop: PosterTop | null =
    topId && topNpc && topSignals
      ? {
          name: topNpc.name,
          ...(topNpc.avatar ? { avatar: topNpc.avatar } : {}),
          line: `你 → ${topNpc.name} · ${HEART_SIGNAL_LABELS[topSignals.fromMe]}`,
        }
      : null;

  return {
    slogan: copy.slogan,
    stats,
    milestones,
    bonds,
    selfTags,
    observedTags: observedTagsFinal,
    traits,
    verdict: copy.verdict,
    replay,
    replayEmpty,
    posterTop,
    posterHighlights: copy.posterHighlights,
  };
}

// ------------------------------------------------------------
// 静态回退：数据不可用时完整使用 house.ts 旧文案与数值
// ------------------------------------------------------------

function buildStaticReport(): ReportData {
  const topBond = finaleBonds[0]!;
  const topAvatar = avatarOf(topBond.name);
  return {
    slogan: finaleSlogan,
    stats: finaleStats,
    milestones: finaleMilestones,
    bonds: finaleBonds.map((b, i) => {
      const avatar = avatarOf(b.name);
      return {
        name: b.name,
        ...(avatar ? { avatar } : {}),
        tag: b.tag,
        fromMe: staticSignalLabel(b.value),
        toMe: staticSignalLabel(b.value),
        summary: b.summary,
        key: b.key,
        isTop: i === 0,
      };
    }),
    selfTags: finaleSelfTags,
    observedTags: finaleObservedTags,
    traits: finaleTraits,
    verdict: finaleVerdict,
    replay: null,
    replayEmpty: null,
    posterTop: {
      name: topBond.name,
      ...(topAvatar ? { avatar: topAvatar } : {}),
      line: `心动 ${topBond.value}`,
    },
    posterHighlights,
  };
}

/** 静态回退用的定性标签（house.ts 只有数值，转成档位文案） */
function staticSignalLabel(value: number): string {
  if (value >= 75) return "心动";
  if (value >= 40) return "微动";
  if (value >= 20) return "破冰";
  return "平静";
}

// ------------------------------------------------------------
// 小工具
// ------------------------------------------------------------

function stat(label: string, value: string, sub?: string): Stat {
  return sub === undefined ? { label, value } : { label, value, sub };
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** 单 NPC 双向信号（moments 用各自方向的真实 Δ，todayVotes 在结局页恒为 0） */
function npcSignals(
  log: IslandEventLogEntry[],
  npcId: string,
  rel: { toNpc: number; fromNpc: number },
): { fromMe: HeartSignal; toMe: HeartSignal } {
  const toNpcDeltas: number[] = [];
  const fromNpcDeltas: number[] = [];
  for (const e of log) {
    for (const d of e.deltas ?? []) {
      if (d.npcId !== npcId) continue;
      if (d.direction === "to_npc") toNpcDeltas.push(d.delta);
      else fromNpcDeltas.push(d.delta);
    }
  }
  return {
    fromMe: getHeartSignal({
      heartValue: rel.toNpc,
      interactionCount: toNpcDeltas.length,
      moments: toNpcDeltas.map((delta) => ({ delta })),
      todayVotesForOthers: 0,
    }),
    toMe: getHeartSignal({
      heartValue: rel.fromNpc,
      interactionCount: fromNpcDeltas.length,
      moments: fromNpcDeltas.map((delta) => ({ delta })),
      todayVotesForOthers: 0,
    }),
  };
}

/** 关系标签：只由信号档位定性，不暴露数值 */
function bondTag(fromMe: HeartSignal, toMe: HeartSignal): string {
  if (fromMe === "critical" || toMe === "critical") return "临界心动";
  if (fromMe === "crush" || toMe === "crush") return "心动过";
  if (fromMe === "micro" || toMe === "micro") return "微动";
  if (fromMe === "jealous" || toMe === "jealous") return "吃醋";
  return "礼貌的距离";
}

/** 从 Day4–6 决策里挑一条符合条件的引文（优先有选项文本的） */
function quoteOf(
  decisions: IslandEventLogEntry[],
  match: (e: IslandEventLogEntry) => boolean,
): string | null {
  const e = decisions.find((entry) => {
    if (entry.day < 4 || entry.day > 6) return false;
    if (!entry.optionText) return false;
    return match(entry);
  });
  if (!e?.optionText) return null;
  const title = getEventById(e.eventId)?.title ?? e.eventId;
  return `Day ${e.day}《${title}》：${e.optionText}`;
}

// ============================================================
// 布局组件
// ============================================================

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
      <p
        className={`mt-1 pl-9 text-[11px] ${dim ? "text-muted-foreground" : "text-foreground/85"}`}
      >
        {word}
      </p>
    </div>
  );
}

/** 一页式分享海报（数据全部由父组件传入） */
function SharePoster({
  onClose,
  slogan,
  highlights,
  top,
  observedTags,
  verdictTitle,
  meAvatarSrc,
}: {
  onClose: () => void;
  slogan: { line: string; sub: string; desc: string };
  highlights: { k: string; v: string }[];
  top: PosterTop | null;
  observedTags: string[];
  verdictTitle: string;
  meAvatarSrc: string;
}) {
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
            src={meAvatarSrc}
            alt="我的头像"
            width={160}
            height={160}
            className="mx-auto mt-5 size-16 rounded-full object-cover ring-2 ring-primary/40"
          />

          <h2 className="mt-5 text-[26px] font-semibold leading-[1.25] tracking-tight text-foreground">
            {slogan.line}
          </h2>
          <p className="mt-3 text-[9px] tracking-[0.32em] text-primary">{slogan.sub}</p>

          <div className="mx-auto my-6 h-px w-10 bg-primary/40" />
        </div>

        {/* 三个高光数字 */}
        <div className="grid grid-cols-3 gap-px bg-border/60">
          {highlights.map((h) => (
            <div key={h.k} className="bg-background px-2 py-4 text-center">
              <p className="text-base font-semibold text-primary">{h.v}</p>
              <p className="mt-1 text-[9px] text-muted-foreground">{h.k}</p>
            </div>
          ))}
        </div>

        {/* 关系与画像 */}
        <div className="space-y-4 px-6 py-6">
          <div className="flex items-center gap-3">
            {top ? (
              top.avatar ? (
                <img
                  src={top.avatar}
                  alt={top.name}
                  width={96}
                  height={96}
                  className="size-10 rounded-full object-cover ring-1 ring-primary/30"
                />
              ) : (
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-medium text-primary ring-1 ring-primary/30">
                  {top.name.charAt(0)}
                </div>
              )
            ) : (
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-[10px] text-muted-foreground ring-1 ring-border">
                —
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[9px] tracking-[0.25em] text-muted-foreground">走到最后的人</p>
              <p className="text-sm font-medium">
                {top ? `${top.name} · ${top.line}` : "没有 · 一个人走完了七天"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.25em] text-muted-foreground">小屋看到的你</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {observedTags.map((t) => (
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
            {verdictTitle}
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

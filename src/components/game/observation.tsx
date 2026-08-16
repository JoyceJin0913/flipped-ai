/**
 * 心动观察 / 我的 / 终选之夜 / 复盘画像
 * PRD §11.3 分级视觉信号 · §14 复盘画像
 */

import { useMemo, useState } from "react";
import {
  Heart, Sparkles, Lock, Coins, RotateCcw, Trophy, Zap, Frown, Eye,
} from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { getNpcById } from "../../core/npcLibrary";
import { INTENT_LABELS } from "../../core/types";
import type { IntentType, NPC, Relationship } from "../../core/types";
import { ECONOMY_CONFIG, VOTE_CONFIG } from "../../core/scoring";
import {
  TopBar, PrimaryButton, GhostButton, Avatar, Chip, HeartBar, BottomSheet,
  EmptyState, SectionTitle, STAGE_LABELS, ATTACHMENT_LABELS, ATTACHMENT_DESC,
} from "./shared";
import { DeltaTag } from "./dayloop";

//心动信号视觉映射（PRD §11.3）
const SIGNAL_META: Record<string, { label: string; cls: string }> = {
  critical: { label: "心动暴击", cls: "border-primary bg-secondary text-primary" },
  crush: { label: "明显心动", cls: "border-female/40 bg-female/10 text-female" },
  micro: { label: "微表情", cls: "border-border bg-card/70 text-muted-foreground" },
  jealous: { label: "在吃醋", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  none: { label: "无波动", cls: "border-border bg-card/50 text-muted-foreground/60" },
};

// ============================================================
// 心动观察页
// ============================================================

export function RelationshipsView() {
  const islandNpcs = useGameStore((s) => s.islandNpcs);
  const relationships = useGameStore((s) => s.relationships);
  const getHeartSignal = useGameStore((s) => s.getHeartSignal);

  const [detailId, setDetailId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...islandNpcs].sort(
        (a, b) => (relationships[b.id]?.heartValue ?? 0) - (relationships[a.id]?.heartValue ?? 0)
      ),
    [islandNpcs, relationships]
  );

  return (
    <>
      <TopBar title="心动观察" subtitle="每个人的心动值、阶段与冰山进度" />
      <div className="bg-night-fade animate-fade-in space-y-3 px-4 pt-4">
        {sorted.length === 0 ? (
          <EmptyState text="还没有人入岛。" />
        ) : (
          sorted.map((npc) => {
            const rel = relationships[npc.id];
            const signal = getHeartSignal(npc.id);
            const sm = SIGNAL_META[signal] ?? SIGNAL_META["none"]!;
            return (
              <button
                key={npc.id}
                onClick={() => setDetailId(npc.id)}
                className="w-full rounded-3xl glass-card p-4 text-left transition-colors hover:bg-secondary/60 active:scale-[0.98]"
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    name={npc.name}
                    gender={npc.gender}
                    size="lg"
                    ring={signal === "critical" || signal === "crush"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-foreground">{npc.name}</span>
                      <Chip tone="primary">{rel ? STAGE_LABELS[rel.stage] : "陌生"}</Chip>
                      <span
                        className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${sm.cls}`}
                      >
                        {sm.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {npc.mbti} · {ATTACHMENT_LABELS[npc.attachment]} · 互动{" "}
                      {rel?.interactionCount ?? 0} 次
                    </p>
                    <div className="mt-2">
                      <HeartBar value={rel?.heartValue ?? 0} />
                    </div>
                    <div className="mt-2 flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full ${
                            i < (rel?.icebergCluesUnlocked ?? 0) ? "bg-primary" : "bg-secondary"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <AffinityDetail
        npcId={detailId}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}

// ============================================================
// 关系详情（冰山四层 + 心动瞬间时间线）
// ============================================================

function AffinityDetail({
  npcId,
  open,
  onClose,
}: {
  npcId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const relationships = useGameStore((s) => s.relationships);
  const npc = npcId ? getNpcById(npcId) : null;
  const rel = npcId ? relationships[npcId] : null;

  if (!npc || !rel) return null;

  const unlocked = rel.icebergCluesUnlocked;
  const layers = [
    { label: "L1 表现层", text: npc.personality.surface.join(" · ") },
    { label: "L2 角色层", text: npc.personality.role },
    { label: "L3 冲突层", text: npc.personality.conflict },
    { label: "L4 核心层", text: npc.personality.core },
  ];

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="mb-5 flex items-center gap-3">
        <Avatar name={npc.name} gender={npc.gender} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-foreground">{npc.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {npc.age} 岁 · {npc.zodiac} · {npc.mbti}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip tone="primary">{STAGE_LABELS[rel.stage]}</Chip>
            <Chip>{ATTACHMENT_LABELS[npc.attachment]}</Chip>
          </div>
          <div className="mt-2">
            <HeartBar value={rel.heartValue} />
          </div>
        </div>
      </div>

      {/* 冰山四层 */}
      <SectionTitle hint={`${unlocked}/4 已解锁`}>冰山人格</SectionTitle>
      <div className="mb-5 space-y-2">
        {layers.map((l, i) => {
          const on = i < unlocked;
          return (
            <div
              key={l.label}
              className={`rounded-2xl border p-3.5 ${
                on ? "border-primary bg-secondary shadow-glow" : "border-border bg-card/50"
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                {on ? (
                  <Sparkles className="size-3 text-primary" />
                ) : (
                  <Lock className="size-3 text-muted-foreground/60" />
                )}
                <span
                  className={`text-[11px] font-semibold ${
                    on ? "text-primary" : "text-muted-foreground/60"
                  }`}
                >
                  {l.label}
                </span>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  on ? "text-foreground" : "select-none text-muted-foreground/30 blur-[3px]"
                }`}
              >
                {on ? l.text : "继续和TA 相处才能看到这一层"}
              </p>
            </div>
          );
        })}
      </div>

      {/* 核心需求 / 雷区 */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card/50 p-3.5">
          <p className="mb-1.5 text-[11px] font-semibold text-primary">核心需求</p>
          {unlocked >= 3 ? (
            <ul className="space-y-1">
              {npc.coreNeeds.map((n) => (
                <li key={n} className="text-[11px] leading-relaxed text-muted-foreground">
                  · {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">解锁 L3 后可见</p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card/50 p-3.5">
          <p className="mb-1.5 text-[11px] font-semibold text-destructive">雷区</p>
          {unlocked >= 2 ? (
            <ul className="space-y-1">
              {npc.redFlags.map((n) => (
                <li key={n} className="text-[11px] leading-relaxed text-muted-foreground">
                  · {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">解锁 L2 后可见</p>
          )}
        </div>
      </div>

      {/* 心动瞬间时间线 */}
      <SectionTitle hint={`${rel.moments.length} 条`}>心动瞬间</SectionTitle>
      {rel.moments.length === 0 ? (
        <EmptyState text="还没有共同记忆。" />
      ) : (
        <div className="space-y-2 pb-2">
          {[...rel.moments].reverse().slice(0, 20).map((m, i) => (
            <div key={i} className="flex items-start gap-3 rounded-2xl glass-card p-3">
              <div className="w-11 shrink-0">
                <p className="text-[10px] font-semibold text-primary">D{m.day}</p>
                <p className="text-[10px] text-muted-foreground">{m.time}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground/70">{m.place}</p>
                <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-foreground">
                  {m.text}
                </p>
                {m.intent && (
                  <span className="mt-1 inline-block text-[10px] text-muted-foreground/60">
                    意图：{INTENT_LABELS[m.intent]}
                  </span>
                )}
              </div>
              <DeltaTag delta={m.delta} />
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

// ============================================================
// 我的页
// ============================================================

export function MeView() {
  const profile = useGameStore((s) => s.playerProfile);
  const testResult = useGameStore((s) => s.testResult);
  const economy = useGameStore((s) => s.economy);
  const dayCycle = useGameStore((s) => s.dayCycle);
  const relationships = useGameStore((s) => s.relationships);
  const votes = useGameStore((s) => s.votes);
  const resetGame = useGameStore((s) => s.resetGame);
  const setPhase = useGameStore((s) => s.setPhase);

  const [confirmReset, setConfirmReset] = useState(false);

  const totalInteractions = Object.values(relationships).reduce(
    (s, r) => s + r.interactionCount,
    0
  );
  const totalMoments = Object.values(relationships).reduce((s, r) => s + r.moments.length, 0);

  return (
    <>
      <TopBar title="我的" subtitle="档案 · 资源 ·沉淀故事" />
      <div className="bg-night-fade animate-fade-in space-y-4 px-4 pt-4">
        {/* 档案卡 */}
        <div className="glass-card shadow-glow rounded-3xl p-5">
          <div className="flex items-center gap-4">
            <Avatar
              name={profile?.name ?? "你"}
              gender={profile?.gender ?? "male"}
              size="xl"
            />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-foreground">{profile?.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Chip tone="primary">{profile?.mbti}</Chip>
                <Chip>{profile ? ATTACHMENT_LABELS[profile.attachment] : ""}</Chip>
                {profile?.weakAxes.map((a) => (
                  <Chip key={a}>{a} 摇摆</Chip>
                ))}
              </div>
            </div>
          </div>
          {profile && (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {ATTACHMENT_DESC[profile.attachment]}
            </p>
          )}
        </div>

        {/* 资源 */}
        <div className="glass-card rounded-3xl p-5">
          <SectionTitle hint={`每日 +${ECONOMY_CONFIG.DAILY_BONUS}`}>心动点数</SectionTitle>
          <div className="flex items-center gap-2">
            <Coins className="size-5 text-primary" />
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {economy.points}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card/50 p-3">
              <p className="text-[11px] text-muted-foreground">偷看券</p>
              <p className="mt-0.5 text-base font-semibold text-foreground">
                {economy.peekCoupons}
                {economy.freePeekGrantedOn.includes(dayCycle.currentDay) && (
                  <span className="ml-1 text-[10px] text-primary">今日免费</span>
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/50 p-3">
              <p className="text-[11px] text-muted-foreground">闯入券</p>
              <p className="mt-0.5 text-base font-semibold text-foreground">
                {economy.intrudeCoupons}
                {economy.freeIntrudeGrantedOn.includes(dayCycle.currentDay) && (
                  <span className="ml-1 text-[10px] text-primary">今日免费</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 进度统计 */}
        <div className="glass-card rounded-3xl p-5">
          <SectionTitle>本局数据</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "当前天数", value: `${dayCycle.currentDay} / 7` },
              { label: "互动次数", value: totalInteractions },
              { label: "心动瞬间", value: totalMoments },
              { label: "已投票数", value: votes.filter((v) => !v.isRevoke).length },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card/50 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 四轴分布 */}
        {testResult && (
          <div className="glass-card rounded-3xl p-5">
            <SectionTitle hint="人格测试结果">恋爱人格画像</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-card/50 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">焦虑维度</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">
                  {testResult.raw.anx}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card/50 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">回避维度</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">
                  {testResult.raw.avo}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 危险操作 */}
        <div className="glass-card rounded-3xl p-5">
          <SectionTitle>重新开始</SectionTitle>
          {!confirmReset ? (
            <GhostButton onClick={() => setConfirmReset(true)}>
              <span className="flex items-center justify-center gap-1.5">
                <RotateCcw className="size-3.5" />
                清空进度重开
              </span>
            </GhostButton>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-destructive">
                所有关系、心动值与记忆都会被清空，无法恢复。
              </p>
              <PrimaryButton
                onClick={() => {
                  resetGame();
                  setPhase("profile_setup");
                }}
              >
                确认清空
              </PrimaryButton>
              <GhostButton onClick={() => setConfirmReset(false)}>取消</GhostButton>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// 终选之夜（PRD §7）
// ============================================================

export function FinaleNight() {
  const islandNpcs = useGameStore((s) => s.islandNpcs);
  const relationships = useGameStore((s) => s.relationships);
  const setPhase = useGameStore((s) => s.setPhase);
  const setStoryPicked = useGameStore((s) => s.setStoryPicked);
  const storyPicked = useGameStore((s) => s.storyPicked);

  const [picked, setPicked] = useState<string | null>(storyPicked["finale"] ?? null);
  const [revealed, setRevealed] = useState(false);

  const sorted = useMemo(
    () =>
      [...islandNpcs].sort(
        (a, b) => (relationships[b.id]?.heartValue ?? 0) - (relationships[a.id]?.heartValue ?? 0)
      ),
    [islandNpcs, relationships]
  );

  const pickedNpc = picked ? getNpcById(picked) : null;
  const pickedRel = picked ? relationships[picked] : null;

  // 对方是否也选了你：心动值 >= 60 且阶段为 crush 视为双向
  const mutual = (pickedRel?.heartValue ?? 0) >= 60;

  if (revealed && pickedNpc) {
    return (
      <>
        <TopBar title="终选结果" subtitle="灯亮的那一刻" time="23:00" />
        <div className="bg-night-fade animate-fade-in space-y-5 px-5 pt-8">
          <div className="glass-card shadow-glow rounded-3xl p-7 text-center">
            <Avatar name={pickedNpc.name} gender={pickedNpc.gender} size="xl" ring />
            <p className="mt-4 text-xl font-bold text-foreground">{pickedNpc.name}</p>
            <div className="mt-2 flex justify-center gap-1.5">
              <Chip tone="primary">{pickedRel ? STAGE_LABELS[pickedRel.stage] : ""}</Chip>
              <Chip>心动值 {pickedRel?.heartValue ?? 0}</Chip>
            </div>

            <div className="mt-6">
              {mutual ? (
                <>
                  <Trophy className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-3 text-base font-semibold text-primary">双向选择</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    灯亮的那一刻，你看到TA 站在对面。
                    <br />
                    七天里所有的犹豫和试探，在这一秒都有了答案。
                  </p>
                </>
              ) : (
                <>
                  <Frown className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-base font-semibold text-muted-foreground">
                    你选了 TA，TA 选了别人
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    灯亮起来，对面是空的。
                    <br />
                    你也说不清是失落，还是终于松了一口气。
                  </p>
                </>
              )}
            </div>
          </div>

          <PrimaryButton onClick={() => setPhase("review")}>
            查看你的恋爱复盘画像
          </PrimaryButton>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="终选之夜" subtitle="Day 7 · 只能选一个人" time="23:00" />
      <div className="bg-night-fade animate-fade-in space-y-4 px-4 pt-4">
        <div className="glass-card rounded-3xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">七天到了</p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            灯会同时亮起。你走向谁，谁走向你，都藏不住了。
            <br />
            现在，选一个人。
          </p>
        </div>

        <div className="space-y-3">
          {sorted.map((npc) => {
            const rel = relationships[npc.id];
            const on = picked === npc.id;
            return (
              <button
                key={npc.id}
                onClick={() => setPicked(npc.id)}
                className={`w-full rounded-3xl border p-4 text-left transition-colors active:scale-[0.98] ${
                  on
                    ? "border-primary bg-secondary shadow-glow"
                    : "border-border glass-card hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={npc.name} gender={npc.gender} size="lg" ring={on} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-foreground">{npc.name}</span>
                      <Chip tone="primary">{rel ? STAGE_LABELS[rel.stage] : "陌生"}</Chip>
                      {on && (
                        <Heart className="ml-auto h-4 w-4 fill-current text-primary" />
                      )}
                    </div>
                    <div className="mt-2">
                      <HeartBar value={rel?.heartValue ?? 0} />
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {rel?.moments.length ?? 0} 段共同记忆 · 冰山{" "}
                      {rel?.icebergCluesUnlocked ?? 0}/4
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <PrimaryButton
          disabled={!picked}
          onClick={() => {
            if (!picked) return;
            setStoryPicked("finale", picked);
            setRevealed(true);
          }}
        >
          {picked ? "点亮我的灯" : "选一个人"}
        </PrimaryButton>
      </div>
    </>
  );
}

// ============================================================
// 复盘画像（PRD §14）
// ============================================================

export function ReviewPortrait() {
  const profile = useGameStore((s) => s.playerProfile);
  const relationships = useGameStore((s) => s.relationships);
  const islandNpcs = useGameStore((s) => s.islandNpcs);
  const votes = useGameStore((s) => s.votes);
  const resetGame = useGameStore((s) => s.resetGame);

  // 意图偏好统计
  const intentStats = useMemo(() => {
    const counts: Record<string, number> = {
      probe: 0, advance: 0, soothe: 0, humor: 0, adventure: 0,
    };
    Object.values(relationships).forEach((r) =>
      r.moments.forEach((m) => {
        if (m.intent) counts[m.intent] = (counts[m.intent] ?? 0) + 1;
      })
    );
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return (Object.entries(counts) as [IntentType, number][])
      .map(([k, v]) => ({ intent: k, count: v, pct: Math.round((v / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [relationships]);

  const topPair = useMemo<{ npc: NPC; rel: Relationship } | null>(() => {
    let best: { npc: NPC; rel: Relationship } | null = null;
    islandNpcs.forEach((npc) => {
      const rel = relationships[npc.id];
      if (rel && (best === null || rel.heartValue > best.rel.heartValue)) best = { npc, rel };
    });
    return best;
  }, [islandNpcs, relationships]);

  // 生成画像文案
  const portrait = useMemo(() => {
    const top = intentStats[0];
    const map: Record<IntentType, string> = {
      probe: "你是「观察者型恋人」。你习惯先看清再靠近，安全但也容易错过时机。",
      advance: "你是「直球型恋人」。你敢主动定义关系，但对回避型的人可能推得太急。",
      soothe: "你是「疗愈型恋人」。你擅长接住别人的情绪，但要注意别忘了自己也需要被接住。",
      humor: "你是「轻盈型恋人」。你用幽默化解尴尬，但深层话题可能一直没机会发生。",
      adventure: "你是「冒险型恋人」。你带来新鲜感，但节奏太快会让人跟不上。",
    };
    return map[top?.intent ?? "probe"];
  }, [intentStats]);

  const attachInsight = useMemo(() => {
    if (!profile) return "";
    const map = {
      secure: "你的依恋模式是安全型 —— 这意味着你既能靠近也能独处。这局里你的选择比大多数人更稳。",
      anxious: "你的依恋模式偏焦虑 —— 你在等一个确认。留意一下：你有多少次心动，其实是在等对方先给答案？",
      avoidant: "你的依恋模式偏回避 —— 每次靠近你都先想好了退路。这局里，你有没有哪一刻想留下但没说？",
    };
    return map[profile.attachment];
  }, [profile]);

  return (
    <>
      <TopBar title="复盘画像" subtitle="七天结束了，来看看你是什么样的人" />
      <div className="bg-night-fade animate-fade-in space-y-4 px-4 pt-4">
        {/* 主画像 */}
        <div className="glass-card shadow-glow rounded-3xl p-6">
          <Sparkles className="mb-3 h-6 w-6 text-primary" />
          <p className="text-base font-semibold leading-relaxed text-foreground">{portrait}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{attachInsight}</p>
        </div>

        {/* 意图偏好 */}
        <div className="glass-card rounded-3xl p-5">
          <SectionTitle hint="你最常用哪种方式">对话意图分布</SectionTitle>
          <div className="space-y-3">
            {intentStats.map((s) => (
              <div key={s.intent}>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-foreground">{INTENT_LABELS[s.intent]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {s.count}次 · {s.pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="bg-romance h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(1, s.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 关系最终盘 */}
        <div className="glass-card rounded-3xl p-5">
          <SectionTitle hint="最终心动值">关系收官</SectionTitle>
          <div className="space-y-2.5">
            {[...islandNpcs]
              .sort(
                (a, b) =>
                  (relationships[b.id]?.heartValue ?? 0) - (relationships[a.id]?.heartValue ?? 0)
              )
              .map((npc) => {
                const rel = relationships[npc.id];
                return (
                  <div key={npc.id} className="flex items-center gap-3">
                    <Avatar name={npc.name} gender={npc.gender} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{npc.name}</span>
                        <Chip>{rel ? STAGE_LABELS[rel.stage] : "陌生"}</Chip>
                      </div>
                      <div className="mt-1">
                        <HeartBar value={rel?.heartValue ?? 0} />
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* 数据观察 */}
        <div className="glass-card rounded-3xl p-5">
          <SectionTitle>数据观察</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "总互动",
                value: Object.values(relationships).reduce((s, r) => s + r.interactionCount, 0),
              },
              {
                label: "共同记忆",
                value: Object.values(relationships).reduce((s, r) => s + r.moments.length, 0),
              },
              { label: "投出的票", value: votes.filter((v) => !v.isRevoke).length },
              {
                label: "解锁冰山",
                value: Object.values(relationships).reduce(
                  (s, r) => s + r.icebergCluesUnlocked,
                  0
                ),
              },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card/50 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {topPair && (
          <div className="glass-card rounded-3xl p-5">
            <div className="flex items-center gap-2.5">
              <Eye className="size-4 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                你和{" "}
                <span className="font-semibold text-primary">{topPair.npc.name}</span>{" "}
                走得最近，解锁了 TA 的{" "}
                <span className="font-semibold text-foreground">
                  {topPair.rel.icebergCluesUnlocked}/4
                </span>{" "}
                层人格。
                {topPair.rel.icebergCluesUnlocked < 4 &&
                  "还有一层你没看到 —— 有些人，你以为你懂了。"}
              </p>
            </div>
          </div>
        )}

        <PrimaryButton onClick={() => resetGame()}>再玩一局</PrimaryButton>
      </div>
    </>
  );
}

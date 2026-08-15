/**
 * 日循环三幕引擎（PRD §3/ §4.4）
 * daytime（白天公共事件）→ private_chat（20:00 私聊）→ solo_review（22:00 独处复盘）
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Sun, MessageCircle, Moon, Heart, Eye, DoorOpen, Sparkles,
  TrendingUp, TrendingDown, Lock, Send, Coins, RotateCcw, Flame,
} from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { getNpcById } from "../../core/npcLibrary";
import {
  INTENT_LABELS, INTENT_COLORS, ACT_ORDER,
} from "../../core/types";
import type { IntentType, ActKey, NPC, Relationship } from "../../core/types";
import { ECONOMY_CONFIG, VOTE_CONFIG } from "../../core/scoring";
import {
  TopBar, PrimaryButton, GhostButton, Avatar, Chip, HeartBar, BottomSheet,
  EmptyState, SectionTitle, STAGE_LABELS, ATTACHMENT_LABELS, INTENT_ICONS,
} from "./shared";
import { PublicEventSceneByDay } from "./PublicEventScene";
import type { EventChatContext } from "../../data/eventScripts";

const ACT_META: Record<ActKey, { label: string; time: string; Icon: typeof Sun; desc: string }> = {
  daytime: { label: "白天", time: "10:00", Icon: Sun, desc: "小屋公共时间，所有人都在场" },
  private_chat: { label: "私聊", time: "20:00", Icon: MessageCircle, desc: "选一个人，单独说说话" },
  solo_review: { label: "独处", time: "22:00", Icon: Moon, desc: "回房间，整理今天的心动" },
};

// 白天公共事件库（PRD §3.4 共同记忆）
const PUBLIC_EVENTS = [
  { id: "breakfast", title: "早餐桌上的沉默", desc: "有人先起来做了早餐，你走进厨房时，几双眼睛同时看过来。" },
  { id: "kitchen", title: "厨房分工", desc: "今天轮到两个人做饭，大家在客厅里心照不宣地等着谁开口。" },
  { id: "game", title: "真心话游戏", desc: "转瓶子停在了你面前。所有人都在等你回答那个问题。" },
  { id: "beach", title: "海边散步", desc: "下午有人提议去海边，队伍走着走着就散成了几对。" },
  { id: "night_talk", title: "天台夜谈", desc: "有人在天台上待了很久，你上去的时候，TA正好回头。" },
  { id: "date_pick", title: "约会邀请环节", desc: "节目组给了每人一次邀约机会。写下名字的那一刻，空气很安静。" },
  { id: "farewell", title: "淘汰前夜", desc: "今晚会有人离开。大家都在客厅坐着，没人先说话。" },
];

// ============================================================
// 小屋主视图（三幕推进）
// ============================================================

export function HouseView({ onOpenChat }: { onOpenChat: (npcId: string) => void }) {
  const dayCycle = useGameStore((s) => s.dayCycle);
  const islandNpcs = useGameStore((s) => s.islandNpcs);
  const relationships = useGameStore((s) => s.relationships);
  const economy = useGameStore((s) => s.economy);
  const advanceAct = useGameStore((s) => s.advanceAct);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const completeCurrentAct = useGameStore((s) => s.completeCurrentAct);
  const processPublicEvent = useGameStore((s) => s.processPublicEvent);
  const addEvent = useGameStore((s) => s.addEvent);
  const setPhase = useGameStore((s) => s.setPhase);
  const addPoints = useGameStore((s) => s.addPoints);

  const { currentDay, currentAct } = dayCycle;
  const meta = ACT_META[currentAct];
  const actIdx = ACT_ORDER.indexOf(currentAct);
  const completed = dayCycle.actCompleted[currentDay]?.[currentAct] === true;

  const todayEvent = useMemo(
    () => PUBLIC_EVENTS[(currentDay - 1) % PUBLIC_EVENTS.length]!,
    [currentDay]
  );

  // ---- 公共事件场景状态 ----
  const [eventSceneActive, setEventSceneActive] = useState(false);
  const [eventChatContext, setEventChatContext] = useState<EventChatContext | null>(null);

  // ---- 白天：触发公共事件（进入交互式场景）----
  const handleTriggerEvent = () => {
    setEventSceneActive(true);
  };

  // ---- 公共事件场景完成回调 ----
  const handleEventSceneComplete = useCallback(
    (ctx: EventChatContext, _deltas: Record<string, number>) => {
      setEventChatContext(ctx);
      processPublicEvent(todayEvent.id, todayEvent.title);
      addEvent({
        id: `${todayEvent.id}-d${currentDay}`,
        day: currentDay,
        act: "daytime",
        type: "public",
        timestamp: "10:00",
        title: todayEvent.title,
        description: ctx.topic ?? todayEvent.desc,
        participants: ctx.mentionedNpcs?.length ? ctx.mentionedNpcs : islandNpcs.map((n) => n.id),
      });
      completeCurrentAct();
    },
    [todayEvent, currentDay, islandNpcs, processPublicEvent, addEvent, completeCurrentAct]
  );

  // ---- 独处：领每日点数 + 推进 ----
  const handleFinishDay = () => {
    completeCurrentAct();
    if (currentDay >= 7) {
      setPhase("finale");
    } else {
      addPoints(ECONOMY_CONFIG.DAILY_BONUS);
      advanceDay();
    }
  };

  return (
    <>
      <TopBar
        title="小屋"
        subtitle={`Day ${currentDay} · ${meta.label} — ${meta.desc}`}
        time={meta.time}
        right={
          <div className="inline-flex items-center gap-1 rounded-full glass-card px-3 py-1.5">
            <Coins className="size-3 text-primary" />
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {economy.points}
            </span>
          </div>
        }
      />

      <div className="bg-night-fade animate-fade-in space-y-4 px-4 pt-4">
        {/* 三幕进度 */}
        <div className="glass-card rounded-3xl p-4">
          <div className="flex items-center justify-between">
            {ACT_ORDER.map((a, i) => {
              const { Icon, label, time } = ACT_META[a];
              const isDone = dayCycle.actCompleted[currentDay]?.[a] === true;
              const isNow = a === currentAct;
              return (
                <div key={a} className="flex flex-1 items-center">
                  <div className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`flex size-9 items-center justify-center rounded-full transition-colors ${
                        isNow
                          ? "bg-romance text-primary-foreground shadow-glow"
                          : isDone
                            ? "bg-primary/20 text-primary"
                            : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <span
                      className={`text-[10px] ${isNow ? "font-semibold text-primary" : "text-muted-foreground"}`}
                    >
                      {label}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60">{time}</span>
                  </div>
                  {i < ACT_ORDER.length - 1 && (
                    <div
                      className={`h-px w-4 ${isDone ? "bg-primary/40" : "bg-border"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary/70">
            <div
              className="bg-romance h-full rounded-full transition-all duration-500"
              style={{ width: `${(currentDay / 7) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            第 {currentDay} 天 / 共 7 天
          </p>
        </div>

        {/* ---- 幕一：白天公共事件（交互式故事线）---- */}
        {currentAct === "daytime" && (
          <div className="glass-card rounded-3xl p-5">
            {!completed && !eventSceneActive ? (
              /* 事件入口：显示标题 + 进入按钮 */
              <>
                <SectionTitle hint="全员在场">今日公共事件</SectionTitle>
                <div className="rounded-2xl glass-card p-4">
                  <p className="text-sm font-semibold text-foreground">{todayEvent.title}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {todayEvent.desc}
                  </p>
                </div>
                <PrimaryButton className="mt-4" onClick={handleTriggerEvent}>
                  进入场景
                </PrimaryButton>
              </>
            ) : !completed && eventSceneActive ? (
              /* 交互式事件场景：旁白 → NPC对话 → 玩家选项 → 结局 */
              <PublicEventSceneByDay
                day={currentDay}
                onComplete={handleEventSceneComplete}
              />
            ) : (
              /* 事件已完成：展示摘要 */
              <>
                <SectionTitle hint="已完成">今日公共事件</SectionTitle>
                <div className="rounded-2xl glass-card p-4">
                  <p className="text-sm font-semibold text-foreground">{todayEvent.title}</p>
                  {eventChatContext && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">关键瞬间</p>
                      {eventChatContext.keyMoments?.map((m, i) => (
                        <p key={i} className="text-[11px] leading-relaxed text-muted-foreground/80">
                          · {m}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <PrimaryButton className="mt-4" onClick={advanceAct}>
                  等到 20:00 · 进入私聊
                </PrimaryButton>
              </>
            )}
          </div>
        )}

        {/* ---- 幕二：私聊 ---- */}
        {currentAct === "private_chat" && (
          <>
            <div className="glass-card rounded-3xl p-5">
              <SectionTitle hint={`已聊 ${dayCycle.chattedToday.length} 人`}>
                20:00 · 选一个人私聊
              </SectionTitle>
              <div className="space-y-2.5">
                {islandNpcs.map((npc) => {
                  const rel = relationships[npc.id];
                  const chatted = dayCycle.chattedToday.includes(npc.id);
                  return (
                    <button
                      key={npc.id}
                      onClick={() => onOpenChat(npc.id)}
                      className="flex w-full items-center gap-3 rounded-2xl glass-card p-3 text-left transition-colors hover:bg-secondary/60 active:scale-[0.98]"
                    >
                      <Avatar name={npc.name} gender={npc.gender} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{npc.name}</span>
                          <Chip tone={chatted ? "default" : "primary"}>
                            {rel ? STAGE_LABELS[rel.stage] : "陌生"}
                          </Chip>
                          {chatted && (
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              今日已聊
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5">
                          <HeartBar value={rel?.heartValue ?? 0} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="glass-card rounded-3xl p-5">
              <SectionTitle hint="消耗点数">窥探小屋</SectionTitle>
              <PeekPanel />
            </div>

            <PrimaryButton onClick={() => { completeCurrentAct(); advanceAct(); }}>
              回房间 · 进入独处复盘
            </PrimaryButton>
          </>
        )}

        {/* ---- 幕三：独处复盘 ---- */}
        {currentAct === "solo_review" && (
          <SoloReview onFinish={handleFinishDay} isLastDay={currentDay >= 7} />
        )}
      </div>
    </>
  );
}

// ============================================================
// 心动值变动标签
// ============================================================

export function DeltaTag({ delta }: { delta: number }) {
  if (delta === 0)
    return <span className="shrink-0 text-[11px] text-muted-foreground">±0</span>;
  const up = delta > 0;
  return (
    <span
      className={`flex shrink-0 items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
        up ? "text-primary" : "text-destructive"
      }`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}
      {delta}
    </span>
  );
}

// ============================================================
//偷看 / 闯入面板（PRD §9 经济系统）
// ============================================================

function PeekPanel() {
  const economy = useGameStore((s) => s.economy);
  const islandNpcs = useGameStore((s) => s.islandNpcs);
  const competitors = useGameStore((s) => s.competitors);
  const usePeekCoupon = useGameStore((s) => s.usePeekCoupon);
  const useIntrudeCoupon = useGameStore((s) => s.useIntrudeCoupon);
  const dayCycle = useGameStore((s) => s.dayCycle);

  const [reveal, setReveal] = useState<string | null>(null);

  const freePeek = economy.freePeekGrantedOn.includes(dayCycle.currentDay);
  const freeIntrude = economy.freeIntrudeGrantedOn.includes(dayCycle.currentDay);

  const handlePeek = () => {
    if (!usePeekCoupon()) {
      setReveal("点数不足，今天只能靠猜了。");
      return;
    }
    const a = islandNpcs[Math.floor(Math.random() * islandNpcs.length)];
    const b = competitors[Math.floor(Math.random() * Math.max(1, competitors.length))];
    setReveal(
      a && b
        ? `你从走廊拐角看到：${b.name} 正在和 ${a.name} 说话。${a.name} 笑了一下，但很快低下头。`
        : "走廊很安静，什么也没看到。"
    );
  };

  const handleIntrude = () => {
    if (!useIntrudeCoupon()) {
      setReveal("闯入需要更多点数。");
      return;
    }
    const a = islandNpcs[Math.floor(Math.random() * islandNpcs.length)];
    setReveal(
      a
        ? `你直接推门进去。${a.name} 抬头看你，房间里另一个人的话停在半句。空气凝了三秒。`
        : "房间里没人。"
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handlePeek}
          className="flex flex-col items-center gap-1.5 rounded-2xl glass-card py-3.5 transition-transform hover:scale-[1.02] active:scale-95"
        >
          <Eye className="size-4 text-primary" />
          <span className="text-xs font-medium text-foreground">偷看</span>
          <span className="text-[10px] text-muted-foreground">
            {freePeek ? "今日免费" : `${ECONOMY_CONFIG.PEEK_COST} 点`}
          </span>
        </button>
        <button
          onClick={handleIntrude}
          className="flex flex-col items-center gap-1.5 rounded-2xl glass-card py-3.5 transition-transform hover:scale-[1.02] active:scale-95"
        >
          <DoorOpen className="size-4 text-accent-foreground" />
          <span className="text-xs font-medium text-foreground">闯入</span>
          <span className="text-[10px] text-muted-foreground">
            {freeIntrude ? "今日免费" : `${ECONOMY_CONFIG.INTRUDE_COST} 点`}
          </span>
        </button>
      </div>
      {reveal && (
        <div className="animate-fade-in rounded-2xl glass-card p-3.5">
          <p className="text-xs leading-relaxed text-muted-foreground">{reveal}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 独处复盘（幕三）
// ============================================================

function SoloReview({ onFinish, isLastDay }: { onFinish: () => void; isLastDay: boolean }) {
  const dayCycle = useGameStore((s) => s.dayCycle);
  const relationships = useGameStore((s) => s.relationships);
  const islandNpcs = useGameStore((s) => s.islandNpcs);
  const castVote = useGameStore((s) => s.castVote);
  const revokeVote = useGameStore((s) => s.revokeVote);
  const votes = useGameStore((s) => s.votes);

  const todayVotes = votes.filter((v) => v.day === dayCycle.currentDay && !v.isRevoke);
  const remain = dayCycle.remainingVotes;

  // 今日心动瞬间汇总
  const todayMoments = useMemo(() => {
    const list: { npc: NPC; text: string; delta: number; place: string }[] = [];
    islandNpcs.forEach((npc) => {
      const rel = relationships[npc.id];
      rel?.moments
        .filter((m) => m.day === dayCycle.currentDay)
        .forEach((m) => list.push({ npc, text: m.text, delta: m.delta, place: m.place }));
    });
    return list.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [islandNpcs, relationships, dayCycle.currentDay]);

    const topNpc = useMemo<{ npc: NPC; rel: Relationship } | null>(() => {
    let best: { npc: NPC; rel: Relationship } | null = null;
    islandNpcs.forEach((npc) => {
      const rel = relationships[npc.id];
      if (rel && (best === null || rel.heartValue > best.rel.heartValue)) best = { npc, rel };
    });
    return best;
  }, [islandNpcs, relationships]);

  return (
    <>
      <div className="glass-card rounded-3xl p-5">
        <SectionTitle hint="22:00">今天的心动瞬间</SectionTitle>
        {todayMoments.length === 0 ? (
          <EmptyState text="今天什么也没发生。有时候安静也是一种答案。" />
        ) : (
          <div className="space-y-2.5">
            {todayMoments.slice(0, 6).map((m, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-2xl glass-card p-3">
                <Avatar name={m.npc.name} gender={m.npc.gender} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{m.npc.name}</span>
                    <span className="text-[10px] text-muted-foreground">{m.place}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {m.text.split("\n").pop()}
                  </p>
                </div>
                <DeltaTag delta={m.delta} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 心动投票 */}
      <div className="glass-card rounded-3xl p-5">
        <SectionTitle hint={`剩余 ${remain} / ${VOTE_CONFIG.DAILY_VOTE_LIMIT} 票`}>
          今晚投给谁
        </SectionTitle>
        <div className="space-y-2">
          {islandNpcs.map((npc) => {
            const voted = todayVotes.some((v) => v.targetId === npc.id);
            const rel = relationships[npc.id];
            return (
              <div
                key={npc.id}
                className="flex items-center gap-3 rounded-2xl glass-card p-3"
              >
                <Avatar name={npc.name} gender={npc.gender} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{npc.name}</p>
                  <div className="mt-1">
                    <HeartBar value={rel?.heartValue ?? 0} showLabel={false} />
                  </div>
                </div>
                <button
                  onClick={() => (voted ? revokeVote() : castVote(npc.id))}
                  disabled={!voted && remain <= 0}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium transition-transform active:scale-95 disabled:opacity-30 ${
                    voted
                      ? "bg-romance text-primary-foreground shadow-glow"
                      : "border border-border bg-card/70 text-muted-foreground"
                  }`}
                >
                  <Heart className={`size-3 ${voted ? "fill-current" : ""}`} />
                  {voted ? "已投" : "投票"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/70">
          每票 +{VOTE_CONFIG.VOTE_VALUE} 心动值，撤回会扣 {VOTE_CONFIG.REVOKE_PENALTY} 点。
          TA 会知道你今晚把票给了谁。
        </p>
      </div>

      {/* 今日总结 */}
      {topNpc && (
        <div className="glass-card shadow-glow rounded-3xl p-5">
          <div className="flex items-center gap-3">
            <Flame className="size-4 text-primary" />
            <p className="text-xs text-muted-foreground">
              今天心动值最高的是{" "}
              <span className="font-semibold text-primary">{topNpc.npc.name}</span>
              （{topNpc.rel.heartValue} · {STAGE_LABELS[topNpc.rel.stage]}）
            </p>
          </div>
        </div>
      )}

      <PrimaryButton onClick={onFinish}>
        {isLastDay ? "进入终选之夜" : "睡吧 · 进入第二天"}
      </PrimaryButton>
    </>
  );
}

// ============================================================
// 私聊弹层（五类意图判定，PRD §12.2）
// ============================================================

interface ChatLine {
  from: "npc" | "me";
  text: string;
  delta?: number;
  intent?: IntentType;
  /** NPC 的动作/神情描述（括号内） */
  action?: string;
}

/** 导入新的选项生成器和回复生成器 */
import { generateChatChoices, type ChatChoice } from "../../data/chatTemplates";
import { generateOpeningLine, generateContextualResponse } from "../../data/npcResponses";
import { callLlmForNpc, type LlmChatTurn } from "../../core/actor/llmEngine";
import type { WorldEventLog } from "../../core/state/worldTypes";

/**
 * 降级兜底时的「回应锚点」
 *
 * LLM 不可用时，模板回复可能与玩家原话脱节。这里根据玩家选项的意图 +
 * NPC 依恋类型，拼一句明确指向玩家那句话的开头，消除「已读乱回」观感。
 */
function buildAnchorLine(choice: ChatChoice, npc: NPC): string {
  const byAttachment: Record<string, Record<string, string>> = {
    avoidant: {
      probe: "你问这个啊。",
      advance: "……你说得挺直接。",
      soothe: "不用替我担心。",
      humor: "嗯，这话说得。",
      adventure: "你还真敢问。",
      default: "嗯。",
    },
    anxious: {
      probe: "你是想知道这个吗？",
      advance: "你这么说……我得先确认一下。",
      soothe: "你会这样说，我有点意外。",
      humor: "你是在逗我吧？",
      adventure: "你这问题让我有点慌。",
      default: "你是这个意思吗？",
    },
    fearful: {
      probe: "你问到这儿了。",
      advance: "……先别说这个。",
      soothe: "我没事，真的。",
      humor: "你倒是会转话题。",
      adventure: "这个我不太想答。",
      default: "……",
    },
    secure: {
      probe: "你想聊这个，可以。",
      advance: "我听明白你的意思了。",
      soothe: "谢谢你这么说。",
      humor: "行，这个我接。",
      adventure: "你挺敢问的。",
      default: "嗯，我说说我的想法。",
    },
  };

  const pool = byAttachment[npc.attachment] ?? byAttachment["secure"]!;
  const anchor = pool[choice.intentType] ?? pool["default"] ?? "";
  return anchor ? `${anchor}\n` : "";
}

export function ChatSheet({
  npcId,
  open,
  onClose,
}: {
  npcId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const relationships = useGameStore((s) => s.relationships);
  const processInteraction = useGameStore((s) => s.processInteraction);
  const dayCycle = useGameStore((s) => s.dayCycle);
  const worldState = useGameStore((s) => s.worldState);
  const playerProfile = useGameStore((s) => s.playerProfile);
  const playerName = playerProfile?.name ?? "对方";

  const npc = npcId ? getNpcById(npcId) : null;
  const rel = npcId ? relationships[npcId] : null;

  const [lines, setLines] = useState<ChatLine[]>([]);
  const [clue, setClue] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  /** LLM 调用失败、当前这句是模板兜底 */
  const [llmDegraded, setLlmDegraded] = useState(false);
  const isNight = dayCycle.currentAct === "solo_review";

  /** 当前可用的 3 个聊天选项 */
  const [choices, setChoices] = useState<ChatChoice[]>([]);
  /** 已进行的对话轮数（每对玩家消息+NPC回复算一轮） */
  const [round, setRound] = useState(0);

  /** 当天事件的基础上下文（用于选项生成） */
  const baseContext = useMemo(() => {
    const lastEvent = dayCycle.events[dayCycle.events.length - 1];
    const tensionLevel: "low" | "medium" | "high" | "very-high" =
      dayCycle.currentDay <= 2 ? "low" :
      dayCycle.currentDay <= 4 ? "medium" :
      dayCycle.currentDay <= 5 ? "high" : "very-high";
    return {
      eventTopic: lastEvent?.title,
      npcWasMentioned: lastEvent?.participants?.includes(npcId ?? "") ?? false,
      tensionLevel,
      dayNumber: dayCycle.currentDay,
    };
  }, [dayCycle.events, dayCycle.currentDay, npcId]);

  /** 根据当前对话状态重新生成 3 个选项 */
  const regenerateChoices = useCallback((currentNpc: NPC, currentRel: Relationship, currentLines: ChatLine[], currentRound: number) => {
    // 取最近一条 NPC 回复作为上下文（用于差异化模板）
    const lastNpcLine = [...currentLines].reverse().find((l) => l.from === "npc");

    const dynamicCtx: Parameters<typeof generateChatChoices>[0] = {
      npc: currentNpc,
      relationship: currentRel,
      eventContext: {
        eventTopic: baseContext.eventTopic,
        npcWasMentioned: baseContext.npcWasMentioned,
        tensionLevel: baseContext.tensionLevel,
        dayNumber: baseContext.dayNumber,
        round: currentRound,
        lastNpcReply: lastNpcLine?.text,
      },
    };

    const generated = generateChatChoices(dynamicCtx);
    setChoices(generated);
  }, [baseContext]);

  useEffect(() => {
    if (open && npc && rel) {
      // 动态生成开场白
      const opening = generateOpeningLine(npc, {
        ...(baseContext.eventTopic ? { topic: baseContext.eventTopic } : {}),
        npcMentioned: baseContext.npcWasMentioned,
        tensionLevel: baseContext.tensionLevel,
        dayNumber: baseContext.dayNumber,
      });

      setLines([{ from: "npc", text: opening }]);
      setClue(null);
      setRound(0);
      regenerateChoices(npc, rel, [{ from: "npc", text: opening }], 0);
    }
  }, [open, npcId]);

  if (!npc || !npcId) return null;

  /** 处理玩家选择某个聊天选项（异步 LLM 回复） */
  const handleChoice = async (choice: ChatChoice) => {
    if (isTyping) return;

    // 先立即显示玩家消息
    const playerLine: ChatLine = { from: "me", text: choice.text, intent: choice.intentType };
    const historyBeforeReply = lines;
    const linesWithPlayer = [...lines, playerLine];
    setLines(linesWithPlayer);
    setIsTyping(true);
    setLlmDegraded(false);

    // 使用选项映射的意图类型调用数值引擎（好感度仅后台记录）
    const result = processInteraction(choice.intentType, npcId, isNight ? "private_night" : "private_day");

    // ---- 调用 LLM 生成 NPC 回复 ----
    let npcReply = "";
    let npcAction: string | undefined;
    let llmSuccess = false;

    try {
      // 把本次私聊的真实往返传给 LLM —— 这是 NPC 能"接得上话"的关键
      const chatHistory: LlmChatTurn[] = historyBeforeReply.map((l) => ({
        from: l.from,
        text: l.text,
      }));

      const llmOutput = await callLlmForNpc(
        npcId,
        worldState?.personalityVectors?.[npcId],
        worldState?.textContracts?.[npcId],
        worldState?.eventLog as WorldEventLog | undefined,
        choice.text,
        {
          topic: baseContext.eventTopic ?? "入岛后的日常闲聊",
          tensionLevel:
            baseContext.tensionLevel === "low" ? 30 :
            baseContext.tensionLevel === "medium" ? 50 :
            baseContext.tensionLevel === "high" ? 68 : 82,
          heartValue: rel?.heartValue ?? 30,
          relationshipStage: rel ? STAGE_LABELS[rel.stage] : "陌生",
          day: dayCycle.currentDay,
          playerName: playerName || "对方",
          playerIntent: choice.intentType,
          playerRiskLevel: choice.meta.riskLevel,
          scene: "private",
          isNight,
        },
        chatHistory
      );

      if (llmOutput?.line) {
        npcReply = llmOutput.line;
        npcAction = llmOutput.action;
        llmSuccess = true;
      }
    } catch {
      // 落入降级分支
    }

    // ---- 降级：模板引擎 + 玩家话锚定（保证不会答非所问）----
    if (!llmSuccess) {
      const lastEvent = dayCycle.events[dayCycle.events.length - 1];
      const respContext: { topic?: string; npcWasMentioned?: boolean; tensionLevel?: string } = {};
      if (lastEvent?.title) respContext.topic = lastEvent.title;
      respContext.npcWasMentioned = lastEvent?.participants?.includes(npcId ?? "") ?? false;
      respContext.tensionLevel = dayCycle.currentDay <= 2 ? "low" : dayCycle.currentDay <= 4 ? "medium" : "high";
      const templateReply = generateContextualResponse({
        choice,
        npc,
        eventContext: respContext,
        relationship: rel!,
      });
      // 锚定：在模板回复前拼一句针对玩家原话的回应，避免"已读乱回"观感
      npcReply = `${buildAnchorLine(choice, npc)}${templateReply}`;
      setLlmDegraded(true);
    }

    setIsTyping(false);

    const updatedLines: ChatLine[] = [
      ...linesWithPlayer,
      {
        from: "npc",
        text: npcReply,
        delta: result.delta,
        ...(npcAction ? { action: npcAction } : {}),
      },
    ];
    setLines(updatedLines);

    if (result.unlocksIcebergClue && result.clueText) setClue(result.clueText);

    // 立即基于最新对话状态重新生成下一轮 3 个选项
    const nextRound = round + 1;
    setRound(nextRound);
    regenerateChoices(npc, rel!, updatedLines, nextRound);
  };

  const cluesUnlocked = rel?.icebergCluesUnlocked ?? 0;
  const ICEBERG_LAYERS = [
    { key: "surface", label: "表现层" },
    { key: "role", label: "角色层" },
    { key: "conflict", label: "冲突层" },
    { key: "core", label: "核心层" },
  ] as const;

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* 头部 */}
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={npc.name} gender={npc.gender} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">{npc.name}</span>
            <Chip tone="primary">{rel ? STAGE_LABELS[rel.stage] : "陌生"}</Chip>
            {isNight && <Chip tone="danger">深夜 ×1.3</Chip>}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {npc.mbti} · {ATTACHMENT_LABELS[npc.attachment]}
          </p>
          <div className="mt-1.5">
            {/* 好感度仅后台记录，不向玩家暴露具体数值 */}
            <HeartBar value={rel?.heartValue ?? 0} showLabel={false} />
          </div>
        </div>
      </div>

      {/* 冰山进度 */}
      <div className="mb-4 flex gap-1.5">
        {ICEBERG_LAYERS.map((l, i) => {
          const on = i < cluesUnlocked;
          return (
            <div
              key={l.key}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] ${
                on ? "bg-primary/15 text-primary" : "bg-secondary/50 text-muted-foreground/60"
              }`}
            >
              {!on && <Lock className="size-2.5" />}
              {l.label}
            </div>
          );
        })}
      </div>

      {/* 对话流 */}
      <div className="mb-4 max-h-56 space-y-2.5 overflow-y-auto rounded-2xl border border-border bg-background/40 p-3">
        {lines.map((l, i) =>
          l.from === "npc" ? (
            <div key={i} className="flex items-start gap-2">
              <Avatar name={npc.name} gender={npc.gender} size="sm" />
              <div className="max-w-[78%] rounded-2xl bg-secondary px-3.5 py-2">
                {l.action && (
                  <p className="mb-1 text-[11px] italic leading-relaxed text-muted-foreground/80">
                    {l.action}
                  </p>
                )}
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{l.text}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-end">
              <div className="max-w-[78%] rounded-2xl bg-romance px-3.5 py-2">
                <p className="text-sm font-medium leading-relaxed text-primary-foreground">
                  {l.text}
                </p>
              </div>
            </div>
          )
        )}
        {/* 打字指示器 */}
        {isTyping && (
          <div className="flex items-center gap-2 animate-fade-in">
            <Avatar name={npc.name} gender={npc.gender} size="sm" />
            <div className="rounded-2xl bg-secondary px-4 py-3">
              <div className="flex gap-1">
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" style={{ animationDelay: "0ms" }} />
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" style={{ animationDelay: "150ms" }} />
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 冰山线索解锁提示 */}
      {clue && (
        <div className="animate-fade-in mb-4 rounded-2xl border border-primary bg-secondary p-3.5 shadow-glow">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-primary">解锁新的冰山线索</span>
          </div>
          <p className="whitespace-pre-line text-xs leading-relaxed text-foreground">{clue}</p>
        </div>
      )}

      {/* 三句聊天选项（替代原有五意图按钮） */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground">
          {isTyping ? `${npc.name} 正在回复…` : "想跟 TA 聊点什么？"}
        </p>
        {llmDegraded && (
          <span className="text-[9px] text-yellow-400/70">离线模式</span>
        )}
      </div>
      <div className="space-y-2">
        {choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => handleChoice(choice)}
            disabled={isTyping}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.98] disabled:opacity-40 ${
              choice.meta.riskLevel === "risky"
                ? "border-red-400/30 bg-red-400/5 hover:bg-red-400/10"
                : choice.meta.riskLevel === "moderate"
                  ? "border-yellow-400/30 bg-yellow-400/5 hover:bg-yellow-400/10"
                  : "border-border bg-card/70 hover:bg-secondary/60"
            }`}
          >
            <p className="text-sm leading-relaxed text-foreground">{choice.text}</p>
            <div className="mt-1 flex items-center gap-2">
              {choice.meta.source === "event_ref" && (
                <span className="text-[9px] font-medium text-primary/70">📌 今日事件</span>
              )}
              {choice.meta.source === "personality" && (
                <span className="text-[9px] font-medium text-blue-400/70">💭 关于TA</span>
              )}
              <span className={`text-[9px] ${
                choice.meta.riskLevel === "risky" ? "text-red-400/60" :
                choice.meta.riskLevel === "moderate" ? "text-yellow-400/60" :
                "text-green-400/60"
              }`}>
                {choice.meta.riskLevel === "safe" ? "● 安全" :
                 choice.meta.riskLevel === "moderate" ? "◐ 需谨慎" : "○ 冒险"}
              </span>
            </div>
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground/70">
        选项会根据今天的公共事件和你们的关系动态变化。不同依恋类型对同一话题反应不同。
      </p>

      <div className="mt-5">
        <GhostButton onClick={onClose}>结束这段对话</GhostButton>
      </div>
    </BottomSheet>
  );
}

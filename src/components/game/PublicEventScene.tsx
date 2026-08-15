/**
 * 公共事件交互式场景组件（三层架构版）
 *
 * 导演层竞价调度 → 演员层模板组合 → 裁判层Δ结算
 * NPC 按人格向量自由互动，不按固定剧本
 *
 * 降级机制：导演层出错时 fallback 到 v1.0 固定脚本
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { getNpcById } from "../../core/npcLibrary";
import type {
  EventScript,
  EventChatContext,
} from "../../data/eventScripts";
import { getEventScript } from "../../data/eventScripts";
import type { ActorOutput, EmotionTag, ActorContext, TextContract } from "../../core/actor/types";
import { generateActorOutput } from "../../core/actor/templateEngine";
import { pickMicroReaction } from "../../core/actor/microReactions";
import { runBidding } from "../../core/director/scheduler";
import { generateBlueprint, generateBlueprintV11, adjustTension, checkResolution } from "../../core/director/beats";
import type { Beat, SceneBlueprint, BiddingResult, SceneTurn, TensionState } from "../../core/director/types";
import { buildOptions, deriveEvalState } from "../../core/director/optionBuilder";
import type { BuiltOption } from "../../core/director/optionBuilder";
import { getOptionRecipe } from "../../data/optionRecipes";
import { assertObserverBeatExists } from "../../core/director/beatRunner";
import { settle } from "../../core/referee/settlement";
import { filterByAudience, createPublicEvent } from "../../core/state/eventLog";
import type { WorldEventLog } from "../../core/state/worldTypes";
import {
  TopBar, PrimaryButton, GhostButton, Avatar, SectionTitle,
} from "./shared";

// ============================================================
// 类型定义
// ============================================================

interface DynamicTurn {
  speakers: Array<{
    npcId: string;
    output: ActorOutput;
    delta: number;
  }>;
  microReactions: Array<{
    npcId: string;
    text: string;
  }>;
  beat: Beat;
  bidding: BiddingResult;
}

interface ChatChoiceItem {
  id: string;
  text: string;
  intentType: string;
  riskLevel: "safe" | "moderate" | "risky";
}

// ============================================================
// 子组件：旁白文本（逐段显示）
// ============================================================

function NarrationBlock({
  lines,
  onComplete,
}: {
  lines: string[];
  onComplete?: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setVisibleCount(0);
    setDone(false);
  }, [lines]);

  const showNext = useCallback(() => {
    if (visibleCount < lines.length) {
      setVisibleCount((c) => c + 1);
    }
    if (visibleCount + 1 >= lines.length) {
      setDone(true);
      onComplete?.();
    }
  }, [visibleCount, lines.length, onComplete]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (visibleCount === 0 && lines.length > 0) {
        setVisibleCount(1);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [lines.length, visibleCount]);

  return (
    <div className="space-y-3">
      {lines.slice(0, visibleCount).map((line, i) => (
        <p
          key={i}
          className="animate-fade-in text-sm leading-relaxed text-muted-foreground"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {line}
        </p>
      ))}
      {!done && visibleCount < lines.length && (
        <button
          onClick={showNext}
          className="mt-2 flex items-center gap-1 text-xs text-primary/70 transition-colors hover:text-primary"
        >
          继续阅读 <ChevronRight className="size-3" />
        </button>
      )}
    </div>
  );
}

// ============================================================
// 子组件：NPC 动态对话气泡
// ============================================================

function DynamicDialogueBubble({ output }: { output: ActorOutput }) {
  const npc = getNpcById(output.npcId);
  if (!npc) return null;

  return (
    <div className="animate-fade-in flex items-start gap-2.5 rounded-2xl bg-secondary/40 px-3.5 py-3">
      <Avatar name={npc.name} gender={npc.gender} size="sm" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="text-[11px] font-semibold text-primary">
          {npc.name}
        </span>
        {output.action && (
          <p className="text-[11px] leading-relaxed italic text-muted-foreground/80">
            {output.action}
          </p>
        )}
        <p className="text-sm leading-relaxed text-foreground">
          {output.line}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// 子组件：微反应旁注
// ============================================================

function MicroReactionNote({ npcId, text }: { npcId: string; text: string }) {
  const npc = getNpcById(npcId);
  if (!npc) return null;

  return (
    <div className="animate-fade-in flex items-center gap-2 rounded-xl bg-secondary/20 px-3 py-1.5">
      <Avatar name={npc.name} gender={npc.gender} size="sm" />
      <p className="text-[11px] leading-relaxed italic text-muted-foreground/70">
        {text}
      </p>
    </div>
  );
}

// ============================================================
// 子组件：玩家选项按钮
// ============================================================

function ChoiceButton({
  choice,
  onClick,
  disabled,
}: {
  choice: ChatChoiceItem;
  onClick: () => void;
  disabled?: boolean;
}) {
  const riskColor =
    choice.riskLevel === "risky"
      ? "border-red-400/30 bg-red-400/5 hover:bg-red-400/10"
      : choice.riskLevel === "moderate"
        ? "border-yellow-400/30 bg-yellow-400/5 hover:bg-yellow-400/10"
        : "border-border bg-card/70 hover:bg-secondary/60";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.98] disabled:opacity-50 ${riskColor}`}
    >
      <p className="text-sm leading-relaxed text-foreground">{choice.text}</p>
    </button>
  );
}

// ============================================================
// 场景阶段类型
// ============================================================

type ScenePhase =
  | "atmosphere"
  | "opening"
  | "dynamic_dialogue"
  | "choice"
  | "ending"
  | "complete";

// ============================================================
// 主组件：公共事件场景（三层架构版）
// ============================================================

interface PublicEventSceneProps {
  script: EventScript;
  onComplete: (chatContext: EventChatContext, affinityChanges: Record<string, number>) => void;
}

export function PublicEventScene({ script, onComplete }: PublicEventSceneProps) {
  const worldState = useGameStore((s) => s.worldState);
  const appendWorldEvent = useGameStore((s) => s.appendWorldEvent);
  const updateRelationship = useGameStore((s) => s.updateRelationship);
  const relationships = useGameStore((s) => s.relationships);
  const islandNpcs = useGameStore((s) => s.islandNpcs);

  // ---- 场景状态 ----
  const [phase, setPhase] = useState<ScenePhase>("atmosphere");
  const [turns, setTurns] = useState<DynamicTurn[]>([]);
  const [currentChoices, setCurrentChoices] = useState<ChatChoiceItem[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [endingNarration, setEndingNarration] = useState<string[]>([]);
  const [tension, setTension] = useState<TensionState>(
    worldState.tension ?? { current: 30, trend: "stable", lastDelta: 0 }
  );
  const [directorError, setDirectorError] = useState(false);

  // ---- 生成场景蓝图（v1.1：合并 BeatV1Ext 扩展字段）----
  const blueprint = useMemo<SceneBlueprint>(() => {
    try {
      const npcIds = islandNpcs.map((n) => n.id);
      const bp = generateBlueprintV11(script.day, "daytime", tension, npcIds);
      // 用 v1.0 脚本的氛围和旁白填充
      bp.title = script.title;
      bp.location = script.location;
      bp.atmosphere = script.atmosphere;
      bp.fallbackScriptId = script.id;
      // v1.1 校验：一天至少 1 个 observer beat
      assertObserverBeatExists(bp);
      return bp;
    } catch {
      setDirectorError(true);
      return generateBlueprint(script.day, "daytime", tension, islandNpcs.map((n) => n.id));
    }
  }, [script, tension, islandNpcs]);

  // ---- 构建 ActorContext ----
  const buildActorContext = useCallback(
    (npcId: string, beat: Beat): ActorContext => {
      const npc = getNpcById(npcId);
      const pv = worldState.personalityVectors[npcId];
      const contract = worldState.textContracts[npcId];
      const visibleEvents = filterByAudience(worldState.eventLog, npcId);
      const rel = relationships[npcId];

      // 如果没有人格向量或文字契约，降级
      if (!pv || !contract || !npc) {
        throw new Error(`Missing personality data for NPC ${npcId}`);
      }

      const sceneHistory: SceneTurn[] = turns.flatMap((t) =>
        t.speakers.map((s) => ({
          npcId: s.npcId,
          line: s.output.line,
          ...(s.output.action ? { action: s.output.action } : {}),
          intentType: s.output.intent.type,
          emotionTag: s.output.emotionTag,
          isMicroReaction: false,
        }))
      );

      return {
        npcId,
        personality: pv,
        textContract: contract as TextContract,
        visibleEvents,
        directorCtx: {
          beat,
          speakerId: npcId,
          topic: beat.topic ?? script.title,
          tensionLevel: tension.current,
          sceneHistory,
          audienceFilter: islandNpcs.map((n) => n.id),
          day: script.day,
        },
        relationshipToPlayer: rel?.heartValue ?? 30,
        relationshipsToNpcs: {},
      };
    },
    [worldState, relationships, islandNpcs, turns, tension, script]
  );

  // ---- 执行一轮动态对话 ----
  const runDialogueTurn = useCallback(() => {
    try {
      const beatIndex = turns.length;
      const beat = blueprint.beats[beatIndex];
      if (!beat || beat.type !== "dialogue") {
        // 没有更多对话节拍了，进入选择阶段
        setPhase("choice");
        return;
      }

      const npcIds = islandNpcs.map((n) => n.id);
      const silenceMap: Record<string, number> = {};
      const cooldownMap: Record<string, number> = {};
      for (const id of npcIds) {
        silenceMap[id] = turns.filter((t) => !t.speakers.some((s) => s.npcId === id)).length;
        cooldownMap[id] = turns.length > 0 && turns[turns.length - 1]?.speakers.some((s) => s.npcId === id) ? 2 : 0;
      }

      // 1. 导演竞价
      const bidding = runBidding(
        beat.speakerCandidates.length > 0 ? beat.speakerCandidates : npcIds,
        worldState.personalityVectors,
        beat,
        worldState.eventLog,
        silenceMap,
        cooldownMap
      );

      // 2. 演员生成台词 + 裁判结算
      const speakers: DynamicTurn["speakers"] = [];
      for (const speakerId of bidding.speakers) {
        try {
          const ctx = buildActorContext(speakerId, beat);
          const output = generateActorOutput(ctx);

          // 裁判结算（好感 Δ 后台记录，不展示）
          const npc = getNpcById(speakerId);
          if (npc) {
            const result = settle({
              actorOutput: output,
              targetNpcId: speakerId,
              currentHeart: relationships[speakerId]?.heartValue ?? 30,
              scene: "public",
              relationshipStage: relationships[speakerId]?.stage ?? "stranger",
              personalityVector: ctx.personality,
            });

            // 后台更新好感度
            if (result.delta !== 0) {
              updateRelationship(speakerId, (r) => ({
                ...r,
                heartValue: Math.max(0, Math.min(100, r.heartValue + result.delta)),
                moments: [
                  ...r.moments,
                  {
                    text: `公共事件：${script.title}`,
                    delta: result.delta,
                    place: "公共事件",
                    day: script.day,
                    time: script.time,
                  },
                ],
              }));
            }

            // 记录事件到世界状态
            appendWorldEvent(
              createPublicEvent(
                `evt_d${script.day}_t${turns.length}_${speakerId}`,
                script.day,
                "daytime",
                script.time,
                `${npc.name}: ${output.line}`,
                [speakerId],
                {
                  intentTag: output.intent.type,
                  emotionTag: output.emotionTag,
                  beatRef: beat.id,
                  line: output.line,
                  ...(output.action ? { action: output.action } : {}),
                }
              )
            );

            speakers.push({ npcId: speakerId, output, delta: result.delta });
          }
        } catch {
          // 演员层出错，跳过该 NPC
        }
      }

      // 3. 微反应
      const microReactions = bidding.microReactors.map((id) => {
        const pv = worldState.personalityVectors[id];
        const npc = getNpcById(id);
        const emotion: EmotionTag = tension.current > 60 ? "defensive" : "neutral";
        const text = pv && npc
          ? pickMicroReaction(pv, emotion, npc.name)
          : `（${npc?.name ?? "某人"}安静地听着）`;
        return { npcId: id, text };
      });

      // 4. 更新张力
      const newTension = adjustTension(tension, beat.type, script.day);
      setTension(newTension);

      // 5. 记录本轮结果
      const turn: DynamicTurn = { speakers, microReactions, beat, bidding };
      setTurns((prev) => [...prev, turn]);

      // 6. 检查收场
      const allSpeakers = new Set(turns.flatMap((t) => t.speakers.map((s) => s.npcId)));
      if (checkResolution(beatIndex, blueprint.beats.length, newTension, allSpeakers, beat.mustInclude)) {
        setPhase("choice");
      }
    } catch {
      // 导演层出错，降级到 v1.0 脚本
      setDirectorError(true);
      setPhase("choice");
    }
  }, [turns, blueprint, islandNpcs, worldState, relationships, tension, script, buildActorContext, updateRelationship, appendWorldEvent]);

  // ---- 生成玩家选项（v1.1：OptionBuilder 配方求值替代硬编码）----
  useEffect(() => {
    if (phase !== "choice") return;

    try {
      const recipe = getOptionRecipe(script.day);
      if (!recipe) {
        // 无配方 → 降级到 v1.0 脚本的选项
        const v1Script = getEventScript(script.day);
        if (v1Script) {
          setCurrentChoices(
            v1Script.playerChoice.options.map((opt) => ({
              id: opt.id,
              text: opt.text,
              intentType: "probe",
              riskLevel: "moderate" as const,
            }))
          );
        }
        return;
      }

      const npcIds = islandNpcs.map((n) => n.id);
      const npcNameMap: Record<string, string> = {};
      for (const n of islandNpcs) {
        npcNameMap[n.id] = n.name;
      }

      const evalState = deriveEvalState(
        worldState,
        "player_choice",
        tension.current,
        npcIds,
        npcNameMap
      );

      // 确定性 seed：day × 1000 + beatIndex
      const seed = script.day * 1000 + turns.length;

      const builtOptions = buildOptions(recipe, evalState, seed);

      // BuiltOption → ChatChoiceItem（灰显选项也保留，但标 enabled=false）
      const choices: ChatChoiceItem[] = builtOptions
        .filter((o) => o.enabled)
        .map((o) => ({
          id: o.slot,
          text: o.text,
          intentType: o.intentType,
          riskLevel: o.riskLevel,
        }));

      // 如果可选项不足 2 个，补 v1.0 兜底
      if (choices.length < 2) {
        const v1Script = getEventScript(script.day);
        if (v1Script) {
          for (const opt of v1Script.playerChoice.options) {
            if (choices.length >= 3) break;
            choices.push({
              id: opt.id,
              text: opt.text,
              intentType: "probe",
              riskLevel: "moderate" as const,
            });
          }
        }
      }

      setCurrentChoices(choices);
    } catch {
      // 降级：使用 v1.0 脚本的选项
      const v1Script = getEventScript(script.day);
      if (v1Script) {
        setCurrentChoices(
          v1Script.playerChoice.options.map((opt) => ({
            id: opt.id,
            text: opt.text,
            intentType: "probe",
            riskLevel: "moderate" as const,
          }))
        );
      }
    }
  }, [phase, turns, blueprint, islandNpcs, worldState, relationships, tension, script]);

  // ---- 处理玩家选择 ----
  const writeWorldFacts = useGameStore((s) => s.writeWorldFacts);

  const handleChoice = (choice: ChatChoiceItem) => {
    setSelectedChoice(choice.id);

    // v1.1：写入跨天事实（player_choice beat 的 factKey）
    try {
      const playerChoiceBeat = blueprint.beats.find(
        (b) => b.playerRole === "decider" || b.playerChoiceRequired
      );
      if (playerChoiceBeat?.factKey) {
        writeWorldFacts(
          [{ key: playerChoiceBeat.factKey, value: choice.intentType }],
          script.day,
          playerChoiceBeat.id
        );
      }
    } catch {
      // 写事实失败不阻断流程
    }

    // 后台记录好感度变化（基于选项类型）
    const affinityChanges: Record<string, number> = {};
    const intentDelta: Record<string, number> = {
      probe: 2,
      advance: 4,
      soothe: 3,
      humor: 2,
      adventure: 3,
      defend: 0,
      retreat: -1,
      observe: 1,
      tease: 1,
    };
    const baseDelta = intentDelta[choice.intentType] ?? 2;

    for (const npc of islandNpcs) {
      const pv = worldState.personalityVectors[npc.id];
      if (!pv) continue;

      // 人格修正：高 initiative 的 NPC 更欣赏主动型选择
      let mod = 0;
      if (choice.intentType === "advance" && pv.initiative > 0.6) mod += 1;
      if (choice.intentType === "advance" && pv.exposureThreshold > 0.7) mod -= 2;
      if (choice.intentType === "humor" && pv.humorTendency > 0.6) mod += 1;
      if (choice.intentType === "soothe" && pv.exposureThreshold > 0.6) mod += 2;

      const delta = baseDelta + mod;
      if (delta !== 0) {
        affinityChanges[npc.id] = delta;
        updateRelationship(npc.id, (r) => ({
          ...r,
          heartValue: Math.max(0, Math.min(100, r.heartValue + delta)),
          moments: [
            ...r.moments,
            {
              text: `公共事件选择：${choice.text.slice(0, 20)}`,
              delta,
              place: "公共事件",
              day: script.day,
              time: script.time,
            },
          ],
        }));
      }
    }

    // 生成结局旁白
    const narration = generateEndingNarration(choice, turns, script);
    setEndingNarration(narration);
    setPhase("ending");
  };

  // ---- 结局完成 ----
  const handleEndingComplete = () => {
    const chatContext: EventChatContext = {
      topic: script.title,
      mentionedNpcs: turns.flatMap((t) => t.speakers.map((s) => s.npcId)),
      playerStance: selectedChoice ?? "unknown",
      tensionLevel: tension.current > 60 ? "high" : tension.current > 30 ? "medium" : "low",
      keyMoments: turns.flatMap((t) =>
        t.speakers.map((s) => `${getNpcById(s.npcId)?.name ?? "TA"}: ${s.output.line.slice(0, 20)}`)
      ),
    };
    onComplete(chatContext, {});
  };

  // ============================================================
  // 降级模式：使用 v1.0 固定脚本
  // ============================================================

  if (directorError) {
    return <PublicEventSceneLegacy script={script} onComplete={onComplete} />;
  }

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="space-y-5">
      {/* ====== 氛围描述 ====== */}
      {phase === "atmosphere" && (
        <div className="animate-fade-in space-y-4 rounded-3xl glass-card p-5">
          <SectionTitle hint={`Day ${script.day} · ${script.time}`}>
            {script.title}
          </SectionTitle>
          <div className="rounded-2xl bg-secondary/30 px-4 py-3">
            <p className="text-sm leading-relaxed italic text-muted-foreground">
              {script.atmosphere}
            </p>
          </div>
          <PrimaryButton onClick={() => setPhase("opening")}>
            进入场景
          </PrimaryButton>
        </div>
      )}

      {/* ====== 开场旁白 ====== */}
      {phase === "opening" && (
        <div className="animate-fade-in space-y-4 rounded-3xl glass-card p-5">
          <p className="text-center text-[11px] tracking-[0.2em] text-muted-foreground">
            ✦ 开场 ✦
          </p>
          <NarrationBlock
            lines={script.openingNarration}
            onComplete={() => setPhase("dynamic_dialogue")}
          />
          <div className="flex justify-center pt-2">
            <GhostButton onClick={() => setPhase("dynamic_dialogue")}>
              开始
            </GhostButton>
          </div>
        </div>
      )}

      {/* ====== 动态对话（竞价驱动）====== */}
      {phase === "dynamic_dialogue" && (
        <div className="space-y-3">
          {/* 已发生的对话轮次 */}
          {turns.map((turn, ti) => (
            <div key={ti} className="space-y-2">
              {/* 发言者气泡 */}
              {turn.speakers.map((s, si) => (
                <DynamicDialogueBubble key={`${ti}-${si}`} output={s.output} />
              ))}
              {/* 微反应旁注 */}
              {turn.microReactions.map((m, mi) => (
                <MicroReactionNote key={`mr-${ti}-${mi}`} npcId={m.npcId} text={m.text} />
              ))}
            </div>
          ))}

          {/* 继续按钮 / 进入选择 */}
          {checkResolution(
            turns.length - 1,
            blueprint.beats.length,
            tension,
            new Set(turns.flatMap((t) => t.speakers.map((s) => s.npcId)))
          ) || turns.length >= blueprint.beats.filter((b) => b.type === "dialogue").length ? (
            <div className="animate-fade-in pt-2 text-center">
              <p className="text-[11px] text-muted-foreground">—— 现在，轮到你了 ——</p>
              <div className="mt-3 flex justify-center">
                <PrimaryButton onClick={() => setPhase("choice")}>
                  做出你的选择
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="flex justify-center pt-2">
              <GhostButton onClick={runDialogueTurn}>
                {turns.length === 0 ? "开始观察" : "继续"}
              </GhostButton>
            </div>
          )}
        </div>
      )}

      {/* ====== 玩家决策 ====== */}
      {phase === "choice" && (
        <div className="animate-fade-in space-y-4 rounded-3xl glass-card p-5">
          <SectionTitle hint="你的选择会影响故事走向">
            💭 你的决定
          </SectionTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            基于刚才的对话，你想怎么做？
          </p>
          <div className="space-y-2.5 pt-1">
            {currentChoices.map((choice) => (
              <ChoiceButton
                key={choice.id}
                choice={choice}
                onClick={() => handleChoice(choice)}
                disabled={selectedChoice !== null}
              />
            ))}
          </div>
        </div>
      )}

      {/* ====== 结局旁白 ====== */}
      {phase === "ending" && (
        <div className="animate-fade-in space-y-4 rounded-3xl glass-card p-5">
          <p className="text-center text-[11px] tracking-[0.2em] text-primary">
            ✦ 尾声 ✦
          </p>
          <NarrationBlock lines={endingNarration} onComplete={handleEndingComplete} />
          <div className="flex justify-center pt-2">
            <PrimaryButton onClick={handleEndingComplete}>
              完成今日公共事件
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* ====== 完成 ====== */}
      {phase === "complete" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Sparkles className="size-8 text-primary" />
          <p className="text-sm font-medium text-foreground">今日公共事件已完成</p>
          <p className="text-xs text-muted-foreground">所有反应已记录</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 辅助函数：生成结局旁白
// ============================================================

function generateEndingNarration(
  choice: ChatChoiceItem,
  turns: DynamicTurn[],
  script: EventScript
): string[] {
  const speakerNames = turns
    .flatMap((t) => t.speakers.map((s) => getNpcById(s.npcId)?.name))
    .filter(Boolean) as string[];

  const narration: string[] = [];

  if (choice.intentType === "advance") {
    narration.push("你的话让空气安静了一瞬。");
    if (speakerNames.length > 0) {
      narration.push(`${speakerNames[0]}看了你一眼，没有立刻回答。`);
    }
    narration.push("但有些东西——已经在这一刻被改变了。");
  } else if (choice.intentType === "humor") {
    narration.push("你的一句话打破了微妙的气氛。");
    if (speakerNames.length > 1) {
      narration.push(`${speakerNames[1]}忍不住笑了一下。`);
    }
    narration.push("空气里紧绷的东西，松了一点。");
  } else if (choice.intentType === "observe") {
    narration.push("你选择了安静。");
    narration.push("但你的目光——被好几个人注意到了。");
    narration.push("沉默有时候比说话更有重量。");
  } else {
    narration.push("你的选择在这个小屋里激起了一圈涟漪。");
    narration.push("没有人说话，但每个人都在想。");
    narration.push("这就是心动岛——每一个选择都在改变什么。");
  }

  return narration;
}

// ============================================================
// 降级组件：v1.0 固定脚本播放
// ============================================================

function PublicEventSceneLegacy({
  script,
  onComplete,
}: PublicEventSceneProps) {
  return (
    <div className="space-y-5">
      <div className="animate-fade-in space-y-4 rounded-3xl glass-card p-5">
        <SectionTitle hint={`Day ${script.day} · ${script.time}（降级模式）`}>
          {script.title}
        </SectionTitle>
        <div className="rounded-2xl bg-secondary/30 px-4 py-3">
          <p className="text-sm leading-relaxed italic text-muted-foreground">
            {script.atmosphere}
          </p>
        </div>
        <NarrationBlock lines={script.openingNarration} />
        {script.npcDialogues.map((line, i) => {
          const npc = getNpcById(line.npcId);
          if (!npc) return null;
          return (
            <div key={i} className="animate-fade-in flex items-start gap-2.5 rounded-2xl bg-secondary/40 px-3.5 py-3">
              <Avatar name={npc.name} gender={npc.gender} size="sm" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <span className="text-[11px] font-semibold text-primary">{npc.name}</span>
                {line.action && (
                  <p className="text-[11px] leading-relaxed italic text-muted-foreground/80">{line.action}</p>
                )}
                {line.lines.map((text, j) => (
                  <p key={j} className="text-sm leading-relaxed text-foreground">{text}</p>
                ))}
              </div>
            </div>
          );
        })}
        <div className="space-y-2.5">
          {script.playerChoice.options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                const ending = script.endings[opt.id];
                onComplete(
                  ending?.chatContext ?? { topic: script.title, mentionedNpcs: [], playerStance: "", tensionLevel: "low", keyMoments: [] },
                  {}
                );
              }}
              className="w-full rounded-2xl border border-border bg-card/70 px-4 py-3.5 text-left transition-all hover:border-primary/40 hover:bg-secondary/60 active:scale-[0.98]"
            >
              <p className="text-sm leading-relaxed text-foreground">{opt.text}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 便捷导出
// ============================================================

export function PublicEventSceneByDay({
  day,
  onComplete,
}: {
  day: number;
  onComplete: (ctx: EventChatContext, deltas: Record<string, number>) => void;
}) {
  const script = getEventScript(day);
  if (!script) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        今日无公共事件脚本
      </div>
    );
  }
  return <PublicEventScene script={script} onComplete={onComplete} />;
}

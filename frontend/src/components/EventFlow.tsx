/**
 * EventFlow —— 七日公共事件播放器（T5 产出）
 *
 * 无 props（或仅 onDayFinished）。从 useIslandStore 读取 phase/day/eventIndex，
 * 按天播放 3 个事件：
 *   - 事件进入时（渲染前）跑 openingHooks（day 首事件）+ beforeHooks；
 *     open 事件的 afterHooks 也在渲染前跑（脚本/分支依赖其输出）
 *   - 旁白逐段淡入、点击推进
 *   - 决策事件：选项卡（槽位徽章 + 风险点 + 灰显 lockLabel + 隐藏变体剔除）、
 *     选择器弹窗（9.2 对所选 NPC 好感复核，不足拒绝确认）
 *   - 选项结算 → 结算后 afterHooks → reply → 「继续」→ advanceEvent
 *   - 事件不满足 when → 记 eventLog 跳过；跳过时也要跑 afterHooks
 *     （day7_confession_window 的 d7_resolve_confession）+ resolveEnding()
 *   - 当天第 3 个事件结束 → day 7：resolveEnding() 切 finale；
 *     1-6 天：回小屋按钮 → onDayFinished
 *
 * 视觉：HouseApp 风格（glass-card / rounded-3xl / bg-night-fade /
 * animate-fade-in / 张力氛围渐变），Tailwind v4。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useIslandStore } from "@/stores/useIslandStore";
import { getDay } from "@/data/events";
import type {
  DecisionEventSpec,
  EventOption,
  EventSpec,
  NpcRef,
  NpcSelectorSpec,
  OpenEventSpec,
  RiskLevel,
  ScriptLine,
  SlotId,
  TensionLevel,
} from "@/data/events/types";
import { getNpcById } from "@/onboarding/npcLibrary";
import { postNarration } from "@/lib/api";
import {
  buildOptions,
  dynamicAffinityMin,
  evaluateRequire,
  fillText,
  highestNpc,
  npcName,
  resolveNpcRef,
  resolveOption,
  runEngineHook,
  secondNpc,
  selectorCandidates,
  type BuildOptionsResult,
  type EngineContext,
  type EngineResult,
  type RenderedOption,
} from "@/core/turnRunner";

// ============================================================
// 样式元数据
// ============================================================

const TENSION_META: Record<TensionLevel, { label: string; chip: string; bg: string }> = {
  low: {
    label: "低张力",
    chip: "border-sky-400/30 text-sky-400",
    bg: "from-sky-950/70",
  },
  medium: {
    label: "中张力",
    chip: "border-indigo-400/30 text-indigo-400",
    bg: "from-indigo-950/70",
  },
  high: {
    label: "高张力",
    chip: "border-amber-400/30 text-amber-400",
    bg: "from-amber-950/60",
  },
  "very-high": {
    label: "极高张力",
    chip: "border-red-400/30 text-red-400",
    bg: "from-red-950/70",
  },
};

const SLOT_LABELS: Record<SlotId, string> = {
  A: "推进",
  B: "转移",
  C: "回避",
  D: "风险",
};

const SLOT_STYLE: Record<SlotId, string> = {
  A: "border-sky-300/25 text-sky-300",
  B: "border-violet-300/25 text-violet-300",
  C: "border-slate-400/25 text-slate-400",
  D: "border-red-300/25 text-red-300",
};

const RISK_DOT: Record<RiskLevel, string> = {
  safe: "bg-emerald-400",
  subtle: "bg-amber-400",
  dangerous: "bg-red-400",
};

type FlowStage = "hooks" | "narration" | "decision" | "open" | "settled" | "skipped" | "dayEnd";

// ============================================================
// 状态快照 → 引擎上下文
// ============================================================

function makeCtx(st: ReturnType<typeof useIslandStore.getState>): EngineContext {
  return {
    npcIds: st.npcIds,
    relationships: st.relationships,
    worldFacts: st.worldFacts,
    resources: st.resources,
    day: st.day,
    eventIndex: st.eventIndex,
    eventLog: st.eventLog,
    random: Math.random,
  };
}

function applyResult(
  r: EngineResult,
  st: ReturnType<typeof useIslandStore.getState>,
  eventId: string,
): void {
  if (r.factWrites.length === 0 && r.deltas.length === 0) return;
  st.applyResolvedOption({
    day: st.day,
    eventId,
    kind: "open",
    optionId: "",
    optionText: "",
    risk: null,
    targetNpcId: null,
    deltas: r.deltas.length > 0 ? r.deltas : null,
    factsWrites: r.factWrites,
    resourceCosts: [],
  });
}

// ============================================================
// 主组件
// ============================================================

export function EventFlow({
  onDayFinished,
  singleEvent = false,
  onSingleEventExit,
}: {
  onDayFinished?: () => void;
  singleEvent?: boolean;
  onSingleEventExit?: () => void;
}) {
  const state = useIslandStore();
  const { phase, day, eventIndex } = state;

  const daySpec = useMemo(() => getDay(day), [day]);
  const event = daySpec?.events[eventIndex];

  const [stage, setStage] = useState<FlowStage>("hooks");
  const [paraIndex, setParaIndex] = useState(0);
  const [settled, setSettled] = useState<{
    text: string | null;
    option: RenderedOption;
    targetNpcId: string | null;
  } | null>(null);
  const [picker, setPicker] = useState<{
    option: EventOption;
    title: string;
    /** 候选 NPC 约束（selectorCandidates；null = 全员可选） */
    candidates: string[] | null;
  } | null>(null);
  const [pickedNpc, setPickedNpc] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const skippedRef = useRef<string | null>(null);

  const ctx = useMemo(() => makeCtx(state), [state]);

  // ---- 事件进入：钩子 + 跳过判定 ----
  useEffect(() => {
    if (phase !== "day_loop" || !daySpec || !event) return;
    const st = useIslandStore.getState();

    const runInto = (hooks: readonly string[] | undefined): EngineResult[] => {
      const out: EngineResult[] = [];
      for (const h of hooks ?? []) {
        const r = runEngineHook(
          h as Parameters<typeof runEngineHook>[0],
          makeCtx(useIslandStore.getState()),
        );
        if (r.factWrites.length > 0 || r.deltas.length > 0) out.push(r);
      }
      return out;
    };

    // openingHooks：当天第一个事件进入时
    if (eventIndex === 0) {
      for (const r of runInto(daySpec.openingHooks)) applyResult(r, st, event.id);
    }
    // beforeHooks：渲染前
    for (const r of runInto(event.beforeHooks)) applyResult(r, st, event.id);
    // open 事件 afterHooks：渲染前（脚本/后续分支依赖其输出）
    if (event.kind === "open") {
      for (const r of runInto(event.afterHooks)) applyResult(r, st, event.id);
    }

    // ---- 跳过判定（用钩子写入后的最新状态） ----
    const st2 = useIslandStore.getState();
    const c2 = makeCtx(st2);
    const skipped = event.when ? !evaluateRequire(event.when, c2).pass : false;
    if (skipped) {
      const key = `${st2.day}:${st2.eventIndex}`;
      if (skippedRef.current === key) return;
      skippedRef.current = key;
      // 记 eventLog（跳过：optionId ""）
      st2.applyResolvedOption({
        day: st2.day,
        eventId: event.id,
        kind: event.kind === "decision" ? "decision" : "open",
        optionId: "",
        optionText: "",
        risk: null,
        targetNpcId: null,
        deltas: null,
        factsWrites: [],
        resourceCosts: [],
      });
      // 跳过也必须跑结算后钩子（day7_confession_window → d7_resolve_confession）
      for (const r of runInto(event.afterHooks)) {
        applyResult(r, useIslandStore.getState(), event.id);
      }
      // D7 跳过告白窗口 → 结局锁定
      if (event.id === "day7_confession_window") {
        const s3 = useIslandStore.getState();
        if (s3.phase === "day_loop") s3.resolveEnding();
      }
      setStage("skipped");
      return;
    }

    setParaIndex(0);
    // 决策事件延续旧版 SceneView 的阅读节奏：事件引导和选项
    // 进入时就同屏呈现，不再先经过一个只有旁白的中间页。
    setStage(event.kind === "decision" ? "decision" : "narration");
  }, [day, eventIndex, phase, daySpec, event]);

  if (phase !== "day_loop" || !daySpec || !event) return null;

  const tension = TENSION_META[event.tension];
  const decisionResult: BuildOptionsResult | null =
    event.kind === "decision" ? buildOptions(event, ctx) : null;

  // ---- 推进 ----
  const nextParagraph = () => {
    const n = event.narration.length;
    if (paraIndex + 1 < n) {
      setParaIndex(paraIndex + 1);
    } else if (event.kind === "decision") {
      setStage("decision");
    } else {
      setStage("open");
    }
  };

  const advance = () => {
    if (singleEvent) {
      onSingleEventExit?.();
      return;
    }
    const st = useIslandStore.getState();
    if (st.eventIndex >= 2) {
      finishDay(st);
    } else {
      st.advanceEvent();
      setStage("hooks");
    }
  };

  const finishDay = (st: ReturnType<typeof useIslandStore.getState>) => {
    if (st.day === 7 && st.phase === "day_loop") st.resolveEnding();
    setStage("dayEnd");
  };

  // ---- 选项结算 ----
  const settleAndApply = (ro: RenderedOption, picked: string | null) => {
    const st = useIslandStore.getState();
    if (event.kind !== "decision") return;
    const resolved = resolveOption(event, ro.option, picked, makeCtx(st));
    st.applyResolvedOption({
      day: st.day,
      eventId: event.id,
      kind: "decision",
      optionId: ro.option.id,
      optionText: ro.text,
      risk: ro.option.risk,
      targetNpcId: resolved.mainTargetId,
      deltas: resolved.deltas.length > 0 ? resolved.deltas : null,
      factsWrites: resolved.factsWrites,
      resourceCosts: resolved.resourceCosts,
    });
    // decision 事件：结算后跑 afterHooks（d2_resolve_groups / d6_recompute_votes / …）
    for (const h of event.afterHooks ?? []) {
      applyResult(
        runEngineHook(h as Parameters<typeof runEngineHook>[0], makeCtx(useIslandStore.getState())),
        useIslandStore.getState(),
        event.id,
      );
    }
    const fallback = resolved.reply ?? "（空气中有什么发生了变化。）";
    setSettled({ text: fallback, option: ro, targetNpcId: resolved.mainTargetId });
    setStage("settled");

    void postNarration({
      day: st.day,
      eventTitle: event.title,
      location: event.location,
      context: event.narration.map((line) => fillText(line, makeCtx(st))).join(" "),
      choice: ro.text,
      fallback,
    })
      .then(({ resultText }) => {
        const latest = useIslandStore.getState();
        if (latest.day === st.day && latest.eventIndex === st.eventIndex) {
          setSettled((current) => (current ? { ...current, text: resultText } : current));
        }
      })
      .catch((error) => {
        console.warn("[event] 豆包不可用，使用规则引擎文案", error);
      });
  };

  const onOptionClick = (ro: RenderedOption) => {
    if (!ro.enabled) return;
    if (ro.option.selector) {
      const candidates = selectorCandidates(ro.option, ctx);
      setPicker({
        option: ro.option,
        title: ro.option.selector.prompt,
        candidates,
      });
      const def = defaultSelection(ro.option.selector, ctx);
      // 约束集合内才有默认值；不在集合内取首个候选（b_speak_to_rejected 场景）
      setPickedNpc(
        candidates ? (def && candidates.includes(def) ? def : (candidates[0] ?? null)) : def,
      );
      setPickerError(null);
    } else {
      settleAndApply(ro, null);
    }
  };

  const confirmPicker = () => {
    if (!picker || !pickedNpc) return;
    const st = useIslandStore.getState();
    const c = makeCtx(st);
    const req = picker.option.requires;
    // 候选约束复核（防陈旧状态选中集合外 NPC）
    if (picker.candidates && pickedNpc !== "none" && !picker.candidates.includes(pickedNpc)) {
      setPickerError("这个人不在可交谈的名单里……");
      return;
    }
    const ok = req
      ? evaluateRequire(req, c, {
          selectedNpcId: pickedNpc === "none" ? null : pickedNpc,
          affinityMinOverride: dynamicAffinityMin(picker.option.id, c, {
            selectedNpcId: pickedNpc === "none" ? null : pickedNpc,
          }),
        }).pass
      : true;
    if (!ok) {
      setPickerError("好感不足，无法确认……");
      return;
    }
    const ro = decisionResult?.options.find((r) => r.option.id === picker.option.id);
    setPicker(null);
    settleAndApply(
      ro ?? {
        option: picker.option,
        text: picker.option.text,
        enabled: true,
        lockLabel: null,
        hidden: false,
        mainTargetId: pickedNpc === "none" ? null : pickedNpc,
      },
      pickedNpc,
    );
  };

  // ---- 渲染 ----
  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b ${tension.bg} to-transparent`}
      />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5 pb-12 pt-14 animate-fade-in">
        <div className="mb-6">
          {singleEvent ? (
            <button
              type="button"
              onClick={onSingleEventExit}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <ChevronLeft className="size-4" /> 返回
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1.5">
              {daySpec.events.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-8 rounded-full transition-colors ${
                    i <= eventIndex ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
            </div>
          )}
          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs tracking-[0.3em] text-muted-foreground">
                第 {day} 天 · {daySpec.theme}
              </p>
              <h2 className="mt-1 text-xl font-medium text-foreground">{event.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {event.location} · {event.timeLabel}
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${tension.chip}`}>
              {tension.label}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          {stage === "hooks" && (
            <div className="grid flex-1 place-items-center">
              <p className="text-sm tracking-widest text-muted-foreground">……</p>
            </div>
          )}

          {stage === "narration" && (
            <button
              onClick={nextParagraph}
              className="w-full rounded-3xl glass-card p-6 text-left animate-fade-in"
            >
              <p className="text-[15px] leading-7 text-foreground/90">
                {fillText(event.narration[paraIndex] ?? "", ctx)}
              </p>
              <p className="mt-6 text-center text-xs tracking-widest text-muted-foreground">
                点击继续
              </p>
            </button>
          )}

          {stage === "decision" && decisionResult && (
            <DecisionView
              contextLines={event.narration.map((line) => fillText(line, ctx))}
              result={decisionResult}
              onOption={onOptionClick}
            />
          )}

          {stage === "open" && event.kind === "open" && (
            <OpenView
              key={event.id}
              event={event}
              ctx={ctx}
              onContinue={advance}
              continueLabel={singleEvent ? "返回小屋" : "继续"}
            />
          )}

          {stage === "settled" && settled && (
            <DecisionOutcomeView
              contextLines={event.narration.map((line) => fillText(line, ctx))}
              selected={settled.option}
              targetNpcId={settled.targetNpcId}
              text={settled.text ?? "（空气中有什么发生了变化。）"}
              onContinue={advance}
              continueLabel={singleEvent ? "返回小屋" : "继续"}
            />
          )}

          {stage === "skipped" && (
            <div className="rounded-3xl glass-card p-6 animate-fade-in">
              <p className="text-center text-sm leading-7 text-muted-foreground">
                这件事没有发生。
              </p>
              <button
                onClick={advance}
                className="mt-6 w-full rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
              >
                {singleEvent ? "返回小屋" : "继续"}
              </button>
            </div>
          )}

          {stage === "dayEnd" && (
            <div className="grid flex-1 place-items-center">
              <div className="text-center animate-fade-in">
                <p className="text-xs tracking-[0.3em] text-muted-foreground">Day {day}</p>
                <h3 className="mt-4 text-xl font-medium leading-relaxed text-foreground">
                  今天的三件事已经发生完
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {day === 7 ? "篝火暗了下去。" : "你带着今天的余温走向夜晚。"}
                </p>
                <button
                  onClick={() => onDayFinished?.()}
                  className="mt-8 w-full rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
                >
                  {day === 7 ? "进入结局" : "回到小屋"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {picker && (
        <PickerModal
          title={picker.title}
          npcIds={
            picker.candidates
              ? state.npcIds.filter((id) => picker.candidates?.includes(id) === true)
              : state.npcIds
          }
          picked={pickedNpc}
          allowNone={picker.option.selector?.allowNone === true}
          {...(picker.option.selector?.noneLabel
            ? { noneLabel: picker.option.selector.noneLabel }
            : {})}
          error={pickerError}
          onPick={(id) => {
            setPickedNpc(id);
            setPickerError(null);
          }}
          onCancel={() => setPicker(null)}
          onConfirm={confirmPicker}
        />
      )}
    </div>
  );
}

// ============================================================
// 选择器缺省选中（§2.5：defaultRef > 玩家第二好感）
// ============================================================

function defaultSelection(sel: NpcSelectorSpec, ctx: EngineContext): string | null {
  if (sel.defaultRef) {
    const id = resolveNpcRef(sel.defaultRef, ctx);
    if (id) return id;
  }
  return secondNpc(ctx);
}

// ============================================================
// 决策视图（选项卡）
// ============================================================

function DecisionView({
  contextLines,
  result,
  onOption,
}: {
  contextLines: string[];
  result: BuildOptionsResult;
  onOption: (ro: RenderedOption) => void;
}) {
  return (
    <div className="mt-2 animate-fade-in">
      <div className="rounded-3xl glass-card p-5">
        <p className="text-xs tracking-[0.24em] text-accent">此刻，你会怎么做？</p>
        <div className="mt-3 space-y-2">
          {contextLines.map((line, index) => (
            <p key={index} className="text-[15px] leading-7 text-foreground/90">
              {line}
            </p>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {result.options.map((ro) => (
          <DecisionOptionCard key={ro.option.id} option={ro} onSelect={() => onOption(ro)} />
        ))}
      </div>
      {result.warnings.length > 0 && (
        <p className="text-center text-xs text-amber-400/80">（{result.warnings.join("；")}）</p>
      )}
    </div>
  );
}

function DecisionOptionCard({
  option: ro,
  selected = false,
  selectedTarget,
  onSelect,
}: {
  option: RenderedOption;
  selected?: boolean;
  selectedTarget?: string | null;
  onSelect?: () => void;
}) {
  const silent = ro.option.slot === "C";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={selected || !ro.enabled}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        selected
          ? "border-primary/70 bg-primary/10"
          : `glass-card border-transparent ${
              ro.enabled ? "hover:bg-foreground/5 active:scale-[0.99]" : "opacity-45"
            }`
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-[11px] ${SLOT_STYLE[ro.option.slot]}`}>
          {SLOT_LABELS[ro.option.slot]}
        </span>
        {!silent && ro.option.risk && (
          <span className={`size-1.5 rounded-full ${RISK_DOT[ro.option.risk]}`} />
        )}
        {selected && (
          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
            已选择
          </span>
        )}
        {selectedTarget ? (
          <span className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {selectedTarget}
          </span>
        ) : (
          ro.option.selector && (
            <span className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              选择目标
            </span>
          )
        )}
      </div>
      <p
        className={`mt-3 text-[15px] leading-7 ${
          silent ? "text-foreground/75" : "text-foreground"
        }`}
      >
        {ro.text}
      </p>
      {!ro.enabled && ro.lockLabel && (
        <p className="mt-2 text-xs text-muted-foreground">{ro.lockLabel}</p>
      )}
    </button>
  );
}

function DecisionOutcomeView({
  contextLines,
  selected,
  targetNpcId,
  text,
  onContinue,
  continueLabel,
}: {
  contextLines: string[];
  selected: RenderedOption;
  targetNpcId: string | null;
  text: string;
  onContinue: () => void;
  continueLabel: string;
}) {
  return (
    <div className="mt-2 animate-fade-in">
      <div className="rounded-3xl glass-card p-5">
        <p className="text-xs tracking-[0.24em] text-accent">此刻，你选择了</p>
        <div className="mt-3 space-y-2">
          {contextLines.map((line, index) => (
            <p key={index} className="text-[15px] leading-7 text-foreground/90">
              {line}
            </p>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <DecisionOptionCard
          option={selected}
          selected
          selectedTarget={targetNpcId ? npcName(targetNpcId) : null}
        />
      </div>

      <div className="mt-4 rounded-3xl glass-card p-5">
        <p className="text-xs tracking-[0.24em] text-accent">剧情走向</p>
        <p className="mt-3 text-[15px] leading-7 text-foreground/90">{text}</p>
        <button
          onClick={onContinue}
          className="mt-6 w-full rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 开放事件视图（三形态）
// ============================================================

interface OpenLine {
  key: number;
  who: string | null;
  whoId: string | null;
  text: string;
}

function openLines(event: OpenEventSpec, ctx: EngineContext): OpenLine[] {
  const out: OpenLine[] = [];
  for (let i = 0; i < event.script.length; i++) {
    const line: ScriptLine | undefined = event.script[i];
    if (!line) continue;
    let who: string | null = null;
    let whoId: string | null = null;
    if (line.speaker != null) {
      const ref: NpcRef =
        typeof line.speaker === "string" ? { kind: "npc", id: line.speaker } : line.speaker;
      const id = resolveNpcRef(ref, ctx);
      if (!id) continue; // speaker 缺席岛上 → 整行跳过（types.ts 约定）
      who = npcName(id);
      whoId = id;
    }
    out.push({ key: i, who, whoId, text: fillText(line.line, ctx) });
  }
  return out;
}

function OpenView({
  event,
  ctx,
  onContinue,
  continueLabel,
}: {
  event: OpenEventSpec;
  ctx: EngineContext;
  onContinue: () => void;
  continueLabel: string;
}) {
  const lines = useMemo(() => openLines(event, ctx), [event, ctx]);
  const [shown, setShown] = useState(1);

  if (event.visibility === "hidden") {
    return (
      <div className="flex flex-1 flex-col justify-between">
        <div className="rounded-3xl glass-card p-6 animate-fade-in">
          <p className="text-[15px] leading-7 text-foreground/80">{lines[0]?.text ?? ""}</p>
        </div>
        <button
          onClick={onContinue}
          className="mb-8 mt-6 w-full rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
        >
          {continueLabel}
        </button>
      </div>
    );
  }

  const visible = lines.slice(0, shown);
  const done = shown >= lines.length;
  return (
    <div className="flex flex-1 flex-col">
      <div className="space-y-4">
        {visible.map((l) =>
          l.who ? (
            <div key={l.key} className="animate-fade-in">
              <p
                className={`text-xs font-medium ${
                  l.whoId && getNpcById(l.whoId)?.gender === "male" ? "text-male" : "text-female"
                }`}
              >
                {l.who}
              </p>
              <div className="mt-1 rounded-2xl glass-card p-4">
                <p className="text-[15px] leading-7 text-foreground/90">{l.text}</p>
              </div>
            </div>
          ) : (
            <p
              key={l.key}
              className="animate-fade-in rounded-2xl glass-card p-4 text-[15px] leading-7 text-foreground/75 italic"
            >
              {l.text}
            </p>
          ),
        )}
      </div>
      <div className="mt-auto pb-8 pt-6">
        {!done && (
          <button
            onClick={() => setShown((s) => s + 1)}
            className="w-full py-2 text-center text-xs tracking-widest text-muted-foreground"
          >
            点击继续
          </button>
        )}
        {done && (
          <button
            onClick={onContinue}
            className="w-full rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            {continueLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 选择器弹窗（§2.1 硬规则 2：不显示好感数值）
// ============================================================

function PickerModal({
  title,
  npcIds,
  picked,
  allowNone,
  noneLabel,
  error,
  onPick,
  onCancel,
  onConfirm,
}: {
  title: string;
  npcIds: string[];
  picked: string | null;
  allowNone: boolean;
  noneLabel?: string;
  error: string | null;
  onPick: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-5 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl glass-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        <div className="mt-4 space-y-2">
          {npcIds.map((id) => {
            const active = picked === id;
            return (
              <button
                key={id}
                onClick={() => onPick(id)}
                className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
                  active ? "border-primary/60 bg-primary/10" : "border-border hover:bg-foreground/5"
                }`}
              >
                <span className="text-sm text-foreground">{getNpcById(id)?.name ?? id}</span>
              </button>
            );
          })}
          {allowNone && (
            <button
              onClick={() => onPick("none")}
              className={`w-full rounded-2xl border p-3 text-center text-sm transition ${
                picked === "none"
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-foreground/5"
              }`}
            >
              {noneLabel ?? "放弃选择"}
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-center text-xs text-red-400">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-border py-3 text-sm text-muted-foreground transition active:scale-[0.98]"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!picked}
            className="flex-1 rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-40"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

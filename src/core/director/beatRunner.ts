/**
 * BeatRunner —— v1.1 Beat 推进状态机
 *
 * 从 PublicEventScene.runDialogueTurn 抽离 beat 推进逻辑为纯函数模块。
 *
 * 核心职责：
 *   1. 按 blueprint.beats 顺序推进
 *   2. 执行 trigger.ladder 三级降级（natural → forced → narration）
 *   3. 校验 narrativeInvariant
 *   4. 解析 outcomes 收敛结果，收集 factsToWrite
 *   5. 决定下一步（continue / player_choice / scene_end）
 *
 * 不依赖 React，纯逻辑可单测。
 */

import type {
  SceneBlueprint,
  BiddingResult,
  TensionState,
  SceneTurn,
} from "./types";
import type { BeatV11 } from "./beatTypes";
import type {
  ForcedSelector,
  BeatOutcome,
  WorldFactWrite,
  TriggerLadder,
  PlayerRole,
} from "./beatTypes";
import type { WorldState } from "../state/worldTypes";
import { runBidding } from "./scheduler";
import { adjustTension } from "./beats";
import { getNpcById } from "../npcLibrary";

// ============================================================
// 状态与结果类型
// ============================================================

/** BeatRunner 内部状态（可序列化，支持持久化） */
export interface BeatRunnerState {
  blueprint: SceneBlueprint;
  beatIndex: number;
  turns: SceneTurn[];
  tension: TensionState;
  /** 已达成的 outcome id 列表 */
  resolvedOutcomes: string[];
  /** 已校验通过的 invariant beatId 列表 */
  resolvedInvariants: string[];
  /** 本场景已写入的 factKey 列表 */
  writtenFacts: string[];
}

export type NextAction = "continue" | "player_choice" | "scene_end";

/** 单步推进结果 */
export interface BeatStepResult {
  beat: BeatV11;
  bidding: BiddingResult;
  /** 实际使用的触发方式（可能从 natural 降级到 forced/narration） */
  triggerUsed: TriggerLadder;
  /** forced 模式挑出的人（若有） */
  forcedSpeakerId?: string;
  /** narration 文本（若 triggerUsed=narration） */
  narrationText?: string;
  /** beat 结束应写入的事实 */
  factsToWrite: WorldFactWrite[];
  /** invariant 是否成立（不成立需触发降级） */
  invariantSatisfied: boolean;
  /** 该 beat 的玩家角色 */
  playerRole?: PlayerRole;
  /** 下一步建议 */
  nextAction: NextAction;
}

// ============================================================
// 核心函数
// ============================================================

/** 创建初始 runner state */
export function createBeatRunnerState(
  blueprint: SceneBlueprint,
  initialTension: TensionState
): BeatRunnerState {
  return {
    blueprint,
    beatIndex: 0,
    turns: [],
    tension: initialTension,
    resolvedOutcomes: [],
    resolvedInvariants: [],
    writtenFacts: [],
  };
}

/**
 * 推进一个 beat（核心入口）
 *
 * 流程：
 *   1. 取 blueprint.beats[beatIndex]
 *   2. 按 trigger.ladder 执行：
 *      - natural → runBidding，若无人竞价达阈值则降级 forced
 *      - forced → resolveForcedSpeaker 挑人，强制入 speakers
 *      - narration → 不竞价，直接产旁白
 *      - 无 trigger（v1.0 beat）→ 走原 runBidding 路径
 *   3. adjustTension 更新张力
 *   4. 若有 outcomes → resolveOutcome + collectFacts
 *   5. checkInvariant 校验
 *   6. decideNextAction 返回下一步
 */
export function stepBeat(
  state: BeatRunnerState,
  worldState: WorldState,
  allNpcIds: string[]
): BeatStepResult | null {
  const beat = state.blueprint.beats[state.beatIndex];
  if (!beat) return null;

  const silenceMap = worldState.beatProgress.silenceMap;
  const trigger = beat.trigger;

  let bidding: BiddingResult;
  let triggerUsed: TriggerLadder = "natural";
  let forcedSpeakerId: string | undefined;
  let narrationText: string | undefined;

  const vectors = worldState.personalityVectors;
  const eventLog = worldState.eventLog;
  const cooldownMap = worldState.beatProgress.cooldownMap;

  if (trigger?.ladder === "narration") {
    // ---- narration 级：不竞价，直接旁白 ----
    bidding = {
      speakers: [],
      microReactors: [],
      scores: {},
    };
    triggerUsed = "narration";
    narrationText = trigger.narrationText ?? "（旁白）场景在沉默中推进。";

  } else if (trigger?.ladder === "forced") {
    // ---- forced 级：直接挑人 ----
    const selector = trigger.forcedSelector;
    forcedSpeakerId = selector
      ? resolveForcedSpeaker(selector, allNpcIds, worldState, silenceMap)
      : allNpcIds[0];

    bidding = runBidding(
      forcedSpeakerId ? [forcedSpeakerId] : allNpcIds,
      vectors,
      beat,
      eventLog,
      silenceMap,
      cooldownMap
    );
    // 确保 forced 的人一定在 speakers 里
    if (forcedSpeakerId && !bidding.speakers.includes(forcedSpeakerId)) {
      bidding.speakers = [forcedSpeakerId, ...bidding.speakers];
    }
    triggerUsed = "forced";

  } else {
    // ---- natural 级（或无 trigger 的 v1.0 beat）----
    bidding = runBidding(allNpcIds, vectors, beat, eventLog, silenceMap, cooldownMap);

    // 检查是否需要降级到 forced
    if (trigger?.ladder === "natural" && shouldDegradeFromNatural(bidding, beat)) {
      const selector = trigger.forcedSelector;
      forcedSpeakerId = selector
        ? resolveForcedSpeaker(selector, allNpcIds, worldState, silenceMap)
        : allNpcIds[0];

      if (forcedSpeakerId) {
        bidding = runBidding(
          [forcedSpeakerId],
          vectors,
          beat,
          eventLog,
          silenceMap,
          cooldownMap
        );
        if (!bidding.speakers.includes(forcedSpeakerId)) {
          bidding.speakers = [forcedSpeakerId];
        }
      }
      triggerUsed = "forced";

      // forced 也没人？降级到 narration
      if (!forcedSpeakerId) {
        triggerUsed = "narration";
        narrationText = trigger.narrationText ?? "（旁白）没人开口，场面安静了一会儿。";
        bidding = { speakers: [], microReactors: [], scores: {} };
      }
    }
  }

  // ---- 张力调节 ----
  const newTension = adjustTension(state.tension, beat.type, beat.tensionTarget);

  // ---- outcomes 收敛 ----
  let outcome: BeatOutcome | null = null;
  let factsToWrite: WorldFactWrite[] = [];
  if (beat.outcomes && beat.outcomes.length > 0) {
    outcome = resolveOutcome(beat, state, worldState);
    factsToWrite = collectFacts(beat, outcome);
  }

  // ---- invariant 校验 ----
  const invariantSatisfied = checkInvariant(beat, state, worldState);

  // ---- 玩家角色 ----
  const playerRole = beat.playerRole;

  // ---- 推进 beatIndex ----
  state.beatIndex += 1;
  state.tension = newTension;
  if (outcome) {
    state.resolvedOutcomes.push(outcome.id);
  }
  if (invariantSatisfied) {
    state.resolvedInvariants.push(beat.id);
  }
  for (const f of factsToWrite) {
    if (!state.writtenFacts.includes(f.key)) {
      state.writtenFacts.push(f.key);
    }
  }

  // ---- 下一步 ----
  const nextAction = decideNextAction(state, state.blueprint);

  const result: BeatStepResult = {
    beat,
    bidding,
    triggerUsed,
    factsToWrite,
    invariantSatisfied,
    nextAction,
  };
  if (forcedSpeakerId !== undefined) {
    result.forcedSpeakerId = forcedSpeakerId;
  }
  if (narrationText !== undefined) {
    result.narrationText = narrationText;
  }
  if (playerRole !== undefined) {
    result.playerRole = playerRole;
  }
  return result;
}

// ============================================================
// forced 模式挑人
// ============================================================

/**
 * forced 模式挑人（按 ForcedSelector 谓词）
 *
 * 禁止写死 npcId —— 只按条件挑人。
 */
export function resolveForcedSpeaker(
  selector: ForcedSelector,
  candidateIds: string[],
  worldState: WorldState,
  silenceMap: Record<string, number>
): string | undefined {
  if (candidateIds.length === 0) return undefined;

  const pool = selector.fallbackPool === "opposite_sex" || selector.fallbackPool === "same_sex"
    ? candidateIds // 简化：暂不按性别分池，用全部候选
    : candidateIds;

  switch (selector.predicate) {
    case "highest_affinity": {
      // 对玩家好感最高
      let best: string | undefined;
      let bestVal = -1;
      for (const id of pool) {
        const rel = worldState.playerRelations[id];
        const val = rel?.heartValue ?? 30;
        if (val > bestVal) {
          bestVal = val;
          best = id;
        }
      }
      return best ?? pool[0];

    }
    case "lowest_affinity": {
      let best: string | undefined;
      let bestVal = Infinity;
      for (const id of pool) {
        const rel = worldState.playerRelations[id];
        const val = rel?.heartValue ?? 30;
        if (val < bestVal) {
          bestVal = val;
          best = id;
        }
      }
      return best ?? pool[0];

    }
    case "highest_initiative": {
      let best: string | undefined;
      let bestVal = -1;
      for (const id of pool) {
        const pv = worldState.personalityVectors[id];
        const val = pv?.initiative ?? 0.5;
        if (val > bestVal) {
          bestVal = val;
          best = id;
        }
      }
      return best ?? pool[0];

    }
    case "silent_longest": {
      let best: string | undefined;
      let bestVal = -1;
      for (const id of pool) {
        const val = silenceMap[id] ?? 0;
        if (val > bestVal) {
          bestVal = val;
          best = id;
        }
      }
      return best ?? pool[0];

    }
    case "specific_trait": {
      const trait = selector.traitValue;
      if (!trait) return pool[0];
      for (const id of pool) {
        const npc = getNpcById(id);
        if (npc?.traits.includes(trait)) return id;
      }
      return pool[0];

    }
    default:
      return pool[0];
  }
}

// ============================================================
// natural 降级判定
// ============================================================

/**
 * natural 降级判定：本轮无人竞价达到阈值则降级到 forced
 *
 * 阈值：speakers 为空，或所有 desire 分数低于 0.3
 */
export function shouldDegradeFromNatural(
  bidding: BiddingResult,
  _beat: BeatV11
): boolean {
  if (bidding.speakers.length === 0) return true;

  const scores = Object.values(bidding.scores);
  if (scores.length === 0) return true;

  const maxScore = Math.max(...scores);
  return maxScore < 0.3;
}

// ============================================================
// invariant 校验
// ============================================================

/**
 * 校验 narrativeInvariant
 *
 * 基于 state + worldState 断言。
 *
 * 策略：对于无法精确判定的 invariant（大多数自然语言断言），
 * 采用"宽松校验"——只要有竞价 speakers 或 narration 产生，就算通过。
 * 精确判定需要调用方在 React 层根据具体断言做额外检查。
 */
export function checkInvariant(
  beat: BeatV11,
  state: BeatRunnerState,
  _worldState: WorldState
): boolean {
  if (!beat.narrativeInvariant) return true;

  // 宽松校验：beat 已推进 + 有产出（speakers 或 narration）
  // 精确校验由调用方在 React 层补充
  const hasProduced = state.turns.length > 0 || state.beatIndex > 0;
  return hasProduced;
}

// ============================================================
// outcomes 收敛
// ============================================================

/**
 * 解析 outcomes：按 condition 求值取首个命中，否则取 isDefault
 *
 * 简化版 condition 求值：
 *   - "any_speaker" → state.turns 中有 speaker
 *   - "player_intent == advance" → 需要调用方在 worldState 中记录玩家意图
 *   - 空或未识别 → 视为始终命中
 */
export function resolveOutcome(
  beat: BeatV11,
  state: BeatRunnerState,
  worldState: WorldState
): BeatOutcome | null {
  if (!beat.outcomes || beat.outcomes.length === 0) return null;

  // 按顺序求值 condition
  for (const outcome of beat.outcomes) {
    if (outcome.isDefault) continue; // 跳过默认项，最后再取

    if (!outcome.condition || outcome.condition.trim() === "") {
      // 无条件 = 始终命中
      return outcome;
    }

    if (evalOutcomeCondition(outcome.condition, state, worldState)) {
      return outcome;
    }
  }

  // 全不命中 → 取 isDefault
  const defaultOutcome = beat.outcomes.find((o) => o.isDefault);
  return defaultOutcome ?? beat.outcomes[0] ?? null;
}

/** 简化版 outcome condition 求值 */
function evalOutcomeCondition(
  condition: string,
  state: BeatRunnerState,
  _worldState: WorldState
): boolean {
  const trimmed = condition.trim();

  if (trimmed === "any_speaker") {
    return state.turns.length > 0;
  }

  if (trimmed === "player_intent == advance") {
    // 简化：需要调用方通过 worldState 传递玩家意图
    // 暂时返回 false，让 isDefault 兜住
    return false;
  }

  // 未识别条件 → 视为不命中（让 isDefault 兜底）
  return false;
}

/** 收集该 beat 应写入的所有事实 */
export function collectFacts(
  beat: BeatV11,
  outcome: BeatOutcome | null
): WorldFactWrite[] {
  const facts: WorldFactWrite[] = [];

  // 从 outcome 收集
  if (outcome?.factsToWrite) {
    facts.push(...outcome.factsToWrite);
  }

  // 若 beat 有 factKey 但 outcome 没有 factsToWrite，用 factKey 做默认写入
  if (beat.factKey && facts.length === 0 && outcome) {
    facts.push({
      key: beat.factKey,
      value: outcome.id,
    });
  }

  return facts;
}

// ============================================================
// 下一步决策
// ============================================================

/** 计算下一步建议 */
export function decideNextAction(
  state: BeatRunnerState,
  blueprint: SceneBlueprint
): NextAction {
  // beat 已耗尽 → 场景结束
  if (state.beatIndex >= blueprint.beats.length) {
    return "scene_end";
  }

  // 下一个 beat 是 player_choice → 等待玩家操作
  const nextBeat = blueprint.beats[state.beatIndex];
  if (nextBeat?.type === "player_choice" || nextBeat?.playerRole === "decider") {
    return "player_choice";
  }

  return "continue";
}

// ============================================================
// 校验工具
// ============================================================

/**
 * 一天至少 1 个 observer beat 校验（§2.4.5）
 *
 * 蓝图生成后调用，违反则 console.warn（不阻断，允许无 observer 的降级场景）
 */
export function assertObserverBeatExists(blueprint: SceneBlueprint): void {
  const hasObserver = blueprint.beats.some(
    (b) => b.playerRole === "observer"
  );

  if (!hasObserver) {
    console.warn(
      `[BeatRunner] 蓝图 ${blueprint.sceneId} 无 observer beat，` +
        "建议至少 1 个 beat 设 playerRole=observer 让 NPC 自由互动"
    );
  }
}

/**
 * 模板组合引擎 —— 核心文件
 *
 * 核心职责：从 ActorContext 生成 ActorOutput
 * 流程：inferIntent → inferEmotion → composeLine
 *
 * 红线：ActorOutput 中没有任何好感增减字段。Δ 由裁判层查表计算。
 */

import { getNpcById } from "../npcLibrary";
import type {
  ActorContext,
  ActorOutput,
  ActorIntent,
  ActorIntentType,
  EmotionTag,
  PersonalityVector,
  TextContract,
} from "./types";
import type { WorldEventLog } from "../state/worldTypes";
import { pickMicroReaction } from "./microReactions";

// ============================================================
// 模板片段：intent × emotion → 台词候选
// ============================================================

const LINE_TEMPLATES: Partial<Record<ActorIntentType, Partial<Record<EmotionTag, string[]>>>> = {
  probe: {
    curious: ["你对{topic}怎么看？", "{topic}？说来听听。", "说到{topic}，你怎么想？"],
    neutral: ["{topic}。", "说说{topic}吧。"],
    happy: ["{topic}啊，正好我也在想。", "聊到{topic}就开心。"],
  },
  advance: {
    flustered: ["我……其实一直在注意你", "其实我，算了，没什么。", "不是你想的那样……好吧也许是。"],
    moved: ["你这句话我记下了。", "很少有人说进我心坎里。"],
    vulnerable: ["我不知道怎么开口，但想试试。", "你让我有点想认真。"],
  },
  soothe: {
    vulnerable: ["没关系，慢慢来。", "不急，我在。", "你慢慢说，我听着。"],
    moved: ["你已经够好了。", "别太为难自己。"],
  },
  humor: {
    amused: ["你这个问题比我预期的有趣。", "行，这个我给满分。", "你这脑回路挺特别的。"],
    happy: ["哈哈，又被你逗到了。", "你这样挺有意思的。"],
    neutral: ["有意思，继续说。"],
  },
  defend: {
    jealous: [
      "哦？你跟{target}聊得挺开心啊。",
      "看来你跟{target}很熟。",
      "你刚才跟{target}在聊什么？",
    ],
    defensive: ["我没那么说。", "你别误会。", "不是你想的那样。"],
    cold: ["哦。", "随便吧。"],
  },
  tease: {
    defensive: ["行吧，你说了算。", "好好好，你都对。", "行，你厉害。"],
    amused: ["你这反应挺可爱的。", "急了？", "看把你紧张的。"],
    jealous: ["找{target}去啊。", "怎么不找{target}了？"],
  },
  retreat: {
    cold: ["……随便。", "没事。", "嗯。"],
    defensive: ["我先去忙了。", "没什么想说的。"],
  },
  observe: {
    neutral: ["（沉默了一会儿）", "我在想你说的话。", "嗯，听着呢。"],
    curious: ["继续说，我在听。"],
  },
  adventure: {
    curious: ["敢不敢跟我赌一把{topic}？", "要不要试试？"],
    happy: ["走，去做点有意思的。"],
  },
};

// ============================================================
// 动作模板：emotion → 动作候选
// ============================================================

const ACTION_BY_EMOTION: Partial<Record<EmotionTag, string[]>> = {
  flustered: ["低头避开视线", "手指无意识地敲了敲桌面", "声音压低了一些", "耳根有些发红"],
  jealous: ["挑了挑眉", "嘴角微微上扬，眼神却冷了", "语气变得轻飘飘的"],
  defensive: ["双臂抱在胸前", "往后靠了靠", "移开了视线"],
  vulnerable: ["看着你的眼睛", "停顿了一下", "深吸了一口气"],
  amused: ["嘴角弯了弯", "轻轻笑了一声", "眼神带着点促狭"],
  moved: ["沉默了一会儿", "目光变得柔和", "点了点头"],
  cold: ["转过身去", "面无表情", "没有看你"],
  happy: ["眉眼弯弯", "不自觉地靠近了一些", "笑了起来"],
  curious: ["微微前倾", "歪了歪头", "看着你"],
  neutral: ["神色平静", "端起杯子", "没什么表情变化"],
};

// ============================================================
// 辅助函数
// ============================================================

/** 检查玩家最近是否与其他 NPC 互动（用于嫉妒判定） */
function hasRecentInteractionWithOthers(ctx: ActorContext): boolean {
  const recentEvents = ctx.visibleEvents.events.slice(-5);
  for (const evt of recentEvents) {
    const hasPlayer = evt.participants.includes("player");
    const hasOtherNpc = evt.participants.some((p) => p !== "player" && p !== ctx.npcId);
    if (hasPlayer && hasOtherNpc) return true;
  }
  return false;
}

/** 从事件日志中找到情敌 NPC 的名字（用于 {target} 占位符） */
function findRivalName(visibleEvents: WorldEventLog, currentNpcId: string): string {
  const events = [...visibleEvents.events].reverse();
  for (const evt of events) {
    const hasPlayer = evt.participants.includes("player");
    const rivalId = evt.participants.find((p) => p !== "player" && p !== currentNpcId);
    if (hasPlayer && rivalId) {
      const npc = getNpcById(rivalId);
      return npc?.name ?? "别人";
    }
  }
  return "别人";
}

/** 从模板候选中随机选一条 */
function pickTemplate(arr: string[]): string {
  if (arr.length === 0) return "……";
  return arr[Math.floor(Math.random() * arr.length)] ?? "……";
}

/** 生成动作描述（括号内文字） */
function generateAction(emotion: EmotionTag, pv: PersonalityVector): string | undefined {
  const actions = ACTION_BY_EMOTION[emotion];
  if (!actions || actions.length === 0) return undefined;

  // 极低话量 NPC 有时省略动作描写
  if (pv.verbosity < 0.3 && Math.random() < 0.4) {
    return undefined;
  }

  return actions[Math.floor(Math.random() * actions.length)] ?? undefined;
}

// ============================================================
// 核心逻辑
// ============================================================

/**
 * 推断意图类型
 *
 * 根据 beat.type + tensionLevel + pv 决定：
 * 1. beat.type == "trigger" → probe 或 observe（取决于 initiative）
 * 2. tensionLevel > 60 && conflictTendency > 0.5 → defend 或 tease（取决于 humorTendency）
 * 3. jealousySensitivity > 0.7 && 玩家最近与他人互动 → tease
 * 4. 默认 → probe 或 humor（取决于 humorTendency）
 */
function inferIntent(ctx: ActorContext): ActorIntent {
  const { directorCtx, personality } = ctx;
  const beat = directorCtx.beat;

  let intentType: ActorIntentType;

  if (beat.type === "trigger") {
    // 触发节拍：主动型试探，回避型观察
    intentType = personality.initiative > 0.5 ? "probe" : "observe";
  } else if (directorCtx.tensionLevel > 60 && personality.conflictTendency > 0.5) {
    // 高张力 + 高冲突倾向：幽默型调侃，否则防御
    intentType = personality.humorTendency > 0.5 ? "tease" : "defend";
  } else if (personality.jealousySensitivity > 0.7 && hasRecentInteractionWithOthers(ctx)) {
    // 高嫉妒敏感 + 玩家与他人互动 → 调侃
    intentType = "tease";
  } else {
    // 默认：高幽默走幽默，否则试探
    intentType = personality.humorTendency > 0.5 ? "humor" : "probe";
  }

  // 意图强度由张力等级决定
  let intensity: "low" | "medium" | "high";
  if (directorCtx.tensionLevel > 70) {
    intensity = "high";
  } else if (directorCtx.tensionLevel > 40) {
    intensity = "medium";
  } else {
    intensity = "low";
  }

  return {
    type: intentType,
    target: "player",
    topic: directorCtx.topic,
    intensity,
    isReactive: directorCtx.reactTo !== undefined,
  };
}

/**
 * 推断情绪标签
 *
 * 根据 intent + pv + heartValue 决定：
 * - advance + exposureThreshold > 0.7 → flustered
 * - defend + jealousySensitivity > 0.6 → jealous
 * - humor + humorTendency > 0.6 → amused
 * 其余按意图类型兜底
 */
function inferEmotion(intent: ActorIntent, pv: PersonalityVector, heartValue: number): EmotionTag {
  const { type } = intent;

  // 优先规则（PRD 指定）
  if (type === "advance" && pv.exposureThreshold > 0.7) return "flustered";
  if (type === "defend" && pv.jealousySensitivity > 0.6) return "jealous";
  if (type === "humor" && pv.humorTendency > 0.6) return "amused";

  // 兜底规则
  switch (type) {
    case "probe":
      return "curious";
    case "soothe":
      return "vulnerable";
    case "retreat":
      return pv.exposureThreshold > 0.6 ? "cold" : "defensive";
    case "observe":
      return "neutral";
    case "tease":
      return pv.humorTendency > 0.5 ? "amused" : "defensive";
    case "advance":
      return heartValue > 60 ? "moved" : "flustered";
    case "adventure":
      return "curious";
    case "defend":
      return "defensive";
    default:
      return "neutral";
  }
}

/**
 * 组装台词
 *
 * 1. 按 intent × emotion 从模板片段中选取
 * 2. 替换 {topic} 和 {target} 占位符
 * 3. 按 contract.forbiddenPhrases 过滤
 * 4. 按 pv.verbosity + contract.sentenceLengthRange 裁剪句长
 * 5. 组装 action（动作描述）
 */
function composeLine(
  intent: ActorIntent,
  emotion: EmotionTag,
  pv: PersonalityVector,
  contract: TextContract,
  topic: string,
  visibleEvents: WorldEventLog,
): { line: string; action?: string } {
  // 1. 选取模板
  const emotionMap = LINE_TEMPLATES[intent.type];
  const templates = emotionMap?.[emotion] ?? emotionMap?.["neutral"] ?? ["……"];
  const rawTemplate = pickTemplate(templates);

  // 2. 替换占位符
  const targetName = findRivalName(visibleEvents, pv.npcId);
  const topicText = topic || "这事";
  let line = rawTemplate.replace(/\{topic\}/g, topicText).replace(/\{target\}/g, targetName);

  // 3. 禁忌词过滤：替换为省略号
  for (const forbidden of contract.forbiddenPhrases) {
    if (line.includes(forbidden)) {
      line = line.replace(forbidden, "……");
    }
  }

  // 4. 句长裁剪
  const [contractMin, contractMax] = contract.sentenceLengthRange;
  let effectiveMax = contractMax;
  // 按 verbosity 进一步调整
  if (pv.verbosity < 0.3) {
    effectiveMax = Math.min(effectiveMax, 15);
  } else if (pv.verbosity > 0.7) {
    effectiveMax = Math.max(effectiveMax, 50);
  }
  // 确保不小于契约最小值
  effectiveMax = Math.max(effectiveMax, contractMin);

  if (line.length > effectiveMax) {
    line = line.slice(0, Math.max(0, effectiveMax - 1)) + "……";
  }

  // 5. 组装动作描述
  const action = generateAction(emotion, pv);

  return { line, ...(action ? { action } : {}) };
}

/**
 * 核心函数：从 ActorContext 生成 ActorOutput
 *
 * 流程：
 * 1. 从导演拿到 beat + speakerId + topic
 * 2. inferIntent: 根据 beat.type + tensionLevel + pv 推断意图
 * 3. inferEmotion: 根据 intent + pv + heartValue 推断情绪
 * 4. composeLine: 组装台词 + 动作
 *
 * 若 beat.type == "micro_reaction"，走微反应路径（不发言）。
 */
export function generateActorOutput(ctx: ActorContext): ActorOutput {
  const { directorCtx, personality, textContract, visibleEvents } = ctx;
  const beat = directorCtx.beat;

  const intent = inferIntent(ctx);
  const emotion = inferEmotion(intent, personality, ctx.relationshipToPlayer);

  // 微反应节拍：不发言，只走微反应
  if (beat.type === "micro_reaction") {
    const npcName = getNpcById(ctx.npcId)?.name ?? ctx.npcId;
    const microAction = pickMicroReaction(personality, emotion, npcName);
    return {
      npcId: ctx.npcId,
      line: "",
      intent,
      emotionTag: emotion,
      microAction,
    };
  }

  // 正常发言
  const { line, action } = composeLine(
    intent,
    emotion,
    personality,
    textContract,
    directorCtx.topic,
    visibleEvents,
  );

  return {
    npcId: ctx.npcId,
    line,
    intent,
    emotionTag: emotion,
    ...(action ? { action } : {}),
  };
}

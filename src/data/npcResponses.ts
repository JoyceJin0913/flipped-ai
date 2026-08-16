/**
 * 基于上下文的 NPC 回复生成器
 *
 * 区别于原有的 30 条通用 REACTION_TEMPLATES，
 * 新系统会拼接：事件上下文 + 人格特征 + 依恋反应 → 生成差异化回复
 *
 * 使用方式：
 *   import { generateContextualResponse } from '../data/npcResponses';
 *   const reply = generateContextualResponse({ choice, npc, eventContext, relationship });
 */

import type { NPC, Relationship, IntentType, AttachmentType } from "../core/types";
import type { ChatChoice } from "./chatTemplates";

// ============================================================
// 上下文输入
// ============================================================

export interface NpcResponseInput {
  /** 玩家选择的聊天选项 */
  choice: ChatChoice;
  /** 当前聊天 NPC */
  npc: NPC;
  /** 公共事件上下文 */
  eventContext: {
    topic?: string;
    npcWasMentioned?: boolean;
    npcAction?: string;
    tensionLevel?: string;
  };
  /** 当前关系状态 */
  relationship: Relationship;
}

// ============================================================
// 回复片段库
// ============================================================

/** 前缀：引用事件上下文 */
const EVENT_PREFIXES: Record<string, Record<AttachmentType, string[]>> = {
  // ---- 玩家引用了事件/行为时 ----
  event_ref: {
    secure: [
      "你注意到了啊……",
      "原来你在看那边。",
      "嗯，今天确实发生了不少事。",
    ],
    anxious: [
      "你……你一直在关注我？",
      "（停顿了一下）你居然记得。",
      "我以为没人会注意到那个……",
    ],
    avoidant: [
      "……",
      "你有必要这么仔细吗。",
      "（耳尖微红）那不算什么。",
    ],
  },
  // ---- 玩家表达关心/安抚时 ----
  soothe: {
    secure: [
      "谢谢。我没事的。",
      "有你这句话就够了。",
      "（笑了笑）你总是很会照顾人。",
    ],
    anxious: [
      "……你是唯一一个看出来的人。",
      "（眼眶微红）谢谢你。",
      "你怎么知道我需要的正是这个……",
    ],
    avoidant: [
      "我没那么脆弱。",
      "……不用管我。",
      "（沉默了几秒）……谢谢。但我没事。",
    ],
  },
  // ---- 玩家推进关系时 ----
  advance: {
    secure: [
      "我也正想跟你多说说话。",
      "那我们多聊聊？",
      "（眼神温柔）好啊。",
    ],
    anxious: [
      "真的吗……你不是在哄我吧？",
      "（眼睛亮了一下）你说真的？",
      "……你确定是我吗？",
    ],
    avoidant: [
      "太早了吧。",
      "别急着定义什么。",
      "（攥紧了拳头又松开）……让我想想。",
    ],
  },
  // ---- 默认前缀 ----
  default: {
    secure: ["嗯？", "怎么说？", "我在听。"],
    anxious: ["……什么？", "（看向你）嗯？", "你突然说这个……"],
    avoidant: ["……", "嗯。", "然后呢？"],
  },
};

/** 后缀：注入人格色彩 */
const PERSONALITY_SUFFIXES: Record<
  string,
  (npc: NPC, rel: Relationship) => string
> = {
  // ---- INTJ / avoidant（林一式） ----
  "INTJ-avoidant": () =>
    "\n（没有再说什么，但他的目光在你身上多停留了一秒）",

  // ---- ISFJ / secure（周叙式） ----
  "ISFJ-secure": () =>
    "\n（温和地笑了，像是在说'我知道你的意思'）",

  // ---- ENTP / anxious（沈知式） ----
  "ENTP-anxious": () =>
    "\n（嘴上在笑，但手指不自觉地摩挲着衣角——他在紧张）",

  // ---- ESFP / secure（陆野式） ----
  "ESFP-secure": () =>
    "\n（哈哈大笑，整个人的能量都亮了起来）",

  // ---- INFP / anxious（江郁式） ----
  "INFP-anxious": () =>
    "\n（脸微微红了，低下头，但嘴角在上扬）",

  // ---- ESTJ / secure（顾言式） ----
  "ESTJ-secure": () =>
    "\n（点了点头，表情平静但眼神温和了许多）",

  // ---- ENFP / secure（程逸式） ----
  "ENFP-secure": () =>
    "\n（眼睛亮晶晶的，像是想到了什么好玩的事）",

  // ---- ISTJ / avoidant（宋清式） ----
  "ISTJ-avoidant": () =>
    "\n（推了推眼镜，偏过头去——但耳朵红了）",

  // ---- 默认人格后缀 ----
  default: (_npc: NPC, rel: Relationship) => {
    const clues = rel.icebergCluesUnlocked;
    if (clues >= 3)
      return "\n（这一次，他没有用任何伪装来回答你）";
    if (clues >= 2)
      return "\n（你能感觉到他说的话比平时多了几分真诚）";
    return "";
  },
};

/** 中间：依恋类型 × 意图类型 的核心反应 */
const CORE_REACTIONS: Partial<Record<IntentType, Partial<Record<AttachmentType, string[]>>>> = {
  probe: {
    secure: ["你想了解什么都可以问。", "这个问题……让我想想怎么回答。"],
    anxious: ["你怎么突然问这个……是有什么想法吗？", "（停顿）你想知道多少？"],
    avoidant: ["这重要吗？", "为什么问这个。", "……有些事，知道了也不一定好。" ],
  },
  advance: {
    secure: ["我也正有此意。", "那就一起吧。", "好。"],
    anxious: ["真的吗……你不是在骗我吧？", "（深呼吸）你说真的？" ],
    avoidant: ["……太快了。", "我不确定。", "给我一点时间。" ],
  },
  soothe: {
    secure: ["谢谢，我好多了。", "有你在我放心多了。", "你总是能察觉到。" ],
    anxious: ["你……你是唯一一个看出来的人。", "（眼眶微红）谢谢。" ],
    avoidant: ["我没那么脆弱。", "不用管我。……但谢谢。" ],
  },
  humor: {
    secure: ["哈哈哈 你也太会说了", "行啊，接得住你的梗", "你这个人……有意思" ],
    anxious: ["（忍不住笑了）你这个人……", "好吧，你赢了这次" ],
    avoidant: ["还行。", "……有点好笑。", "哼。" ],
  },
  adventure: {
    secure: ["走！我陪你。", "有意思，来吧！", "好啊，试试看。" ],
    anxious: ["这……会不会太冒险了？", "但你如果要去的话……我跟上。" ],
    avoidant: ["不去。", "你自己去吧。", "……你认真的？" ],
  },
};

// ============================================================
// 核心生成函数
// ============================================================

/**
 * 基于上下文生成 NPC 回复
 *
 * 拼接逻辑：
 *   1. 基础反应（依恋类型 × 意图类型）
 *   2. 事件前缀（如果选项引用了公共事件）
 *   3. 人格后缀（NPC 特色 + 关系深度）
 */
export function generateContextualResponse(input: NpcResponseInput): string {
  const { choice, npc, eventContext, relationship: rel } = input;
  const attachment = npc.attachment;
  const intent = choice.intentType;

  // ---- 1. 选择前缀 ----
  let prefix = "";
  const prefixCategory =
    choice.meta.source === "event_ref"
      ? "event_ref"
      : intent === "soothe"
        ? "soothe"
        : intent === "advance"
          ? "advance"
          : "default";

  const prefixPool = EVENT_PREFIXES[prefixCategory]?.[attachment] ?? EVENT_PREFIXES['default']?.[attachment] ?? [];
  if (prefixPool.length > 0) {
    prefix = prefixPool[Math.floor(Math.random() * prefixPool.length)] ?? "";
  }

  // ---- 2. 选择核心反应 ----
  let core = "";
  const corePool = CORE_REACTIONS[intent]?.[attachment as AttachmentType];
  if (corePool && corePool.length > 0) {
    core = corePool[Math.floor(Math.random() * corePool.length)] ?? "";
  }
  // 如果核心池没有匹配，使用一个通用回复
  if (!core) {
    core = getDefaultCoreReaction(intent, npc);
  }

  // ---- 3. 选择后缀 ----
  const personalityKey = `${npc.mbti}-${attachment}`;
  const suffixFn =
    PERSONALITY_SUFFIXES[personalityKey] ?? PERSONALITY_SUFFIXES['default'];
  const suffix = suffixFn ? suffixFn(npc, rel) : "";

  // ---- 4. 组装最终回复 ----
  const parts = [prefix, core].filter((p) => p.length > 0);
  let response = parts.join("\n");
  if (suffix) response += suffix;

  return response;
}

/** 兜底核心回复（当 CORE_REACTIONS 未覆盖时） */
function getDefaultCoreReaction(intent: IntentType, npc: NPC): string {
  const responses: Record<IntentType, string[]> = {
    probe: [`"${npc.name}"想了想，"可以问。"`],
    advance: [`"${npc.name}"沉默了一瞬，"……你再說一遍。"`],
    soothe: [`"${npc.name}"轻轻点了点头,"……謝谢。"`],
    humor: [`"${npc.name}"嘴角弯了一下,"你还挺有趣的。"`],
    adventure: [`"${npc.name}"挑眉,"你确定？"`],
  };
  const pool = responses[intent] ?? responses.probe!;
  return pool[Math.floor(Math.random() * pool.length)] ?? "...";
}

// ============================================================
// 导出：开场白生成器（根据当天事件动态生成）
// ============================================================

/**
 * 根据公共事件上下文生成私聊开场白
 *
 * @param npc 当前 NPC
 * @param eventContext 当天事件上下文
 * @returns 开场白文本
 */
export function generateOpeningLine(
  npc: NPC,
  eventContext?: {
    topic?: string;
    npcMentioned?: boolean;
    tensionLevel?: string;
    dayNumber?: number;
  },
): string {
  const ctx = eventContext ?? {};
  const tension = ctx.tensionLevel ?? "low";
  const mentioned = ctx.npcMentioned ?? false;
  const day = ctx.dayNumber ?? 1;

  // 高紧张度 + 被提及 → 更直接/更有情绪的开场
  if (tension === "high" || tension === "very-high") {
    if (mentioned) {
      const intenseOpenings = [
        `（${npc.name}站在阴影里，看到你来，没有转身）……你来了。`,
        `（${npc.name}的声音比平时低）今天的事……你还好吗？`,
        `（${npc.name}抬头看了你一眼，很快移开）……我等了你一会儿。`,
      ];
      return intenseOpenings[Math.floor(Math.random() * intenseOpenings.length)]!;
    }
  }

  // 有事件话题时 → 引用事件
  if (ctx.topic) {
    const eventOpenings = [
      `（${npc.name}抬头看了你一下）关于今天${ctx.topic}的事……`,
      `（${npc.name}靠在门框上）${ctx.topic}之后，你找我？`,
      `（${npc.name}正在发呆，被你打断后回过神）……哦，是你。`,
    ];
    return eventOpenings[Math.floor(Math.random() * eventOpenings.length)]!;
  }

  // 默认开场白（按依恋类型区分）
  const defaultOpenings: Record<AttachmentType, string[]> = {
    secure: [
      `（${npc.name}微笑着）这么晚了还没睡？`,
      `（${npc.name}正在整理东西，看到你停下来）有事吗？`,
      `（${npc.name}自然地拍了拍身边的位置）坐？`,
    ],
    anxious: [
      `（${npc.name}看起来有点意外）你……来找我？`,
      `（${npc.name}手指无意识地绞着衣角）我还以为你不会来……`,
      `（${npc.name}试图装作不在意，但眼神一直跟着你）`,
    ],
    avoidant: [
      `（${npc.name}看了你一眼，没说话，但往旁边挪了一点位置）`,
      `（${npc.name}低头看着手机，但屏幕一直是黑的）……`,
      `（${npc.name}背对着你，声音很轻）……你来了。`,
    ],
  };

  const pool = defaultOpenings[npc.attachment] ?? defaultOpenings.secure!;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

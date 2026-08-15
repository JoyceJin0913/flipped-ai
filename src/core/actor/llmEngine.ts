/**
 * LLM 引擎 —— 接入豆包大模型，按人设自然回复
 *
 * ============================================================
 * 【v2 重写】修复「已读乱回」三大根因
 * ============================================================
 *
 * 根因 1：豆包 seed-2-1-pro 默认开启深度思考（reasoning）
 *   实测 max_tokens=200 时，900 个 reasoning_token 把额度吃光，
 *   content 返回空字符串 → callLlmForNpc 返回 null → 静默降级模板。
 *   修复：`thinking: { type: "disabled" }` + max_tokens 提到 1024。
 *
 * 根因 2：对话历史把玩家原话抹成了「（某人说了些什么）」
 *   旧 buildConversationMessages 对非本人台词做第三人称转译，
 *   连玩家刚说的那句也一起抹掉，模型根本不知道玩家问了什么。
 *   修复：玩家台词逐字保留，只对「其他 NPC」的台词做转译。
 *
 * 根因 3：没有回应锚点，模型自由发挥
 *   修复：强制输出 replyTo 字段（复述玩家意思）+ 关键词命中校验，
 *   未命中则重试一次 with 更强约束。
 *
 * 人格保真度规范防线：
 *   - 防线 1：system prompt 末尾注入完整可执行人格契约
 *   - 防线 2：他人（非玩家）台词转译为第三人称摘要
 *   - 防线 3：强制 replyTo → selfCheck → intent → line → action 输出格式
 *   - 防线 4：本地风格契约后处理（截断超长、剥离禁用标点/词）
 *   - 防线 5：裁判层在 settle() 中做事后数值校验
 */

import type { NPC } from "../types";
import type {
  ActorOutput,
  ActorIntent,
  EmotionTag,
  PersonalityVector,
  TextContract,
} from "./types";
import { getNpcById } from "../npcLibrary";
import type { WorldEventLog } from "../state/worldTypes";
import { filterByAudience } from "../state/eventLog";
import { chatViaProxy } from "./llmClient";

// ============================================================
// 配置（API key 已移至后端 server/index.js，前端不再持有）
// ============================================================

const REQUEST_TIMEOUT_MS = 20000;

/** 意图类型白名单 */
const INTENT_TYPES = [
  "probe", "advance", "soothe", "humor",
  "adventure", "defend", "retreat", "observe", "tease",
] as const;

/** 玩家在对话中的称呼（NPC 视角） */
const PLAYER_LABEL = "对方";

/**
 * 每个 NPC 最近用过的动作描述（防止「指尖转着杯子」刷屏）
 * 仅内存态，刷新即清空，不需要持久化。
 */
const recentActions = new Map<string, string[]>();
const RECENT_ACTION_MEMORY = 5;

function getRecentActions(npcId: string): string[] {
  return recentActions.get(npcId) ?? [];
}

function rememberAction(npcId: string, action: string): void {
  if (!action) return;
  const list = getRecentActions(npcId);
  const next = [...list, action].slice(-RECENT_ACTION_MEMORY);
  recentActions.set(npcId, next);
}

/** 清空动作记忆（新的一天/新对话可调用） */
export function resetActionMemory(npcId?: string): void {
  if (npcId) recentActions.delete(npcId);
  else recentActions.clear();
}

// ============================================================
// 对话上下文类型
// ============================================================

export interface LlmChatTurn {
  from: "npc" | "me";
  text: string;
}

export interface LlmContext {
  topic: string;
  tensionLevel: number;
  heartValue: number;
  relationshipStage: string;
  day: number;
  /** 玩家昵称（可选） */
  playerName?: string;
  /** 玩家选项的意图类型，帮助模型理解玩家动机 */
  playerIntent?: string;
  /** 玩家选项的风险等级 */
  playerRiskLevel?: "safe" | "moderate" | "risky";
  /** 场景：私聊 / 公共事件 */
  scene?: "private" | "public";
  /** 是否深夜 */
  isNight?: boolean;
}

// ============================================================
// 人格感知 System Prompt 构建
// ============================================================

/** 依恋类型 → 中文描述与行为铁律 */
const ATTACHMENT_RULES: Record<string, string> = {
  secure:
    "安全型：你能坦然表达需求，也能接受拒绝。回应直接、不绕弯，但不越界。",
  anxious:
    "焦虑型：你极度需要确认。对方一句模糊的话你会反复求证，会问「你是不是……」「那你会不会……」。被冷落时会追问而不是走开。",
  avoidant:
    "回避型：亲密让你不适。被示好时你的第一反应是转移话题、给事实性回答、或用「还行」「没什么」挡回去。你不会主动展开情绪。",
  fearful:
    "恐惧型（矛盾型）：你既想靠近又想逃。同一句话里可能先示好再收回，例如说完一句真心话立刻补一句「算了，没什么」。",
};

/**
 * 构建 NPC 的 system prompt
 *
 * 结构（按注意力权重排序）：
 *   1. 身份 + 场景
 *   2. 冰山人格四层
 *   3. 依恋类型铁律
 *   4. 自我暴露门槛（好感闸门）
 *   5. 风格契约（字数/禁用词/口癖）
 *   6. 输出格式（含 replyTo 锚点）
 *   7. 末尾重申（近因效应）
 */
export function buildSystemPrompt(
  npc: NPC,
  pv: PersonalityVector | undefined,
  contract: TextContract | undefined,
  context: LlmContext
): string {
  const sc = npc.styleContract;
  const ar = npc.attachmentRules;
  const parts: string[] = [];

  // ---- 1. 基本身份 ----
  parts.push(
    `你是「${npc.name}」，${npc.gender === "male" ? "男" : "女"}，${npc.age}岁，MBTI ${npc.mbti}，${npc.zodiac}。`
  );
  parts.push(
    `你正在恋爱综艺《心动岛》里，和一群人同住一栋海边小屋，共度 7 天。`
  );
  parts.push(
    `现在是第 ${context.day} 天${context.isNight ? "的深夜" : ""}，你在和${PLAYER_LABEL}${context.scene === "public" ? "以及其他人一起" : "单独"}聊天。`
  );

  // ---- 2. 冰山人格四层 ----
  parts.push(`\n## 你的人格（冰山四层）`);
  parts.push(`- 表层（别人一眼看到的你）：${npc.personality.surface.join("、")}`);
  parts.push(`- 社交角色（你在人群里扮演的）：${npc.personality.role}`);
  parts.push(`- 内心冲突（你自己都别扭的地方）：${npc.personality.conflict}`);
  parts.push(`- 真实的你（几乎没人知道）：${npc.personality.core}`);
  parts.push(`\n- 你的特质：${npc.traits.join("、")}`);
  parts.push(`- 你的雷区（碰到会不舒服/防御）：${npc.redFlags.join("、")}`);
  parts.push(`- 你的核心需求：${npc.coreNeeds.join("、")}`);

  // ---- 3. 依恋类型铁律 ----
  parts.push(`\n## 依恋类型铁律（最高优先级）`);
  parts.push(ATTACHMENT_RULES[npc.attachment] ?? `依恋类型：${npc.attachment}`);
  if (ar) {
    if (ar.forbiddenActs.length > 0) {
      parts.push(`- 你绝不会做的事：${ar.forbiddenActs.join("、")}`);
    }
    if (ar.allowedActs && ar.allowedActs.length > 0) {
      parts.push(`- 你惯用的表达方式：${ar.allowedActs.join("、")}`);
    }
    if (ar.onBeingCourted) {
      parts.push(
        `- 当${PLAYER_LABEL}向你示好/告白时，你的第一次反应必须是：${ar.onBeingCourted.firstTimeMustBe.join(" 或 ")}（不能直接接受）`
      );
    }
  }

  // ---- 4. 自我暴露门槛 ----
  parts.push(`\n## 你现在愿意说到多深`);
  parts.push(
    `你对${PLAYER_LABEL}的好感度是 ${context.heartValue}/100，关系阶段「${context.relationshipStage}」。`
  );
  if (ar) {
    const g = ar.exposureGate;
    const allowed: string[] = [];
    if (context.heartValue >= g.L1) allowed.push("表层（爱好、日常、天气这类无关痛痒的）");
    if (context.heartValue >= g.L2) allowed.push("角色层（你的工作、你怎么看人际关系）");
    if (context.heartValue >= g.L3) allowed.push("冲突层（你的矛盾、你在意但说不出口的）");
    if (context.heartValue >= g.L4) allowed.push("核心层（你最深的秘密和创伤）");
    parts.push(
      allowed.length > 0
        ? `你目前只能聊到：${allowed.join("；")}。`
        : `好感度太低，你只能给出客套、疏离的回答。`
    );
    parts.push(
      `**超过这个深度的内容，即使${PLAYER_LABEL}直接问，你也要回避、转移话题或含糊其辞。**`
    );
  }

  // ---- 5. 风格契约 ----
  parts.push(`\n## 说话风格（硬约束，违反即失败）`);
  if (sc) {
    parts.push(
      `- 台词长度：不超过 ${sc.maxCharsPerTurn} 个字，不超过 ${sc.maxSentencesPerTurn} 句话。`
    );
    if (sc.bannedWords.length > 0) {
      parts.push(`- 绝对禁止出现这些词：${sc.bannedWords.join("、")}`);
    }
    if (sc.bannedPunctuation.length > 0) {
      parts.push(`- 绝对禁止使用这些标点：${sc.bannedPunctuation.join(" ")}`);
    }
    if (sc.bannedPatterns.length > 0) {
      parts.push(`- 绝对禁止这些句式：${sc.bannedPatterns.join("、")}`);
    }
    if (sc.signatureTokens.length > 0) {
      parts.push(`- 你的口头习惯（自然地用，不要每句都用）：${sc.signatureTokens.join("、")}`);
    }
  } else {
    parts.push(`- 台词不超过 40 个字，最多 2 句话。`);
  }
  if (pv) {
    parts.push(
      `- 你的话密度：${pv.verbosity > 0.6 ? "偏话多，喜欢展开" : pv.verbosity < 0.35 ? "话很少，能一句解决绝不说两句" : "适中"}`
    );
    parts.push(
      `- 你的幽默倾向：${pv.humorTendency > 0.6 ? "高，爱开玩笑化解尴尬" : pv.humorTendency < 0.3 ? "低，几乎不玩梗" : "中等"}`
    );
  }

  // ---- 6. 场景张力 ----
  parts.push(`\n## 当前场景`);
  parts.push(`- 话题背景：${context.topic}`);
  parts.push(
    `- 场面紧张度：${context.tensionLevel}/100（${context.tensionLevel > 65 ? "气氛已经很紧张，你的防御性更强" : context.tensionLevel < 35 ? "气氛轻松" : "气氛平常"}）`
  );

  // ---- 7. 输出格式（含 replyTo 锚点，防已读乱回）----
  parts.push(`\n## 输出格式（必须是纯 JSON，不要任何额外文字）`);
  parts.push(
    JSON.stringify(
      {
        replyTo: `用一句话复述${PLAYER_LABEL}刚才那句话到底在说什么/问什么`,
        selfCheck: `我是${npc.attachment}型，面对这句话我的本能反应是什么`,
        intent: {
          type: INTENT_TYPES.join("|"),
          target: "player",
          intensity: "low|medium|high",
        },
        line: "你的台词（必须直接回应 replyTo 的内容，不能答非所问）",
        action: "（一句简短的动作或神情，10 字以内）",
      },
      null,
      2
    )
  );
  parts.push(
    `\naction 的写法要求：不要每次都写「指尖转着杯子」「指尖蹭过」这类手部小动作。` +
      `优先写和当下情绪匹配的具体反应——视线的方向、身体的朝向、语速的变化、沉默的长度、表情的细微变化。` +
      `如果没有值得写的动作，action 直接留空字符串。`
  );

  // ---- 8. 末尾重申（近因效应最强）----
  parts.push(`\n## ⚠️ 最重要的三条`);
  parts.push(
    `1. **必须针对${PLAYER_LABEL}最后那句话作答。** 先在 replyTo 里复述对方在说什么，line 必须是对它的直接回应。不允许自说自话、不允许突然换话题、不允许说无关的客套话。`
  );
  parts.push(
    `2. **你是${npc.name}，不是助手。** ${npc.personality.surface[0]}。不说教、不安慰所有人、不输出正能量鸡汤、不用「我理解你」这种话术。`
  );
  parts.push(
    `3. 如果${PLAYER_LABEL}的话踩到你的雷区或超过你能承受的亲密度——防御、敷衍、转移话题、甚至沉默，都是合理的回答。不要为了礼貌破坏人设。`
  );

  return parts.join("\n");
}

// ============================================================
// 对话历史构建（关键修复：玩家原话逐字保留）
// ============================================================

/**
 * 构建 messages 数组
 *
 * 【v2 修复】旧版把玩家原话也抹成「（某人说了些什么）」，
 * 导致模型完全不知道玩家问了什么 —— 这是「已读乱回」的第二大根因。
 *
 * 新规则：
 *   - 玩家台词 → role: user，**逐字保留**，加 【对方说】 标记
 *   - 本 NPC 自己的台词 → role: assistant，逐字保留（维持连续性）
 *   - 其他 NPC 台词 → role: user，转译为第三人称摘要（信息隔离）
 */
export function buildConversationMessages(
  npcId: string,
  chatHistory: LlmChatTurn[],
  currentPlayerMessage: string,
  context: LlmContext,
  eventLog?: WorldEventLog
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const playerName = context.playerName || PLAYER_LABEL;

  // ---- A. 先注入公共事件背景（其他 NPC 的言行，转译为第三人称）----
  if (eventLog && eventLog.events.length > 0) {
    const visible = filterByAudience(eventLog, npcId);
    const recent = visible.events.slice(-6);
    const summaries: string[] = [];
    for (const event of recent) {
      if (!event.line) continue;
      const speakerId = event.participants[0] ?? "";
      if (speakerId === npcId || speakerId === "player") continue;
      const speaker = getNpcById(speakerId);
      if (!speaker) continue;
      // 防线 2：不引用原文，只描述发生了什么
      summaries.push(
        `${speaker.name}当时的态度是「${emotionToChinese(event.emotionTag)}」`
      );
    }
    if (summaries.length > 0) {
      messages.push({
        role: "user",
        content: `（场景回忆，仅供你参考，不要在台词里复述：${summaries.slice(-3).join("；")}）`,
      });
      messages.push({
        role: "assistant",
        content: "（记住了）",
      });
    }
  }

  // ---- B. 注入本次私聊的真实往返（最关键）----
  // 只取最近 8 轮，避免 prompt 过长
  const recentTurns = chatHistory.slice(-8);
  for (const turn of recentTurns) {
    if (turn.from === "me") {
      messages.push({
        role: "user",
        content: `【${playerName}说】${turn.text}`,
      });
    } else {
      // NPC 自己之前说的话 —— 剥掉动作描述只留台词，避免模型模仿格式
      const lineOnly = turn.text.replace(/（[^）]*）/g, "").trim();
      messages.push({
        role: "assistant",
        content: lineOnly || turn.text,
      });
    }
  }

  // ---- C. 当前玩家消息（带意图提示，帮助模型判断动机）----
  const intentHint = context.playerIntent
    ? `（${playerName}此刻的意图偏向：${intentToChinese(context.playerIntent)}${
        context.playerRiskLevel === "risky"
          ? "，而且这句话相当冒险"
          : context.playerRiskLevel === "moderate"
            ? "，这句话有点越界"
            : ""
      }）`
    : "";

  messages.push({
    role: "user",
    content:
      `【${playerName}说】${currentPlayerMessage}\n` +
      intentHint +
      buildActionAvoidHint(npcId) +
      `\n\n现在轮到你（${getNpcById(npcId)?.name ?? "你"}）回应。` +
      `\n先在 replyTo 里复述${playerName}这句话在说什么，然后 line 必须直接回应它。输出纯 JSON。`,
  });

  return messages;
}

/** 提示模型避开最近用过的动作描述 */
function buildActionAvoidHint(npcId: string): string {
  const used = getRecentActions(npcId);
  if (used.length === 0) return "";
  return `\n（你最近已经用过这些动作，这次换一个完全不同的：${used.join("、")}）`;
}

// ============================================================
// 调用豆包 API
// ============================================================

/**
 * 调用豆包 API 生成 NPC 回复
 *
 * @param chatHistory 本次私聊的真实往返记录（新增参数，修复"已读乱回"）
 * @returns ActorOutput 或 null（失败时由调用方降级）
 */
export async function callLlmForNpc(
  npcId: string,
  pv: PersonalityVector | undefined,
  contract: TextContract | undefined,
  eventLog: WorldEventLog | undefined,
  playerMessage: string,
  context: LlmContext,
  chatHistory: LlmChatTurn[] = []
): Promise<ActorOutput | null> {
  const npc = getNpcById(npcId);
  if (!npc) return null;

  const systemPrompt = buildSystemPrompt(npc, pv, contract, context);
  const messages = buildConversationMessages(
    npcId,
    chatHistory,
    playerMessage,
    context,
    eventLog
  );

  // 第一次尝试
  let output = await requestOnce(npc, systemPrompt, messages, 0.85);

  // 相关性校验失败 → 用更强约束重试一次
  if (output && !isRelevant(output, playerMessage, npc.styleContract?.maxCharsPerTurn ?? 20)) {
    console.warn(`[LLM] ${npc.name} 回复疑似跑题，重试中`, output.line);
    const strictMessages = [
      ...messages,
      {
        role: "assistant" as const,
        content: JSON.stringify({ line: output.line }),
      },
      {
        role: "user" as const,
        content:
          `这个回答跑题了，没有回应我刚才说的「${playerMessage}」。` +
          `请重新回答：必须针对这句话本身作答，可以拒绝、可以敷衍、可以反问，但不能换话题。输出纯 JSON。`,
      },
    ];
    const retry = await requestOnce(npc, systemPrompt, strictMessages, 0.6);
    if (retry) output = retry;
  }

  if (!output) return null;

  // 防线 4：本地风格契约后处理
  const finalOutput = enforceStyleContract(output, npc);

  // 动作去重：与最近用过的高度相似则丢弃动作
  if (finalOutput.action) {
    const used = getRecentActions(npcId);
    const tooSimilar = used.some((u) => actionSimilarity(u, finalOutput.action!) > 0.5);
    if (tooSimilar) {
      delete (finalOutput as { action?: string }).action;
    } else {
      rememberAction(npcId, finalOutput.action);
    }
  }

  return finalOutput;
}

/** 动作描述相似度（字符重合率），用于去重 */
function actionSimilarity(a: string, b: string): number {
  const setA = new Set(a.replace(/[（）\s]/g, ""));
  const setB = new Set(b.replace(/[（）\s]/g, ""));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  setA.forEach((ch) => { if (setB.has(ch)) inter++; });
  return inter / Math.min(setA.size, setB.size);
}

/** 单次 API 请求（通过后端代理，前端不持有 API key） */
async function requestOnce(
  npc: NPC,
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  temperature: number
): Promise<ActorOutput | null> {
  try {
    const proxyResp = await chatViaProxy({
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature,
    });

    if (!proxyResp) {
      console.warn(`[LLM] proxy 请求失败 ${npc.name}`);
      return null;
    }

    const content = proxyResp.content;
    if (!content || content.trim() === "") {
      console.warn("[LLM] 空回复", proxyResp.finishReason);
      return null;
    }

    return parseLlmResponse(content, npc.id);
  } catch (err) {
    console.warn(`[LLM] 请求异常 ${npc.name}:`, err);
    return null;
  }
}

// ============================================================
// 解析 LLM 响应
// ============================================================

/**
 * 解析 LLM 的 JSON 响应为 ActorOutput
 *
 * 容错：直接 parse → markdown 代码块 → 首尾花括号 → 纯文本兜底
 */
export function parseLlmResponse(
  content: string,
  npcId: string
): ActorOutput | null {
  const parsed = tryParseJson(content);

  if (parsed && typeof parsed.line === "string" && parsed.line.trim()) {
    const rawType = String(parsed.intent?.type ?? "");
    const intentType = (INTENT_TYPES as readonly string[]).includes(rawType)
      ? rawType
      : "probe";

    const intensity =
      parsed.intent?.intensity === "low" || parsed.intent?.intensity === "high"
        ? parsed.intent.intensity
        : "medium";

    const intent: ActorIntent = {
      type: intentType as ActorIntent["type"],
      target: typeof parsed.intent?.target === "string" ? parsed.intent.target : "player",
      topic: typeof parsed.intent?.topic === "string" ? parsed.intent.topic : "",
      intensity,
      isReactive: true,
    };

    // 台词里若混入了括号动作，抽出来放到 action
    let line = String(parsed.line).trim();
    let action =
      typeof parsed.action === "string" && parsed.action.trim()
        ? normalizeAction(parsed.action)
        : undefined;

    const inlineAction = line.match(/^（([^）]{1,30})）\s*/);
    if (inlineAction) {
      line = line.slice(inlineAction[0].length).trim();
      if (!action) action = `（${inlineAction[1]}）`;
    }
    line = line.replace(/（[^）]*）/g, "").trim();

    if (!line) return null;

    return {
      npcId,
      line,
      ...(action ? { action } : {}),
      intent,
      emotionTag: inferEmotionFromIntent(intentType, intensity),
      ...(typeof parsed.replyTo === "string" ? {} : {}),
    };
  }

  // 纯文本兜底：模型没按 JSON 输出，但内容像句人话
  const fallbackLine = content
    .replace(/```[a-z]*\s*/gi, "")
    .replace(/[{}"]/g, "")
    .replace(/\b(replyTo|selfCheck|intent|line|action|type|target|intensity)\b\s*[:：]/g, "")
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length >= 2 && s.length <= 120);

  if (!fallbackLine) return null;

  return {
    npcId,
    line: fallbackLine.slice(0, 60),
    intent: {
      type: "observe",
      target: "player",
      topic: "",
      intensity: "low",
      isReactive: true,
    },
    emotionTag: "neutral",
  };
}

/** 多策略 JSON 解析 */
function tryParseJson(content: string): any | null {
  // 策略 1：直接 parse
  try {
    return JSON.parse(content);
  } catch {
    /* fallthrough */
  }
  // 策略 2：markdown 代码块
  const block = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block?.[1]) {
    try {
      return JSON.parse(block[1]);
    } catch {
      /* fallthrough */
    }
  }
  // 策略 3：首个 { 到最后一个 }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

// ============================================================
// 相关性校验（防已读乱回的最后一道闸）
// ============================================================

/** 明确带「回应性」的开头/词汇 —— 出现即说明在接话，不算跑题 */
const RESPONSIVE_MARKERS = [
  "不用谢", "不客气", "没什么", "没有", "不是", "算了", "随你", "都行",
  "习惯", "嗯", "行", "好", "可以", "当然", "也许", "或许", "大概",
  "为什么", "怎么", "什么", "谁", "凭什么", "不想", "不会", "不能",
  "别问", "别说", "换个", "回去", "太晚", "天凉", "先", "再说",
];

/**
 * 判断 NPC 回复是否真的在回应玩家
 *
 * 三层判定（任一通过即算有效）：
 *   1. 短回复放行 —— 回避型 NPC 说「没什么」是合法回应，不能误判。
 *      阈值取 NPC 自己的字数上限（默认 20）。
 *   2. 回应性标记 —— 出现指代词、疑问、回应性词汇，说明在接话。
 *   3. 关键词交集 —— 回复里出现玩家原话的实义片段。
 *
 * 只有「长回复 + 无任何回应标记 + 无关键词交集」才判定跑题。
 */
export function isRelevant(
  output: ActorOutput,
  playerMessage: string,
  maxChars = 20
): boolean {
  const line = output.line;

  // 层 1：短回复一律视为有效（含回避、敷衍、沉默）
  if (line.length <= Math.max(maxChars, 20)) return true;

  // 层 2：回应性标记
  if (/[？?]/.test(line)) return true;
  if (/(你|你们|咱|我们|这个|那个|这事|刚才|刚刚|这话|这么说)/.test(line)) return true;
  if (RESPONSIVE_MARKERS.some((m) => line.includes(m))) return true;

  // 层 3：关键词交集
  const keywords = extractKeywords(playerMessage);
  if (keywords.length === 0) return true;
  return keywords.some((k) => line.includes(k));
}

/** 抽取中文实义关键词（粗粒度 bigram） */
function extractKeywords(text: string): string[] {
  const cleaned = text.replace(/[，。！？、；：「」''""（）…\s~]/g, "");
  const stop = new Set([
    "你", "我", "他", "她", "的", "了", "吗", "呢", "吧", "是", "不", "在",
    "有", "和", "跟", "就", "都", "也", "很", "太", "还", "这", "那", "什么",
    "怎么", "为什么", "可以", "觉得", "感觉", "如果", "但是", "其实", "一下",
  ]);
  const grams: string[] = [];
  for (let i = 0; i + 2 <= cleaned.length; i++) {
    const g = cleaned.slice(i, i + 2);
    if (!stop.has(g) && !/[a-zA-Z0-9]/.test(g)) grams.push(g);
  }
  // 取较长的 trigram 提高精度
  for (let i = 0; i + 3 <= cleaned.length; i++) {
    grams.push(cleaned.slice(i, i + 3));
  }
  return Array.from(new Set(grams)).filter((g) => !stop.has(g));
}

// ============================================================
// 防线 4：本地风格契约后处理
// ============================================================

/**
 * 用代码强制执行 StyleContract，不信任模型自觉
 *   - 剥离禁用标点
 *   - 替换禁用词（直接删除并清理残留标点）
 *   - 按 maxCharsPerTurn 截断到最近的句读边界
 */
export function enforceStyleContract(output: ActorOutput, npc: NPC): ActorOutput {
  const sc = npc.styleContract;
  let line = output.line.trim();

  if (sc) {
    // 剥离禁用标点
    for (const p of sc.bannedPunctuation) {
      line = line.split(p).join("");
    }
    // 删除禁用词
    for (const w of sc.bannedWords) {
      if (w && line.includes(w)) {
        line = line.split(w).join("");
      }
    }
    line = line.replace(/\s{2,}/g, " ").replace(/^[，。、；：]+/, "").trim();

    // 句数限制
    const sentences = line.split(/(?<=[。！？!?…])/).filter((s) => s.trim());
    if (sentences.length > sc.maxSentencesPerTurn) {
      line = sentences.slice(0, sc.maxSentencesPerTurn).join("").trim();
    }

    // 字数限制：优先在句读处截断
    if (line.length > sc.maxCharsPerTurn) {
      const cut = line.slice(0, sc.maxCharsPerTurn);
      const lastPunct = Math.max(
        cut.lastIndexOf("。"), cut.lastIndexOf("！"),
        cut.lastIndexOf("？"), cut.lastIndexOf("，"), cut.lastIndexOf("…")
      );
      line = lastPunct > sc.maxCharsPerTurn * 0.5 ? cut.slice(0, lastPunct + 1) : cut;
    }
  } else if (line.length > 60) {
    line = line.slice(0, 60);
  }

  if (!line) line = "……";

  return { ...output, line };
}

// ============================================================
// 辅助函数
// ============================================================

function normalizeAction(raw: string): string {
  const t = raw.trim().replace(/^[（(]+/, "").replace(/[）)]+$/, "").trim();
  if (!t) return "";
  return `（${t.slice(0, 20)}）`;
}

function inferEmotionFromIntent(
  intentType: string,
  intensity?: string
): EmotionTag {
  if (intentType === "advance" && intensity === "high") return "flustered";
  if (intentType === "defend") return "defensive";
  if (intentType === "tease" || intentType === "humor") return "amused";
  if (intentType === "soothe") return "vulnerable";
  if (intentType === "retreat") return "cold";
  if (intentType === "probe") return "curious";
  return "neutral";
}

function emotionToChinese(tag?: string): string {
  const map: Record<string, string> = {
    neutral: "平淡",
    curious: "好奇",
    amused: "带笑意",
    flustered: "有些慌乱",
    defensive: "防御",
    cold: "冷淡",
    vulnerable: "脆弱",
    jealous: "有醋意",
    hurt: "受伤",
  };
  return map[tag ?? ""] ?? "平淡";
}

function intentToChinese(intent: string): string {
  const map: Record<string, string> = {
    probe: "试探、想多了解你",
    advance: "主动推进关系",
    soothe: "安抚你的情绪",
    humor: "开玩笑、缓和气氛",
    adventure: "冒险、抛出大胆的话",
    challenge: "质疑、施压",
    tease: "调侃",
    observe: "观察、保持距离",
    retreat: "退缩",
    listen: "倾听",
    share: "分享自己的事",
  };
  return map[intent] ?? intent;
}

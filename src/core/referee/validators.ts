/**
 * 裁判层校验器
 *
 * 四道防线（NPC 人格保真度规范 §5）：
 * A. 硬禁区 —— 禁用词 / 禁用标点 / 禁用句式 / 雷点表述（正则，block）
 * B. 风格指纹 —— 句长 / 句数 / 标点分布 / 口癖命中率（统计，warn）
 * C. 状态一致性 —— intent 与依恋类型冲突 / exposeLayer 超阈值 / 首次示好响应规则（查表，block）
 * D. 越权/剧透 —— 台词中实体是否都在该 NPC 可见事件内（实体比对，block）
 *
 * 每个校验器返回单个 RefereeViolation | null，settle 函数负责收集。
 */

import type { ActorOutput, PersonalityVector, TextContract, ActorIntent } from "../actor/types";
import type { WorldEvent, WorldEventLog } from "../state/worldTypes";
import type { StyleContract, AttachmentRules } from "../types";
import type { SceneTurn } from "../director/types";
import type { RefereeViolation } from "./types";
import { NPC_LIBRARY, getNpcById } from "../npcLibrary";

// ============================================================
// §A 越权拦截：演员不应输出好感值
// ============================================================

/** 台词中暗示好感数值的模式 */
const OVERSCORE_PATTERNS: RegExp[] = [
  /[+-]\d{1,2}/,          // +5, -3 等裸数值
  /好感[+＋]/,             // 好感+
  /心动[值＋+]/,           // 心动值, 心动+
  /好感度/,                // 好感度
  /加分|扣分/,             // 加分/扣分
];

/** 台词中暗示好感数值的关键词（裸词命中即视为越权） */
const OVERSCORE_KEYWORDS: string[] = [
  "affinity",
  "heartValue",
  "delta",
  "score",
  // 数值泄露裸词：好感 / 心动值 / 好感值
  "好感",
  "心动值",
  "好感值",
];

/** ActorOutput 允许的字段白名单 */
const ALLOWED_OUTPUT_KEYS = new Set([
  "npcId",
  "line",
  "action",
  "intent",
  "emotionTag",
  "microAction",
]);

/** ActorIntent 允许的字段白名单 */
const ALLOWED_INTENT_KEYS = new Set([
  "type",
  "target",
  "topic",
  "intensity",
  "isReactive",
]);

/**
 * 越权拦截：检查演员是否输出了好感值。
 *
 * 检查项：
 * - 台词/动作中是否包含数值模式（+5、-3、好感+、心动值等）
 * - intent 中是否夹带了非法字段（只允许 type/target/topic/intensity/isReactive）
 * - output 中是否夹带了非法字段（delta / heartValue 等）
 */
export function checkOverscoreViolation(
  output: ActorOutput,
): RefereeViolation | null {
  // 1. 检查台词中的数值模式
  const line = output.line;
  for (const pattern of OVERSCORE_PATTERNS) {
    if (pattern.test(line)) {
      return {
        type: "overscore",
        detail: `台词中包含好感值相关内容（匹配 ${pattern.source}）："${line}"`,
        severity: "block",
      };
    }
  }
  for (const kw of OVERSCORE_KEYWORDS) {
    if (line.toLowerCase().includes(kw.toLowerCase())) {
      return {
        type: "overscore",
        detail: `台词中包含好感值相关关键词（${kw}）："${line}"`,
        severity: "block",
      };
    }
  }

  // 2. 检查动作描述中的数值模式
  if (output.action) {
    for (const pattern of OVERSCORE_PATTERNS) {
      if (pattern.test(output.action)) {
        return {
          type: "overscore",
          detail: `动作描述中包含好感值相关内容（匹配 ${pattern.source}）："${output.action}"`,
          severity: "block",
        };
      }
    }
    for (const kw of OVERSCORE_KEYWORDS) {
      if (output.action.toLowerCase().includes(kw.toLowerCase())) {
        return {
          type: "overscore",
          detail: `动作描述中包含好感值相关关键词（${kw}）："${output.action}"`,
          severity: "block",
        };
      }
    }
  }

  // 3. 检查 intent 是否夹带非法字段
  const intentKeys = Object.keys(output.intent);
  const illegalIntentKeys = intentKeys.filter(
    (k) => !ALLOWED_INTENT_KEYS.has(k),
  );
  if (illegalIntentKeys.length > 0) {
    return {
      type: "overscore",
      detail: `意图中夹带非法字段：${illegalIntentKeys.join(", ")}`,
      severity: "block",
    };
  }

  // 4. 检查 output 是否夹带非法字段
  const outputKeys = Object.keys(output);
  const illegalOutputKeys = outputKeys.filter(
    (k) => !ALLOWED_OUTPUT_KEYS.has(k),
  );
  if (illegalOutputKeys.length > 0) {
    return {
      type: "overscore",
      detail: `输出中夹带非法字段：${illegalOutputKeys.join(", ")}`,
      severity: "block",
    };
  }

  return null;
}

// ============================================================
// §B/§C 人格一致性校验
// ============================================================

/** 低话量阈值：低于此值时台词不应超过 30 字 */
const LOW_VERBOSITY_THRESHOLD = 0.3;
const LOW_VERBOSITY_MAX_LEN = 30;

/** 高暴露阈值：高于此值时不应输出高强度 advance */
const HIGH_EXPOSURE_THRESHOLD = 0.7;

/** 句末终止符（用于统计句数） */
const SENTENCE_TERMINATORS = /[。！？!?…]/g;

// ------------------------------------------------------------
// 辅助函数：从 NPC 库查询契约
// ------------------------------------------------------------

/** 从 NPC 库获取 StyleContract */
function getStyleContract(npcId: string): StyleContract | undefined {
  return getNpcById(npcId)?.styleContract;
}

/** 从 NPC 库获取 AttachmentRules */
function getAttachmentRules(npcId: string): AttachmentRules | undefined {
  return getNpcById(npcId)?.attachmentRules;
}

/**
 * 统计句数：以句号 / 问号 / 感叹号 / 省略号切分，最少为 1。
 */
function countSentences(text: string): number {
  if (!text) return 0;
  // 把连续终止符折叠为 1 个，避免 "！！" 算两句
  const collapsed = text.replace(/([。！？!?…])\1+/g, "$1");
  const matches = collapsed.match(SENTENCE_TERMINATORS);
  const terminatorCount = matches ? matches.length : 0;
  // 无终止符视为整段一句
  return Math.max(1, terminatorCount);
}

/**
 * 检查口癖命中率：tokens 中至少有 1 个出现在文本内即视为命中。
 */
function checkSignatureTokens(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true; // 无口癖要求 → 默认通过
  return tokens.some((tok) => tok.length > 0 && text.includes(tok));
}

/**
 * 根据 intent 推断 NPC 本轮暴露的冰山层级：
 *   - advance + high → L4（核心层暴露）
 *   - high → L3（冲突层暴露）
 *   - medium → L2（角色层）
 *   - low / 其它 → L1（表现层）
 *
 * exposureGate[L{n}] 给出该层级所需的好感阈值。
 */
function inferExposureLayer(intent: ActorIntent): "L1" | "L2" | "L3" | "L4" {
  if (intent.type === "advance" && intent.intensity === "high") return "L4";
  if (intent.intensity === "high") return "L3";
  if (intent.intensity === "medium") return "L2";
  return "L1";
}

/** 暴露层级 → 数值，便于比较 */
const EXPOSURE_LAYER_RANK: Record<"L1" | "L2" | "L3" | "L4", number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
};

// ------------------------------------------------------------
// 一致性校验上下文
// ------------------------------------------------------------

/** 一致性校验附加上下文（向后兼容：全部可选） */
export interface ConsistencyContext {
  /** NPC ID，用于查询 StyleContract / AttachmentRules */
  npcId?: string;
  /** 当前对该 NPC 的好感值（0-100），用于 exposureGate 校验 */
  currentHeartValue?: number;
  /** 本场景历史回合，用于判断是否"首次被示好" */
  sceneHistory?: SceneTurn[];
}

/**
 * 人格一致性校验（增强版，NPC 人格保真度规范 §5）。
 *
 * 检查项（按优先级返回首个命中）：
 *
 * **A. 硬禁区**（severity: block）
 *   - bannedWords：台词/动作包含任何禁用词
 *   - bannedPunctuation：台词包含任何禁用标点
 *   - bannedPatterns：台词匹配任何禁用正则
 *
 * **C. 状态一致性**（severity: block）
 *   - intent.type ∈ attachmentRules.forbiddenActs
 *   - 首次示好（sceneHistory 为空）但 intent.type 不在 onBeingCourted.firstTimeMustBe
 *   - intent 暴露层级超过 exposureGate 对应好感阈值
 *
 * **B. 风格指纹**（severity: warn）
 *   - 句长超过 maxCharsPerTurn
 *   - 句数超过 maxSentencesPerTurn
 *   - signatureTokens 全部未命中
 *
 * 兼容性：保持原有 forbiddenPhrases / verbosity / exposureThreshold 检查。
 *
 * @param output 演员输出
 * @param pv 人格向量
 * @param contract 文字契约（保留原参数，forbiddenPhrases 等仍生效）
 * @param context 附加上下文（npcId / currentHeartValue / sceneHistory）
 */
export function checkPersonalityConsistency(
  output: ActorOutput,
  pv: PersonalityVector,
  contract: TextContract,
  context?: ConsistencyContext,
): RefereeViolation | null {
  const style = context?.npcId ? getStyleContract(context.npcId) : undefined;
  const rules = context?.npcId ? getAttachmentRules(context.npcId) : undefined;

  // ---- A. 硬禁区检测（block） ----
  if (style) {
    // A1. 禁用词
    for (const word of style.bannedWords) {
      if (word.length === 0) continue;
      if (output.line.includes(word)) {
        return {
          type: "forbidden_phrase",
          detail: `台词命中禁用词："${word}"`,
          severity: "block",
        };
        }
      if (output.action?.includes(word) ?? false) {
        return {
          type: "forbidden_phrase",
          detail: `动作描述命中禁用词："${word}"`,
          severity: "block",
        };
      }
    }

    // A2. 禁用标点
    for (const punct of style.bannedPunctuation) {
      if (punct.length === 0) continue;
      if (output.line.includes(punct)) {
        return {
          type: "forbidden_phrase",
          detail: `台词命中禁用标点："${punct}"`,
          severity: "block",
        };
      }
      if (output.action?.includes(punct) ?? false) {
        return {
          type: "forbidden_phrase",
          detail: `动作描述命中禁用标点："${punct}"`,
          severity: "block",
        };
      }
    }

    // A3. 禁用句式（正则）
    for (const patternSrc of style.bannedPatterns) {
      if (patternSrc.length === 0) continue;
      let regex: RegExp;
      try {
        regex = new RegExp(patternSrc);
      } catch {
        // 非法正则跳过，避免校验器自身崩溃
        continue;
      }
      if (regex.test(output.line)) {
        return {
          type: "forbidden_phrase",
          detail: `台词命中禁用句式（/${patternSrc}/）："${output.line}"`,
          severity: "block",
        };
      }
      if (output.action && regex.test(output.action)) {
        return {
          type: "forbidden_phrase",
          detail: `动作描述命中禁用句式（/${patternSrc}/）："${output.action}"`,
          severity: "block",
        };
      }
    }
  }

  // ---- 兼容：原 forbiddenPhrases（TextContract 上的禁用短语，block） ----
  for (const phrase of contract.forbiddenPhrases) {
    if (phrase.length === 0) continue;
    const inLine = output.line.includes(phrase);
    const inAction = output.action?.includes(phrase) ?? false;
    if (inLine || inAction) {
      return {
        type: "forbidden_phrase",
        detail: `台词包含禁用短语："${phrase}"`,
        severity: "block",
      };
    }
  }

  // ---- C. 状态一致性（block） ----
  if (rules) {
    // C1. intent.type 与依恋类型 forbiddenActs 冲突
    if (rules.forbiddenActs.includes(output.intent.type)) {
      return {
        type: "personality_break",
        detail: `意图 "${output.intent.type}" 被 ${context?.npcId ?? "NPC"} 的依恋类型禁止（forbiddenActs: [${rules.forbiddenActs.join(", ")}]）`,
        severity: "block",
      };
    }

    // C2. 首次示好必须以 onBeingCourted.firstTimeMustBe 开场
    if (rules.onBeingCourted) {
      const isFirstTime = isFirstTimeBeingCourted(
        context?.sceneHistory,
        context?.npcId,
      );
      if (
        isFirstTime &&
        !rules.onBeingCourted.firstTimeMustBe.includes(output.intent.type)
      ) {
        return {
          type: "personality_break",
          detail: `首次被示好必须使用 [${rules.onBeingCourted.firstTimeMustBe.join(", ")}] 之一，实际为 "${output.intent.type}"`,
          severity: "block",
        };
      }
    }

    // C3. 暴露层级超过 exposureGate 对应的好感阈值
    if (context?.currentHeartValue !== undefined) {
      const layer = inferExposureLayer(output.intent);
      const gate = rules.exposureGate[layer];
      if (context.currentHeartValue < gate) {
        return {
          type: "personality_break",
          detail: `意图暴露层级 ${layer}（rank=${EXPOSURE_LAYER_RANK[layer]}）需要好感 ≥ ${gate}，实际 ${context.currentHeartValue}`,
          severity: "block",
        };
      }
    }
  }

  // ---- B. 风格指纹（warn） ----
  if (style) {
    // B1. 句长
    if (output.line.length > style.maxCharsPerTurn) {
      return {
        type: "personality_break",
        detail: `台词长度 ${output.line.length} 超过 maxCharsPerTurn=${style.maxCharsPerTurn}`,
        severity: "warn",
      };
    }

    // B2. 句数
    const sentenceCount = countSentences(output.line);
    if (sentenceCount > style.maxSentencesPerTurn) {
      return {
        type: "personality_break",
        detail: `句数 ${sentenceCount} 超过 maxSentencesPerTurn=${style.maxSentencesPerTurn}`,
        severity: "warn",
      };
    }

    // B3. 口癖命中率（至少命中 1 个）
    if (!checkSignatureTokens(output.line, style.signatureTokens)) {
      return {
        type: "personality_break",
        detail: `口癖未命中：signatureTokens=[${style.signatureTokens.join(", ")}] 全部缺席`,
        severity: "warn",
      };
    }
  }

  // ---- 兼容：原话量一致性（warn） ----
  if (pv.verbosity < LOW_VERBOSITY_THRESHOLD && output.line.length > LOW_VERBOSITY_MAX_LEN) {
    return {
      type: "personality_break",
      detail: `NPC 话量过低（verbosity=${pv.verbosity.toFixed(2)}）但台词过长（${output.line.length}字 > ${LOW_VERBOSITY_MAX_LEN}字）`,
      severity: "warn",
    };
  }

  // ---- 兼容：原暴露阈值与高强度推进冲突（warn） ----
  if (
    pv.exposureThreshold > HIGH_EXPOSURE_THRESHOLD &&
    output.intent.type === "advance" &&
    output.intent.intensity === "high"
  ) {
    return {
      type: "personality_break",
      detail: `NPC 自我暴露阈值过高（exposureThreshold=${pv.exposureThreshold.toFixed(2)}）不应输出高强度推进`,
      severity: "warn",
    };
  }

  return null;
}

/**
 * 判断是否首次被示好：
 * - 若 sceneHistory 缺失 → 视为首次（保守判断，宁可触发硬规则）
 * - 若 sceneHistory 中没有任何 advance/probe 类回合 → 视为首次
 * - 否则视为非首次
 */
function isFirstTimeBeingCourted(
  sceneHistory: SceneTurn[] | undefined,
  npcId: string | undefined,
): boolean {
  if (!sceneHistory || sceneHistory.length === 0) return true;
  // 仅看本 NPC 之前作为响应者的回合（如果有 npcId），看是否已有示好响应
  const turns = npcId
    ? sceneHistory.filter((t) => t.npcId === npcId)
    : sceneHistory;
  if (turns.length === 0) return true;
  // advance / probe 视为示好响应
  const COURTING_INTENTS = new Set(["advance", "probe"]);
  return !turns.some((t) => COURTING_INTENTS.has(t.intentType));
}

// ============================================================
// §D 信息泄露检查
// ============================================================

/** 从事件描述中截取用于匹配的前缀长度（兼容旧逻辑） */
const LEAK_PREFIX_LEN = 5;

/** 长度 >= 此值的事件关键词片段才视为"实体" */
const ENTITY_MIN_LEN = 3;

/** 停用关键词集合（避免常见词被当成实体造成假阳性） */
const ENTITY_STOPWORDS = new Set([
  "今天",
  "昨天",
  "明天",
  "刚才",
  "现在",
  "不知道",
  "没什么",
]);

/**
 * 从单个事件中提取关键实体：
 * 1. 参与 NPC 的名字
 * 2. 事件 description 中提到的所有 NPC 名字
 * 3. description 中长度 >= 3 的连续中文片段（去除停用词）
 */
function extractEntitiesFromEvent(event: WorldEvent): string[] {
  const entities = new Set<string>();

  // 1. 参与者 NPC 名字
  for (const pid of event.participants) {
    const npc = getNpcById(pid);
    if (npc) entities.add(npc.name);
  }

  // 2. 事件描述中提到的所有 NPC 名字
  for (const npc of NPC_LIBRARY) {
    if (event.description.includes(npc.name)) {
      entities.add(npc.name);
    }
  }

  // 3. 长度 >= 3 的连续中文片段（简化分词）
  const matches = event.description.match(/[\u4e00-\u9fa5]{ENTITY_MIN_LEN,}/g);
  if (matches) {
    for (const seg of matches) {
      if (!ENTITY_STOPWORDS.has(seg)) {
        entities.add(seg);
      }
    }
  }

  return Array.from(entities);
}

/**
 * 信息泄露检查：检查台词是否引用了 NPC 不应知晓的事件。
 *
 * 增强算法（NPC 人格保真度规范 §5 D）：
 * 1. 从 allEvents 中找出不在 visibleEvents 中的事件（即 NPC 不该知道的）
 * 2. 对每个隐藏事件：
 *    a. 取 description 的前 5 字前缀（兼容旧逻辑）
 *    b. 提取关键实体（NPC 名字 + 长中文片段）
 * 3. 检查台词/动作是否包含前缀或任一实体
 *
 * 命中即返回 block 级违规。
 */
export function checkInfoLeak(
  output: ActorOutput,
  visibleEvents: WorldEventLog,
  allEvents: WorldEventLog,
): RefereeViolation | null {
  const visibleIds = new Set(visibleEvents.events.map((e) => e.id));

  // 找出 NPC 不该知道的事件
  const hiddenEvents = allEvents.events.filter(
    (e) => !visibleIds.has(e.id),
  );

  for (const event of hiddenEvents) {
    // 兼容旧逻辑：description 前 5 字前缀
    const prefix = event.description.slice(0, LEAK_PREFIX_LEN);
    if (prefix.length > 0) {
      if (output.line.includes(prefix)) {
        return {
          type: "info_leak",
          detail: `台词引用了 NPC 不应知晓的事件（前缀"${prefix}…"，事件ID=${event.id}）`,
          severity: "block",
        };
      }
      if (output.action && output.action.includes(prefix)) {
        return {
          type: "info_leak",
          detail: `动作描述引用了 NPC 不应知晓的事件（前缀"${prefix}…"，事件ID=${event.id}）`,
          severity: "block",
        };
      }
    }

    // 新逻辑：实体比对
    const entities = extractEntitiesFromEvent(event);
    for (const entity of entities) {
      // 跳过过短实体，避免 "嗯" 这类单字误命中（前面已经按 >= 3 字过滤）
      if (output.line.includes(entity)) {
        return {
          type: "info_leak",
          detail: `台词引用了 NPC 不应知晓的实体"${entity}"（事件ID=${event.id}）`,
          severity: "block",
        };
      }
      if (output.action && output.action.includes(entity)) {
        return {
          type: "info_leak",
          detail: `动作描述引用了 NPC 不应知晓的实体"${entity}"（事件ID=${event.id}）`,
          severity: "block",
        };
      }
    }
  }

  return null;
}

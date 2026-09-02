import type { InteractionStrength, InteractionValence, MemoryTag } from "../core/interactionSignal";

/**
 * 私聊动态对话选项的纯函数层（阶段 1）。
 *
 * 约束：
 * - 零 server-only / 零 React 依赖，客户端与服务端共用。
 * - 不接触任何状态写入；signal 永远由调用方传入的本地 slot 决定。
 * - 校验与补齐逻辑与 src/data/chatTopics.ts 的 planChatSuggestionSlots 配套使用。
 */

export type SuggestionIntent =
  | "greet"
  | "check_in"
  | "get_to_know"
  | "follow_up"
  | "support"
  | "repair"
  | "romantic_probe"
  | "playful_shift"
  | "self_disclosure"
  | "free_chat";

export type SuggestionDirection = "continue" | "express" | "advance";

/** 点击选项后交给 applyInteractionSignal 的确定性结算元数据，只来自本地 slot。 */
export type SuggestionSignal = {
  intent: string;
  valence: InteractionValence;
  strength: InteractionStrength;
  memoryTag: MemoryTag;
};

/** 每个 slot 在 §9.3 服务端降级时还需要本地 reply 兜底，因此比 spec §6.1 多 fallbackReply 字段。 */
export interface SuggestionSlot {
  slotId: string;
  direction: SuggestionDirection;
  intent: SuggestionIntent;
  /** 给模型的写作指引（非展示文案），承载单条 slot 的意图与边界。 */
  guidance: string;
  fallbackLabel: string;
  fallbackText: string;
  /** 模型/网络不可用时 NPC 对该选项的本地兜底回复，沿用现有 replyOf 的语义与语气。 */
  fallbackReply: string;
  signal: SuggestionSignal;
}

export interface ChatSuggestion {
  /** 本地 UI 键：`sug_${slotId}`，一个响应内唯一。 */
  id: string;
  slotId: string;
  label: string;
  text: string;
  signal: SuggestionSignal;
  source: "model" | "fallback";
}

/** API 与模型可以产生的文案契约：不包含任何结算字段。 */
export interface GeneratedSuggestionCopy {
  slotId: string;
  label: string;
  text: string;
  source: "model" | "fallback";
}

/**
 * 共享校验/补齐函数可接受的最小 slot 结构（spec §9.2）：
 * 服务端清理后的 slot 没有 intent/signal/fallbackReply，只需 slotId 与兜底文案即可参与补齐；
 * 完整本地 slot 结构上天然满足该 Pick，因此旧调用点（含 smoke）无需改动。
 */
export type SuggestionSlotInput = Pick<SuggestionSlot, "slotId" | "fallbackLabel" | "fallbackText">;

/** POST /api/chat 请求里 slots 的线上结构（spec §7.1）：只含文案规划字段，服务端只收这些。 */
export type SuggestionSlotWire = Pick<
  SuggestionSlot,
  "slotId" | "direction" | "guidance" | "fallbackLabel" | "fallbackText"
>;

export const SUGGESTION_LABEL_LIMIT = 10;
export const SUGGESTION_TEXT_LIMIT = 70;

/**
 * 记忆跟进 slot 的 slotId 前缀（规划器在 chatTopics.ts 中保证）。
 * 校验器凭此前缀判定「允许引用过往经历」的 slot；
 * 其余 slot 一律不允许出现过往时态声称。
 */
export const MEMORY_FOLLOW_SLOT_PREFIX = "advance_follow_";

/** 隐藏数值表述：关系关键词 + 数字，或百分比。启发式，宁紧勿松。 */
const HIDDEN_NUMBER_PATTERN =
  /(?:好感(?:度)?|心动值?|兴趣值?|信任(?:度)?|张力值?|亲密度?|关系值?|默契度?|数值)\s*[值为是到:]?\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*%/;
/** 无依据过往经历声称的信号词（合法记忆跟进只能由专用 slot 承载）。 */
const MEMORY_CLAIM_PATTERN =
  /上次|上一次|那天|当天晚上|那天晚上|当时|曾经|还记得|没有忘|以前(?:我们|一起)|我们之前|只对你|只告诉了你|对我说过/;
/** 生成腔/疑似系统措辞，清理时移除（启发式，宁少勿多）。 */
const GENERATION_JARGON_PATTERN =
  /作为(?:一个)?(?:人工智能|AI|模型|机器人|NPC|助手)|你是(?:一个)?(?:人工智能|AI|模型|机器人|NPC|系统)|(?:系统|游戏)提示|请记住你|明白了吗/gi;

function hasControlChar(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

/**
 * 清理单条选项文案：去控制字符、Markdown 反引号与尖括号、系统术语式表述，压空白并限长。
 * 校验器在 raw 文本上先做否决检查，此处是落库/展示前的最终清理。
 */
export function sanitizeSuggestionText(value: unknown, maxLength = SUGGESTION_TEXT_LIMIT): string {
  let text = String(value ?? "").replace(GENERATION_JARGON_PATTERN, "");
  text = Array.from(text)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("");
  text = text.replace(/`+/g, "").replace(/[<>]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return Array.from(text).slice(0, maxLength).join("");
}

/** 去标点/符号/空白并统一大小写后的比较键，仅用于去重。 */
export function normalizeForDedup(text: string): string {
  return Array.from(String(text ?? ""))
    .filter((character) => !/[\p{P}\p{S}\s]/u.test(character))
    .join("")
    .toLocaleLowerCase();
}

export type SuggestionRejectReason =
  | "invalid_shape"
  | "unknown_slot"
  | "duplicate_slot"
  | "empty_text"
  | "too_long"
  | "duplicate_text"
  | "markdown"
  | "control_char"
  | "hidden_number"
  | "unverified_memory_claim";

export interface ValidatedModelSuggestion {
  slotId: string;
  label: string;
  text: string;
  source: "model";
}

export interface RejectedModelSuggestion {
  slotId: string | null;
  reason: SuggestionRejectReason;
}

export interface ValidateGeneratedSuggestionsResult {
  valid: ValidatedModelSuggestion[];
  rejected: RejectedModelSuggestion[];
}

/** 从不可信候选对象中读取字符串字段；类型不对即视为缺失。 */
function readStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * §9.1 单条选项校验。每条被否决的候选都会给出原因，供日志与测试断言使用。
 * 校验在清理后的文本上进行语义判断，在原始文本上进行否决判断（避免 Markdown/控制字符先被清洗掉）。
 */
export function validateGeneratedSuggestions(
  slots: readonly SuggestionSlotInput[],
  candidates: readonly unknown[],
): ValidateGeneratedSuggestionsResult {
  // 校验只用得到 slotId（含记忆跟进前缀判定），最小结构即可满足。
  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]));
  const usedSlotIds = new Set<string>();
  const acceptedTextKeys: string[] = [];
  const valid: ValidatedModelSuggestion[] = [];
  const rejected: RejectedModelSuggestion[] = [];

  for (const candidate of candidates) {
    const slotId = readStringField(candidate, "slotId");
    const label = readStringField(candidate, "label");
    const text = readStringField(candidate, "text");
    const reject = (reason: SuggestionRejectReason) =>
      rejected.push({ slotId: slotId ?? null, reason });

    if (slotId === undefined) {
      reject("invalid_shape");
      continue;
    }
    if (!slotById.has(slotId)) {
      reject("unknown_slot");
      continue;
    }
    if (usedSlotIds.has(slotId)) {
      reject("duplicate_slot");
      continue;
    }

    const rawLabel = String(label ?? "");
    const rawText = String(text ?? "");
    if (hasControlChar(rawLabel) || hasControlChar(rawText)) {
      reject("control_char");
      continue;
    }
    if (/```|`|\*\*|__/.test(rawLabel) || /```|`|\*\*|__/.test(rawText)) {
      reject("markdown");
      continue;
    }

    const cleanLabel = sanitizeSuggestionText(label, SUGGESTION_LABEL_LIMIT);
    const cleanText = sanitizeSuggestionText(text, SUGGESTION_TEXT_LIMIT);
    if (cleanLabel === "" || cleanText === "") {
      reject("empty_text");
      continue;
    }
    if (
      Array.from(rawLabel).length > SUGGESTION_LABEL_LIMIT ||
      Array.from(rawText).length > SUGGESTION_TEXT_LIMIT
    ) {
      reject("too_long");
      continue;
    }
    if (HIDDEN_NUMBER_PATTERN.test(cleanLabel) || HIDDEN_NUMBER_PATTERN.test(cleanText)) {
      reject("hidden_number");
      continue;
    }

    // 只有记忆跟进 slot 允许引用过往经历；其余 slot 出现过往声称即无依据。
    const memoryFollowSlot = slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX);
    if (
      !memoryFollowSlot &&
      (MEMORY_CLAIM_PATTERN.test(cleanLabel) || MEMORY_CLAIM_PATTERN.test(cleanText))
    ) {
      reject("unverified_memory_claim");
      continue;
    }

    const normalized = normalizeForDedup(cleanText);
    if (acceptedTextKeys.includes(normalized)) {
      reject("duplicate_text");
      continue;
    }
    usedSlotIds.add(slotId);
    acceptedTextKeys.push(normalized);
    valid.push({ slotId, label: cleanLabel, text: cleanText, source: "model" });
  }
  return { valid, rejected };
}

export interface GenericSuggestionOption {
  label: string;
  text: string;
}

/**
 * §9.2 通用选项池：经过测试的固定文案，全部遵守 §8（不替玩家告白/承诺/道歉/设界），
 * 长度与去重约束与普通选项一致。用于 slot 自身 fallback 也无法凑齐三条时兜底。
 */
export const GENERIC_SUGGESTION_POOL: readonly GenericSuggestionOption[] = [
  { label: "聊聊近况", text: "最近过得怎么样？我想听听你的近况。" },
  { label: "问问爱好", text: "你平时空下来的时候，都喜欢做些什么？" },
  { label: "分享一件事", text: "今天发生了一件小事，想说给你听听。" },
  { label: "聊聊小屋", text: "来小屋之后，你最喜欢这里的哪一刻？" },
  { label: "问问想做的事", text: "最近有没有什么特别想做的事？" },
];

/**
 * §9.2 核心：按 slot 顺序逐项补齐，最终恰好返回与 slots 等长的补齐结果。
 * 优先级：合法模型文案 > 该 slot 的 fallbackLabel/fallbackText > 通用选项池；
 * 任一环节与已采用文本重复即降级到下一环节，保证结果文本唯一。
 *
 * 传入完整本地 slot（含 signal）时返回带 UI id 与本地 signal 的 ChatSuggestion[]；
 * 传入服务端清理后的最小结构（无 signal）时返回不含结算字段的 GeneratedSuggestionCopy[]。
 */
export function fillSuggestionGaps<S extends SuggestionSlotInput>(
  slots: readonly S[],
  valid: readonly ValidatedModelSuggestion[],
): FilledSuggestionFor<S>[] {
  const copies = new Map<string, CopyChoice>();
  for (const item of valid) {
    copies.set(item.slotId, { label: item.label, text: item.text, source: item.source });
  }
  return resolveSlotCopies(slots, copies);
}

/**
 * 客户端合并：按 slotId 把 GeneratedSuggestionCopy 文案合并回本地 SuggestionSlot。
 * 只读取 copy 的 slotId/label/text/source 四个字段，signal 一律取本地 slot；
 * 外部伪造的同名结算字段（包括类型层面不存在的字段）不参与合并。
 */
export function mergeGeneratedSuggestions(
  slots: readonly SuggestionSlot[],
  copies: readonly GeneratedSuggestionCopy[],
): ChatSuggestion[] {
  const slotIds = new Set(slots.map((slot) => slot.slotId));
  const merged = new Map<string, { label: string; text: string; source: "model" | "fallback" }>();
  for (const copy of copies) {
    if (!slotIds.has(copy.slotId) || merged.has(copy.slotId)) continue;
    const label = sanitizeSuggestionText(copy.label, SUGGESTION_LABEL_LIMIT);
    const text = sanitizeSuggestionText(copy.text, SUGGESTION_TEXT_LIMIT);
    if (label === "" || text === "") continue;
    merged.set(copy.slotId, {
      label,
      text,
      source: copy.source === "model" ? "model" : "fallback",
    });
  }
  return resolveSlotCopies(slots, merged);
}

export type SuggestionMode = "model" | "mixed_fallback" | "fallback";

/** §9.2 mode 计算：3 条 model → model；1~2 条 → mixed_fallback；0 条 → fallback。 */
export function computeSuggestionMode(
  suggestions: readonly Pick<ChatSuggestion, "source">[],
): SuggestionMode {
  const modelCount = suggestions.filter((suggestion) => suggestion.source === "model").length;
  if (modelCount >= 3) return "model";
  if (modelCount === 0) return "fallback";
  return "mixed_fallback";
}

/**
 * 从模型原始文本解析出的结构化候选（spec §7.2）。
 * 字段均为「未经校验的 unknown」，合法性判断交给 validateGeneratedSuggestions 与 reply 清理；
 * reply 缺失或类型不对时缺省，suggestions 缺失或非数组时缺省。
 */
export interface ParsedModelChatOutput {
  reply?: unknown;
  suggestions?: unknown[];
}

function parseObjectJson(text: string): ParsedModelChatOutput | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const output: ParsedModelChatOutput = {};
    if (typeof record["reply"] === "string") output.reply = record["reply"];
    if (Array.isArray(record["suggestions"])) output.suggestions = record["suggestions"];
    return output;
  } catch {
    return null;
  }
}

/**
 * 服务端结构化解析：把模型原始文本剥成 { reply?, suggestions? } 候选（§8/§9）。
 * 1. trim 后先剥 ```json / ``` 代码围栏再 JSON.parse；
 * 2. 失败则取第一个 { 到最后一个 } 的子串再 parse；
 * 3. 仍失败返回 null（调用方整体降级，不做二次调用）。
 * 纯函数，零依赖，客户端与服务端可共用。
 */
export function parseModelChatOutput(raw: string): ParsedModelChatOutput | null {
  const text = String(raw ?? "").trim();
  if (text === "") return null;

  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```/);
  const bare = fence?.[1]?.trim() ?? text;
  const direct = parseObjectJson(bare);
  if (direct) return direct;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = parseObjectJson(text.slice(start, end + 1));
    if (sliced) return sliced;
  }
  return null;
}

function optionId(slotId: string): string {
  return `sug_${slotId}`;
}

type CopyChoice = { label: string; text: string; source: "model" | "fallback" };

/**
 * fillSuggestionGaps 的逐项补齐结果：
 * 完整本地 slot（S extends SuggestionSlot）→ 含 UI id 与本地 signal 的 ChatSuggestion；
 * 最小结构（无 signal）→ 不含结算字段的 GeneratedSuggestionCopy。
 */
type FilledSuggestionFor<S extends SuggestionSlotInput> = S extends SuggestionSlot
  ? ChatSuggestion
  : GeneratedSuggestionCopy;

/**
 * 按 slot 顺序逐项解析文案：合法模型文案 > slot 自身 fallback > 通用选项池。
 * 输出形状随入参结构变化（见 FilledSuggestionFor），signal 永远只取本地 slot。
 */
function resolveSlotCopies<S extends SuggestionSlotInput>(
  slots: readonly S[],
  copies: ReadonlyMap<string, CopyChoice>,
): FilledSuggestionFor<S>[] {
  const usedTextKeys = new Set<string>();
  const filled: FilledSuggestionFor<S>[] = [];
  for (const slot of slots) {
    let label = slot.fallbackLabel;
    let text = slot.fallbackText;
    let source: "model" | "fallback" = "fallback";

    const copy = copies.get(slot.slotId);
    const normalizedCopy = copy ? normalizeForDedup(copy.text) : "";
    if (copy && !usedTextKeys.has(normalizedCopy)) {
      label = copy.label;
      text = copy.text;
      source = copy.source;
    } else if (usedTextKeys.has(normalizeForDedup(slot.fallbackText))) {
      // 自身 fallback 与已采用文本撞车时，从通用选项池挑一条没撞车的。
      const poolItem = GENERIC_SUGGESTION_POOL.find(
        (item) => !usedTextKeys.has(normalizeForDedup(item.text)),
      );
      if (poolItem) {
        label = poolItem.label;
        text = poolItem.text;
      }
    }
    usedTextKeys.add(normalizeForDedup(text));

    const copyItem = {
      slotId: slot.slotId,
      label,
      text,
      source,
    };
    if ("signal" in (slot as object)) {
      // 完整本地 slot：附上 UI id 与本地 signal；signal 永远来自确定性 slot，不取模型。
      const fullSlot = slot as unknown as SuggestionSlot;
      filled.push({
        id: optionId(fullSlot.slotId),
        ...copyItem,
        signal: { ...fullSlot.signal },
      } as FilledSuggestionFor<S>);
    } else {
      // 服务端最小结构：只回文案副本，不带任何结算字段。
      filled.push(copyItem as FilledSuggestionFor<S>);
    }
  }
  return filled;
}

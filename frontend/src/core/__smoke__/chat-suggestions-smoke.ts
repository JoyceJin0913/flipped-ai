/**
 * 「私聊动态对话选项」spec §15.1 纯函数测试矩阵（阶段 1 收尾）。
 *
 * Run from frontend:
 *   ../backend/node_modules/.bin/tsx src/core/__smoke__/chat-suggestions-smoke.ts
 *
 * 覆盖 chatTopics.ts 的 planChatSuggestionSlots 规划器，以及
 * chatSuggestions.ts 的校验 / 补齐 / 合并 / 去重 / 通用兜底纯函数层。
 * 只读测试：不修改任何生产代码。
 */
import { planChatSuggestionSlots } from "../../data/chatTopics";
import {
  computeSuggestionMode,
  fillSuggestionGaps,
  mergeGeneratedSuggestions,
  validateGeneratedSuggestions,
  normalizeForDedup,
  GENERIC_SUGGESTION_POOL,
  MEMORY_FOLLOW_SLOT_PREFIX,
  parseModelChatOutput,
  sanitizeSuggestionText,
} from "../../lib/chatSuggestions";
import type {
  ChatSuggestion,
  GeneratedSuggestionCopy,
  SuggestionSlot,
  SuggestionSlotInput,
  ValidatedModelSuggestion,
} from "../../lib/chatSuggestions";
import { getNpcOutputContext } from "../outputContext";
import type { NpcOutputContext } from "../outputContext";
import { createNpcStateCard } from "../npcState";
import type { MemoryNote, NpcStateCard } from "../npcState";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`断言失败：${message}`);
}

/* ------------------------------------------------------------------ *
 * 测试数据构造（只走纯数据层，不依赖任何组件/图片资源）                *
 * ------------------------------------------------------------------ */

/** 构造一条可直接放进状态卡的记忆；day 固定为 2（≤ 上下文的 day=3）。 */
function memoryOf(id: string, tag: MemoryNote["tag"], createdAt: number): MemoryNote {
  return {
    id,
    day: 2,
    source: "private_chat",
    tag,
    text: `记忆正文-${id}`,
    visibility: "private",
    createdAt,
  };
}

/** 从单张状态卡构造 chat_choices 上下文（与生产读取路径一致，含记忆排序/裁剪）。 */
function chatContextOf(npcId: string, cardOverrides: Partial<NpcStateCard> = {}): NpcOutputContext {
  const card = { ...createNpcStateCard(npcId), ...cardOverrides };
  const context = getNpcOutputContext(
    { npcStateCards: { [npcId]: card }, worldFacts: {}, day: 3 },
    npcId,
    "chat_choices",
  );
  if (!context) throw new Error(`构造上下文失败：${npcId}`);
  return context;
}

/** 断言最终选项的 signal 逐字段等于本地 slot 的原始 signal。 */
function assertSignalEqualsSlot(
  suggestion: Pick<ChatSuggestion, "signal">,
  slot: SuggestionSlot,
  message: string,
): void {
  assert(suggestion.signal.intent === slot.signal.intent, `${message}：intent 应取本地 slot 的值`);
  assert(
    suggestion.signal.valence === slot.signal.valence,
    `${message}：valence 应取本地 slot 的值`,
  );
  assert(
    suggestion.signal.strength === slot.signal.strength,
    `${message}：strength 应取本地 slot 的值`,
  );
  assert(
    suggestion.signal.memoryTag === slot.signal.memoryTag,
    `${message}：memoryTag 应取本地 slot 的值`,
  );
}

/* ------------------------------------------------------------------ *
 * §15.1-1 无记忆 / 低好感 / 低张力 / 无对话 → 恰好三个互异 slot        *
 * ------------------------------------------------------------------ */

const baseContext = chatContextOf("npc_x");
const baseSlots = planChatSuggestionSlots(baseContext);
assert(baseSlots.length === 3, "无记忆低好感低张力时仍恰好返回 3 个 slot");
assert(
  baseSlots.map((slot) => slot.direction).join(",") === "continue,express,advance",
  "三个 slot 的 direction 应互不相同且为 continue/express/advance",
);
assert(
  baseSlots.map((slot) => slot.intent).join(",") === "greet,self_disclosure,get_to_know",
  "三个 slot 的 intent 应互不相同（greet/self_disclosure/get_to_know）",
);
assert(
  baseSlots.map((slot) => slot.slotId).join(",") ===
    "continue_opening,express_current_state,advance_know_more",
  "无记忆初始轮应落到 continue_opening/express_current_state/advance_know_more",
);
for (const slot of baseSlots) {
  assert(slot.guidance.trim() !== "", "每个 slot 都应携带非空 guidance（供模型写作）");
  assert(slot.fallbackReply.trim() !== "", "每个 slot 都应携带非空 fallbackReply（服务端降级用）");
}

/* ------------------------------------------------------------------ *
 * §15.1-2 冲突/拒绝记忆或 tension>=35 → 恰好一个 repair（在 advance） *
 * ------------------------------------------------------------------ */

const repairScenarios: Array<[string, NpcOutputContext]> = [
  ["张力 40（无记忆）", chatContextOf("npc_t1", { tension: 40 })],
  ["冲突记忆", chatContextOf("npc_t2", { memories: [memoryOf("m-conflict", "conflict", 1)] })],
  [
    "拒绝记忆 + 张力 30",
    chatContextOf("npc_t3", {
      tension: 30,
      memories: [memoryOf("m-reject", "rejection", 1)],
    }),
  ],
];
for (const [scenario, context] of repairScenarios) {
  const slots = planChatSuggestionSlots(context);
  assert(slots.length === 3, `${scenario}：仍恰好返回 3 个 slot`);
  const repairCount = slots.filter((slot) => slot.intent === "repair").length;
  assert(repairCount === 1, `${scenario}：必须恰好出现一个 intent=repair 的 slot`);
  assert(slots[2]?.intent === "repair", `${scenario}：repair 应落在 advance（第三个）slot`);
  assert(slots[2]?.slotId === "advance_repair", `${scenario}：repair slot 应为 advance_repair`);
  for (const slot of slots.slice(0, 2)) {
    assert(slot.intent !== "repair", `${scenario}：非 advance slot 不得携带 repair 意图`);
    const wording = `${slot.fallbackLabel}${slot.fallbackText}`;
    assert(
      !/道歉|对不起|原谅|是我不好/.test(wording),
      `${scenario}：非 repair slot 的文案不得带道歉/修复措辞`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * §15.1-3 高好感（任一方 interest>=60）→ romantic_probe；低好感不出现 *
 * ------------------------------------------------------------------ */

function expectRomanticSlot(context: NpcOutputContext, message: string): void {
  const slots = planChatSuggestionSlots(context);
  const probe = slots.find((slot) => slot.intent === "romantic_probe");
  assert(probe !== undefined, `${message}：应出现 romantic_probe 意图`);
  assert(probe.direction === "advance", `${message}：romantic_probe 应位于 advance 方向`);
  assert(probe.slotId === "advance_romantic_probe", `${message}：应使用 advance_romantic_probe`);
}

expectRomanticSlot(
  chatContextOf("npc_h1", { interest: { playerToNpc: 72, npcToPlayer: 20 } }),
  "玩家侧好感 72 时",
);
expectRomanticSlot(
  chatContextOf("npc_h2", { interest: { playerToNpc: 20, npcToPlayer: 75 } }),
  "NPC 侧好感 75 时",
);
expectRomanticSlot(
  chatContextOf("npc_h3", { interest: { playerToNpc: 60, npcToPlayer: 10 } }),
  "玩家侧好感恰好 60（含边界）时",
);

const lowInterestSlots = planChatSuggestionSlots(
  chatContextOf("npc_low", { interest: { playerToNpc: 20, npcToPlayer: 20 } }),
);
assert(
  !lowInterestSlots.some((slot) => slot.intent === "romantic_probe"),
  "低好感（20/20）不得出现 romantic_probe（不强制暧昧）",
);

// 状态优先级：可跟进记忆 > 高好感 → 有记忆时 advance 是跟进而非暧昧。
const memoryBeatsRomance = planChatSuggestionSlots(
  chatContextOf("npc_h4", {
    interest: { playerToNpc: 70, npcToPlayer: 70 },
    memories: [memoryOf("m-promise", "promise", 1)],
  }),
);
assert(
  !memoryBeatsRomance.some((slot) => slot.intent === "romantic_probe"),
  "高好感但存在可跟进记忆时，advance 应让位于记忆跟进而非暧昧试探",
);
assert(
  memoryBeatsRomance.some(
    (slot) => slot.direction === "advance" && slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX),
  ),
  "高好感 + 可跟进记忆时 advance 应形成记忆跟进 slot",
);

/* ------------------------------------------------------------------ *
 * §15.1-4 只有目标 NPC 的最近非 chat 记忆能形成 advance_follow_ slot   *
 * ------------------------------------------------------------------ */

// (a) chat 标签记忆不产生跟进 slot。
const chatOnlySlots = planChatSuggestionSlots(
  chatContextOf("npc_c1", { memories: [memoryOf("m-chat", "chat", 1)] }),
);
assert(
  !chatOnlySlots.some((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)),
  "只有 chat 标签记忆时不得产生记忆跟进 slot",
);
assert(
  chatOnlySlots.map((slot) => slot.slotId).join(",") ===
    "continue_opening,express_current_state,advance_know_more",
  "chat 标签记忆不改变默认三 slot（继续打招呼/表达状态/了解彼此）",
);

// (b) 秘密记忆形成唯一的 secret 变体跟进 slot。
const secretMemory = memoryOf("m-sec", "secret", 1);
const secretSlots = planChatSuggestionSlots(chatContextOf("npc_c2", { memories: [secretMemory] }));
const secretFollows = secretSlots.filter((slot) =>
  slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX),
);
assert(secretFollows.length === 1, "每条非 chat 记忆最多形成一个跟进 slot（秘密记忆恰好一条）");
assert(
  secretFollows[0]?.slotId === "advance_follow_secret_m-sec",
  "秘密记忆跟进的 slotId 应为 advance_follow_secret_{id}",
);
assert(secretFollows[0]?.direction === "advance", "记忆跟进只出现在 advance 方向");
assert(secretFollows[0]?.intent === "support", "秘密记忆跟进意图应为 support");
assert(
  secretFollows[0]?.fallbackLabel === "关心上次只对你说的事",
  "秘密记忆跟进的 fallbackLabel 应沿用既有关心文案",
);
assert(
  secretFollows[0]?.guidance.includes(secretMemory.text),
  "秘密记忆跟进的写作指引应引用该记忆文本",
);
assert(
  secretFollows[0] !== undefined && !secretFollows[0].guidance.includes("\n"),
  "指引中引用的记忆文本应被压成单行",
);

// (c) 多条非 chat 记忆时只跟进最近一条（createdAt 最大），且不会出现第二个跟进。
const supportOld = memoryOf("m-su-old", "support", 1);
const promiseNew = memoryOf("m-pr-new", "promise", 5);
const multiMemorySlots = planChatSuggestionSlots(
  chatContextOf("npc_c3", { memories: [supportOld, promiseNew] }),
);
const follows = multiMemorySlots.filter((slot) =>
  slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX),
);
assert(follows.length === 1, "多条非 chat 记忆只能形成一个跟进 slot");
assert(
  follows[0]?.slotId === "advance_follow_promise_m-pr-new",
  "应跟进最近（createdAt 最大）的非 chat 记忆，而非较早的 support 记忆",
);

// (c2) 最新的记忆若是 chat 标签也不得抢占跟进：仍应跟进最近的非 chat 记忆。
const chatNewest = memoryOf("m-chat9", "chat", 9);
const newestChatSlots = planChatSuggestionSlots(
  chatContextOf("npc_c6", { memories: [supportOld, promiseNew, chatNewest] }),
);
const newestChatFollows = newestChatSlots.filter((slot) =>
  slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX),
);
assert(
  newestChatFollows.length === 1 &&
    newestChatFollows[0]?.slotId === "advance_follow_promise_m-pr-new",
  "最新 chat 记忆不得成为跟进目标：仍应恰好跟进一个最近的非 chat 记忆",
);
assert(
  newestChatFollows[0]?.fallbackLabel === "接着聊聊之前的约定",
  "promise 记忆跟进应沿用既有跟进文案",
);
assert(
  newestChatFollows[0]?.guidance.includes(promiseNew.text) &&
    !(newestChatFollows[0]?.guidance.includes("\n") ?? false),
  "跟进写作指引应引用该记忆文本并压成单行",
);
for (const slot of newestChatSlots.filter(
  (item) => !item.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX),
)) {
  const wording = `${slot.fallbackLabel}${slot.fallbackText}`;
  assert(
    !/上次|还记得|那天|当时/.test(wording),
    "非记忆跟进 slot 的兜底文案不得包含无依据的过往声称",
  );
}

// (d)(e) 冲突/拒绝记忆在冲突状态下由 repair 占用 advance，不再出现跟进 slot。
for (const [scenario, tag] of [
  ["冲突记忆", "conflict"],
  ["拒绝记忆", "rejection"],
] as const) {
  const slots = planChatSuggestionSlots(
    chatContextOf("npc_c4", { memories: [memoryOf(`m-${tag}`, tag, 1)] }),
  );
  assert(
    !slots.some((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)),
    `${scenario}：冲突状态不得再产生重复的跟进 slot`,
  );
  assert(slots[2]?.slotId === "advance_repair", `${scenario}：advance 应被唯一 repair 占用`);
}

// (f) 冲突记忆较旧、更新的是 support 记忆：冲突仍优先，不出现重复跟进。
const mixedMemorySlots = planChatSuggestionSlots(
  chatContextOf("npc_c5", {
    memories: [memoryOf("m-cf-old", "conflict", 1), memoryOf("m-su-new", "support", 6)],
  }),
);
assert(
  !mixedMemorySlots.some((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)),
  "存在冲突记忆时即使有更新的可跟进记忆，advance 也只给 repair，不叠加跟进",
);
assert(
  mixedMemorySlots[2]?.slotId === "advance_repair",
  "冲突 + 更新的非冲突记忆时 advance 仍为 advance_repair",
);

// (g) 跨 NPC 隔离：别人的记忆不进入目标上下文，也就不形成目标侧的跟进 slot。
const secretOfB = memoryOf("m-secret-b", "secret", 1);
const isolationState = {
  npcStateCards: {
    npc_a: createNpcStateCard("npc_a"),
    npc_b: { ...createNpcStateCard("npc_b"), memories: [secretOfB] },
  },
  worldFacts: {},
  day: 3,
};
const isolationA = getNpcOutputContext(isolationState, "npc_a", "chat_choices");
const isolationB = getNpcOutputContext(isolationState, "npc_b", "chat_choices");
assert(isolationA !== null && isolationB !== null, "隔离场景应能构造两个 NPC 的上下文");
const slotsA = planChatSuggestionSlots(isolationA);
const slotsB = planChatSuggestionSlots(isolationB);
assert(
  !slotsA.some((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)),
  "其他 NPC 的秘密记忆不得让目标侧形成跟进 slot",
);
assert(
  !JSON.stringify(slotsA).includes(secretOfB.text),
  "其他 NPC 的记忆文本不得泄露进目标侧任何 slot 的文案或指引",
);
assert(
  slotsB.some((slot) => slot.slotId === "advance_follow_secret_m-secret-b"),
  "记忆归属的 NPC 自己应能形成秘密记忆跟进 slot",
);

/* ------------------------------------------------------------------ *
 * §15.1-5 对话承接：NPC 消息 → continue_respond；无对话 → continue_opening *
 * ------------------------------------------------------------------ */

assert(
  planChatSuggestionSlots(baseContext, [])[0]?.slotId === "continue_opening",
  "无对话时应承接 NPC 固定开场白（continue_opening）",
);
assert(
  planChatSuggestionSlots(baseContext, [{ from: "me", text: "我在楼下碰到你，就想上来坐坐。" }])[0]
    ?.slotId === "continue_opening",
  "只有玩家消息（无 NPC 消息）时仍应使用 continue_opening",
);
const dialogueSlots = planChatSuggestionSlots(baseContext, [
  { from: "me", text: "刚才你说的话我其实很在意。" },
  { from: "ta", text: "是吗？那你听完是什么感觉？" },
]);
assert(
  dialogueSlots[0]?.slotId === "continue_respond",
  "含 NPC 消息时 continue 应为 continue_respond",
);
assert(
  dialogueSlots.map((slot) => slot.slotId).join(",") ===
    "continue_respond,express_my_take,advance_go_deeper",
  "已有对话时 express/advance 应承接当前话题（express_my_take/advance_go_deeper）",
);
assert(
  dialogueSlots[0]?.guidance.includes("是吗？那你听完是什么感觉？"),
  "continue_respond 的写作指引应引用 NPC 刚说的最后一句话",
);

/* ------------------------------------------------------------------ *
 * §15.1-6 fillSuggestionGaps：0/1/2/3 条合法选项 → 恰好 3 条 + mode    *
 * ------------------------------------------------------------------ */

const SUG_ID_JOIN = "sug_continue_opening,sug_express_current_state,sug_advance_know_more";
const MODEL_FOR_OPENING: ValidatedModelSuggestion = {
  slotId: "continue_opening",
  label: "接住你的话",
  text: "你刚才说的那件小事，我想听你多说一点。",
  source: "model",
};
const MODEL_FOR_EXPRESS: ValidatedModelSuggestion = {
  slotId: "express_current_state",
  label: "说说我自己",
  text: "其实我最近常想，自己真正想要的是什么样的关系。",
  source: "model",
};
const MODEL_FOR_ADVANCE: ValidatedModelSuggestion = {
  slotId: "advance_know_more",
  label: "走近一步",
  text: "有没有哪一刻，你会想让我再多了解你一点？",
  source: "model",
};

let fullModelRun: ChatSuggestion[] = [];

function runFillCase(
  runLabel: string,
  modelItems: readonly ValidatedModelSuggestion[],
  expectedSourceJoin: string,
  expectedMode: "model" | "mixed_fallback" | "fallback",
): ChatSuggestion[] {
  const { valid, rejected } = validateGeneratedSuggestions(baseSlots, modelItems);
  assert(
    valid.length === modelItems.length && rejected.length === 0,
    `${runLabel}：合法条目应原样通过校验`,
  );
  const filled = fillSuggestionGaps(baseSlots, valid);
  assert(
    filled.length === 3,
    `${runLabel}：模型只返回 ${modelItems.length} 条合法选项时最终仍恰好 3 条`,
  );
  assert(
    filled.map((s) => s.id).join(",") === SUG_ID_JOIN,
    `${runLabel}：id 应为 sug_{slotId} 且保持 slot 顺序`,
  );
  assert(
    filled.map((s) => s.source).join(",") === expectedSourceJoin,
    `${runLabel}：source 序列应为 ${expectedSourceJoin}`,
  );
  assert(
    computeSuggestionMode(filled) === expectedMode,
    `${runLabel}：computeSuggestionMode 应为 ${expectedMode}`,
  );
  assert(
    new Set(filled.map((s) => normalizeForDedup(s.text))).size === 3,
    `${runLabel}：补齐后的三条文案互不重复`,
  );
  return filled;
}

runFillCase("模型返回 0 条", [], "fallback,fallback,fallback", "fallback");
runFillCase("模型返回 1 条", [MODEL_FOR_OPENING], "model,fallback,fallback", "mixed_fallback");
runFillCase(
  "模型返回 2 条",
  [MODEL_FOR_OPENING, MODEL_FOR_EXPRESS],
  "model,model,fallback",
  "mixed_fallback",
);
fullModelRun = runFillCase(
  "模型返回 3 条",
  [MODEL_FOR_OPENING, MODEL_FOR_EXPRESS, MODEL_FOR_ADVANCE],
  "model,model,model",
  "model",
);
for (let index = 0; index < fullModelRun.length; index += 1) {
  const suggestion = fullModelRun[index];
  const slot = baseSlots[index];
  if (suggestion && slot) {
    assertSignalEqualsSlot(suggestion, slot, "三条全模型结果");
  }
}

/* ------------------------------------------------------------------ *
 * §15.1-7 validateGeneratedSuggestions：各类否决及其 reason            *
 * ------------------------------------------------------------------ */

const TOO_LONG_LABEL = "这个标签实在是太长了不行"; // 12 字 > 10
const DUPLICATE_TEXT = "想先接住你刚才那句话"; // 先被合法接受，用于 duplicate_text
const seventyPlusText = "好".repeat(71);
const batchCandidates: unknown[] = [
  42, // 非对象 → invalid_shape
  { label: "你好呀", text: "今天天气不错，想和你聊聊。" }, // 缺 slotId → invalid_shape
  { slotId: "ghost_slot", label: "你好呀", text: "今天天气不错，想和你聊聊。" }, // 未知 slotId
  { slotId: "continue_opening", label: "重复的第一个", text: DUPLICATE_TEXT }, // 合法，占用 slot 与文本
  { slotId: "continue_opening", label: "再补一条", text: "同一个 slot 再补一条不同文案" }, // duplicate_slot
  { slotId: "express_current_state", label: TOO_LONG_LABEL, text: "超过十个字的标签必须被拒绝" }, // too_long
  { slotId: "advance_know_more", label: "超长正文", text: seventyPlusText }, // too_long（>70）
  { slotId: "express_current_state", label: "反引号文案", text: "我可不可以这样问：`你会想我吗`" }, // markdown
  { slotId: "advance_know_more", label: "加粗文案", text: "明天**晚上**想和你见面" }, // markdown
  { slotId: "express_current_state", label: "控制字符", text: "话说到一半\u0001就断了" }, // control_char
  { slotId: "advance_know_more", label: "数值文案", text: "我感觉好感度 80 已经很高了" }, // hidden_number
  { slotId: "express_current_state", label: "百分比文案", text: "这轮互动下来成功率涨了 50% 呢" }, // hidden_number
  { slotId: "advance_know_more", label: "上次的事", text: "上次你说的那件事，我一直都记得" }, // unverified_memory_claim
  { slotId: "express_current_state", label: "空白正文", text: "     " }, // empty_text
  { slotId: "express_current_state", text: "有正文但缺标签" }, // empty_text
  { slotId: "express_current_state", label: "换个说法", text: DUPLICATE_TEXT }, // duplicate_text
];
const expectedReasons = [
  "invalid_shape",
  "invalid_shape",
  "unknown_slot",
  "duplicate_slot",
  "too_long",
  "too_long",
  "markdown",
  "markdown",
  "control_char",
  "hidden_number",
  "hidden_number",
  "unverified_memory_claim",
  "empty_text",
  "empty_text",
  "duplicate_text",
];
const validated = validateGeneratedSuggestions(baseSlots, batchCandidates);
assert(
  validated.valid.length === 1 && validated.valid[0]?.slotId === "continue_opening",
  "混合批次中唯一合法候选（首次出现、无瑕疵的 continue_opening）应被接受",
);
assert(
  validated.valid[0]?.label === "重复的第一个" && validated.valid[0]?.text === DUPLICATE_TEXT,
  "被接受的候选应保留清理后的 label/text 原值",
);
const actualReasons = validated.rejected.map((item) => item.reason).join(",");
assert(
  actualReasons === expectedReasons.join(","),
  `各类否决的 reason 应与候选顺序一致：期望 ${expectedReasons.join(",")}，实际 ${actualReasons}`,
);

// 去掉标点/空白后重复的文案：两条写法不同但去符号后相同的候选仍判为重复。
const punctuationDup = validateGeneratedSuggestions(baseSlots, [
  { slotId: baseSlots[0]?.slotId, label: "聊天气", text: "今天天气不错，我们随便聊聊吧。" },
  { slotId: baseSlots[1]?.slotId, label: "也聊天气", text: "今天 天气不错！我们随便聊聊吧" },
]);
assert(
  punctuationDup.valid.length === 1 && punctuationDup.rejected[0]?.reason === "duplicate_text",
  "两条仅标点/空格写法不同的文案应判为重复并被拒绝（duplicate_text）",
);

/* ------------------------------------------------------------------ *
 * §15.1-8 记忆跟进 slot 允许过往时态表述，不被 unverified_memory_claim 否决 *
 * ------------------------------------------------------------------ */

function expectMemoryFollowCandidateAllowed(
  context: NpcOutputContext,
  runLabel: string,
  label: string,
  text: string,
): void {
  const slots = planChatSuggestionSlots(context);
  const followId = slots.find((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX))?.slotId;
  assert(followId !== undefined, `${runLabel}：先决条件，规划应产出记忆跟进 slot`);
  const { valid, rejected } = validateGeneratedSuggestions(slots, [
    { slotId: followId, label, text },
  ]);
  assert(
    valid.length === 1 && valid[0]?.slotId === followId,
    `${runLabel}：跟进 slot 上的过往时态表述应通过校验`,
  );
  assert(rejected.length === 0, `${runLabel}：不应产生任何否决原因`);
}

expectMemoryFollowCandidateAllowed(
  chatContextOf("npc_f1", { memories: [memoryOf("m-sec8", "secret", 1)] }),
  "秘密记忆跟进",
  "关心那件事",
  "上次你悄悄跟我说的那件事，我一直都记得。现在好一点了吗？",
);
expectMemoryFollowCandidateAllowed(
  chatContextOf("npc_f2", { memories: [memoryOf("m-su8", "support", 1)] }),
  "support 记忆跟进",
  "接着聊",
  "上次我们说好的那件事，我没有忘。你现在还想继续吗？",
);

/* ------------------------------------------------------------------ *
 * §15.1-9 mergeGeneratedSuggestions：本地 signal 优先，伪造字段无效     *
 * ------------------------------------------------------------------ */

const forgedContinueLabel = "回应你的开场";
const forgedContinueText = "嗯，我刚好路过，想来看看你在做什么。";
const truncatedLabel = TOO_LONG_LABEL; // 12 字，合并时被截断到 10 字
const truncatedText =
  "今天发生了一件很有意思的小事，我特别想第一时间告诉你。我想你大概也愿意听下去，所以特意过来，想和你聊聊这件有趣的事，听听你怎么看。其实我本来还担心你不在呢。";
assert(Array.from(truncatedText).length > 70, "先决条件：用于截断断言的正文明文长度应超过 70");
// 模型/API 边界不可信载荷：契约类型里不存在 signal，但运行时可能被塞进同名结算字段。
const untrustedCopies = [
  {
    slotId: "continue_opening",
    label: forgedContinueLabel,
    text: forgedContinueText,
    source: "model",
    signal: { intent: "repair", valence: "negative", strength: 3, memoryTag: "conflict" },
  },
  {
    slotId: "advance_know_more",
    label: truncatedLabel,
    text: truncatedText,
    source: "model",
    signal: { intent: "repair", valence: "mixed", strength: 3, memoryTag: "rejection" },
  },
  { slotId: "ghost_unknown_slot", label: "不存在", text: "这段文案不该出现", source: "model" },
  {
    slotId: "continue_opening",
    label: "重复的第二个",
    text: "同 slot 第二条应被丢弃",
    source: "model",
  },
  { slotId: "express_current_state", label: "", text: "   ", source: "model" }, // 空白文案 copy：清洗后为空应被丢弃
] as GeneratedSuggestionCopy[];

const merged = mergeGeneratedSuggestions(baseSlots, untrustedCopies);
assert(merged.length === 3, "合并后仍恰好返回 3 条（未知 slot 与重复 slot 的 copy 被丢弃）");
const mergedOpening = merged[0];
const mergedExpress = merged[1];
const mergedAdvance = merged[2];
assert(
  mergedOpening !== undefined && mergedExpress !== undefined && mergedAdvance !== undefined,
  "先决条件：合并结果应含三条索引",
);
const baseSlot0 = baseSlots[0];
const baseSlot2 = baseSlots[2];
assert(baseSlot0 !== undefined && baseSlot2 !== undefined, "先决条件：基础 slot 数组应含三条索引");
assert(
  merged.map((s) => s.id).join(",") === SUG_ID_JOIN,
  "合并结果应保持本地 slot 顺序且 id=sug_{slotId}",
);
assert(
  merged.map((s) => s.source).join(",") === "model,fallback,model",
  "缺席的 express slot 应回退为 fallback 来源",
);
// continue_opening：文案来自 copy（首条优先），但 signal 必须是本地 slot 的 greet/neutral/1/chat。
assert(
  mergedOpening.label === forgedContinueLabel && mergedOpening.text === forgedContinueText,
  "存在的 slot 应用 copy 的文案（同 slot 第二条 copy 被丢弃）",
);
assertSignalEqualsSlot(mergedOpening, baseSlot0, "带伪造 signal 的 continue copy 合并后");
// express_current_state：没有可采用的 copy（含空白文案 copy 被丢弃）→ 回退本地 fallback 文案。
assert(
  mergedExpress.label === baseSlots[1]?.fallbackLabel &&
    mergedExpress.text === baseSlots[1]?.fallbackText,
  "缺失或空白的 slot copy 应回退本地 fallbackLabel/fallbackText",
);
// advance_know_more：文案来自 copy（超长 label/text 被清理截断），signal 仍是本地 slot 的。
assert(
  mergedAdvance.label === Array.from(truncatedLabel).slice(0, 10).join(""),
  "copy 的超长 label 应被截断到 10 字",
);
assert(
  mergedAdvance.text === Array.from(truncatedText).slice(0, 70).join(""),
  "copy 的超长 text 应被截断到 70 字",
);
assertSignalEqualsSlot(mergedAdvance, baseSlot2, "带伪造 signal 的 advance copy 合并后");

/* ------------------------------------------------------------------ *
 * §15.1-10 通用兜底：fallback 撞车时从 GENERIC_SUGGESTION_POOL 补齐      *
 * ------------------------------------------------------------------ */

// 场景 A（fillSuggestionGaps 路径）：slot0 采用模型文案，恰好等于 slot1 的 fallbackText；
// slot1 自身 fallback 撞车 → 从通用池取第一条；slot2 无碍保留自身 fallback。
const slot1FallbackWording = baseSlots[1]?.fallbackText ?? "";
const collisionValid: ValidatedModelSuggestion[] = [
  {
    slotId: "continue_opening",
    label: "换个开场白",
    text: slot1FallbackWording,
    source: "model",
  },
];
const gapFilled = fillSuggestionGaps(baseSlots, collisionValid);
assert(
  gapFilled.length === 3 && new Set(gapFilled.map((s) => normalizeForDedup(s.text))).size === 3,
  "fallback 撞车时最终仍为恰好三条互不重复的文案",
);
assert(
  gapFilled[0]?.text === slot1FallbackWording && gapFilled[0]?.source === "model",
  "slot0 应保留不撞车的模型文案",
);
assert(
  gapFilled[1]?.label === GENERIC_SUGGESTION_POOL[0]?.label &&
    gapFilled[1]?.text === GENERIC_SUGGESTION_POOL[0]?.text,
  "slot1 自身 fallback 撞车时应从通用选项池补齐（聊聊近况）",
);
assert(gapFilled[2]?.text === baseSlots[2]?.fallbackText, "slot2 的 fallback 未撞车时应原样保留");

// 场景 B（mergeGeneratedSuggestions 路径 + 通用池逐项跳过）：
// 依次让 slot1/slot2 的 fallback 都撞上已采用文本，池子必须跳过已占用条目。
const chainedSlots = planChatSuggestionSlots(chatContextOf("npc_g1")).map((slot) => ({
  ...slot,
}));
const poolText0 = GENERIC_SUGGESTION_POOL[0]?.text ?? "";
const poolText1 = GENERIC_SUGGESTION_POOL[1]?.text ?? "";
const poolText2 = GENERIC_SUGGESTION_POOL[2]?.text ?? "";
const chainSlot0 = chainedSlots[0];
const chainSlot1 = chainedSlots[1];
const chainSlot2 = chainedSlots[2];
assert(
  chainSlot0 !== undefined && chainSlot1 !== undefined && chainSlot2 !== undefined,
  "先决条件：链式兜底场景需要 3 个本地 slot",
);
const chainMerged = mergeGeneratedSuggestions(
  [
    chainSlot0,
    { ...chainSlot1, fallbackText: poolText0 },
    { ...chainSlot2, fallbackText: poolText1 },
  ],
  [
    {
      slotId: chainSlot0.slotId,
      label: "聊聊近况",
      text: poolText0,
      source: "model",
    },
  ],
);
assert(chainMerged.length === 3, "通用池补齐后仍恰好三条");
assert(
  new Set(chainMerged.map((s) => normalizeForDedup(s.text))).size === 3,
  "链式撞车后三条文案互不重复",
);
assert(
  chainMerged[0]?.text === poolText0 &&
    chainMerged[1]?.text === poolText1 &&
    chainMerged[2]?.text === poolText2,
  "撞车 slot 应依次从通用池跳过已占用条目（pool0 → pool1 → pool2）",
);
assert(
  chainMerged.map((s) => s.source).join(",") === "model,fallback,fallback",
  "通用池补齐的条目来源应为 fallback",
);

/* ------------------------------------------------------------------ *
 * §8 / §9.2（内容安全）兜底文案与通用选项池不替玩家告白/道歉/承诺       *
 * ------------------------------------------------------------------ */

const CONTENT_BANNED =
  /对不起|抱歉|道歉|是我的错|我喜欢你|爱上你|在一起|做我|答应你|我保证|永远|承诺|交往/;
const safetyScenarios: Array<[string, SuggestionSlot[]]> = [
  ["空白状态", planChatSuggestionSlots(chatContextOf("npc_y1"))],
  ["高张力 60", planChatSuggestionSlots(chatContextOf("npc_y2", { tension: 60 }))],
  [
    "冲突记忆",
    planChatSuggestionSlots(
      chatContextOf("npc_y3", { memories: [memoryOf("m-y3", "conflict", 1)] }),
    ),
  ],
  [
    "秘密记忆",
    planChatSuggestionSlots(chatContextOf("npc_y4", { memories: [memoryOf("m-y4", "secret", 1)] })),
  ],
  [
    "高好感",
    planChatSuggestionSlots(
      chatContextOf("npc_y5", { interest: { playerToNpc: 72, npcToPlayer: 40 } }),
    ),
  ],
  ["有对话", planChatSuggestionSlots(baseContext, [{ from: "ta", text: "我刚才在想一些事情。" }])],
];
for (const [scenario, slots] of safetyScenarios) {
  const wording = slots
    .map((slot) => `${slot.fallbackLabel}${slot.fallbackText}${slot.fallbackReply}`)
    .join("");
  assert(
    !CONTENT_BANNED.test(wording),
    `${scenario}：兜底文案（label+text+reply）不得替玩家告白/道歉/承诺`,
  );
}

// express 方向在不同状态下应提供互不相同的保守兜底文案（现状为 4 个变体）。
const expressFallbackTexts = new Set(
  planChatSuggestionSlots(chatContextOf("npc_y6", { tension: 60 }))
    .concat(
      planChatSuggestionSlots(
        chatContextOf("npc_y7", { interest: { playerToNpc: 70, npcToPlayer: 30 } }),
      ),
    )
    .concat(planChatSuggestionSlots(chatContextOf("npc_y8")))
    .concat(
      planChatSuggestionSlots(chatContextOf("npc_y9"), [{ from: "me", text: "今天还好吗？" }]),
    )
    .filter((slot) => slot.direction === "express")
    .map((slot) => slot.fallbackText),
);
assert(expressFallbackTexts.size >= 3, "express 方向应提供至少 3 条互不相同的保守兜底文案");

// 通用选项池内容质量：条目充足、去标点后互不相同、可直接下发。
assert(GENERIC_SUGGESTION_POOL.length >= 3, "通用选项池至少应有 3 条");
assert(
  new Set(GENERIC_SUGGESTION_POOL.map((item) => normalizeForDedup(item.text))).size ===
    GENERIC_SUGGESTION_POOL.length,
  "通用选项池文案去标点后应互不相同",
);
assert(
  !CONTENT_BANNED.test(GENERIC_SUGGESTION_POOL.map((item) => `${item.label}${item.text}`).join("")),
  "通用选项池不得替玩家告白/道歉/承诺",
);
for (const item of GENERIC_SUGGESTION_POOL) {
  assert(
    Array.from(item.label).length > 0 && Array.from(item.label).length <= 10,
    "通用选项池 label 长度应合规（1..10 字）",
  );
  assert(
    Array.from(item.text).length > 0 && Array.from(item.text).length <= 70,
    "通用选项池 text 长度应合规（1..70 字）",
  );
  assert(
    sanitizeSuggestionText(item.label) === item.label &&
      sanitizeSuggestionText(item.text) === item.text,
    "通用选项池文案应已是干净文本（无需再清洗）",
  );
}

/* ------------------------------------------------------------------ *
 * §15.1-11 parseModelChatOutput：模型原始文本 → reply + suggestions 候选 *
 * ------------------------------------------------------------------ */

assert(parseModelChatOutput("") === null, "空输入解析失败返回 null");
assert(parseModelChatOutput("    ") === null, "纯空白输入返回 null");
assert(parseModelChatOutput("这不是 JSON，只是一句话") === null, "非法 JSON 返回 null");
assert(parseModelChatOutput('{"reply":"截断了') === null, "未闭合的 JSON 返回 null");
assert(parseModelChatOutput("[1,2,3]") === null, "JSON 数组不是契约对象，返回 null");
assert(parseModelChatOutput('"hello"') === null, "JSON 字符串不是契约对象，返回 null");
assert(parseModelChatOutput("42") === null, "JSON 数字不是契约对象，返回 null");

const fencedOutput = parseModelChatOutput(
  '```json\n{"reply":"嗯？你怎么过来了。","suggestions":[{"slotId":"continue_opening","label":"接住","text":"闲着没事，想过来看看你。"}]}\n```',
);
assert(fencedOutput !== null, "```json 围栏包裹的 JSON 应解析成功");
assert(fencedOutput.reply === "嗯？你怎么过来了。", "围栏模式应读回 reply 原值");
assert(
  Array.isArray(fencedOutput.suggestions) && fencedOutput.suggestions.length === 1,
  "围栏模式应读回 suggestions 数组",
);

const bareOutput = parseModelChatOutput('{"reply":"在的","suggestions":[{"slotId":"x"}]}');
assert(bareOutput !== null && bareOutput.reply === "在的", "裸 JSON 应直接解析成功");
assert(
  Array.isArray(bareOutput.suggestions) &&
    (bareOutput.suggestions[0] as Record<string, unknown> | undefined)?.["slotId"] === "x",
  "裸 JSON 的 suggestions 元素应原样保留（类型校验交给 validateGeneratedSuggestions）",
);

const verboseOutput = parseModelChatOutput(
  '好的，这是生成结果：\n```json\n{"reply":"好呀","suggestions":[{"slotId":"a","label":"L","text":"T"}]}\n```\n请查收。',
);
assert(
  verboseOutput !== null && verboseOutput.reply === "好呀",
  "正文前后带解释文字时应经花括号子串容错解析成功",
);

const replyOnlyOutput = parseModelChatOutput('{"reply":"在吗"}');
assert(
  replyOnlyOutput !== null && replyOnlyOutput.suggestions === undefined,
  "缺 suggestions 键时该键应为 undefined（不强行补空数组）",
);
const suggestionsOnlyOutput = parseModelChatOutput('{"suggestions":[]}');
assert(
  suggestionsOnlyOutput !== null && suggestionsOnlyOutput.reply === undefined,
  "缺 reply 键时该键应为 undefined",
);
const nonArraySuggestionsOutput = parseModelChatOutput('{"reply":"在吗","suggestions":"oops"}');
assert(
  nonArraySuggestionsOutput !== null && nonArraySuggestionsOutput.suggestions === undefined,
  "suggestions 非数组时丢弃该键",
);
const nonStringReplyOutput = parseModelChatOutput('{"reply":123,"suggestions":[]}');
assert(
  nonStringReplyOutput !== null && nonStringReplyOutput.reply === undefined,
  "reply 非字符串时丢弃该键",
);

/* ------------------------------------------------------------------ *
 * §15.1-12 服务端最小结构 slot：补齐输出不含结算字段（spec §9.3 降级形状） *
 * ------------------------------------------------------------------ */

const slimSlots: SuggestionSlotInput[] = baseSlots.map((slot) => ({
  slotId: slot.slotId,
  fallbackLabel: slot.fallbackLabel,
  fallbackText: slot.fallbackText,
}));
const slimFilled = fillSuggestionGaps(slimSlots, []);
assert(slimFilled.length === 3, "最小结构 slot 补齐后仍恰好三条");
assert(
  slimFilled.every((item) => item.source === "fallback"),
  "无模型文案时最小结构补齐全部为 fallback 来源",
);
assert(
  Object.keys(slimFilled[0] ?? {})
    .sort()
    .join(",") === "label,slotId,source,text",
  "最小结构补齐结果只含文案字段（不含 id/signal 等结算字段）",
);
const { valid: slimValid } = validateGeneratedSuggestions(slimSlots, [
  { slotId: "ghost", label: "你好", text: "不存在这个 slot" },
  { slotId: baseSlots[0]?.slotId, label: "接住", text: "刚想过来看看你，你呢？" },
]);
assert(
  slimValid.length === 1 && slimValid[0]?.slotId === baseSlots[0]?.slotId,
  "校验器接受最小结构 slot 数组，未知 slotId 仍被拒绝",
);
assert(
  computeSuggestionMode(slimFilled) === "fallback",
  "全 fallback 的最小结构补齐 mode 应为 fallback",
);

console.log("chat suggestions pure-function smoke passed ✓");

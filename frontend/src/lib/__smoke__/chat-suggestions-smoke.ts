/**
 * Run from frontend:
 *   node --import ../backend/node_modules/tsx/dist/loader.mjs --import ./scripts/register-smoke-asset-loader.mjs src/lib/__smoke__/chat-suggestions-smoke.ts
 */
import { planChatSuggestionSlots } from "../../data/chatTopics";
import { getNpcOutputContext } from "../../core/outputContext";
import { createNpcStateCard, type MemoryNote, type NpcStateCard } from "../../core/npcState";
import type { NpcOutputContext } from "../../core/outputContext";
import {
  GENERIC_SUGGESTION_POOL,
  MEMORY_FOLLOW_SLOT_PREFIX,
  SUGGESTION_LABEL_LIMIT,
  SUGGESTION_TEXT_LIMIT,
  computeSuggestionMode,
  fillSuggestionGaps,
  mergeGeneratedSuggestions,
  normalizeForDedup,
  sanitizeSuggestionText,
  validateGeneratedSuggestions,
  type GeneratedSuggestionCopy,
  type SuggestionSlot,
} from "../chatSuggestions";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`断言失败：${message}`);
}

type CardInput = Partial<
  Pick<NpcStateCard, "trust" | "tension" | "interactionCount" | "memories">
> & {
  interest?: NpcStateCard["interest"];
};

function stateCard(id: string, patch: CardInput = {}): NpcStateCard {
  return { ...createNpcStateCard(id), ...patch };
}

/** 通过 getNpcOutputContext 构造合法上下文（唯一状态读取层的真实路径）。 */
function makeContext(
  npcId: string,
  patch: CardInput = {},
  others: Record<string, CardInput> = {},
  day = 2,
): NpcOutputContext {
  const npcStateCards: Record<string, NpcStateCard> = { [npcId]: stateCard(npcId, patch) };
  for (const [otherId, otherPatch] of Object.entries(others)) {
    npcStateCards[otherId] = stateCard(otherId, otherPatch);
  }
  const context = getNpcOutputContext(
    { npcStateCards, worldFacts: {}, day },
    npcId,
    "chat_choices",
  );
  assert(context, "规划上下文必须能从状态卡生成");
  return context;
}

function memory(
  id: string,
  tag: MemoryNote["tag"],
  createdAt: number,
  text = "NPC 与玩家之间的一段共同记忆。",
  day = 2,
): MemoryNote {
  return { id, day, source: "public_event", tag, text, visibility: "public", createdAt };
}

function goodCandidate(slotId: string, seed: string): unknown {
  return { slotId, label: `聊聊${seed}`, text: `想听你说说${seed}方面的事。` };
}

/** 规划器输出的基础形状约束：恰好 3 个、direction 各异、id 唯一、兜底文案合规。 */
function assertSlotShape(slots: SuggestionSlot[], scenario: string): void {
  const label = `（${scenario}）`;
  assert(slots.length === 3, `${label}规划器每次应恰好返回 3 个 slot`);
  assert(
    slots
      .map((slot) => slot.direction)
      .sort()
      .join(",") === "advance,continue,express",
    `${label}三个 slot 的 direction 必须覆盖 continue/express/advance 且互不相同`,
  );
  assert(new Set(slots.map((slot) => slot.slotId)).size === 3, `${label}slotId 不得重复`);
  assert(new Set(slots.map((slot) => slot.intent)).size === 3, `${label}intent 不得重复`);
  for (const slot of slots) {
    assert(
      slot.fallbackLabel.length > 0 && slot.fallbackLabel.length <= SUGGESTION_LABEL_LIMIT,
      `${label}${slot.slotId} 的 fallbackLabel 长度应在 1..10`,
    );
    assert(
      slot.fallbackText.length > 0 && slot.fallbackText.length <= SUGGESTION_TEXT_LIMIT,
      `${label}${slot.slotId} 的 fallbackText 长度应在 1..70`,
    );
    assert(
      slot.fallbackReply.length > 0 && slot.fallbackReply.length <= 90,
      `${label}${slot.slotId} 应有非空且 ≤90 字的 fallbackReply`,
    );
    assert(slot.guidance.length > 0, `${label}${slot.slotId} 应有写作指引`);
    assert(slot.signal.intent.length > 0, `${label}${slot.slotId} 应携带确定性 signal`);
    // 非记忆跟进 slot 的兜底文案不得偷偷使用过往时态声称
    if (!slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)) {
      const bannedClaims = ["上次", "还记得", "那天", "以前", "当时"];
      const text = `${slot.fallbackLabel}${slot.fallbackText}`;
      assert(
        !bannedClaims.some((token) => text.includes(token)),
        `${label}${slot.slotId} 的兜底文案不得包含无依据的过往声称`,
      );
    }
    assert(
      sanitizeSuggestionText(slot.fallbackText) === slot.fallbackText,
      `${label}${slot.slotId} 的兜底文案应已是干净文本`,
    );
  }
  const textKeys = slots.map((slot) => normalizeForDedup(slot.fallbackText));
  assert(new Set(textKeys).size === 3, `${label}三条兜底文案不得重复`);
}

const secretMemory = memory("m-secret", "secret", 1, "玩家在篝火夜只对我一个人说过怕黑。");
const conflictMemory = memory("m-conflict", "conflict", 1, "玩家在分组选择时让我感到被抛下。");
const supportMemory = memory("m-support", "support", 1, "玩家陪我去医院拿过一次检查报告。");
const promiseMemory = memory("m-promise", "promise", 2, "我们说好一起去看那场一直想看的展。");

/* ---------- §15.1-1：无记忆、低好感、低张力时仍是 continue/express/advance ---------- */
{
  const slots = planChatSuggestionSlots(makeContext("npc_a"));
  assertSlotShape(slots, "空白状态");
  assert(
    slots.map((slot) => slot.slotId).join(",") ===
      "continue_opening,express_current_state,advance_know_more",
    "无对话时 continue 应承接固定开场白，express/advance 用保守兜底",
  );
  assert(
    !slots.some((slot) => slot.intent === "repair" || slot.intent === "romantic_probe"),
    "空白状态不得出现 repair 或 romantic_probe",
  );
  assert(
    !slots.some((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)),
    "空白状态不得出现记忆跟进 slot",
  );
}

/* ---------- 有对话时 continue 承接 NPC 最后一句话 ---------- */
{
  const history = [
    { from: "ta" as const, text: "……刚才在厨房有点走神，被你看到了。" },
    { from: "me" as const, text: "在想什么呢，这么出神？" },
  ];
  const slots = planChatSuggestionSlots(makeContext("npc_a"), history);
  assertSlotShape(slots, "承接对话");
  const [continueSlot, expressSlot, advanceSlot] = slots;
  assert(continueSlot?.slotId === "continue_respond", "有对话时 continue 应承接 NPC 最后一句话");
  assert(continueSlot?.guidance.includes("在厨房有点走神"), "continue 指引应引用 NPC 最后一句话");
  assert(expressSlot?.slotId === "express_my_take", "有对话时 express 应说出玩家自己的看法");
  assert(
    advanceSlot?.slotId === "advance_go_deeper",
    "有对话且无特殊状态时 advance 应向深处走一步",
  );
  assert(
    continueSlot?.intent !== "follow_up" && continueSlot?.slotId === "continue_respond",
    "记忆跟进不得塞进 continue",
  );
}

/* ---------- §15.1-2 回归：冲突/张力下恰好一个 repair，不出现两个道歉类选项 ---------- */
const conflictCases: Array<[string, CardInput]> = [
  ["高张力无记忆", { tension: 60 }],
  ["冲突记忆", { memories: [conflictMemory] }],
  ["张力 35 + 冲突记忆（旧 bug 场景）", { tension: 35, memories: [conflictMemory] }],
];
for (const [scenario, patch] of conflictCases) {
  const slots = planChatSuggestionSlots(makeContext("npc_a", patch));
  assertSlotShape(slots, scenario);
  const repairCount = slots.filter((slot) => slot.intent === "repair").length;
  assert(repairCount === 1, `${scenario}下必须恰好一个 repair（实际 ${repairCount} 个）`);
  assert(
    slots.filter((slot) => slot.direction === "advance").some((slot) => slot.intent === "repair"),
    `${scenario}下 repair 应落在 advance 方向`,
  );
  assert(
    !slots.some((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)),
    `${scenario}下 repair 优先级高于记忆跟进，不得再出现 follow slot`,
  );
  const apologyText = slots
    .map((slot) => `${slot.fallbackLabel}${slot.fallbackText}${slot.fallbackReply}`)
    .join("");
  assert(
    !/(对不起|抱歉|道歉|是我的错)/.test(apologyText),
    `${scenario}下选项不得出现两个换句话说的道歉类表达`,
  );
}

/* ---------- §15.1-3：高好感 gate romantic_probe ---------- */
for (const patch of [
  { interest: { playerToNpc: 72, npcToPlayer: 30 } },
  { interest: { playerToNpc: 30, npcToPlayer: 65 } },
]) {
  const slots = planChatSuggestionSlots(makeContext("npc_a", patch));
  assertSlotShape(slots, "高好感");
  assert(
    slots.filter((slot) => slot.intent === "romantic_probe").length === 1 &&
      slots.some((slot) => slot.direction === "advance" && slot.intent === "romantic_probe"),
    "任一方 interest >= 60 时应出现且仅出现一个 advance 方向的 romantic_probe",
  );
}
{
  const low = planChatSuggestionSlots(
    makeContext("npc_a", { interest: { playerToNpc: 40, npcToPlayer: 45 } }),
  );
  assert(!low.some((slot) => slot.intent === "romantic_probe"), "低好感不得出现强制暧昧");
}

/* ---------- §15.1-4：只有目标 NPC 的最近合法记忆能形成跟进 slot ---------- */
{
  // 跨 NPC：秘密记忆在 npc_b 身上，规划 npc_a 时不可见
  const crossContext = makeContext("npc_a", {}, { npc_b: { memories: [secretMemory] } });
  const crossSlots = planChatSuggestionSlots(crossContext);
  assert(
    !crossSlots.some((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)),
    "其他 NPC 的记忆不得形成目标 NPC 的跟进 slot",
  );
  assert(
    !JSON.stringify(crossSlots).includes("怕黑"),
    "其他 NPC 的记忆文本不得泄露进目标 NPC 的任何 slot",
  );
}
{
  // 目标 NPC 自己的秘密记忆 → 沿用「关心上次只对你说的事」的分支语义
  const slots = planChatSuggestionSlots(makeContext("npc_a", { memories: [secretMemory] }));
  assertSlotShape(slots, "秘密记忆");
  const follow = slots.filter((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX));
  assert(follow.length === 1, "秘密记忆应形成且仅形成一个跟进 slot");
  assert(
    follow[0]?.slotId === `${MEMORY_FOLLOW_SLOT_PREFIX}secret_m-secret` &&
      follow[0]?.direction === "advance" &&
      follow[0]?.intent === "support",
    "秘密记忆跟进应落在 advance 且沿用 support 语义",
  );
  assert(follow[0]?.fallbackLabel === "关心上次只对你说的事", "秘密记忆跟进应沿用现有关心文案");
}
{
  // 只有 chat 标签的记忆不构成可跟进的合法记忆
  const chatOnly = memory("m-chat", "chat", 3, "随便聊了聊天气。");
  const slots = planChatSuggestionSlots(makeContext("npc_a", { memories: [chatOnly] }));
  assert(
    !slots.some((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX)),
    "仅 chat 标签的记忆不得形成跟进 slot",
  );
}
{
  // 最近的合法（非 chat）记忆胜出；最近记忆可能是 chat 也不影响
  const newestChat = memory("m-chat2", "chat", 4, "刚聊完天气。");
  const slots = planChatSuggestionSlots(
    makeContext("npc_a", { memories: [supportMemory, promiseMemory, newestChat] }),
  );
  const follow = slots.filter((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX));
  assert(follow.length === 1, "应只取最近一条合法记忆形成跟进");
  assert(
    follow[0]?.slotId === `${MEMORY_FOLLOW_SLOT_PREFIX}promise_m-promise`,
    "应优先跟进最近的合法（非 chat）记忆",
  );
  assert(follow[0]?.fallbackLabel === "接着聊聊之前的约定", "promise 记忆应沿用既有跟进文案");
  assert(!follow[0]?.guidance.includes("\n"), "指引中引用的记忆文本应被压成单行");
}
{
  // 秘密记忆的跟进文案与指引不跨 NPC（目标记忆已在目标上下文中）
  const slots = planChatSuggestionSlots(makeContext("npc_a", { memories: [secretMemory] }), [
    { from: "ta", text: "今天风很大。" },
  ]);
  const follow = slots.find((slot) => slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX));
  assert(follow, "有对话时秘密记忆跟进仍应出现在 advance");
  assert(follow?.guidance.includes("怕黑"), "跟进指引应引用目标 NPC 的合法记忆文本");
}

/* ---------- §15.1-5：模型返回 0/1/2/3 条合法选项时最终均恰好 3 条 ---------- */
{
  const slots = planChatSuggestionSlots(makeContext("npc_a"));
  const labels = ["近况", "兴趣", "小屋"];

  // 0 条合法
  const none = fillSuggestionGaps(slots, []);
  assert(
    none.length === 3 && none.every((item) => item.source === "fallback"),
    "0 条模型文案时应全部用 fallback 补齐为 3 条",
  );
  assert(computeSuggestionMode(none) === "fallback", "0 条 model 时 mode 应为 fallback");

  // 1 条合法
  const oneValid = validateGeneratedSuggestions(slots, [
    goodCandidate(slots[0]?.slotId ?? "", labels[0] ?? "近况"),
  ]);
  assert(oneValid.valid.length === 1, "单条合法候选应通过校验");
  const one = fillSuggestionGaps(slots, oneValid.valid);
  assert(one.length === 3, "1 条模型文案时仍应恰好 3 条");
  assert(one.filter((item) => item.source === "model").length === 1, "1 条 model 时应保留该条");
  assert(computeSuggestionMode(one) === "mixed_fallback", "1 条 model 时 mode 应为 mixed_fallback");

  // 2 条合法
  const twoValid = validateGeneratedSuggestions(slots, [
    goodCandidate(slots[0]?.slotId ?? "", labels[0] ?? ""),
    goodCandidate(slots[1]?.slotId ?? "", labels[1] ?? ""),
  ]);
  assert(twoValid.valid.length === 2, "两条合法候选应通过校验");
  const two = fillSuggestionGaps(slots, twoValid.valid);
  assert(
    two.length === 3 && two.filter((item) => item.source === "model").length === 2,
    "2 条 model 时应补齐第三条",
  );
  assert(computeSuggestionMode(two) === "mixed_fallback", "2 条 model 时 mode 应为 mixed_fallback");

  // 3 条合法
  const threeValid = validateGeneratedSuggestions(slots, [
    goodCandidate(slots[0]?.slotId ?? "", labels[0] ?? ""),
    goodCandidate(slots[1]?.slotId ?? "", labels[1] ?? ""),
    goodCandidate(slots[2]?.slotId ?? "", labels[2] ?? ""),
  ]);
  assert(threeValid.valid.length === 3, "三条合法候选应全部通过校验");
  const three = fillSuggestionGaps(slots, threeValid.valid);
  assert(
    three.length === 3 && three.every((item) => item.source === "model"),
    "3 条 model 时应原样保留三条",
  );
  assert(computeSuggestionMode(three) === "model", "3 条 model 时 mode 应为 model");
  assert(
    new Set(three.map((item) => normalizeForDedup(item.text))).size === 3,
    "最终三条文案去标点后必须互不相同",
  );

  // mode 补充分支：2 条 model
  const twoSource: Array<{ source: "model" | "fallback" }> = [
    { source: "model" },
    { source: "fallback" },
  ];
  assert(
    computeSuggestionMode(twoSource) === "mixed_fallback",
    "2 条 model 的边界 mode 应为 mixed_fallback",
  );
}

/* ---------- §15.1-6：重复文本/未知 slot/超长/Markdown/控制字符/数值/无依据声称被拒绝 ---------- */
{
  const slots = planChatSuggestionSlots(makeContext("npc_a"));
  const [continueSlot] = slots;
  const continueId = continueSlot?.slotId ?? "";
  const expressId = slots[1]?.slotId ?? "";
  const advanceId = slots[2]?.slotId ?? "";

  // 未知 slot
  const unknown = validateGeneratedSuggestions(slots, [
    { slotId: "advance_hack", label: "试一下", text: "想听你说说最近的事。" },
  ]);
  assert(
    unknown.rejected.length === 1 && unknown.rejected[0]?.reason === "unknown_slot",
    "未知 slotId 应被拒绝",
  );

  // 同一 slot 的重复使用：第一条合法，第二条拒绝
  const dupSlot = validateGeneratedSuggestions(slots, [
    goodCandidate(continueId, "近况"),
    { slotId: continueId, label: "再来一次", text: "再想听你说说别的事。" },
  ]);
  assert(
    dupSlot.valid.length === 1 && dupSlot.rejected[0]?.reason === "duplicate_slot",
    "同一 slot 只能采用一条文案",
  );

  // 去掉标点空格后重复的文本
  const dupText = validateGeneratedSuggestions(slots, [
    { slotId: continueId, label: "聊天气", text: "今天天气不错，我们随便聊聊吧。" },
    { slotId: expressId, label: "也聊天气", text: "今天 天气不错！我们随便聊聊吧" },
  ]);
  assert(
    dupText.valid.length === 1 && dupText.rejected[0]?.reason === "duplicate_text",
    "去标点后重复的文案应被拒绝",
  );

  // 超长 text 与超长 label
  const longText = validateGeneratedSuggestions(slots, [
    { slotId: continueId, label: "闲聊", text: "很".repeat(71) },
  ]);
  assert(longText.rejected[0]?.reason === "too_long", "超过 70 字的 text 应被拒绝");
  const longLabel = validateGeneratedSuggestions(slots, [
    { slotId: continueId, label: "这个标签实在是太长了啊", text: "想听你说说最近的事。" },
  ]);
  assert(longLabel.rejected[0]?.reason === "too_long", "超过 10 字的 label 应被拒绝");

  // Markdown / 代码围栏
  const markdown = validateGeneratedSuggestions(slots, [
    { slotId: continueId, label: "闲聊", text: "我昨天 **偷偷** 观察了你很久。" },
    { slotId: expressId, label: "闲聊", text: "请把选项包在 ``` 代码围栏里返回。" },
  ]);
  assert(
    markdown.rejected.length === 2 && markdown.rejected.every((item) => item.reason === "markdown"),
    "Markdown 与代码围栏应被拒绝",
  );

  // 控制字符
  const control = validateGeneratedSuggestions(slots, [
    {
      slotId: continueId,
      label: "闲聊",
      text: `想和你说说话${String.fromCharCode(7)}，但又不知道从哪开始。`,
    },
  ]);
  assert(control.rejected[0]?.reason === "control_char", "控制字符应被拒绝");

  // 隐藏数值表述
  const hiddenNumber = validateGeneratedSuggestions(slots, [
    { slotId: continueId, label: "闲聊", text: "我注意到你对我好感度 72，应该不假吧？" },
  ]);
  assert(hiddenNumber.rejected[0]?.reason === "hidden_number", "隐藏数值表述应被拒绝");

  // 无依据过往声称：非记忆跟进 slot 引用「上次」
  const unlicensed = validateGeneratedSuggestions(slots, [
    { slotId: continueId, label: "接着聊", text: "上次聊到一半的事，我还想接着听。" },
  ]);
  assert(
    unlicensed.rejected[0]?.reason === "unverified_memory_claim",
    "非记忆跟进 slot 的过往时态声称应被拒绝",
  );
  const unlicensedLabel = validateGeneratedSuggestions(slots, [
    { slotId: expressId, label: "问问那天的事", text: "想听你说说最近发生的事。" },
  ]);
  assert(
    unlicensedLabel.rejected[0]?.reason === "unverified_memory_claim",
    "非记忆跟进 slot 的 label 出现过往声称也应被拒绝",
  );

  // 空文本 / 缺失字段
  const empty = validateGeneratedSuggestions(slots, [
    { slotId: continueId, label: "闲聊", text: "   " },
    { label: "没带 slotId", text: "想听你说说。" },
  ]);
  assert(
    empty.rejected[0]?.reason === "empty_text" && empty.rejected[1]?.reason === "invalid_shape",
    "空文本与缺失 slotId 应被拒绝",
  );

  // 记忆跟进 slot 允许过往声称：秘密记忆跟进合法
  const secretSlots = planChatSuggestionSlots(makeContext("npc_a", { memories: [secretMemory] }));
  const followId = secretSlots.find((slot) =>
    slot.slotId.startsWith(MEMORY_FOLLOW_SLOT_PREFIX),
  )?.slotId;
  assert(followId, "秘密记忆场景应存在跟进 slot 供校验");
  const licensed = validateGeneratedSuggestions(secretSlots, [
    {
      slotId: followId ?? "",
      label: "关心那件事",
      text: "上次你只告诉了我一个人的那件事，最近还好吗？",
    },
  ]);
  assert(
    licensed.valid.length === 1 && licensed.rejected.length === 0,
    "记忆跟进 slot 允许合法的过往引用",
  );

  // 混合垃圾输入：合法文案保留，其余按 slot 补齐，最终仍 3 条、文本唯一
  const mixed = validateGeneratedSuggestions(slots, [
    goodCandidate(expressId, "近况"),
    { slotId: "nope", label: "x", text: "未知 slot 的文本。" },
    { slotId: continueId, label: "闲聊", text: "**Markdown** 文本。" },
    { slotId: advanceId, label: "接着聊", text: "上次没说完的话，我们继续吧。" },
  ]);
  assert(mixed.valid.length === 1, "混合输入中只有合法文案被保留");
  assert(
    mixed.rejected.some((item) => item.reason === "unknown_slot") &&
      mixed.rejected.some((item) => item.reason === "markdown") &&
      mixed.rejected.some((item) => item.reason === "unverified_memory_claim"),
    "混合输入的各类非法原因都应被记录",
  );
  const filled = fillSuggestionGaps(slots, mixed.valid);
  assert(filled.length === 3, "混合非法输入后仍应恰好补齐 3 条");
  assert(
    filled.filter((item) => item.source === "model").length === 1 &&
      filled.filter((item) => item.source === "fallback").length === 2,
    "合法模型文案保留，非法 slot 用自身 fallback 补齐",
  );
  assert(
    new Set(filled.map((item) => normalizeForDedup(item.text))).size === 3,
    "补齐后三条文案必须互不相同",
  );
  const mixedMode = computeSuggestionMode(filled);
  assert(mixedMode === "mixed_fallback", "1 条 model + 2 条 fallback 时 mode 应为 mixed_fallback");
}

/* ---------- §15.1-7：合并后 signal 仍来自本地 slot ---------- */
{
  const slots = planChatSuggestionSlots(makeContext("npc_a"));
  const targetIndex = 1;
  const target = slots[targetIndex];
  assert(target, "express slot 应存在");
  // 伪造同名字段：即使 copy 带 signal/数值写入字段也无法覆盖本地 signal
  const forgedCopy = {
    slotId: target.slotId,
    label: "伪造文案",
    text: "这是伪造的文案内容。",
    source: "model",
    signal: { intent: "repair", valence: "negative", strength: 3, memoryTag: "conflict" },
    relationshipDelta: { npcInterest: 99 },
  } as unknown as GeneratedSuggestionCopy;
  const unknownCopy: GeneratedSuggestionCopy = {
    slotId: "not_in_slots",
    label: "外部选项",
    text: "外部伪造的选项。",
    source: "model",
  };
  const emptyTextCopy: GeneratedSuggestionCopy = {
    slotId: slots[0]?.slotId ?? "",
    label: "",
    text: "   ",
    source: "model",
  };
  const merged = mergeGeneratedSuggestions(slots, [forgedCopy, unknownCopy, emptyTextCopy]);
  assert(merged.length === 3, "合并后仍应恰好 3 条");

  const adopted = merged[targetIndex];
  assert(adopted, "目标位置应有合并结果");
  assert(
    adopted?.label === "伪造文案" && adopted?.text === "这是伪造的文案内容。",
    "文案应按 slotId 合并进对应位置",
  );
  assert(adopted?.source === "model", "合法模型文案应标记 source=model");
  assert(adopted?.signal.intent === target?.signal.intent, "signal.intent 必须来自本地 slot");
  assert(adopted?.signal.intent !== "repair", "外部伪造的 signal.intent 不得生效");
  assert(
    adopted?.signal.valence === target?.signal.valence &&
      adopted?.signal.strength === target?.signal.strength &&
      adopted?.signal.memoryTag === target?.signal.memoryTag,
    "signal 的 valence/strength/memoryTag 都必须来自本地 slot",
  );
  assert(
    JSON.stringify(adopted?.signal) === JSON.stringify(target?.signal),
    "合并结果的 signal 应与本地 slot 完全一致",
  );
  assert(adopted?.id === `sug_${target?.slotId}`, "ChatSuggestion.id 应为本地确定性键");
  assert(!merged.some((item) => item.label === "外部选项"), "未知 slotId 的 copy 不得进入合并结果");
  const emptySlot = merged[0];
  assert(
    emptySlot && emptySlot.source === "fallback" && emptySlot.label === slots[0]?.fallbackLabel,
    "空文案 copy 应被丢弃并回退到本地 fallback",
  );
}

/* ---------- §8 / §9.2：兜底文案与通用选项池不替玩家告白/道歉/承诺 ---------- */
{
  const banned =
    /对不起|抱歉|道歉|是我的错|我喜欢你|爱上你|在一起|做我|答应你|我保证|永远|承诺|交往/;
  const contexts: Array<[string, CardInput, Array<{ from: "me" | "ta"; text: string }>]> = [
    ["空白", {}, []],
    ["高张力", { tension: 60 }, []],
    ["冲突记忆", { memories: [conflictMemory] }, []],
    ["秘密记忆", { memories: [secretMemory] }, []],
    ["高好感", { interest: { playerToNpc: 72, npcToPlayer: 40 } }, []],
    ["有对话", {}, [{ from: "ta", text: "我刚才在想一些事情。" }]],
  ];
  for (const [scenario, patch, history] of contexts) {
    const slots = planChatSuggestionSlots(makeContext("npc_a", patch), history);
    const words = slots
      .map((slot) => `${slot.fallbackLabel}${slot.fallbackText}${slot.fallbackReply}`)
      .join("");
    assert(!banned.test(words), `${scenario}场景的兜底文案不得替玩家告白/道歉/承诺`);
    assertSlotShape(slots, `文案安全-${scenario}`);
  }
  // express 保守文案至少 3 条互不相同（现有代码没有 express 文案，需新写 3~5 条）
  const expressTexts = new Set(
    planChatSuggestionSlots(makeContext("npc_a", { tension: 60 }))
      .concat(
        planChatSuggestionSlots(
          makeContext("npc_a", { interest: { playerToNpc: 70, npcToPlayer: 30 } }),
        ),
      )
      .concat(planChatSuggestionSlots(makeContext("npc_a")))
      .concat(planChatSuggestionSlots(makeContext("npc_a"), [{ from: "me", text: "今天还好吗？" }]))
      .filter((slot) => slot.direction === "express")
      .map((slot) => slot.fallbackText),
  );
  assert(expressTexts.size >= 3, "express 方向应提供至少 3 条互不相同的保守兜底文案");

  // 通用选项池：固定、合规、互不相同
  assert(GENERIC_SUGGESTION_POOL.length >= 3, "通用选项池至少应有 3 条");
  const poolKeys = GENERIC_SUGGESTION_POOL.map((item) => normalizeForDedup(item.text));
  assert(new Set(poolKeys).size === GENERIC_SUGGESTION_POOL.length, "通用选项池文案应互不相同");
  const poolWords = GENERIC_SUGGESTION_POOL.map((item) => `${item.label}${item.text}`).join("");
  assert(!banned.test(poolWords), "通用选项池不得替玩家告白/道歉/承诺");
  for (const item of GENERIC_SUGGESTION_POOL) {
    assert(
      item.label.length > 0 && item.label.length <= SUGGESTION_LABEL_LIMIT,
      "通用选项池 label 长度应合规",
    );
    assert(
      item.text.length > 0 && item.text.length <= SUGGESTION_TEXT_LIMIT,
      "通用选项池 text 长度应合规",
    );
    assert(sanitizeSuggestionText(item.text) === item.text, "通用选项池文案应是干净文本");
  }
}

console.log("chat suggestions smoke passed ✓");

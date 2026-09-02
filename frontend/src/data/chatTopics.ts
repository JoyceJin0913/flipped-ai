import type { MemoryTag } from "../core/interactionSignal";
import type { NpcOutputContext } from "../core/outputContext";
import { MEMORY_FOLLOW_SLOT_PREFIX, sanitizeSuggestionText } from "../lib/chatSuggestions";
import type { SuggestionSlot } from "../lib/chatSuggestions";

/**
 * 私聊动态对话选项的确定性 slot 规划器（spec §6）。
 *
 * - `planChatSuggestionSlots(context, recentMessages?)` 从任意合法 NpcOutputContext 返回
 *   恰好三个 direction 互异（continue/express/advance）的 SuggestionSlot；文案兜底与
 *   结算元数据（signal）全部确定性生成，LLM 只为 slot 生成自然文案，无权改动语义。
 * - 记忆跟进 slot 的 slotId 以 `advance_follow_`（MEMORY_FOLLOW_SLOT_PREFIX）开头，
 *   校验器凭此前缀放行「过往经历引用」（spec §9.1；前缀约定见 lib/chatSuggestions.ts）。
 * - 旧式固定话题选择器（getChatTopics / generateChatTopics / StatefulChatTopic 等
 *   @deprecated alias）已随 spec §6.3 调用点全量迁移而移除。
 */

/** 记忆跟进用 slotId 前缀，必须与 lib/chatSuggestions 的约定一致。 */
const followSlotId = (memory: NpcOutputContext["memories"][number]): string =>
  `${MEMORY_FOLLOW_SLOT_PREFIX}${memory.tag}_${memory.id}`;

/** 取对话中 NPC 最近一句话用于 continue 承接。 */
function lastNpcMessageOf(messages: readonly { from: "me" | "ta"; text: string }[]): string | null {
  const message = [...messages].reverse().find((item) => item.from === "ta");
  return message ? message.text : null;
}

/** guidance 里引用对话/记忆文本前先清洗并限长，避免把脏文本带进 prompt。 */
function excerptForGuidance(text: string, maxLength = 120): string {
  const clean = sanitizeSuggestionText(text, maxLength);
  return clean === "" ? "……" : clean;
}

/** continue：初始轮承接 NPC 的固定开场白「（地点）嗯？你怎么过来了。」 */
function continueOpeningSlot(): SuggestionSlot {
  return {
    slotId: "continue_opening",
    direction: "continue",
    intent: "greet",
    guidance:
      "承接开场：NPC 刚问「你怎么过来了」，先回应她的招呼、自然说明来意，再开启今天的第一个话题；可以结合当天或此刻的地点，不要引用记忆、不要追问私事。",
    fallbackLabel: "回应你的招呼",
    fallbackText: "闲着没事，想过来看看你。你呢，刚才在忙什么？",
    fallbackReply: "不忙，正好想找人说说话。",
    signal: { intent: "greet", valence: "neutral", strength: 1, memoryTag: "chat" },
  };
}

/** continue：承接 NPC 刚说的最后一句话；不把记忆跟进放进 continue，避免意图重复。 */
function continueRespondSlot(lastNpcText: string): SuggestionSlot {
  return {
    slotId: "continue_respond",
    direction: "continue",
    intent: "free_chat",
    guidance: `承接 NPC 刚说的最后一句话（「${excerptForGuidance(lastNpcText)}」）：顺着她的话回应或追问，不要急着转移话题；禁止引用记忆、泄露数值或替玩家表态。`,
    fallbackLabel: "接住你刚才的话",
    fallbackText: "嗯，我在听。你刚才说的那些，我也想再听你多说一点。",
    fallbackReply: "……你还愿意听啊。那我接着说了。",
    signal: { intent: "free_chat", valence: "neutral", strength: 1, memoryTag: "chat" },
  };
}

/** express：紧张/冲突状态下的温和表态，不替玩家道歉或指责。 */
function expressTensionSlot(): SuggestionSlot {
  return {
    slotId: "express_feelings",
    direction: "express",
    intent: "self_disclosure",
    guidance:
      "让玩家表达此刻的感受：以「我」开头、第一人称可直接发送的中文；重点是说出自己的真实感受，先不评判对错；不替玩家道歉、不指责对方、不做极端承诺。",
    fallbackLabel: "说说我的感受",
    fallbackText: "我们之间最近的氛围，我想先说说我的感受，也想听听你的想法。",
    fallbackReply: "……好，你说，我在听。",
    signal: { intent: "self_disclosure", valence: "positive", strength: 1, memoryTag: "chat" },
  };
}

/** express：高好感时轻度自我敞开，不替玩家告白。 */
function expressHighInterestSlot(): SuggestionSlot {
  return {
    slotId: "express_open_myself",
    direction: "express",
    intent: "self_disclosure",
    guidance:
      "让玩家表达此刻的感受：以「我」开头、第一人称可直接发送的中文；重点是让对方多了解真实的自己，语气真诚克制；不替玩家告白、承诺或设定性边界。",
    fallbackLabel: "多说一点自己",
    fallbackText: "和你相处这几天，我发现自己愿意多敞开一些，说些真实的想法。",
    fallbackReply: "嗯，我喜欢听你说这些。慢慢来，我等你。",
    signal: { intent: "self_disclosure", valence: "positive", strength: 1, memoryTag: "chat" },
  };
}

/** express：已有对话时，顺着话题说出玩家自己的看法。 */
function expressConversationSlot(): SuggestionSlot {
  return {
    slotId: "express_my_take",
    direction: "express",
    intent: "self_disclosure",
    guidance:
      "让玩家表达此刻的态度：以「我」开头、第一人称可直接发送的中文；顺着刚才的对话说出玩家自己的看法，不替玩家告白、承诺、道歉或替对方做主。",
    fallbackLabel: "想先说说我的想法",
    fallbackText: "刚才你说的，我都记在心里了。我也想先说说自己的看法。",
    fallbackReply: "嗯，我想听的正是这个。你说。",
    signal: { intent: "self_disclosure", valence: "positive", strength: 1, memoryTag: "chat" },
  };
}

/** express：无对话的初始轮，表达此刻的心情状态（保守文案）。 */
function expressFreshSlot(): SuggestionSlot {
  return {
    slotId: "express_current_state",
    direction: "express",
    intent: "self_disclosure",
    guidance:
      "让玩家表达此刻的感受：以「我」开头、第一人称可直接发送的中文；重点是此刻的心情状态，自然克制；不替玩家告白、承诺、道歉或设定性边界。",
    fallbackLabel: "说说我现在的状态",
    fallbackText: "今天的心情有点复杂，不过见到你之后，好像平静了一点。",
    fallbackReply: "……那就好。想说的话，我在这儿听着。",
    signal: { intent: "self_disclosure", valence: "positive", strength: 1, memoryTag: "chat" },
  };
}

/** advance：冲突情境唯一的 repair 选项。 */
function advanceRepairSlot(): SuggestionSlot {
  return {
    slotId: "advance_repair",
    direction: "advance",
    intent: "repair",
    guidance:
      "推进：主动提出把没说开的话聊清楚，愿意倾听、不辩解；本场景只允许这一条 repair 选项，措辞不要与其他选项重复道歉的意味。",
    fallbackLabel: "把没说开的话聊清楚",
    fallbackText: "我感觉我们之间还有些话没说开。如果让你不舒服了，我想认真听你说。",
    fallbackReply: "我确实有点在意。你愿意先来找我，我也愿意把话说清楚。",
    signal: { intent: "repair", valence: "positive", strength: 2, memoryTag: "support" },
  };
}

/** advance：秘密记忆跟进（沿用「关心上次只对你说的事」的分支语义）。 */
function advanceSecretFollowSlot(memory: NpcOutputContext["memories"][number]): SuggestionSlot {
  return {
    slotId: followSlotId(memory),
    direction: "advance",
    intent: "support",
    guidance: `记忆跟进（秘密变体）：NPC 曾私下向玩家说起「${excerptForGuidance(memory.text)}」。自然提起这件事并关心近况，不泄露给第三人语境；这是唯一允许引用该记忆的选项。`,
    fallbackLabel: "关心上次只对你说的事",
    fallbackText: "你上次和我说的那件事，我没有忘。你现在感觉好一点了吗？",
    fallbackReply: "谢谢你还记得。能被认真放在心上，我确实轻松了一点。",
    signal: { intent: "support", valence: "positive", strength: 2, memoryTag: "support" },
  };
}

/** advance：普通记忆跟进（promise/date/support 等非 chat 标签）。 */
function advanceMemoryFollowSlot(memory: NpcOutputContext["memories"][number]): SuggestionSlot {
  const labelByTag: Partial<Record<MemoryTag, string>> = {
    promise: "接着聊聊之前的约定",
    date: "回想一起度过的时刻",
    support: "问问上次之后的心情",
  };
  return {
    slotId: followSlotId(memory),
    direction: "advance",
    intent: "follow_up",
    guidance: `记忆跟进：NPC 与玩家之间可被提起的记忆是「${excerptForGuidance(memory.text)}」。自然提起并询问近况；这是唯一允许引用该记忆的选项。`,
    fallbackLabel: labelByTag[memory.tag] ?? "接着聊聊上次的话题",
    fallbackText: "我还记得我们上次聊过的事。你现在会怎么看？",
    fallbackReply: "我也记得。过了一点时间，我好像能说得更清楚了。",
    signal: { intent: "follow_up", valence: "positive", strength: 1, memoryTag: "chat" },
  };
}

/** advance：高好感时的轻度暧昧试探，只在任一方 interest >= 60 时可用。 */
function advanceRomanticSlot(): SuggestionSlot {
  return {
    slotId: "advance_romantic_probe",
    direction: "advance",
    intent: "romantic_probe",
    guidance:
      "推进：在已有明确好感的前提下做轻度暧昧试探，语气真诚留有余地；不替玩家直接告白，不把关系说得板上钉钉。",
    fallbackLabel: "试探一下彼此的心意",
    fallbackText: "如果明天有一段时间只留给两个人，我希望那个人是你。",
    fallbackReply: "这句话我先记下了。至于我的答案，你可以再靠近一点看看。",
    signal: { intent: "romantic_probe", valence: "positive", strength: 2, memoryTag: "promise" },
  };
}

/** advance：无对话/初始轮的兜底，向更深处了解彼此。 */
function advanceKnowMoreSlot(): SuggestionSlot {
  return {
    slotId: "advance_know_more",
    direction: "advance",
    intent: "get_to_know",
    guidance:
      "推进：在彼此还不太熟时了解对方，问一个真诚、开放的问题；不要引用记忆，也不要试探感情进度。",
    fallbackLabel: "聊聊彼此想了解的事",
    fallbackText: "来小屋之后，有没有什么是你很想让别人了解的？",
    fallbackReply: "有，但可能得慢慢说。你呢？",
    signal: { intent: "get_to_know", valence: "positive", strength: 1, memoryTag: "chat" },
  };
}

/** advance：已有对话时的兜底，让话题向更深处多走一步。 */
function advanceDeeperSlot(): SuggestionSlot {
  return {
    slotId: "advance_go_deeper",
    direction: "advance",
    intent: "get_to_know",
    guidance:
      "推进：顺着刚才的对话自然深入，请对方多说一些关于自己的事；不要引用记忆，也不要试探感情进度。",
    fallbackLabel: "想多了解你一点",
    fallbackText: "刚才聊到的这些，我还想听你多说一点。你愿意继续吗？",
    fallbackReply: "愿意。和你说话的时候，我好像总想多说一些。",
    signal: { intent: "get_to_know", valence: "positive", strength: 1, memoryTag: "chat" },
  };
}

function hasConflictSituation(context: NpcOutputContext): boolean {
  return (
    context.tension >= 35 ||
    context.memories.some((memory) => memory.tag === "conflict" || memory.tag === "rejection")
  );
}

/**
 * 动态对话选项规划器：从任意合法 NpcOutputContext 出发，返回恰好三个
 * direction 互不相同（continue/express/advance）的 SuggestionSlot。
 *
 * 状态优先级（spec §6.2）：
 *   冲突/拒绝记忆或 tension >= 35
 *     > 可跟进的最近非 chat 记忆
 *     > 高好感（任一方 interest >= 60）
 *     > 当前话题（有对话时向更深处走一步）
 *     > NPC 个性基线/通用兜底
 *
 * 记忆跟进只会出现在 advance，且每条非 chat 记忆最多形成一个跟进 slot，
 * 冲突情境至多一个 repair——从根上消除旧式固定话题选择器同时出现
 * 「冲突修复话题与冲突记忆跟进」的历史意图重复问题。
 */
export function planChatSuggestionSlots(
  context: NpcOutputContext,
  recentMessages: readonly { from: "me" | "ta"; text: string }[] = [],
): SuggestionSlot[] {
  const messages = recentMessages.slice(-10);
  const conflictSituation = hasConflictSituation(context);
  const followableMemory =
    [...context.memories].reverse().find((memory) => memory.tag !== "chat") ?? null;
  const highInterest = context.interest.playerToNpc >= 60 || context.interest.npcToPlayer >= 60;
  const playerHasSpoken = messages.some((message) => message.from === "me");
  const npcLastText = lastNpcMessageOf(messages);

  // continue：有对话承接 NPC 最后一句话；无对话承接固定开场白。记忆跟进不进 continue。
  const continueSlot = npcLastText ? continueRespondSlot(npcLastText) : continueOpeningSlot();

  // express：表达玩家此刻的感受/态度，按状态在保守文案里选一条。
  const expressSlot = conflictSituation
    ? expressTensionSlot()
    : highInterest
      ? expressHighInterestSlot()
      : playerHasSpoken
        ? expressConversationSlot()
        : expressFreshSlot();

  // advance：按状态优先级选择推进方向；同方向意图天然不重复。
  let advanceSlot: SuggestionSlot;
  if (conflictSituation) {
    advanceSlot = advanceRepairSlot();
  } else if (followableMemory) {
    advanceSlot =
      followableMemory.tag === "secret"
        ? advanceSecretFollowSlot(followableMemory)
        : advanceMemoryFollowSlot(followableMemory);
  } else if (highInterest) {
    advanceSlot = advanceRomanticSlot();
  } else {
    advanceSlot = playerHasSpoken ? advanceDeeperSlot() : advanceKnowMoreSlot();
  }

  return [continueSlot, expressSlot, advanceSlot];
}

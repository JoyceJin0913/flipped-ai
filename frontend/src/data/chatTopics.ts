import type { InteractionStrength, InteractionValence, MemoryTag } from "../core/interactionSignal";
import type { NpcOutputContext } from "../core/outputContext";
import type { ChatTopic } from "./house";

export interface StatefulChatTopic extends ChatTopic {
  intent: string;
  valence: InteractionValence;
  strength: InteractionStrength;
  memoryTag: MemoryTag;
}

const FALLBACK_TOPICS: readonly StatefulChatTopic[] = [
  {
    key: "greet",
    label: "轻松打个招呼",
    say: "在忙吗？我路过看到你一个人。",
    reply: "不忙，正好想找人说说话。",
    intent: "greet",
    valence: "neutral",
    strength: 1,
    memoryTag: "chat",
  },
  {
    key: "today",
    label: "问问今天的感受",
    say: "今天过得怎么样？感觉你有些话没说出来。",
    reply: "还好，只是想的事情比说出来的多一点。",
    intent: "check_in",
    valence: "positive",
    strength: 1,
    memoryTag: "support",
  },
  {
    key: "know_more",
    label: "聊聊彼此想了解的事",
    say: "来小屋之后，有没有什么是你很想让别人了解的？",
    reply: "有，但可能得慢慢说。你呢？",
    intent: "get_to_know",
    valence: "positive",
    strength: 1,
    memoryTag: "chat",
  },
];

function repairTopic(): StatefulChatTopic {
  return {
    key: "repair",
    label: "把没说开的话聊清楚",
    say: "我感觉我们之间还有些话没说开。如果让你不舒服了，我想认真听你说。",
    reply: "我确实有点在意。你愿意先来找我，我也愿意把话说清楚。",
    intent: "repair",
    valence: "positive",
    strength: 2,
    memoryTag: "support",
  };
}

function memoryFollowUpTopic(context: NpcOutputContext): StatefulChatTopic | null {
  const memory = [...context.memories].reverse().find((note) => note.tag !== "chat");
  if (!memory) return null;

  if (memory.tag === "secret") {
    return {
      key: `follow_secret_${memory.id}`,
      label: "关心上次只对你说的事",
      say: "你上次和我说的那件事，我没有忘。你现在感觉好一点了吗？",
      reply: "谢谢你还记得。能被认真放在心上，我确实轻松了一点。",
      intent: "support",
      valence: "positive",
      strength: 2,
      memoryTag: "support",
    };
  }

  const labelByTag: Partial<Record<MemoryTag, string>> = {
    promise: "接着聊聊之前的约定",
    date: "回想之前一起度过的时刻",
    support: "问问上次之后的心情",
    rejection: "温和确认彼此的边界",
    conflict: "回到上次没有说完的话",
  };
  return {
    key: `follow_${memory.tag}_${memory.id}`,
    label: labelByTag[memory.tag] ?? "接着聊聊上次的话题",
    say: "我还记得我们上次聊过的事。你现在会怎么看？",
    reply: "我也记得。过了一点时间，我好像能说得更清楚了。",
    intent: memory.tag === "conflict" || memory.tag === "rejection" ? "repair" : "follow_up",
    valence: "positive",
    strength: memory.tag === "conflict" || memory.tag === "rejection" ? 2 : 1,
    memoryTag: memory.tag === "conflict" || memory.tag === "rejection" ? "support" : "chat",
  };
}

function flirtTopic(): StatefulChatTopic {
  return {
    key: "gentle_flirt",
    label: "试探一下彼此的心意",
    say: "如果明天有一段时间只留给两个人，我希望那个人是你。",
    reply: "这句话我先记下了。至于我的答案，你可以再靠近一点看看。",
    intent: "romantic_probe",
    valence: "positive",
    strength: 2,
    memoryTag: "promise",
  };
}

/** Deterministic three-topic selector. It never calls the model or mutates state. */
export function getChatTopics(context: NpcOutputContext): StatefulChatTopic[] {
  const topics: StatefulChatTopic[] = [];
  const hasConflictMemory = context.memories.some(
    (memory) => memory.tag === "conflict" || memory.tag === "rejection",
  );

  if (context.tension >= 35 || hasConflictMemory) topics.push(repairTopic());

  const followUp = memoryFollowUpTopic(context);
  if (followUp) topics.push(followUp);

  if (context.interest.playerToNpc >= 60 || context.interest.npcToPlayer >= 60) {
    topics.push(flirtTopic());
  }

  for (const fallback of FALLBACK_TOPICS) {
    if (topics.length === 3) break;
    if (!topics.some((topic) => topic.key === fallback.key)) topics.push({ ...fallback });
  }

  return topics.slice(0, 3);
}

export const generateChatTopics = getChatTopics;

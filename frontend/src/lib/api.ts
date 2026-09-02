import type {
  GeneratedSuggestionCopy,
  SuggestionMode,
  SuggestionSlotWire,
} from "./chatSuggestions";

export type ApiScene = {
  id: string;
  place: string;
  time: string;
  title: string;
  image: string;
  ambience: string;
  presentCharacters: string[];
  dialogue: { who: string; line: string }[];
  question: string;
  hint: string;
  choices: { key: "A" | "B" | "C"; label: string }[];
  affectableRelationships: string[];
};

export type Effect = { name: string; delta: number };

export type HistoryEntry = { time: string; place: string; summary: string };

export type WorldState = {
  relationships: Record<string, number>;
  recentHistory: HistoryEntry[];
};

export type ChoiceResponse = {
  resultText: string;
  effects: Effect[];
  usage: { totalTokens: number; promptTokens: number; completionTokens: number };
};

export async function fetchScene(id: string): Promise<ApiScene> {
  const res = await fetch(`/api/scenes/${id}`);
  if (!res.ok) throw new Error(`fetchScene ${id}: ${res.status}`);
  return res.json();
}

export async function postChoice(input: {
  sceneId: string;
  choiceKey: "A" | "B" | "C";
  worldState: WorldState;
}): Promise<ChoiceResponse> {
  const res = await fetch(`/api/choice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `postChoice ${res.status}`);
  return data;
}

// 私聊动态对话选项（spec §7）客户端契约。
// 纯类型/常量均从 lib/chatSuggestions 导入（纯模块，客户端可安全引用，零 server-only 依赖）。
export type ChatUsage = {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
};

export type ChatMemberInput = {
  id?: string;
  name: string;
  where: string;
  gender: string;
};

export type ChatHistoryEntry = { from: "me" | "ta"; text: string };

/** POST /api/chat 动态选项请求（spec §7.1）：slots 为三个互异的文案规划 slot，服务端只收这些字段。 */
export interface ChatRequest {
  member: ChatMemberInput;
  history: ChatHistoryEntry[];
  /** 缺省 = 开场请求（只生成三个选项，不生成 NPC 回复）。 */
  userMessage?: string;
  context?: { day?: number; playerName?: string; npcContext?: string };
  slots: SuggestionSlotWire[];
  /** 仅客户端使用的取消信号（AbortController）：不随请求序列化，postChat 实现中已解构剥离。 */
  signal?: AbortSignal;
}

/** POST /api/chat 动态选项响应（spec §7.3）：mode 仅用于开发日志，不向玩家展示。 */
export interface ChatResponse {
  reply?: string;
  suggestions: GeneratedSuggestionCopy[];
  generationId: string;
  mode: SuggestionMode;
  usage?: ChatUsage;
}

/**
 * POST /api/chat 动态选项调用（spec §7.1/§7.3）：slots 必传三个互异文案规划 slot，
 * userMessage 缺省即开场请求（只生成三个选项）；signal 为 AbortSignal，仅客户端用于
 * 取消过期请求，不随请求序列化（下方解构剥离）。
 */
export async function postChat(input: ChatRequest): Promise<ChatResponse> {
  const { signal, ...payload } = input;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `postChat ${res.status}`);
  return data as ChatResponse;
}

export async function postNarration(input: {
  day: number;
  eventTitle: string;
  location: string;
  context: string;
  choice: string;
  fallback: string;
}): Promise<{ resultText: string }> {
  const res = await fetch("/api/narrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `postNarration ${res.status}`);
  return data;
}

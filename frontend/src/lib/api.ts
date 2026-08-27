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

export async function postChat(input: {
  member: { id?: string; name: string; where: string; gender: string };
  history: Array<{ from: "me" | "ta"; text: string }>;
  userMessage: string;
  context?: { day?: number; playerName?: string; npcContext?: string };
}): Promise<{ reply: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `postChat ${res.status}`);
  return data;
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

import type { InteractionSignal, MemoryTag } from "./interactionSignal";

export interface MemoryNote {
  id: string;
  day: number;
  source: "public_event" | "private_chat";
  tag: MemoryTag;
  text: string;
  visibility: "private" | "public";
  createdAt: number;
}

export interface NpcStateCard {
  npcId: string;
  interest: {
    playerToNpc: number;
    npcToPlayer: number;
  };
  trust: number;
  tension: number;
  interactionCount: number;
  memories: MemoryNote[];
}

export interface LegacyRelationship {
  toNpc: number;
  fromNpc: number;
}

export function clampRelationshipValue(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function createNpcStateCard(
  npcId: string,
  relationship: LegacyRelationship = { toNpc: 30, fromNpc: 30 },
  interactionCount = 0,
): NpcStateCard {
  return {
    npcId,
    interest: {
      playerToNpc: clampRelationshipValue(relationship.toNpc),
      npcToPlayer: clampRelationshipValue(relationship.fromNpc),
    },
    trust: 30,
    tension: 0,
    interactionCount: Math.max(0, Math.floor(interactionCount)),
    memories: [],
  };
}

export function deriveIntimacy(card: Pick<NpcStateCard, "interactionCount">): number {
  return Math.min(100, Math.max(0, Math.floor(card.interactionCount)) * 10);
}

export function appendMemory(memories: readonly MemoryNote[], memory: MemoryNote): MemoryNote[] {
  const duplicate = memories.some(
    (item) =>
      item.id === memory.id ||
      (item.day === memory.day &&
        item.source === memory.source &&
        item.tag === memory.tag &&
        item.text === memory.text),
  );
  if (duplicate) return [...memories];
  return [...memories, memory].sort((a, b) => a.createdAt - b.createdAt).slice(-5);
}

const PRIVATE_CHAT_DELTAS: Record<
  InteractionSignal["valence"],
  { npcInterest: number; trust: number; tension: number }
> = {
  positive: { npcInterest: 2, trust: 2, tension: -1 },
  negative: { npcInterest: -2, trust: -2, tension: 2 },
  mixed: { npcInterest: 0, trust: 1, tension: 1 },
  neutral: { npcInterest: 0, trust: 0, tension: 0 },
};

/** Private chat magnitude is deterministic; the model/client never supplies deltas. */
export function relationshipDeltaForSignal(signal: InteractionSignal) {
  if (signal.source === "public_event") return signal.relationshipDelta ?? {};
  const base = PRIVATE_CHAT_DELTAS[signal.valence];
  return {
    npcInterest: base.npcInterest * signal.strength,
    trust: base.trust * signal.strength,
    tension: base.tension * signal.strength,
  };
}

export function applySignalToNpcState(
  card: NpcStateCard,
  signal: InteractionSignal,
  createdAt: number,
): NpcStateCard {
  const delta = relationshipDeltaForSignal(signal);
  const memory = signal.memory
    ? {
        id: `${signal.id}:memory`,
        day: signal.day,
        source: signal.source,
        tag: signal.memory.tag,
        text: signal.memory.text,
        visibility: signal.memory.visibility,
        createdAt,
      }
    : null;
  return {
    ...card,
    interest: {
      playerToNpc: clampRelationshipValue(card.interest.playerToNpc + (delta.playerInterest ?? 0)),
      npcToPlayer: clampRelationshipValue(card.interest.npcToPlayer + (delta.npcInterest ?? 0)),
    },
    trust: clampRelationshipValue(card.trust + (delta.trust ?? 0)),
    tension: clampRelationshipValue(card.tension + (delta.tension ?? 0)),
    interactionCount: card.interactionCount + (signal.strength > 0 ? 1 : 0),
    memories: memory ? appendMemory(card.memories, memory) : card.memories,
  };
}

export function projectRelationships(
  cards: Record<string, NpcStateCard>,
): Record<string, LegacyRelationship> {
  return Object.fromEntries(
    Object.entries(cards).map(([npcId, card]) => [
      npcId,
      { toNpc: card.interest.playerToNpc, fromNpc: card.interest.npcToPlayer },
    ]),
  );
}

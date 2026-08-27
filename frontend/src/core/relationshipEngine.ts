import type { MemoryTag } from "./interactionSignal";
import type { NpcOutputContext } from "./outputContext";

export type RelationshipMetric =
  "player_interest" | "npc_interest" | "trust" | "tension" | "intimacy";

export type DerivedRole = {
  npcId: string;
  score: number;
  reasons: string[];
};

export interface RelationshipRoles {
  primary: DerivedRole | null;
  mutual: DerivedRole | null;
  trusted: DerivedRole | null;
  inviters: DerivedRole[];
  hurtNpc: DerivedRole | null;
  unfinished: DerivedRole | null;
}

/**
 * Event-cast score. The weights are deliberately small and inspectable: soft
 * memory can break a close race, but cannot outweigh a substantially stronger
 * relationship. Ties are resolved by the caller's stable npcIds order.
 */
export function eventCastScore(context: NpcOutputContext): number {
  const recentMemoryCount = context.memories.filter(
    (memory) => context.day - memory.day <= 2,
  ).length;
  return (
    context.interest.playerToNpc * 0.45 +
    context.interest.npcToPlayer * 0.25 +
    context.trust * 0.15 +
    context.intimacy * 0.1 -
    context.tension * 0.05 +
    Math.min(5, recentMemoryCount)
  );
}

export function rankEventCast(
  npcIds: readonly string[],
  contexts: Readonly<Record<string, NpcOutputContext>>,
): string[] {
  const stableIndex = new Map(npcIds.map((npcId, index) => [npcId, index]));
  return [...npcIds].sort((a, b) => {
    const aContext = contexts[a];
    const bContext = contexts[b];
    const scoreDelta =
      (bContext ? eventCastScore(bContext) : Number.NEGATIVE_INFINITY) -
      (aContext ? eventCastScore(aContext) : Number.NEGATIVE_INFINITY);
    if (scoreDelta !== 0) return scoreDelta;
    return (stableIndex.get(a) ?? 0) - (stableIndex.get(b) ?? 0);
  });
}

export function readRelationshipMetric(
  context: NpcOutputContext,
  metric: RelationshipMetric,
): number {
  switch (metric) {
    case "player_interest":
      return context.interest.playerToNpc;
    case "npc_interest":
      return context.interest.npcToPlayer;
    case "trust":
      return context.trust;
    case "tension":
      return context.tension;
    case "intimacy":
      return context.intimacy;
  }
}

export function hasMemoryTag(context: NpcOutputContext, tag: MemoryTag): boolean {
  return context.memories.some((memory) => memory.tag === tag);
}

function rankedRole(
  npcIds: readonly string[],
  contexts: Readonly<Record<string, NpcOutputContext>>,
  score: (context: NpcOutputContext) => number | null,
  reasons: (context: NpcOutputContext) => string[],
): DerivedRole[] {
  const stableIndex = new Map(npcIds.map((npcId, index) => [npcId, index]));
  return npcIds
    .flatMap((npcId) => {
      const context = contexts[npcId];
      if (!context) return [];
      const value = score(context);
      return value === null ? [] : [{ npcId, score: value, reasons: reasons(context) }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (stableIndex.get(a.npcId) ?? Number.MAX_SAFE_INTEGER) -
          (stableIndex.get(b.npcId) ?? Number.MAX_SAFE_INTEGER),
    );
}

/** Derive narrative roles without persisting a second source of truth. */
export function deriveRelationshipRoles(
  npcIds: readonly string[],
  contexts: Readonly<Record<string, NpcOutputContext>>,
): RelationshipRoles {
  const primary =
    rankedRole(
      npcIds,
      contexts,
      (context) => eventCastScore(context),
      () => ["玩家倾向、对方兴趣、信任与近期互动的综合关系最强"],
    )[0] ?? null;

  const mutual =
    rankedRole(
      npcIds,
      contexts,
      (context) =>
        context.interest.playerToNpc >= 50 && context.interest.npcToPlayer >= 50
          ? Math.min(context.interest.playerToNpc, context.interest.npcToPlayer) * 0.6 +
            context.trust * 0.25 +
            context.intimacy * 0.15
          : null,
      () => ["双方兴趣均达到门槛"],
    )[0] ?? null;

  const trusted =
    rankedRole(
      npcIds,
      contexts,
      (context) => (context.trust >= 55 ? context.trust * 0.65 + context.intimacy * 0.35 : null),
      () => ["信任达到门槛"],
    )[0] ?? null;

  const inviters = rankedRole(
    npcIds,
    contexts,
    (context) => {
      if (context.interest.npcToPlayer < 55 || context.interest.playerToNpc < 40) return null;
      const recentPositive = context.memories.some(
        (memory) =>
          context.day - memory.day <= 2 && ["support", "promise", "date"].includes(memory.tag),
      )
        ? 100
        : 0;
      return (
        context.interest.npcToPlayer * 0.45 +
        context.intimacy * 0.2 +
        context.trust * 0.15 +
        recentPositive * 0.2
      );
    },
    () => ["双向兴趣达到邀请门槛"],
  ).slice(0, 2);

  const hurtNpc =
    rankedRole(
      npcIds,
      contexts,
      (context) =>
        context.tension >= 35 &&
        context.memories.some((memory) => memory.tag === "conflict" || memory.tag === "rejection")
          ? context.tension * 0.55 + context.interest.npcToPlayer * 0.3 + context.intimacy * 0.15
          : null,
      () => ["存在冲突或拒绝记忆，且关系张力达到门槛"],
    )[0] ?? null;

  const unfinished =
    rankedRole(
      npcIds,
      contexts,
      (context) =>
        context.tension >= 25 &&
        context.memories.some((memory) => ["conflict", "rejection", "promise"].includes(memory.tag))
          ? context.tension * 0.5 + context.intimacy * 0.25 + context.interest.playerToNpc * 0.25
          : null,
      () => ["仍有承诺、冲突或拒绝留下的未完成线索"],
    )[0] ?? null;

  return { primary, mutual, trusted, inviters, hurtNpc, unfinished };
}

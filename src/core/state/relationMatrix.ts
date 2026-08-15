/**
 * NPC↔NPC 关系矩阵管理
 *
 * 8×8 关系表：affinity（好感）/ hostility（敌意）/ rivalry（竞争）
 * 从 MBTI 互补 + 同性竞争推导初始状态，随事件演化
 */

import type { RelationMatrix, NpcRelation, WorldEvent } from "./worldTypes";
import type { NPC, MBTI } from "../types";
import { getNpcById } from "../npcLibrary";

/** MBTI 互补度计算（返回 -5 ~ +5 的偏移） */
function computeMbtiCompatibility(a: MBTI, b: MBTI): number {
  // 同类型 → 中性
  if (a === b) return 0;
  // 完全互补对（E↔I, N↔S, T↔F, J↔P 全反）→ +5
  const isOpposite = (c1: string, c2: string) => c1 !== c2;
  const ops = [
    isOpposite(a[0]!, b[0]!),
    isOpposite(a[1]!, b[1]!),
    isOpposite(a[2]!, b[2]!),
    isOpposite(a[3]!, b[3]!),
  ].filter(Boolean).length;
  if (ops === 4) return 5;
  if (ops === 3) return 3;
  if (ops === 2) return 1;
  if (ops === 1) return -1;
  return 0; // ops === 0 不会到这里因为 a !== b
}

/** clamp 工具 */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** 初始化 NPC↔NPC 关系矩阵 */
export function initRelationMatrix(npcIds: string[]): RelationMatrix {
  const matrix: RelationMatrix = {};

  for (const from of npcIds) {
    matrix[from] = {};
    for (const to of npcIds) {
      if (from === to) continue;

      const fromNpc = getNpcById(from);
      const toNpc = getNpcById(to);

      let affinity = 50; // 初始中性
      let rivalry = 0;

      if (fromNpc && toNpc) {
        // MBTI 互补 → affinity +
        const mbtiBonus = computeMbtiCompatibility(fromNpc.mbti, toNpc.mbti);
        affinity += mbtiBonus * 0.5; // NPC-NPC 系数比玩家弱

        // 同性竞争者 → rivalry +
        if (fromNpc.gender === toNpc.gender) {
          rivalry += 10;
        }

        // traits 重叠 → affinity +
        const commonTraits = fromNpc.traits.filter((t) =>
          toNpc.traits.includes(t)
        );
        affinity += commonTraits.length * 2;

        // redFlags 命中对方 traits → hostility +
        const flagHits = fromNpc.redFlags.filter((r) =>
          toNpc.traits.some((t) => r.includes(t) || t.includes(r))
        );
        // hostility 初始为 0，有 flag 命中才上升
      }

      matrix[from]![to] = {
        from,
        to,
        affinity: clamp(affinity, 0, 100),
        hostility: 0,
        rivalry: clamp(rivalry, 0, 100),
        lastInteractionDay: 0,
        interactionCount: 0,
        events: [],
      };
    }
  }

  return matrix;
}

/** 演化规则：事件后更新关系 */
export function evolveRelation(
  matrix: RelationMatrix,
  event: WorldEvent
): RelationMatrix {
  // 深拷贝
  const newMatrix: RelationMatrix = JSON.parse(JSON.stringify(matrix));
  const { participants, type, intentTag } = event;

  // 1. 共同参与公共事件 → 互相 affinity +
  if (type === "public" && participants.length >= 2) {
    for (let i = 0; i < participants.length; i++) {
      for (let j = 0; j < participants.length; j++) {
        if (i === j) continue;
        const from = participants[i]!;
        const to = participants[j]!;
        if (newMatrix[from]?.[to]) {
          newMatrix[from]![to]!.affinity = Math.min(
            100,
            newMatrix[from]![to]!.affinity + 1
          );
          newMatrix[from]![to]!.interactionCount++;
          newMatrix[from]![to]!.lastInteractionDay = event.day;
          if (!newMatrix[from]![to]!.events.includes(event.id)) {
            newMatrix[from]![to]!.events.push(event.id);
          }
        }
      }
    }
  }

  // 2. 竞争同一玩家 → rivalry +
  if (intentTag === "advance" || intentTag === "tease") {
    const npcs = participants.filter((p) => p !== "player");
    for (let i = 0; i < npcs.length; i++) {
      for (let j = 0; j < npcs.length; j++) {
        if (i === j) continue;
        const a = npcs[i]!;
        const b = npcs[j]!;
        if (newMatrix[a]?.[b]) {
          newMatrix[a]![b]!.rivalry = Math.min(
            100,
            newMatrix[a]![b]!.rivalry + 3
          );
        }
      }
    }
  }

  // 3. 冲突事件 → hostility +
  if (intentTag === "defend" || intentTag === "tease") {
    const npcs = participants.filter((p) => p !== "player");
    if (npcs.length >= 2) {
      // 假设前两位有冲突
      const a = npcs[0]!;
      const b = npcs[1]!;
      if (newMatrix[a]?.[b]) {
        newMatrix[a]![b]!.hostility = Math.min(
          100,
          newMatrix[a]![b]!.hostility + 2
        );
      }
      if (newMatrix[b]?.[a]) {
        newMatrix[b]![a]!.hostility = Math.min(
          100,
          newMatrix[b]![a]!.hostility + 2
        );
      }
    }
  }

  return newMatrix;
}

/** 查询：获取 A 对 B 的态度 */
export function getAttitude(
  matrix: RelationMatrix,
  from: string,
  to: string
): { affinity: number; hostility: number; rivalry: number } {
  const rel = matrix[from]?.[to];
  if (!rel) return { affinity: 50, hostility: 0, rivalry: 0 };
  return {
    affinity: rel.affinity,
    hostility: rel.hostility,
    rivalry: rel.rivalry,
  };
}

/** 获取某 NPC 对所有其他 NPC 的关系摘要 */
export function getRelationSummary(
  matrix: RelationMatrix,
  npcId: string
): Array<{ npcId: string; affinity: number; hostility: number; rivalry: number }> {
  const row = matrix[npcId];
  if (!row) return [];
  return Object.values(row).map((r) => ({
    npcId: r.to,
    affinity: r.affinity,
    hostility: r.hostility,
    rivalry: r.rivalry,
  }));
}

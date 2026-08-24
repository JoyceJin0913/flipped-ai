/**
 * worldFacts 操作工具（移植版）
 *
 * 从 src/core/state/worldFacts.ts 移植。
 * WorldFactWrite 原定义在 src/core/director/beatTypes.ts:58-65，
 * 本移植版不引入 director 层，改为内联定义（结构逐字段一致）。
 *
 * §2.4 factKey 跨天引用的唯一操作入口。
 * 所有事实写入都通过这里，保证幂等性和结构一致性。
 */

import type { WorldFacts, WorldFact } from "./worldTypes";

// ============================================================
// 事实写入指令（原定义在 director/beatTypes.ts，移植时内联）
// ============================================================

/** 事实写入指令（factKey 跨天引用，§2.4.4） */
export interface WorldFactWrite {
  /** 唯一事实键，如 "day1_first_speaker" */
  key: string;
  /** 事实值描述 */
  value: string;
  /** 是否标记为已确认（默认 true） */
  confirmed?: boolean;
}

// ============================================================
// 操作函数
// ============================================================

/** 创建空事实表 */
export function createEmptyFacts(): WorldFacts {
  return {};
}

/** 写入/更新一条事实（幂等，重复写同 key 覆盖 value） */
export function writeFact(
  facts: WorldFacts,
  write: WorldFactWrite,
  day: number,
  beatId: string,
): WorldFacts {
  const fact: WorldFact = {
    key: write.key,
    day,
    beatId,
    value: write.value,
    confirmed: write.confirmed ?? true,
  };
  return { ...facts, [write.key]: fact };
}

/** 批量写入 */
export function writeFacts(
  facts: WorldFacts,
  writes: WorldFactWrite[],
  day: number,
  beatId: string,
): WorldFacts {
  return writes.reduce((acc, w) => writeFact(acc, w, day, beatId), facts);
}

/** 读取事实值（不存在返回 undefined） */
export function readFact(facts: WorldFacts, key: string): string | undefined {
  return facts[key]?.value;
}

/** 某事实是否已确认 */
export function isFactConfirmed(facts: WorldFacts, key: string): boolean {
  return facts[key]?.confirmed ?? false;
}

/** 某事实是否存在 */
export function hasFact(facts: WorldFacts, key: string): boolean {
  return key in facts;
}

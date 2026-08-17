/**
 * 七日公共事件 —— 数据汇总与开发期校验（T5 产出）
 *
 * 只 import 不修改 day1~day7 与 types.ts。提供：
 *   - ALL_DAYS：按 day 升序的 7 天事件包
 *   - DAY_EVENTS：day → DaySpec
 *   - getEventById / getDay
 *   - validateEventData()：开发期常量校验（21 个事件 id 唯一、每天恰 3 个）
 *     —— 模块加载时自动跑一遍（buildOptions/渲染前的最后防线）。
 */

import type { DayNumber, DaySpec, EventId, EventSpec } from "./types";
import { ALL_EVENT_IDS } from "./types";
import { day1 } from "./day1";
import { day2 } from "./day2";
import { day3 } from "./day3";
import { day4 } from "./day4";
import { day5 } from "./day5";
import { day6 } from "./day6";
import { day7 } from "./day7";

/** 按 day 升序的 7 天事件包 */
export const ALL_DAYS: DaySpec[] = [day1, day2, day3, day4, day5, day6, day7];

/** day → DaySpec 索引 */
export const DAY_EVENTS: Record<DayNumber, DaySpec> = {
  1: day1,
  2: day2,
  3: day3,
  4: day4,
  5: day5,
  6: day6,
  7: day7,
};

/** 全部 21 个事件（按播放顺序拼接） */
export const ALL_EVENTS: EventSpec[] = ALL_DAYS.flatMap((d) => d.events);

const EVENT_INDEX: Map<string, EventSpec> = new Map(ALL_EVENTS.map((e) => [e.id, e]));

/** 按事件 id 取事件（未知 id 返回 undefined） */
export function getEventById(id: string): EventSpec | undefined {
  return EVENT_INDEX.get(id);
}

/** 按天取事件包（非法天返回 undefined） */
export function getDay(day: number): DaySpec | undefined {
  return DAY_EVENTS[day as DayNumber];
}

// ============================================================
// 开发期常量校验（import 时自动执行一次）
// ============================================================

/**
 * 校验数据常量一致性：
 *  - 21 个 ALL_EVENT_IDS 每个在数据里恰好出现一次
 *  - 每天恰好 3 个事件、事件 id 无重复
 *  - 每天事件的 day 字段与包一致
 * 抛错则说明 T3/T4 数据与契约不同步，应停止后续使用。
 */
export function validateEventData(): void {
  const seen = new Set<string>();
  for (const d of ALL_DAYS) {
    if (d.events.length !== 3) {
      throw new Error(`validateEventData：day${d.day} 事件数=${d.events.length}，应为 3`);
    }
    for (const e of d.events) {
      if (e.day !== d.day) {
        throw new Error(
          `validateEventData：事件 ${e.id} 的 day=${e.day} 与所属包 day${d.day} 不一致`,
        );
      }
      if (seen.has(e.id)) {
        throw new Error(`validateEventData：事件 id 重复：${e.id}`);
      }
      seen.add(e.id);
    }
  }

  if (seen.size !== ALL_EVENT_IDS.length) {
    const extra = [...seen].filter((id) => !ALL_EVENT_IDS.includes(id as EventId));
    const missing = ALL_EVENT_IDS.filter((id) => !seen.has(id));
    throw new Error(
      `validateEventData：id 数量不匹配（数据=${seen.size} 契约=${ALL_EVENT_IDS.length}）` +
        (extra.length > 0 ? ` 多余=${extra.join(",")}` : "") +
        (missing.length > 0 ? ` 缺失=${missing.join(",")}` : ""),
    );
  }
  for (const id of ALL_EVENT_IDS) {
    if (!seen.has(id)) {
      throw new Error(`validateEventData：契约 id 未出现在数据中：${id}`);
    }
  }
}

// import 时即校验（开发期防线；T6 接线前就能暴露数据问题）
validateEventData();

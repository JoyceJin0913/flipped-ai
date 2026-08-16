/**
 * 事件日志管理
 *
 * 核心机制：append-only + audience 过滤（信息隔离）
 */

import type { WorldEventLog, WorldEvent } from "./worldTypes";

/** 追加事件（append-only，不修改原日志） */
export function appendEvent(
  log: WorldEventLog,
  event: WorldEvent
): WorldEventLog {
  return {
    events: [...log.events, event],
  };
}

/** 批量追加 */
export function appendEvents(
  log: WorldEventLog,
  events: WorldEvent[]
): WorldEventLog {
  return {
    events: [...log.events, ...events],
  };
}

/** 按 audience 过滤可见事件（信息隔离核心） */
export function filterByAudience(
  log: WorldEventLog,
  npcId: string
): WorldEventLog {
  return {
    events: log.events.filter(
      (e) => e.audience.includes("all") || e.audience.includes(npcId)
    ),
  };
}

/** 获取最近 N 条事件 */
export function getRecentEvents(
  log: WorldEventLog,
  count: number
): WorldEvent[] {
  return log.events.slice(-count);
}

/** 获取某天的事件 */
export function getEventsByDay(
  log: WorldEventLog,
  day: number
): WorldEvent[] {
  return log.events.filter((e) => e.day === day);
}

/** 获取涉及某 NPC 的事件 */
export function getEventsInvolvingNpc(
  log: WorldEventLog,
  npcId: string
): WorldEvent[] {
  return log.events.filter(
    (e) => e.participants.includes(npcId) || e.audience.includes(npcId)
  );
}

/** 创建公共事件（所有人可见） */
export function createPublicEvent(
  id: string,
  day: number,
  act: WorldEvent["act"],
  timestamp: string,
  description: string,
  participants: string[],
  extra?: Partial<WorldEvent>
): WorldEvent {
  return {
    id,
    day,
    act,
    timestamp,
    type: "public",
    description,
    participants,
    audience: ["all"],
    ...extra,
  };
}

/** 创建私聊事件（仅参与者可见） */
export function createPrivateEvent(
  id: string,
  day: number,
  act: WorldEvent["act"],
  timestamp: string,
  description: string,
  participants: string[],
  extra?: Partial<WorldEvent>
): WorldEvent {
  return {
    id,
    day,
    act,
    timestamp,
    type: "private",
    description,
    participants,
    audience: [...participants],
    ...extra,
  };
}

/** 创建内部事件（仅目标可见） */
export function createInternalEvent(
  id: string,
  day: number,
  act: WorldEvent["act"],
  timestamp: string,
  description: string,
  targetNpcId: string,
  extra?: Partial<WorldEvent>
): WorldEvent {
  return {
    id,
    day,
    act,
    timestamp,
    type: "internal",
    description,
    participants: [targetNpcId],
    audience: [targetNpcId],
    ...extra,
  };
}

/** 创建空日志 */
export function createEmptyLog(): WorldEventLog {
  return { events: [] };
}

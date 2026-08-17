import { useState } from "react";
import type { Effect, HistoryEntry } from "@/lib/api";

const INITIAL_RELATIONSHIPS: Record<string, number> = {
  "林一 × 温宁 心动值": 72,
  "林一 × 许佳 心动值": 58,
  "林一 × 苏杳 心动值": 34,
  "林一 × 沈知 信任度": 40,
  "温宁 × 沈知 信任度": 55,
  紧张感: 0,
  信任度: 50,
  悬念值: 0,
  意外度: 0,
  林一的信息差: 0,
};

export function useHouseState() {
  const [relationships, setRelationships] = useState<Record<string, number>>(() => ({
    ...INITIAL_RELATIONSHIPS,
  }));
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const applyEffects = (effects: Effect[]) => {
    setRelationships((prev) => {
      const next = { ...prev };
      for (const { name, delta } of effects) {
        next[name] = (next[name] ?? 0) + delta;
      }
      return next;
    });
  };

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((prev) => [...prev.slice(-2), entry]);
  };

  return { relationships, history, applyEffects, pushHistory };
}

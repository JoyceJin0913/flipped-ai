import { describe, it, expect } from "vitest";
import { buildChoicePrompt } from "./choice-judge";
import type { Scene, WorldState } from "../../scenes/types";

const scene: Scene = {
  id: "kitchen-1",
  place: "厨房",
  time: "21:13",
  title: "test",
  image: "kitchen",
  ambience: "深夜厨房",
  presentCharacters: ["温宁", "林一"],
  dialogue: [{ who: "林一", line: "你还好吗？" }],
  question: "你觉得温宁为什么这么回避？",
  hint: "会影响后续",
  choices: [
    { key: "A", label: "她在试探" },
    { key: "B", label: "她没想清楚" },
    { key: "C", label: "她不想说" },
  ],
  affectableRelationships: ["林一 × 温宁 心动值", "紧张感"],
};

const worldState: WorldState = {
  relationships: { "林一 × 温宁 心动值": 72, "紧张感": 0 },
  recentHistory: [{ time: "20:37", place: "客厅", summary: "选了 B" }],
};

describe("buildChoicePrompt", () => {
  it("includes scene ambience", () => {
    const { user } = buildChoicePrompt(scene, "A", worldState);
    expect(user).toContain("深夜厨房");
  });
  it("includes chosen choice label", () => {
    const { user } = buildChoicePrompt(scene, "A", worldState);
    expect(user).toContain("她在试探");
  });
  it("includes relationships as key: value", () => {
    const { user } = buildChoicePrompt(scene, "A", worldState);
    expect(user).toContain("林一 × 温宁 心动值: 72");
  });
  it("includes affectable relationships", () => {
    const { user } = buildChoicePrompt(scene, "A", worldState);
    expect(user).toContain("紧张感");
  });
  it("handles empty history", () => {
    const { user } = buildChoicePrompt(scene, "A", { ...worldState, recentHistory: [] });
    expect(user).toContain("这是玩家第一件事");
  });
  it("has JSON output requirement in system prompt", () => {
    const { system } = buildChoicePrompt(scene, "A", worldState);
    expect(system).toContain("JSON");
  });
});

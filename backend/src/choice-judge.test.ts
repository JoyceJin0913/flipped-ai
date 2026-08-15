import { describe, it, expect } from "vitest";
import { sanitizeChoiceOutput } from "./choice-judge";

describe("sanitizeChoiceOutput", () => {
  it("keeps valid effects", () => {
    const out = sanitizeChoiceOutput({
      resultText: "温宁把碗放回水槽，站着没动。".repeat(1),
      effects: [
        { name: "林一 × 温宁 心动值", delta: 6 },
        { name: "紧张感", delta: 3 },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.effects).toHaveLength(2);
    }
  });

  it("drops effects with unknown name", () => {
    const out = sanitizeChoiceOutput({
      resultText: "温宁把碗放回水槽，站着没动。",
      effects: [
        { name: "林一 × 温宁 心动值", delta: 6 },
        { name: "不存在的关系", delta: 5 },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.effects).toHaveLength(1);
      expect(out.value.effects[0]!.name).toBe("林一 × 温宁 心动值");
    }
  });

  it("clamps delta to [-10, 10]", () => {
    const out = sanitizeChoiceOutput({
      resultText: "温宁把碗放回水槽，站着没动。",
      effects: [{ name: "紧张感", delta: 99 }],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.effects[0]!.delta).toBe(10);
    }
  });

  it("truncates effects to 5 entries", () => {
    const out = sanitizeChoiceOutput({
      resultText: "温宁把碗放回水槽，站着没动。",
      effects: [
        { name: "林一 × 温宁 心动值", delta: 1 },
        { name: "紧张感", delta: 1 },
        { name: "信任度", delta: 1 },
        { name: "悬念值", delta: 1 },
        { name: "意外度", delta: 1 },
        { name: "林一的信息差", delta: 1 },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.effects).toHaveLength(5);
    }
  });

  it("rejects empty effects after filtering", () => {
    const out = sanitizeChoiceOutput({
      resultText: "温宁把碗放回水槽。",
      effects: [{ name: "不存在", delta: 5 }],
    });
    expect(out.ok).toBe(false);
  });

  it("rejects resultText too short", () => {
    const out = sanitizeChoiceOutput({
      resultText: "好。",
      effects: [{ name: "紧张感", delta: 3 }],
    });
    expect(out.ok).toBe(false);
  });

  it("rejects resultText too long", () => {
    const out = sanitizeChoiceOutput({
      resultText: "a".repeat(501),
      effects: [{ name: "紧张感", delta: 3 }],
    });
    expect(out.ok).toBe(false);
  });

  it("rejects malformed JSON structure", () => {
    const out = sanitizeChoiceOutput({ resultText: "温宁把碗放回水槽。", effects: "not-array" });
    expect(out.ok).toBe(false);
  });
});

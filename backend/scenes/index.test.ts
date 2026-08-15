import { describe, it, expect } from "vitest";
import { scenes, getSceneById } from "./index";
import { allowedRelationshipNames } from "./_relationship-whitelist";

describe("scenes registry", () => {
  it("has 4 placeholder scenes", () => {
    expect(scenes).toHaveLength(4);
  });

  it("each scene has unique id", () => {
    const ids = scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each scene has 3 choices with keys A/B/C", () => {
    for (const s of scenes) {
      expect(s.choices).toHaveLength(3);
      expect(s.choices.map((c) => c.key).sort()).toEqual(["A", "B", "C"]);
    }
  });

  it("every affectableRelationships entry is in whitelist", () => {
    for (const s of scenes) {
      for (const name of s.affectableRelationships) {
        expect(allowedRelationshipNames.has(name)).toBe(true);
      }
    }
  });

  it("getSceneById returns undefined for unknown", () => {
    expect(getSceneById("nope")).toBeUndefined();
  });

  it("getSceneById returns scene for known id", () => {
    expect(getSceneById("kitchen")?.place).toBe("厨房");
  });
});

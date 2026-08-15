import { describe, it, expect } from "vitest";
import { allowedRelationshipNames, relationshipWhitelist } from "./_relationship-whitelist";

describe("relationship whitelist", () => {
  it("contains 林一 × 温宁 心动值", () => {
    expect(allowedRelationshipNames.has("林一 × 温宁 心动值")).toBe(true);
  });
  it("contains 紧张感 as ambient", () => {
    expect(relationshipWhitelist.ambient).toContain("紧张感");
  });
  it("rejects unknown names", () => {
    expect(allowedRelationshipNames.has("玩家 x 陌生人 心动值")).toBe(false);
  });
});

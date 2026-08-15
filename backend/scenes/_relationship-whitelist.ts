export const relationshipWhitelist = {
  interpersonal: [
    "林一 × 温宁 心动值",
    "林一 × 许佳 心动值",
    "林一 × 苏杳 心动值",
    "林一 × 沈知 信任度",
    "温宁 × 沈知 信任度",
  ],
  ambient: [
    "紧张感",
    "信任度",
    "悬念值",
    "意外度",
    "林一的信息差",
  ],
} as const;

export const allowedRelationshipNames = new Set<string>([
  ...relationshipWhitelist.interpersonal,
  ...relationshipWhitelist.ambient,
]);

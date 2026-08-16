/**
 * 演员层统一导出入口
 *
 * 演员层职责：根据导演指令 + 人格向量 + 文字契约，
 * 生成结构化意图（ActorIntent）+ 台词（line）+ 微反应（microAction）。
 *
 * 红线：ActorOutput 中没有任何好感增减字段。Δ 由裁判层查表计算。
 */

export * from "./types";
export * from "./personalityVector";
export * from "./textContracts";
export * from "./microReactions";
export * from "./templateEngine";
export * from "./llmEngine";

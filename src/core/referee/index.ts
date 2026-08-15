/**
 * 裁判层统一导出
 *
 * 裁判层职责：好感 Δ 结算、人格一致性校验、越权拦截、内容安全审核。
 * 裁判层不生成任何内容，只做数学运算和规则校验。
 *
 * 使用方式：
 *   import { settle, checkOverscoreViolation, EXTENDED_BASE_MATRIX } from "./referee";
 */

export * from "./types";
export * from "./matrix";
export * from "./validators";
export * from "./settlement";

/**
 * 裁判层校验器（移植裁剪版）
 *
 * 从 src/core/referee/validators.ts 移植。
 *
 * 裁剪决策（关键）：
 *   原文件四道防线中，仅保留 §A 越权拦截 checkOverscoreViolation ——
 *   settle() 的 7a 步骤始终执行它，是本移植版唯一需要的校验器。
 *   其余全部裁剪：
 *     - §B/§C 人格一致性（checkPersonalityConsistency）依赖 director 的
 *       SceneTurn / StyleContract / AttachmentRules 类型（未引入 director 层）
 *     - §D 信息泄露（checkInfoLeak）依赖 WorldEvent / NPC_LIBRARY
 *   settle() 对应分支（7b/7c）不传参即不执行，行为与原版一致。
 *
 *  原版四道防线（NPC 人格保真度规范 §5）：
 *   A. 硬禁区 —— 禁用词 / 禁用标点 / 禁用句式 / 雷点表述（正则，block）
 *   B. 风格指纹 —— 句长 / 句数 / 标点分布 / 口癖命中率（统计，warn）
 *   C. 状态一致性 —— intent 与依恋类型冲突 / exposeLayer 超阈值 / 首次示好响应规则（查表，block）
 *   D. 越权/剧透 —— 台词中实体是否都在该 NPC 可见事件内（实体比对，block）
 */

import type { ActorOutput } from "../actorTypes";
import type { RefereeViolation } from "./types";

// ============================================================
// §A 越权拦截：演员不应输出好感值
// ============================================================

/** 台词中暗示好感数值的模式 */
const OVERSCORE_PATTERNS: RegExp[] = [
  /[+-]\d{1,2}/, // +5, -3 等裸数值
  /好感[+＋]/, // 好感+
  /心动[值＋+]/, // 心动值, 心动+
  /好感度/, // 好感度
  /加分|扣分/, // 加分/扣分
];

/** 台词中暗示好感数值的关键词（裸词命中即视为越权） */
const OVERSCORE_KEYWORDS: string[] = [
  "affinity",
  "heartValue",
  "delta",
  "score",
  // 数值泄露裸词：好感 / 心动值 / 好感值
  "好感",
  "心动值",
  "好感值",
];

/** ActorOutput 允许的字段白名单 */
const ALLOWED_OUTPUT_KEYS = new Set([
  "npcId",
  "line",
  "action",
  "intent",
  "emotionTag",
  "microAction",
]);

/** ActorIntent 允许的字段白名单 */
const ALLOWED_INTENT_KEYS = new Set(["type", "target", "topic", "intensity", "isReactive"]);

/**
 * 越权拦截：检查演员是否输出了好感值。
 *
 * 检查项：
 * - 台词/动作中是否包含数值模式（+5、-3、好感+、心动值等）
 * - intent 中是否夹带了非法字段（只允许 type/target/topic/intensity/isReactive）
 * - output 中是否夹带了非法字段（delta / heartValue 等）
 */
export function checkOverscoreViolation(output: ActorOutput): RefereeViolation | null {
  // 1. 检查台词中的数值模式
  const line = output.line;
  for (const pattern of OVERSCORE_PATTERNS) {
    if (pattern.test(line)) {
      return {
        type: "overscore",
        detail: `台词中包含好感值相关内容（匹配 ${pattern.source}）："${line}"`,
        severity: "block",
      };
    }
  }
  for (const kw of OVERSCORE_KEYWORDS) {
    if (line.toLowerCase().includes(kw.toLowerCase())) {
      return {
        type: "overscore",
        detail: `台词中包含好感值相关关键词（${kw}）："${line}"`,
        severity: "block",
      };
    }
  }

  // 2. 检查动作描述中的数值模式
  if (output.action) {
    for (const pattern of OVERSCORE_PATTERNS) {
      if (pattern.test(output.action)) {
        return {
          type: "overscore",
          detail: `动作描述中包含好感值相关内容（匹配 ${pattern.source}）："${output.action}"`,
          severity: "block",
        };
      }
    }
    for (const kw of OVERSCORE_KEYWORDS) {
      if (output.action.toLowerCase().includes(kw.toLowerCase())) {
        return {
          type: "overscore",
          detail: `动作描述中包含好感值相关关键词（${kw}）："${output.action}"`,
          severity: "block",
        };
      }
    }
  }

  // 3. 检查 intent 是否夹带非法字段
  const intentKeys = Object.keys(output.intent);
  const illegalIntentKeys = intentKeys.filter((k) => !ALLOWED_INTENT_KEYS.has(k));
  if (illegalIntentKeys.length > 0) {
    return {
      type: "overscore",
      detail: `意图中夹带非法字段：${illegalIntentKeys.join(", ")}`,
      severity: "block",
    };
  }

  // 4. 检查 output 是否夹带非法字段
  const outputKeys = Object.keys(output);
  const illegalOutputKeys = outputKeys.filter((k) => !ALLOWED_OUTPUT_KEYS.has(k));
  if (illegalOutputKeys.length > 0) {
    return {
      type: "overscore",
      detail: `输出中夹带非法字段：${illegalOutputKeys.join(", ")}`,
      severity: "block",
    };
  }

  return null;
}

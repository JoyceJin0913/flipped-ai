/**
 * settle() 冒烟测试（回归基线，保留在仓库）
 *
 * 对 10 种 OptionIntent 各跑一次 settle()：
 *   演员 = getNpcById("xiaohai")（小海，ESFP/anxious，来自 @/onboarding/npcLibrary）
 *   人格向量 = buildPersonalityVector(npc)
 *   场景 = private_night（系数 1.3），阶段 = icebreak（系数 1.0），初始心动 = 50
 *
 * 断言（与验收标准一致）：
 *   1. 每种 intent 产生的 Δ 不为 0
 *   2. 总 Δ 在 [-15, 18] 内（DELTA_MIN/DELTA_MAX 由 settle clamp 保证）
 *   3. 不抛异常
 *   4. 7a 越权拦截不误伤（台词不含好感值字样 → violations 应为空）
 *
 * 运行方式（tsx 位于 backend/node_modules；tsconfig 发现基于 cwd，
 * 需在 frontend/ 下运行才能解析 @/* 路径别名）：
 *   cd frontend && ../backend/node_modules/.bin/tsx src/core/__smoke__/settle-smoke.ts
 */

import { getNpcById } from "@/onboarding/npcLibrary";
import { buildPersonalityVector } from "../personalityVector";
import { OPTION_INTENTS, buildActorOutput, type OptionIntent } from "../intents";
import { settle } from "../referee/settlement";

// ------------------------------------------------------------
// 固定测试环境
// ------------------------------------------------------------

const npc = getNpcById("xiaohai");
if (!npc) {
  throw new Error("冒烟测试前置条件失败：NPC xiaohai 未找到");
}

const pv = buildPersonalityVector(npc);
console.log("== 测试环境 ==");
console.log(`NPC: ${npc.name}（${npc.id}，MBTI=${npc.mbti}，依恋=${npc.attachment}）`);
console.log("人格向量:", JSON.stringify(pv));
console.log("");

// 台词刻意避开 7a 越权模式（无 +N/-N、无"好感/心动值"等字样）
const LINE = "今晚的风很轻，我先陪你待一会儿吧。";

// ------------------------------------------------------------
// 主循环：10 种意图各结算一次
// ------------------------------------------------------------

const DELTA_MIN = -15;
const DELTA_MAX = 18;

const results: Partial<Record<OptionIntent, number>> = {};
let maxDelta = -Infinity;
let minDelta = Infinity;

for (const intent of OPTION_INTENTS) {
  const output = buildActorOutput(npc.id, LINE, intent);
  const result = settle({
    actorOutput: output,
    targetNpcId: npc.id,
    currentHeart: 50,
    scene: "private_night",
    relationshipStage: "icebreak",
    personalityVector: pv,
  });

  const { delta, newHeartValue, newStage, unlocksIcebergClue, breakdown, violations } = result;

  // 断言 1：Δ 不为 0
  if (delta === 0) {
    throw new Error(`断言失败 [${intent}]：Δ = 0（期望非零）`);
  }
  // 断言 2：Δ 在 [-15, 18] 内
  if (delta < DELTA_MIN || delta > DELTA_MAX) {
    throw new Error(`断言失败 [${intent}]：Δ = ${delta} 超出 [${DELTA_MIN}, ${DELTA_MAX}]`);
  }
  // 断言 4：不误伤越权
  if (violations.length > 0) {
    throw new Error(`断言失败 [${intent}]：意外触发违规 ${JSON.stringify(violations)}`);
  }

  results[intent] = delta;
  maxDelta = Math.max(maxDelta, delta);
  minDelta = Math.min(minDelta, delta);

  console.log(
    `[${intent.padEnd(12)}] → type=${output.intent.type.padEnd(9)} ` +
      `Δ=${String(delta).padStart(3)} (base=${breakdown.base}, pvMod=${breakdown.personalityMod}, ` +
      `scene×stage=${breakdown.sceneMult}×${breakdown.stageMult}, coreBonus=${breakdown.coreNeedBonus}) ` +
      `→ 心动 ${newHeartValue}（${newStage}）` +
      (unlocksIcebergClue ? " [冰山解锁]" : ""),
  );
}

// ------------------------------------------------------------
// 汇总断言
// ------------------------------------------------------------

const nonZeroCount = OPTION_INTENTS.filter((i) => (results[i] ?? 0) !== 0).length;
if (nonZeroCount !== OPTION_INTENTS.length) {
  throw new Error(`断言失败：期望 10/10 意图 Δ≠0，实际 ${nonZeroCount}/10`);
}

console.log("");
console.log("== 汇总 ==");
console.log(`10 种意图全部 Δ≠0：通过`);
console.log(`Δ 范围：${minDelta} ~ ${maxDelta}（要求 [-15, 18]）`);
console.log("总 Δ 范围断言：通过");
console.log("全程未抛异常：通过");
console.log("7a 越权拦截无误伤（violations 全部为空）：通过");
console.log("");
console.log("冒烟测试通过 ✓");

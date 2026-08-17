/**
 * ENDINGS 六结局文案包冒烟测试（T7 回归基线，保留在仓库）
 *
 * 覆盖（与验收标准一致）：
 *   A. ENDINGS 恰好覆盖全部 6 个 EndingId（P1~P6，顺序一致）
 *   B. 每套 title / sub / desc / slogan{line,sub,desc} 非空
 *   C. verdict{title,body} 非空，且 body 按 §10 要求回放 Day4/5/6
 *   D. milestones 恰 7 条（Day1~Day7 全覆盖）
 *   E. npcLineByAttachment 三依恋档齐全且含 {name} 占位符
 *   F. posterHighlights 恰 3 条且 k/v 非空
 *
 * 运行方式（tsx 位于 backend/node_modules；endings.ts 只用相对导入，
 * 无需 @/* 别名，但保持与 island-smoke 一致的 cwd 约定）：
 *   cd frontend && ../backend/node_modules/.bin/tsx src/data/__smoke__/endings-smoke.ts
 */

import { ENDINGS, type EndingCopy } from "../endings";
import { ENDING_IDS } from "../../core/ending";

// ------------------------------------------------------------
// 断言工具
// ------------------------------------------------------------

let assertionCount = 0;

function assert(condition: boolean, label: string): void {
  assertionCount++;
  if (!condition) {
    throw new Error(`断言失败：${label}`);
  }
}

function nonEmpty(s: string): boolean {
  return s.trim().length > 0;
}

function checkCopy(id: string, copy: EndingCopy): void {
  // B. 标题 / 副题 / 概述
  assert(nonEmpty(copy.title), `${id}：title 非空`);
  assert(nonEmpty(copy.sub), `${id}：sub 非空`);
  assert(nonEmpty(copy.desc), `${id}：desc 非空`);

  // slogan 三件套
  assert(nonEmpty(copy.slogan.line), `${id}：slogan.line 非空`);
  assert(nonEmpty(copy.slogan.sub), `${id}：slogan.sub 非空`);
  assert(nonEmpty(copy.slogan.desc), `${id}：slogan.desc 非空`);

  // C. verdict：非空 + 回放 Day4/5/6
  assert(nonEmpty(copy.verdict.title), `${id}：verdict.title 非空`);
  assert(nonEmpty(copy.verdict.body), `${id}：verdict.body 非空`);
  assert(copy.verdict.body.includes("Day 4"), `${id}：verdict.body 回放 Day 4`);
  assert(copy.verdict.body.includes("Day 5"), `${id}：verdict.body 回放 Day 5`);
  assert(copy.verdict.body.includes("Day 6"), `${id}：verdict.body 回放 Day 6`);

  // D. milestones：恰 7 条、Day1~Day7 全覆盖
  assert(
    copy.milestones.length === 7,
    `${id}：milestones 恰 7 条（实际 ${copy.milestones.length}）`,
  );
  for (const m of copy.milestones) {
    assert(/^Day [1-7]$/.test(m.day), `${id}：milestone 天标签格式（${m.day}）`);
    assert(nonEmpty(m.text), `${id}：milestone ${m.day} 文案非空`);
  }
  for (let d = 1; d <= 7; d++) {
    assert(
      copy.milestones.some((m) => m.day === `Day ${d}`),
      `${id}：milestones 覆盖 Day ${d}`,
    );
  }

  // E. per-NPC 结语：三依恋档齐全 + {name} 占位符
  for (const attachment of ["secure", "anxious", "avoidant"] as const) {
    const line = copy.npcLineByAttachment[attachment];
    assert(nonEmpty(line), `${id}：npcLineByAttachment.${attachment} 非空`);
    assert(line.includes("{name}"), `${id}：npcLineByAttachment.${attachment} 应含 {name} 占位符`);
  }

  // F. 海报高光：恰 3 条且 k/v 非空
  assert(copy.posterHighlights.length === 3, `${id}：posterHighlights 恰 3 条`);
  for (const h of copy.posterHighlights) {
    assert(nonEmpty(h.k), `${id}：posterHighlight.k 非空`);
    assert(nonEmpty(h.v), `${id}：posterHighlight.v 非空`);
  }
}

// ------------------------------------------------------------
// 入口
// ------------------------------------------------------------

void (async () => {
  try {
    console.log("== ENDINGS 六结局文案包完整性 ==");

    // A. 覆盖全部 6 个 EndingId（P1~P6 顺序）
    assert(ENDING_IDS.length === 6, "ENDING_IDS 应有 6 个结局");
    assert(
      ENDING_IDS.join(",") === "mutual,missed,hesitant,restrained,solo,broken",
      "ENDING_IDS 顺序应为 P1~P6",
    );
    assert(
      Object.keys(ENDINGS).length === 6,
      `ENDINGS 应有 6 套文案（实际 ${Object.keys(ENDINGS).length}）`,
    );
    for (const id of ENDING_IDS) {
      const copy = ENDINGS[id];
      if (copy === undefined) {
        throw new Error(`断言失败：ENDINGS 缺少 ${id}`);
      }
      checkCopy(id, copy);
      console.log(`  ${id}（${copy.title} · ${copy.sub}）→ 通过`);
    }

    console.log(`ENDINGS 全部通过（累计 ${assertionCount} 条断言）`);
    console.log("");
    console.log("冒烟测试通过 ✓");
  } catch (err) {
    console.error("冒烟测试失败：", err);
    process.exit(1);
  }
})();

import type { Scene, WorldState, ChoiceKey } from "../../scenes/types";
import { houseContext } from "../personas/house-context";

export function buildChoicePrompt(
  scene: Scene,
  choiceKey: ChoiceKey,
  worldState: WorldState,
): { system: string; user: string } {
  const chosen = scene.choices.find((c) => c.key === choiceKey);
  if (!chosen) throw new Error(`Unknown choiceKey: ${choiceKey}`);

  const system = `你是《心动小屋》恋综节目的剧情判定 AI。玩家扮演林一（男嘉宾）。你的任务：
根据玩家在当前场景做出的选择，判定接下来会发生什么，输出一段短剧情文字和相应的关系值变化。

${houseContext}

# 输出要求
1. resultText: 30-150 字的剧情推进文字，具体、有画面感（动作/神态/氛围）
   - 不要总结、不要评价，就是"接下来发生了什么"
   - 至少一处具体动作或神态（例："把碗放回水槽"、"耳尖有点烫"）
2. effects: 关系值变化数组，每条 {name, delta}
   - name 只能从"可影响关系值列表"里选
   - delta 只能在 -10 ~ +10 之间
   - 好选择 delta 正，冲突/回避 delta 负
   - 一次 1-3 条 effects，不要每种关系都动
3. 严格输出 JSON，格式：
   { "resultText": "...", "effects": [{ "name": "...", "delta": 数字 }] }
   不要 markdown code fence，不要额外文字`;

  const dialogueBlock = scene.dialogue.map((d) => `${d.who}：${d.line}`).join("\n");

  const relationshipsBlock = Object.entries(worldState.relationships)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const historyBlock =
    worldState.recentHistory.length === 0
      ? "（这是玩家第一件事）"
      : worldState.recentHistory
          .map((h) => `${h.time} ${h.place}: ${h.summary}`)
          .join("\n");

  const affectableBlock = scene.affectableRelationships.map((r) => `- ${r}`).join("\n");

  const user = `# 当前场景
地点：${scene.place}    时间：${scene.time}
氛围：${scene.ambience}
在场：${scene.presentCharacters.join("、")}

对话回顾：
${dialogueBlock}

问题：${scene.question}
玩家选了：${choiceKey} - ${chosen.label}

# 当前世界状态
关系值：
${relationshipsBlock}

最近发生：
${historyBlock}

# 可影响的关系值（只能从中选）
${affectableBlock}`;

  return { system, user };
}

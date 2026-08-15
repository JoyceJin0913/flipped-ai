# 里程碑 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把厨房/客厅/阳台的选择环节从"硬编码后果"改成"AI 现场判定"，同时保留静态 Scene 素材架构以便未来外部素材作者接入。

**Architecture:** 后端新增 `POST /api/choice` 端点，接收 Scene ID + 玩家选择 + 当前世界状态，调用豆包 LLM（关思考、JSON mode）返回后果文字和关系值变化。Scene 素材放在 `backend/scenes/` 独立目录，前端通过 `useHouseState` hook 管理内存态的关系值和历史，`SceneView` 组件保持 UI 不变，只把 `chosen.result` 的来源从 `scene.choices` 改成 API 响应。

**Tech Stack:** Node.js + Express + tsx + openai SDK（backend）、React 19 + TanStack Start + Vite（frontend）、Vitest（backend 单测）

**Spec:** [docs/superpowers/specs/2026-08-15-milestone-2a-design.md](../specs/2026-08-15-milestone-2a-design.md)

---

## 前置说明

- 后端目录：`/Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend`
- 前端目录：`/Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/frontend`
- 所有 `rtk` 前缀是本项目的 token 优化 wrapper（详见 [CLAUDE.md](../../../CLAUDE.md)），bash 命令用 `rtk` 前缀更省 token
- 每个 Task 结束都要 commit，遵循 conventional commits（`feat:`、`chore:`、`test:`）

---

## Task 1：装 Vitest 与骨架

**Files:**
- Modify: `backend/package.json`
- Create: `backend/vitest.config.ts`

- [ ] **Step 1: 安装 vitest 到 backend**

Run:
```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm install -D vitest @vitest/coverage-v8
```
Expected: `added N packages`

- [ ] **Step 2: package.json 加 test script**

Modify `backend/package.json`，在 `"scripts"` 里加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 建 vitest.config.ts**

Create `backend/vitest.config.ts`：
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: 跑一次 test，验证空跑成功**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm test`
Expected: `No test files found` (0 fail 0 pass) —— 是**期望的**，只要不报语法错就行

- [ ] **Step 5: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk git add package.json package-lock.json vitest.config.ts && rtk git commit -m "chore: setup vitest for backend"
```

---

## Task 2：定义 Scene 类型与关系值白名单

**Files:**
- Create: `backend/scenes/_relationship-whitelist.ts`
- Create: `backend/scenes/_relationship-whitelist.test.ts`
- Create: `backend/scenes/types.ts`

- [ ] **Step 1: 写关系值白名单的测试**

Create `backend/scenes/_relationship-whitelist.test.ts`:
```ts
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
```

- [ ] **Step 2: 跑测试验证失败**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm test`
Expected: FAIL —— 找不到 `./_relationship-whitelist`

- [ ] **Step 3: 建白名单文件**

Create `backend/scenes/_relationship-whitelist.ts`:
```ts
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
```

- [ ] **Step 4: 建 Scene 类型定义**

Create `backend/scenes/types.ts`:
```ts
export type ChoiceKey = "A" | "B" | "C";

export type SceneChoice = {
  key: ChoiceKey;
  label: string;
};

export type SceneDialogueLine = {
  who: string;
  line: string;
};

export type Scene = {
  id: string;
  place: string;
  time: string;
  title: string;
  image: string;
  ambience: string;
  presentCharacters: string[];
  dialogue: SceneDialogueLine[];
  question: string;
  hint: string;
  choices: SceneChoice[];
  affectableRelationships: string[];
};

export type HistoryEntry = {
  time: string;
  place: string;
  summary: string;
};

export type WorldState = {
  relationships: Record<string, number>;
  recentHistory: HistoryEntry[];
};

export type Effect = {
  name: string;
  delta: number;
};

export type ChoiceResult = {
  resultText: string;
  effects: Effect[];
};
```

- [ ] **Step 5: 跑测试验证通过**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm test`
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk git add scenes/ && rtk git commit -m "feat: add scene types and relationship whitelist"
```

---

## Task 3：写素材作者接口约定文档

**Files:**
- Create: `backend/scenes/_schema.md`

- [ ] **Step 1: 写 schema 文档**

Create `backend/scenes/_schema.md`:

````markdown
# Scene 素材接口约定

> 这个文件给素材作者的 agent 看。加新 Scene 前先读完这份。

## 快速开始

要加一个新 Scene（比如"厨房 · Day 5 早餐"）：

1. 拷贝 `kitchen-1.ts` 为新文件（例：`kitchen-breakfast.ts`）
2. 改 id、place、time、title、dialogue、question、choices 这些内容字段
3. 打开 `index.ts`，加一行 import 和加一行进 scenes 数组
4. 完成，不用碰任何其他文件

## Scene 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 全局唯一，kebab-case，例如 `kitchen-2` |
| `place` | string | 中文场地名，例如 "厨房" |
| `time` | string | HH:MM，例如 "21:13" |
| `title` | string | 场景标题，一句话 |
| `image` | string | 前端资源 key，本次固定 `kitchen`/`living`/`balcony` 三选一 |
| `ambience` | string | 30-40 字的场景氛围描写，给 AI 用来生成后果 |
| `presentCharacters` | string[] | 在场的角色（含玩家"林一"），从 house.ts 的 10 个人里选 |
| `dialogue` | {who, line}[] | 3-6 行对话，玩家旁观，AI 不会改这些 |
| `question` | string | 抛给玩家的问题，例如 "你觉得温宁为什么这么回避？" |
| `hint` | string | 一句提示 |
| `choices` | {key, label}[] | 恰好 3 项，key 分别是 A/B/C。label 是"玩家的猜测/态度"，不是"玩家要说的话" |
| `affectableRelationships` | string[] | 圈定 AI 只能改这几个关系值，2-5 个，都必须在白名单里 |

## 白名单

`_relationship-whitelist.ts` 定义了 AI 能触碰的所有关系值。分两种：

- **人对人**（`林一 × XX 心动值` 之类）：需要写新的必须先在白名单加行
- **氛围值**（紧张感、悬念值 等）：全局

## 禁止事项

- ❌ **不要在 Scene 里写 `result` 或 `effects`** —— 那是 AI 判定的活
- ❌ **不要用 label 直接写玩家台词** —— label 是"猜测/态度"，不是"要说的话"
- ❌ **`affectableRelationships` 里不能出现白名单外的名字**
- ❌ **`choices` 数量必须是 3**

## 写好 Scene 的技巧

1. **dialogue 有留白**：不要把所有信息说满，让玩家有猜测空间
2. **choices 要"能选到不同的人格特质"**：例如
   - A "她在试探" → 敏感/防御型玩家
   - B "她真的没想清楚" → 温和型
   - C "她不想告诉我" → 直觉/悲观型
   同一情景不同解读，不是三种"对温宁做什么"
3. **ambience 具体化**：不要写"气氛很尴尬"，要写"深夜厨房只一盏暖光灯，温宁在洗碗手停了一下"
````

- [ ] **Step 2: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk git add scenes/_schema.md && rtk git commit -m "docs: add scene author schema"
```

---

## Task 4：写 4 个占位 Scene

**Files:**
- Create: `backend/scenes/kitchen-1.ts`
- Create: `backend/scenes/living-1.ts`
- Create: `backend/scenes/balcony-1.ts`
- Create: `backend/scenes/kitchen-2.ts`
- Create: `backend/scenes/index.ts`
- Create: `backend/scenes/index.test.ts`

- [ ] **Step 1: 写 index 的测试**

Create `backend/scenes/index.test.ts`:
```ts
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
    expect(getSceneById("kitchen-1")?.place).toBe("厨房");
  });
});
```

- [ ] **Step 2: 建 kitchen-1.ts（改编自 house.ts）**

Create `backend/scenes/kitchen-1.ts`:
```ts
import type { Scene } from "./types";

export const kitchenOne: Scene = {
  id: "kitchen-1",
  place: "厨房",
  time: "21:13",
  title: "厨房里的十二分钟",
  image: "kitchen",
  ambience: "深夜厨房，只有一盏暖光灯。温宁在洗碗，看到林一进来手停了一下。",
  presentCharacters: ["温宁", "林一"],
  dialogue: [
    { who: "林一", line: "你是不是有话想跟我说？" },
    { who: "温宁", line: "……我也不知道该怎么说。" },
    { who: "林一", line: "那就先别说，站一会儿也行。" },
  ],
  question: "你觉得温宁为什么这么回避？",
  hint: "你的选择会影响后续剧情发展",
  choices: [
    { key: "A", label: "她在试探林一的态度" },
    { key: "B", label: "她真的还没想清楚" },
    { key: "C", label: "她不想告诉林一" },
  ],
  affectableRelationships: [
    "林一 × 温宁 心动值",
    "紧张感",
    "信任度",
    "悬念值",
  ],
};
```

- [ ] **Step 3: 建 living-1.ts**

Create `backend/scenes/living-1.ts`:
```ts
import type { Scene } from "./types";

export const livingOne: Scene = {
  id: "living-1",
  place: "客厅",
  time: "20:37",
  title: "沙发上的第一次分组",
  image: "living",
  ambience: "客厅灯光暖黄，苏杳、沈知、夏可坐在沙发上讨论明天的约会分组，气氛半开玩笑半试探。",
  presentCharacters: ["苏杳", "沈知", "夏可", "林一"],
  dialogue: [
    { who: "苏杳", line: "明天的约会，要不要抽签决定？" },
    { who: "沈知", line: "抽签多没意思，自己选吧。" },
    { who: "夏可", line: "那就看谁先开口咯。" },
  ],
  question: "你希望今晚的分组怎么决定？",
  hint: "会影响明天的约会名单",
  choices: [
    { key: "A", label: "抽签，交给运气" },
    { key: "B", label: "各自邀请，公开表态" },
    { key: "C", label: "让苏杳先决定" },
  ],
  affectableRelationships: [
    "意外度",
    "紧张感",
    "林一 × 苏杳 心动值",
    "林一的信息差",
  ],
};
```

- [ ] **Step 4: 建 balcony-1.ts**

Create `backend/scenes/balcony-1.ts`:
```ts
import type { Scene } from "./types";

export const balconyOne: Scene = {
  id: "balcony-1",
  place: "阳台",
  time: "22:40",
  title: "阳台上的那支烟火",
  image: "balcony",
  ambience: "夜风微凉，阳台上沈知靠着栏杆，看见温宁站在角落，手里拿着一封没寄出去的信。",
  presentCharacters: ["沈知", "温宁", "林一"],
  dialogue: [
    { who: "沈知", line: "你怎么一个人在这里？" },
    { who: "温宁", line: "被你看出来了。" },
  ],
  question: "要不要让沈知把温宁的秘密说出去？",
  hint: "秘密的流向决定关系的走向",
  choices: [
    { key: "A", label: "让沈知替温宁保密" },
    { key: "B", label: "让沈知提醒林一" },
    { key: "C", label: "什么都不做" },
  ],
  affectableRelationships: [
    "温宁 × 沈知 信任度",
    "林一 × 温宁 心动值",
    "林一的信息差",
    "悬念值",
  ],
};
```

- [ ] **Step 5: 建 kitchen-2.ts（测多样性用）**

Create `backend/scenes/kitchen-2.ts`:
```ts
import type { Scene } from "./types";

export const kitchenTwo: Scene = {
  id: "kitchen-2",
  place: "厨房",
  time: "23:02",
  title: "宵夜时间",
  image: "kitchen",
  ambience: "厨房灯光暖黄，许佳在煮泡面，看到林一进来眼睛亮了一下。",
  presentCharacters: ["许佳", "林一"],
  dialogue: [
    { who: "许佳", line: "你也没睡？要一起吃泡面吗？" },
    { who: "林一", line: "……好像有点香。" },
    { who: "许佳", line: "那你去拿两双筷子。" },
  ],
  question: "许佳的邀请，你怎么看？",
  hint: "你的态度会被看到",
  choices: [
    { key: "A", label: "她只是想找个人陪" },
    { key: "B", label: "她真的对我有意思" },
    { key: "C", label: "她想让温宁看到" },
  ],
  affectableRelationships: [
    "林一 × 许佳 心动值",
    "林一 × 温宁 心动值",
    "紧张感",
    "悬念值",
  ],
};
```

- [ ] **Step 6: 建 index.ts**

Create `backend/scenes/index.ts`:
```ts
import { kitchenOne } from "./kitchen-1";
import { livingOne } from "./living-1";
import { balconyOne } from "./balcony-1";
import { kitchenTwo } from "./kitchen-2";
import type { Scene } from "./types";

export type { Scene, SceneChoice, ChoiceKey, WorldState, Effect, ChoiceResult, HistoryEntry } from "./types";

export const scenes: Scene[] = [kitchenOne, livingOne, balconyOne, kitchenTwo];

export function getSceneById(id: string): Scene | undefined {
  return scenes.find((s) => s.id === id);
}
```

- [ ] **Step 7: 跑测试验证 6 个测试全过**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm test`
Expected: 3 + 6 = 9 tests PASS

- [ ] **Step 8: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk git add scenes/ && rtk git commit -m "feat: add 4 placeholder scenes and registry"
```

---

## Task 5：世界观 house-context 与 Choice prompt 模板

**Files:**
- Create: `backend/src/personas/house-context.ts`
- Create: `backend/src/prompts/choice-judge.ts`
- Create: `backend/src/prompts/choice-judge.test.ts`

- [ ] **Step 1: 写 prompt 构造函数的测试**

Create `backend/src/prompts/choice-judge.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildChoicePrompt } from "./choice-judge";
import type { Scene, WorldState } from "../../scenes/types";

const scene: Scene = {
  id: "kitchen-1",
  place: "厨房",
  time: "21:13",
  title: "test",
  image: "kitchen",
  ambience: "深夜厨房",
  presentCharacters: ["温宁", "林一"],
  dialogue: [{ who: "林一", line: "你还好吗？" }],
  question: "你觉得温宁为什么这么回避？",
  hint: "会影响后续",
  choices: [
    { key: "A", label: "她在试探" },
    { key: "B", label: "她没想清楚" },
    { key: "C", label: "她不想说" },
  ],
  affectableRelationships: ["林一 × 温宁 心动值", "紧张感"],
};

const worldState: WorldState = {
  relationships: { "林一 × 温宁 心动值": 72, "紧张感": 0 },
  recentHistory: [{ time: "20:37", place: "客厅", summary: "选了 B" }],
};

describe("buildChoicePrompt", () => {
  it("includes scene ambience", () => {
    const { user } = buildChoicePrompt(scene, "A", worldState);
    expect(user).toContain("深夜厨房");
  });
  it("includes chosen choice label", () => {
    const { user } = buildChoicePrompt(scene, "A", worldState);
    expect(user).toContain("她在试探");
  });
  it("includes relationships as key: value", () => {
    const { user } = buildChoicePrompt(scene, "A", worldState);
    expect(user).toContain("林一 × 温宁 心动值: 72");
  });
  it("includes affectable relationships", () => {
    const { user } = buildChoicePrompt(scene, "A", worldState);
    expect(user).toContain("紧张感");
  });
  it("handles empty history", () => {
    const { user } = buildChoicePrompt(scene, "A", { ...worldState, recentHistory: [] });
    expect(user).toContain("这是玩家第一件事");
  });
  it("has JSON output requirement in system prompt", () => {
    const { system } = buildChoicePrompt(scene, "A", worldState);
    expect(system).toContain("JSON");
  });
});
```

- [ ] **Step 2: 跑测试验证失败**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm test`
Expected: FAIL —— 找不到 `./choice-judge`

- [ ] **Step 3: 建 house-context.ts**

Create `backend/src/personas/house-context.ts`:
```ts
export const houseContext = `# 心动小屋世界观

时间：Day 4 晚上（这是节目的第 4 天）
地点：一栋海边小屋，五男五女在这里共处 7 天

## 十位嘉宾（玩家扮演林一）
男嘉宾：林一（玩家）、周叙、沈知、陆野、江郁
女嘉宾：苏杳、温宁、许佳、白露、夏可

## 已知的暧昧线（截至 Day 4）
- 林一（玩家） × 温宁：今晚在厨房有 12 分钟独处，气氛微妙
- 温宁 × 沈知：白天在阳台被沈知撞见一些心事，温宁请他保密
- 许佳：晚餐时一直偷看林一
- 苏杳：目前跟林一没有实质互动

## 玩家角色
林一 = 男嘉宾，性格内敛，会观察，不轻易表态。玩家在场景中通过"选择"参与，很少主动说长台词。`;
```

- [ ] **Step 4: 建 choice-judge.ts**

Create `backend/src/prompts/choice-judge.ts`:
```ts
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
```

- [ ] **Step 5: 跑测试验证通过**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm test`
Expected: 9 + 6 = 15 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk git add src/personas/house-context.ts src/prompts/ && rtk git commit -m "feat: add house context and choice judge prompt builder"
```

---

## Task 6：Choice 后端验证与判定函数

**Files:**
- Create: `backend/src/choice-judge.ts`
- Create: `backend/src/choice-judge.test.ts`
- Modify: `backend/src/llm.ts`（新增 chatJson 支持 JSON mode）

- [ ] **Step 1: 写验证 & 判定函数的测试**

Create `backend/src/choice-judge.test.ts`:
```ts
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
```

- [ ] **Step 2: 跑测试验证失败**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm test`
Expected: FAIL —— 找不到 `./choice-judge`

- [ ] **Step 3: 修改 llm.ts 加 chatJson 支持 JSON mode**

Read 现有的 `backend/src/llm.ts`，在文件末尾追加一个 `chatJson()` 函数：

```ts
export async function chatJson(
  messages: ChatMessage[],
  options: { temperature?: number } = {},
): Promise<ChatResult> {
  const temperature = options.temperature ?? 0.9;
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      response_format: { type: "json_object" },
      // @ts-expect-error - 火山方舟专有参数
      thinking: { type: "disabled" },
    });
    const content = response.choices[0]?.message?.content ?? "";
    const totalTokens = response.usage?.total_tokens ?? 0;
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;
    return { ok: true, content, totalTokens, promptTokens, completionTokens };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 4: 建 choice-judge.ts**

Create `backend/src/choice-judge.ts`:
```ts
import type { Scene, WorldState, ChoiceKey, ChoiceResult, Effect } from "../scenes/types";
import { allowedRelationshipNames } from "../scenes/_relationship-whitelist";
import { buildChoicePrompt } from "./prompts/choice-judge";
import { chatJson } from "./llm";

type Sanitized =
  | { ok: true; value: ChoiceResult }
  | { ok: false; error: string };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function sanitizeChoiceOutput(raw: unknown): Sanitized {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "output not object" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.resultText !== "string") return { ok: false, error: "resultText not string" };
  const resultText = obj.resultText.trim();
  if (resultText.length < 10) return { ok: false, error: "resultText too short" };
  if (resultText.length > 500) return { ok: false, error: "resultText too long" };

  if (!Array.isArray(obj.effects)) return { ok: false, error: "effects not array" };

  const effects: Effect[] = [];
  for (const e of obj.effects) {
    if (typeof e !== "object" || e === null) continue;
    const eo = e as Record<string, unknown>;
    if (typeof eo.name !== "string") continue;
    if (typeof eo.delta !== "number" || Number.isNaN(eo.delta)) continue;
    if (!allowedRelationshipNames.has(eo.name)) continue;
    effects.push({ name: eo.name, delta: clamp(Math.round(eo.delta), -10, 10) });
  }
  if (effects.length === 0) return { ok: false, error: "no valid effects" };
  const truncated = effects.slice(0, 5);
  return { ok: true, value: { resultText, effects: truncated } };
}

export async function judgeChoice(
  scene: Scene,
  choiceKey: ChoiceKey,
  worldState: WorldState,
): Promise<
  | { ok: true; result: ChoiceResult; usage: { totalTokens: number; promptTokens: number; completionTokens: number } }
  | { ok: false; error: string; hint?: string }
> {
  const { system, user } = buildChoicePrompt(scene, choiceKey, worldState);
  const llmResult = await chatJson([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  if (!llmResult.ok) return { ok: false, error: llmResult.error, hint: "hint" in llmResult ? llmResult.hint : undefined };

  let parsed: unknown;
  try {
    parsed = JSON.parse(llmResult.content);
  } catch {
    return { ok: false, error: "LLM output not valid JSON", hint: llmResult.content.slice(0, 100) };
  }
  const sanitized = sanitizeChoiceOutput(parsed);
  if (!sanitized.ok) {
    return { ok: false, error: `LLM output invalid: ${sanitized.error}` };
  }
  return {
    ok: true,
    result: sanitized.value,
    usage: {
      totalTokens: llmResult.totalTokens,
      promptTokens: llmResult.promptTokens,
      completionTokens: llmResult.completionTokens,
    },
  };
}
```

- [ ] **Step 5: 跑测试验证通过**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm test`
Expected: 15 + 8 = 23 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk git add src/llm.ts src/choice-judge.ts src/choice-judge.test.ts && rtk git commit -m "feat: add choice output sanitizer and judgeChoice"
```

---

## Task 7：把 /api/choice 与 /api/scenes 接进 Express

**Files:**
- Modify: `backend/src/server.ts`

- [ ] **Step 1: 在 server.ts 加 GET /api/scenes/:id 和 POST /api/choice**

Read `backend/src/server.ts`，在现有 `app.post("/api/chat", ...)` 之后追加下面两个 handler（并按需 import）：

```ts
const { scenes, getSceneById } = await import("../scenes/index.js");
const { judgeChoice } = await import("./choice-judge.js");

app.get("/api/scenes/:id", (req, res) => {
  const scene = getSceneById(req.params.id);
  if (!scene) return res.status(404).json({ error: "scene not found" });
  res.json(scene);
});

app.get("/api/scenes", (_req, res) => {
  res.json(scenes.map((s) => ({ id: s.id, place: s.place, time: s.time, title: s.title })));
});

app.post("/api/choice", async (req, res) => {
  const { sceneId, choiceKey, worldState } = req.body ?? {};
  if (typeof sceneId !== "string") return res.status(400).json({ error: "sceneId required" });
  if (!["A", "B", "C"].includes(choiceKey)) return res.status(400).json({ error: "choiceKey must be A/B/C" });
  if (typeof worldState !== "object" || worldState === null) {
    return res.status(400).json({ error: "worldState required" });
  }
  const scene = getSceneById(sceneId);
  if (!scene) return res.status(404).json({ error: "scene not found" });

  const result = await judgeChoice(scene, choiceKey, worldState);
  if (!result.ok) return res.status(500).json({ error: result.error, hint: result.hint });
  res.json({
    resultText: result.result.resultText,
    effects: result.result.effects,
    usage: result.usage,
  });
});
```

**注意**：由于 server.ts 用了顶层 await 动态 import 已有 llm/personas 模块，把上面新加的 dynamic import 放在同一段顶层 await 里（跟已有的写法一致）。

- [ ] **Step 2: 启动服务验证不报错**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm run dev` (background)

Expected: 日志显示 `Server listening on http://localhost:3001`

- [ ] **Step 3: curl 测试 GET /api/scenes**

Run:
```bash
rtk curl -s http://localhost:3001/api/scenes
```
Expected: 返回一个 4 项数组，每项有 id/place/time/title

- [ ] **Step 4: curl 测试 GET /api/scenes/kitchen-1**

Run:
```bash
rtk curl -s http://localhost:3001/api/scenes/kitchen-1
```
Expected: 返回完整 Scene 对象，含 dialogue 和 choices

- [ ] **Step 5: curl 测试 POST /api/choice 真实 LLM 调用**

Run:
```bash
rtk curl -s -X POST http://localhost:3001/api/choice \
  -H "Content-Type: application/json" \
  -d '{
    "sceneId": "kitchen-1",
    "choiceKey": "A",
    "worldState": {
      "relationships": { "林一 × 温宁 心动值": 72, "紧张感": 0, "信任度": 0, "悬念值": 0 },
      "recentHistory": []
    }
  }'
```
Expected: 返回 `{ resultText, effects, usage }`，effects 名字全在白名单里，usage.totalTokens < 1500

- [ ] **Step 6: curl 测试错误路径（未知 sceneId）**

Run:
```bash
rtk curl -s -X POST http://localhost:3001/api/choice \
  -H "Content-Type: application/json" \
  -d '{"sceneId":"nope","choiceKey":"A","worldState":{"relationships":{},"recentHistory":[]}}'
```
Expected: `{"error":"scene not found"}`，HTTP 404

- [ ] **Step 7: 停后端**

Kill the background dev server task.

- [ ] **Step 8: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk git add src/server.ts && rtk git commit -m "feat: add /api/scenes and /api/choice endpoints"
```

---

## Task 8：前端 API client 与 useHouseState hook

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/hooks/useHouseState.ts`

- [ ] **Step 1: 建 API client**

Create `frontend/src/lib/api.ts`:
```ts
const API_BASE = "http://localhost:3001";

export type ApiScene = {
  id: string;
  place: string;
  time: string;
  title: string;
  image: string;
  ambience: string;
  presentCharacters: string[];
  dialogue: { who: string; line: string }[];
  question: string;
  hint: string;
  choices: { key: "A" | "B" | "C"; label: string }[];
  affectableRelationships: string[];
};

export type Effect = { name: string; delta: number };

export type HistoryEntry = { time: string; place: string; summary: string };

export type WorldState = {
  relationships: Record<string, number>;
  recentHistory: HistoryEntry[];
};

export type ChoiceResponse = {
  resultText: string;
  effects: Effect[];
  usage: { totalTokens: number; promptTokens: number; completionTokens: number };
};

export async function fetchScene(id: string): Promise<ApiScene> {
  const res = await fetch(`${API_BASE}/api/scenes/${id}`);
  if (!res.ok) throw new Error(`fetchScene ${id}: ${res.status}`);
  return res.json();
}

export async function postChoice(input: {
  sceneId: string;
  choiceKey: "A" | "B" | "C";
  worldState: WorldState;
}): Promise<ChoiceResponse> {
  const res = await fetch(`${API_BASE}/api/choice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `postChoice ${res.status}`);
  return data;
}
```

- [ ] **Step 2: 建 useHouseState hook**

Create `frontend/src/hooks/useHouseState.ts`:
```ts
import { useState } from "react";
import type { Effect, HistoryEntry } from "@/lib/api";

const INITIAL_RELATIONSHIPS: Record<string, number> = {
  "林一 × 温宁 心动值": 72,
  "林一 × 许佳 心动值": 58,
  "林一 × 苏杳 心动值": 34,
  "林一 × 沈知 信任度": 40,
  "温宁 × 沈知 信任度": 55,
  "紧张感": 0,
  "信任度": 50,
  "悬念值": 0,
  "意外度": 0,
  "林一的信息差": 0,
};

export function useHouseState() {
  const [relationships, setRelationships] = useState<Record<string, number>>(() => ({
    ...INITIAL_RELATIONSHIPS,
  }));
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const applyEffects = (effects: Effect[]) => {
    setRelationships((prev) => {
      const next = { ...prev };
      for (const { name, delta } of effects) {
        next[name] = (next[name] ?? 0) + delta;
      }
      return next;
    });
  };

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((prev) => [...prev.slice(-2), entry]);
  };

  return { relationships, history, applyEffects, pushHistory };
}
```

- [ ] **Step 3: 类型检查**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/frontend && rtk npx tsc --noEmit`
Expected: 通过（无 error）；warning 可以忽略

- [ ] **Step 4: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/frontend && rtk git add src/lib/api.ts src/hooks/useHouseState.ts && rtk git commit -m "feat: add frontend api client and useHouseState hook"
```

---

## Task 9：SceneView 接入动态 result

**Files:**
- Modify: `frontend/src/components/HouseApp.tsx`

**关键改造点**：`SceneView` 组件（行 730 附近）当前从 `chosen.result` 和 `chosen.effects` 直接展示；改成接收父组件传入的 `dynamicResult`（异步获取）+ `loading` state。

- [ ] **Step 1: 修改 SceneView props（追加 dynamicResult 和 loading）**

在 `HouseApp.tsx` 的 SceneView 组件定义（行 730 附近）里，把 props 类型改成：

```ts
function SceneView({
  scene,
  picked,
  onPick,
  onBack,
  storyMode,
  dynamicResult,
  loading,
}: {
  scene: Scene;
  picked?: Choice["key"] | undefined;
  onPick: (k: Choice["key"]) => void;
  onBack: () => void;
  storyMode?: boolean;
  dynamicResult?: { resultText: string } | undefined;
  loading?: boolean;
}) {
```

- [ ] **Step 2: 修改选项按钮：loading 时置灰不可点**

在 `scene.choices.map((c, i) => {` 循环里的 `<button>` 上：
- 加 `disabled={loading}`
- className 里追加：`${loading ? "opacity-50 cursor-not-allowed" : ""}`

- [ ] **Step 3: 修改 chosen 段落：优先展示 dynamicResult**

把原来的：
```tsx
{chosen && (
  <div className="mt-5 rounded-2xl glass-card p-4">
    <p className="text-xs tracking-widest text-accent">剧情走向</p>
    <p className="mt-2 text-sm leading-relaxed">{chosen.result}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {chosen.effects.map((e) => (
        <span ...>{e.name} {e.delta > 0 ? `+${e.delta}` : e.delta}</span>
      ))}
    </div>
  </div>
)}
```

改成：
```tsx
{loading && (
  <div className="mt-5 rounded-2xl glass-card p-4 text-center text-sm text-muted-foreground">
    …
  </div>
)}
{!loading && dynamicResult && (
  <div className="mt-5 rounded-2xl glass-card p-4">
    <p className="text-xs tracking-widest text-accent">剧情走向</p>
    <p className="mt-2 text-sm leading-relaxed">{dynamicResult.resultText}</p>
  </div>
)}
```

**注意**：不再展示 delta chip（按 spec：关系值静默变化）。原本 `{chosen.result}` 的代码整段替换为上面。

- [ ] **Step 4: 类型检查（可能有未使用变量警告，忽略）**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/frontend && rtk npx tsc --noEmit`
Expected: `chosen` 相关的类型可能报"unused"警告，可以先留着 —— 因为下一 task 会在父组件里删除对旧 `chosen.result` 的依赖。

- [ ] **Step 5: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/frontend && rtk git add src/components/HouseApp.tsx && rtk git commit -m "feat: SceneView shows dynamic result and loading state"
```

---

## Task 10：把 HouseApp 顶层接入 useHouseState + API

**Files:**
- Modify: `frontend/src/components/HouseApp.tsx`

**改造点**：`HouseApp` 组件里现在的 `onPick(id, k) => setPicked((p) => ({ ...p, [id]: k }))` 只是把选择记进 state；改成 async 调 `/api/choice`，把返回结果存到 `dynamicResults` state 中，然后传给 SceneView。

- [ ] **Step 1: 在 HouseApp 组件顶部引入 hook 与 api**

在 `HouseApp.tsx` 顶部 imports 追加：
```ts
import { useHouseState } from "@/hooks/useHouseState";
import { postChoice } from "@/lib/api";
```

- [ ] **Step 2: 在 HouseApp 组件内部初始化 hook + state**

在 `HouseApp` 函数体（`function HouseApp() {` 之后）加：
```ts
const houseState = useHouseState();
const [dynamicResults, setDynamicResults] = useState<Record<string, { resultText: string }>>({});
const [loadingSceneId, setLoadingSceneId] = useState<string | null>(null);
```

- [ ] **Step 3: 把 onPick 改成 async 调用 API**

找到目前两处 `onPick={(id, k) => setPicked((p) => ({ ...p, [id]: k }))}`（行 95、108 附近），抽成一个函数：

```ts
const handlePick = async (id: string, k: Choice["key"]) => {
  setPicked((p) => ({ ...p, [id]: k }));
  setLoadingSceneId(id);
  try {
    const scene = scenes.find((s) => s.id === id);
    if (!scene) throw new Error("scene not found");
    const chosenChoice = scene.choices.find((c) => c.key === k);
    if (!chosenChoice) throw new Error("choice not found");

    const res = await postChoice({
      sceneId: id,
      choiceKey: k,
      worldState: {
        relationships: houseState.relationships,
        recentHistory: houseState.history,
      },
    });
    setDynamicResults((prev) => ({ ...prev, [id]: { resultText: res.resultText } }));
    houseState.applyEffects(res.effects);
    houseState.pushHistory({
      time: scene.time,
      place: scene.place,
      summary: `选了 ${k}（${chosenChoice.label}）`,
    });
  } catch (err) {
    console.error("[choice] failed:", err);
    setDynamicResults((prev) => ({
      ...prev,
      [id]: { resultText: "（剧情判定失败，请重试）" },
    }));
  } finally {
    setLoadingSceneId(null);
  }
};
```

然后把两处 `onPick={(id, k) => setPicked(...)}` 都改成 `onPick={handlePick}`。

- [ ] **Step 4: 把 dynamicResult 和 loading 传给 SceneView**

找到调用 `<SceneView ... />` 的地方（在 `SceneRunner` 里，行 240 和 285 附近），加两个 props：
```tsx
dynamicResult={dynamicResults[openScene.id]}
loading={loadingSceneId === openScene.id}
```

（注意有两处调用，都要改。行 240 附近传的是 `scene.id`，行 285 附近传的是 `openScene.id`，具体看代码上下文。）

- [ ] **Step 5: 类型检查**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/frontend && rtk npx tsc --noEmit`
Expected: 通过（无 error）。如果有 `chosen` 相关的"unused"警告可忽略。

- [ ] **Step 6: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/frontend && rtk git add src/components/HouseApp.tsx && rtk git commit -m "feat: HouseApp calls /api/choice and updates relationships"
```

---

## Task 11：手动验收（真实浏览器）

**Files:**
- 无（这是验证任务）

- [ ] **Step 1: 启动 backend**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend && rtk npm run dev` (background)
Expected: `Server listening on http://localhost:3001`

- [ ] **Step 2: 启动 frontend**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/frontend && rtk npm run dev` (background)
Expected: `Local: http://localhost:8080/`

- [ ] **Step 3: 用 browser-harness 截图主页 + 走完厨房场景**

Run:
```bash
browser-harness <<'PY'
new_tab("http://localhost:8080/")
wait_for_load()
import time; time.sleep(1)
capture_screenshot(path="/tmp/m2a-home.png")
# 点厨房卡片
result = js("""
const btns = Array.from(document.querySelectorAll('button, [role=button]')).filter(
  b => (b.textContent||'').includes('厨房里的十二分钟')
);
if (btns.length === 0) return null;
const r = btns[0].getBoundingClientRect();
return {x: r.left + r.width/2, y: r.top + r.height/2};
""")
if result: click_at_xy(result['x'], result['y'])
time.sleep(1.5)
capture_screenshot(path="/tmp/m2a-scene.png")
# 找 A 选项按钮
result = js("""
const btns = Array.from(document.querySelectorAll('button')).filter(
  b => (b.textContent||'').includes('她在试探')
);
if (btns.length === 0) return null;
const r = btns[0].getBoundingClientRect();
return {x: r.left + r.width/2, y: r.top + r.height/2};
""")
if result: click_at_xy(result['x'], result['y'])
time.sleep(4)  # 等 LLM 返回
capture_screenshot(path="/tmp/m2a-after.png")
PY
```
Expected: `/tmp/m2a-after.png` 里能看到"剧情走向"框和一段 AI 生成的 resultText

- [ ] **Step 4: Read 三张截图验证 UI**

Read `/tmp/m2a-home.png`、`/tmp/m2a-scene.png`、`/tmp/m2a-after.png`

Expected：
- home: 房子 + 三件事卡片
- scene: 场景大图 + 3 个选项按钮
- after: 有"剧情走向"框，文字合理、有画面感（含具体动作/神态）

- [ ] **Step 5: 验收清单（用户核对）**

对照 [spec § 8.1](../specs/2026-08-15-milestone-2a-design.md#81-手动验收跑一次里程碑-2a-验收) 逐条：

- [ ] AI 判定 < 3 秒
- [ ] resultText 有具体动作/神态（不是空泛"她笑了笑"）
- [ ] 关系值静默变化，`console` 里能看到 effects 都在白名单
- [ ] 再选另一个选项（B/C），后果文字应明显不同
- [ ] 关系值面板（心动观察 Tab）在选完后有变化

- [ ] **Step 6: 停止 background 服务**

停掉 backend 和 frontend 的两个 background task。

---

## Task 12：PR 收尾

**Files:**
- 无（git 操作）

- [ ] **Step 1: 更新里程碑 2a 完成状态到 milestone-1-plan.md 或建 milestone-2a-record.md**

Create `docs/milestone-2a-record.md`:

```markdown
# 里程碑 2a · 落地记录

> 完成时间：2026-08-15 (预期)
> spec: docs/superpowers/specs/2026-08-15-milestone-2a-design.md
> plan: docs/superpowers/plans/2026-08-15-milestone-2a.md

## 实际交付

- 后端：POST /api/choice、GET /api/scenes 已可用
- 4 个占位 Scene（kitchen-1/2、living-1、balcony-1）
- 全局关系值白名单（15 项：5 人对人 + 5 氛围）
- 前端 HouseApp 接入动态判定，选择后 AI 生成后果文字，关系值静默变化
- 素材接口约定 backend/scenes/_schema.md（供外部素材作者使用）

## Token 与延迟实测

- 单次 Choice 判定：TBD（跑完 Task 11 后填入）
- 平均延迟：TBD

## 后续待办

- [ ] 里程碑 2b：SQLite 持久化 + 跨会话长期记忆
- [ ] 里程碑 3：多角色 AI（每个角色单独有 agent）
- [ ] 素材作者接入：等外部作者提供更多 Scene 素材
```

- [ ] **Step 2: Commit**

```bash
cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai && rtk git add docs/milestone-2a-record.md && rtk git commit -m "docs: milestone 2a landing record"
```

- [ ] **Step 3: 汇总 git log 输出交付摘要**

Run: `cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai && rtk git log --oneline -20`
Expected: 见到本次 12 个 task 的提交

---

## 完成判定

- [ ] 所有 Task 的 checkbox 都勾上
- [ ] `rtk npm test` 在 backend 目录下全绿
- [ ] `rtk npx tsc --noEmit` 在 frontend 目录下无 error
- [ ] Task 11 的手动验收全部通过
- [ ] Task 12 的 milestone-2a-record.md 已填入实测 token/延迟数字

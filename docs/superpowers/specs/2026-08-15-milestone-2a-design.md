# 里程碑 2a · 设计文档

> 编写时间：2026-08-15
> 状态：设计已定，待用户审阅后进入 writing-plans
> 上级目标：v0.2 里程碑 2 —— Scene → Choice → 后果 循环

---

## 一、目标与范围

**做的事**：把厨房/客厅/阳台的**选择环节**从"硬编码后果"改成"AI 现场判定"。玩家点选项 → 后端拿 Scene 数据 + 当前世界状态调 LLM → LLM 返回一段后果文字 + 一组关系值变化 → 前端展示文字、静默更新关系值。

**不做的事**（留给里程碑 2b 及以后）：
- 长期记忆（跨会话，用户 Day 1 说过的话 Day 5 还记得）
- 数据库/SQLite 持久化（一切在内存，刷新丢失）
- Scene 动态生成（Scene 是**静态素材**，由外部素材作者供稿）
- 多角色 AI 交互（本次 AI 只负责"判定后果"，不负责扮演任何角色）

**成功标准**：
1. 现有厨房场景玩 3 次，因为关系初值/历史不同得到 3 段不同后果文字
2. 关系值变化都落在白名单里，且合理（好选择 delta 正，冲突/回避 delta 负）
3. 单次 Choice 判定 < 3 秒，token < 1500

---

## 二、关键决策（跟里程碑 1 的差异）

| 决策 | 结果 | 理由 |
|---|---|---|
| Scene 生成 vs 静态素材 | **静态素材** | 素材作者会提供，AI 只判定 Choice |
| Choice 判定 | **AI 动态** | 里程碑 2a 的核心验证点 |
| Scene 素材来源 | 先写 3-5 个占位 Scene（改编自 `house.ts`）+ 完整接口约定文档 | 不阻塞开发，素材作者按约定替换 |
| 关系值管理 | **全局白名单** | 防 AI 乱造新关系值名字 |
| 后果呈现 | 只显示文字，关系值静默变化 | 更接近真实恋综，不游戏化 |
| 世界状态存储 | React state（内存） | 里程碑 2a 只验证生成质量，持久化留给 2b |

---

## 三、目录结构

```
flipped-ai/
├── backend/
│   ├── scenes/                            # 【新建】静态 Scene 素材
│   │   ├── _schema.md                     # ⭐ 给素材作者的接口约定（PR 里重点说明）
│   │   ├── _relationship-whitelist.ts     # 关系值白名单
│   │   ├── kitchen-1.ts                   # 占位 Scene 1（改编自现有厨房场景）
│   │   ├── living-1.ts                    # 占位 Scene 2
│   │   ├── balcony-1.ts                   # 占位 Scene 3
│   │   ├── kitchen-2.ts                   # 占位 Scene 4（同场景不同氛围，测多样性）
│   │   └── index.ts                       # 导出 scenes[], getSceneById()
│   └── src/
│       ├── llm.ts                         # 已有（不动）
│       ├── personas/
│       │   ├── wenning.ts                 # 已有（不动）
│       │   └── house-context.ts           # 【新建】"小屋世界观"公共背景
│       ├── prompts/
│       │   └── choice-judge.ts            # 【新建】Choice 判定 prompt 模板
│       └── server.ts                      # 改：加 POST /api/choice、GET /api/scenes/:id
├── frontend/
│   └── src/
│       ├── lib/
│       │   └── api.ts                     # 【新建】封装后端 fetch
│       ├── hooks/
│       │   └── useHouseState.ts           # 【新建】管理 relationships + history
│       └── components/
│           └── HouseApp.tsx               # 改：SceneRunner.onPick 走 API
└── docs/
    └── superpowers/specs/
        └── 2026-08-15-milestone-2a-design.md   # ⭐ 本文件
```

**结构说明**：
- `backend/scenes/` 独立于 `backend/src/`：这是"素材"，不是"运行时代码"，素材作者只需要往此目录加文件、往 `index.ts` 加一行 export
- 下划线前缀（`_schema.md`, `_relationship-whitelist.ts`）：明确"这是给素材作者的约定"，一眼可识别
- `useHouseState` hook：把关系值和历史抽出来，将来接入 SQLite 时只改这个 hook

---

## 四、数据契约（最核心的一节）

### 4.1 Scene 数据格式

```ts
// backend/scenes/kitchen-1.ts
import type { Scene } from './index';

export const kitchenOne: Scene = {
  id: 'kitchen-1',
  place: '厨房',
  time: '21:13',
  title: '厨房里的十二分钟',
  image: 'kitchen',                       // 前端 asset 名，不含扩展名

  // 给 AI 看的"氛围提示"（一句话描述场景基调）
  ambience: '深夜厨房，只有一盏暖光灯。温宁在洗碗，看到林一进来手停了一下。',

  // 在场角色（AI 需要知道谁在场才能算他们的关系值；林一 = 玩家）
  presentCharacters: ['温宁', '林一'],

  // 对话（玩家旁观，AI 不改这些，只用来理解氛围）
  dialogue: [
    { who: '林一', line: '你是不是有话想跟我说？' },
    { who: '温宁', line: '……我也不知道该怎么说。' },
    { who: '林一', line: '那就先别说，站一会儿也行。' },
  ],

  // 抛给玩家的问题
  question: '你觉得温宁为什么这么回避？',
  hint: '你的选择会影响后续剧情发展',

  // 3 个选项：只有 label，没有 result 和 effects（AI 现场判定）
  choices: [
    { key: 'A', label: '她在试探林一的态度' },
    { key: 'B', label: '她真的还没想清楚' },
    { key: 'C', label: '她不想告诉林一' },
  ],

  // 【关键】圈定 AI 只能碰的关系值 —— 从白名单里挑
  // 这样每个场景控制影响面，避免 AI 每次动一堆无关关系值
  affectableRelationships: [
    '林一 × 温宁 心动值',
    '紧张感',
    '信任度',
    '悬念值',
  ],
};
```

**类型定义**（`backend/scenes/index.ts`）：

```ts
export type Choice = { key: 'A' | 'B' | 'C'; label: string };

export type Scene = {
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
  choices: Choice[];
  affectableRelationships: string[];
};

import { kitchenOne } from './kitchen-1';
import { livingOne } from './living-1';
import { balconyOne } from './balcony-1';
import { kitchenTwo } from './kitchen-2';

export const scenes: Scene[] = [kitchenOne, livingOne, balconyOne, kitchenTwo];

export function getSceneById(id: string): Scene | undefined {
  return scenes.find((s) => s.id === id);
}
```

### 4.2 关系值白名单（`backend/scenes/_relationship-whitelist.ts`）

```ts
export const relationshipWhitelist = {
  // 人对人（先只列跟玩家有关或已知暧昧的，将来往里加行即可）
  interpersonal: [
    '林一 × 温宁 心动值',
    '林一 × 许佳 心动值',
    '林一 × 苏杳 心动值',
    '林一 × 沈知 信任度',
    '温宁 × 沈知 信任度',
  ],
  // 氛围值（全局）
  ambient: [
    '紧张感',
    '信任度',
    '悬念值',
    '意外度',
    '林一的信息差',
  ],
};

export const allowedRelationshipNames = new Set([
  ...relationshipWhitelist.interpersonal,
  ...relationshipWhitelist.ambient,
]);
```

### 4.3 `POST /api/choice` 契约

**请求体**：

```ts
{
  sceneId: 'kitchen-1',
  choiceKey: 'A' | 'B' | 'C',
  worldState: {
    // 当前所有关系值（key 一定在白名单里）
    relationships: {
      '林一 × 温宁 心动值': 72,
      '紧张感': 0,
      // ...
    },
    // 最近发生的事（最多 3 条，超过就丢最老的）
    recentHistory: [
      { time: '20:37', place: '客厅', summary: '沙发上第一次分组，玩家选了 B（各自邀请）' },
    ],
  },
}
```

**响应体**（成功）：

```ts
{
  resultText: '温宁停顿了一下，把碗放回水槽：「那你先说，你怎么想。」空气忽然变得很轻。',
  effects: [
    { name: '林一 × 温宁 心动值', delta: 6 },
    { name: '紧张感', delta: 3 },
  ],
  usage: { totalTokens: 823, promptTokens: 780, completionTokens: 43 },
}
```

**响应体**（失败）：

```ts
{ error: 'LLM output invalid', hint: 'effects 里有关系值不在白名单' }
```

### 4.4 `GET /api/scenes/:id`

返回 4.1 里的 Scene 对象。前端启动或点击场景时调用。

### 4.5 服务端验证规则

后端拿到 LLM 输出后**必须校验**：

1. `effects[].name` ∈ `allowedRelationshipNames` —— 不在的**直接丢弃这条 effect**（不整体失败）
2. `effects[].delta` ∈ [-10, 10] —— 超出的 clamp 回来
3. `effects.length` ∈ [1, 5] —— 空返回 500，超过 5 条时**截取前 5 条**（避免频繁重试）
4. `resultText.length` ∈ [10, 500] —— 过短或过长返回 500

---

## 五、Prompt 设计

**System prompt**（`backend/src/prompts/choice-judge.ts`）：

```
你是《心动小屋》恋综节目的剧情判定 AI。玩家扮演林一（男嘉宾）。你的任务：
根据玩家在当前场景做出的选择，判定接下来会发生什么，输出一段短剧情文字和相应的关系值变化。

# 世界观
{house-context.ts 内容：10 个人是谁、Day 4 晚上时间线、已知的暧昧线}

# 输出要求
1. resultText: 30-150 字的剧情推进文字，具体、有画面感（动作/神态/氛围）
   - 不要总结、不要评价，就是"接下来发生了什么"
   - 至少一处具体动作或神态（如"把碗放回水槽"、"耳尖有点烫"）
2. effects: 关系值变化数组，每条 {name, delta}
   - name 只能从"可影响关系值列表"里选
   - delta 只能在 -10 ~ +10 之间
   - 好选择 delta 正，冲突/回避 delta 负，大部分场景一次 1-3 条 effects
   - 不要每种关系都动
3. 输出严格 JSON，不要 markdown code fence
```

**User prompt 模板**：

```
# 当前场景
地点：{place}    时间：{time}
氛围：{ambience}
在场：{presentCharacters 逗号分隔}

对话回顾：
{dialogue 每行 "who: line"}

问题：{question}
玩家选了：{choiceKey} - {choiceLabel}

# 当前世界状态
关系值：
{relationships 每行 "name: value"}

最近发生：
{recentHistory 每条一行 "time place: summary"，若为空则写"（这是玩家第一件事）"}

# 可影响的关系值（只能从中选）
{scene.affectableRelationships 逐行列出}
```

**LLM 调用**：用 OpenAI JSON mode (`response_format: { type: "json_object" }`) 保证输出可解析；继承 `llm.ts` 已有的关思考配置。

---

## 六、前端接入

### 6.1 `useHouseState` hook

```ts
export function useHouseState() {
  const [relationships, setRelationships] = useState<Record<string, number>>(() =>
    initialRelationshipsFromHouseTs()
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const applyEffects = (effects: { name: string; delta: number }[]) => {
    setRelationships((prev) => {
      const next = { ...prev };
      for (const { name, delta } of effects) {
        next[name] = (next[name] ?? 0) + delta;
      }
      return next;
    });
  };

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((prev) => [...prev.slice(-2), entry]);   // 保留最近 3 条
  };

  return { relationships, history, applyEffects, pushHistory };
}
```

### 6.2 SceneRunner 改造

现有 `HouseApp.tsx` 里 `SceneRunner.onPick(sceneId, choiceKey)`：

**改造前**：从 `scene.choices[k].result` 直接查表显示

**改造后**：
```ts
const onPick = async (sceneId: string, choiceKey: 'A'|'B'|'C') => {
  setLoading(true);
  try {
    const { resultText, effects } = await api.postChoice({
      sceneId,
      choiceKey,
      worldState: { relationships, recentHistory: history },
    });
    setResultText(resultText);
    applyEffects(effects);
    pushHistory({ time: scene.time, place: scene.place, summary: `选了 ${choiceKey}（${scene.choices.find(c => c.key === choiceKey)!.label}）` });
  } catch (err) {
    showToast('AI 判定失败，请重试');
  } finally {
    setLoading(false);
  }
};
```

**loading 态**：三个选项按钮变灰不可点，中间显示"…"

---

## 七、素材作者接口约定（`backend/scenes/_schema.md`）

这份文件放在仓库里，PR 描述中重点标注，供素材作者的 agent 阅读：

**内容大纲**：

1. **快速开始**：如何加一个新 Scene（拷贝 kitchen-1.ts，改字段，往 index.ts 加一行 export）
2. **每个字段的含义**（详见 § 4.1）
3. **写 Scene 的原则**：
   - `dialogue` 是玩家旁观的对话（AI 不改这些），用来交代场景氛围
   - `choices[].label` 是"玩家的猜测/态度"，不是"玩家要说的话"
   - `affectableRelationships` 圈定这个场景可能触发的关系值，从白名单里挑（想加新的先加白名单）
   - `ambience` 一句话描述场景基调，给 AI 用来生成后果
4. **约束**：
   - `dialogue` 3-6 行
   - `choices` 恰好 3 个（A/B/C）
   - `affectableRelationships` 2-5 个
5. **禁止事项**：不要在 Scene 里写 `result` 或 `effects`（那是 AI 的活）

---

## 八、测试计划

### 8.1 手动验收（跑一次里程碑 2a 验收）

- [ ] 打开 App → 主页 → 点厨房场景 → 见对话 → 选 A → **1-3 秒内**出后果文字 → 后果合理
- [ ] `console.log(effects)`：所有 name 在白名单内，delta ∈ [-10, 10]
- [ ] 同一场景连玩 3 次分别选 A/B/C，比较后果文字差异应该明显
- [ ] Devtools 手动改 React state 让"林一 × 温宁 心动值"= 20（低分）→ 重玩厨房选 A → 后果应该比高分时冷淡
- [ ] Devtools Network offline → 选一个 → 显示 error toast，页面不崩

### 8.2 单元测试（backend）

- `validateEffects()` 函数：给一堆假 effects，验证白名单/delta 范围/数量约束
- `buildChoicePrompt()` 函数：给一个 Scene + worldState，验证 prompt 里字段都拼进去了

### 8.3 里程碑 2a 完成判定

- ✅ 4 个占位 Scene 都能玩通
- ✅ 同场景不同关系初值 → 后果文字有差异
- ✅ 素材作者 agent 拿到 `_schema.md` 后能独立加一个新 Scene（后续验证）

---

## 九、风险与开放项

| 风险 | 影响 | 缓解 |
|---|---|---|
| AI 生成的 resultText 每次都类似（表达单调） | 玩家体验差 | temperature = 0.9；prompt 里明确要"具体动作神态"；后续可加"few-shot 示例" |
| Token 数超预算（>1500） | 成本 | 3 条 recentHistory 上限；ambience 控制在 40 字内 |
| 关系值单调递增（AI 从不扣分） | 数值失衡 | prompt 里强调"冲突/回避 delta 负"；如果实测发现，加"每 3 次里至少 1 次负 delta" |
| Scene 素材作者供稿慢 | 阻塞 | 我们先做 3-5 个占位 Scene，把链路跑通；`_schema.md` 是给未来作者的 |

---

## 十、Out of Scope（下一次做）

- **长期记忆**：跨会话的角色记忆表（里程碑 2b）
- **SQLite 持久化**：world_state 持久化（里程碑 2b）
- **前端接入 TanStack Start**：目前 HouseApp.tsx 已在 React 里，本次直接改；但如果后续要做多角色单聊页，会用动态路由（里程碑 3）
- **AI 生成 Scene**：本次只判定 Choice，Scene 全静态
- **多角色 AI 交互**：其他角色互相对话（里程碑 3-4）

---

## 十一、下一步

1. 用户 review 本 spec → approve
2. 进入 writing-plans skill，生成实施 plan
3. 按 plan 分步实现

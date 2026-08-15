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

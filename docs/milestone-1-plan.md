# 里程碑 1 · 实施方案（待重启后继续）

> 记录时间：2026-08-14
> 状态：方案已定，代码还没开始写
> 目标里程碑：v0.2 里程碑 1 —— 跑通「跟温宁一个人聊天」

---

## 一、当前进度快照

### ✅ 已完成
- [x] 拿到火山方舟 API Key（Doubao-Seed-2.1-pro-260628）
- [x] 填入 `frontend/.env.local`
- [x] curl 测试调通（温宁回复：「你、你好呀～我是温宁，耳尖红红的，有点不好意思😳」）
- [x] 装了 rtk（局部模式，只在这个项目生效）
- [x] roadmap.md 已写入 `docs/roadmap.md`

### ⚠️ 待处理的风险
- **API Key 曾在截图里露出**（`ark-<REDACTED-已停用>`），如果那张截图存过云盘/相册云同步，建议去火山方舟「API Key 管理」停用后重建。

### ❌ 还没开始
- 里程碑 1 的所有实现代码

---

## 二、技术选型（已定）

| 决策 | 结果 | 理由 |
|---|---|---|
| 后端语言 | **Node.js**（不用 Bun，本机没装） | 跟前端同栈，TS 生态足够 |
| 后端框架 | **Express + tsx** | 最简单，够用 |
| LLM SDK | **openai** npm 包 | 兼容豆包/DeepSeek/OpenAI，一套代码切三家 |
| 前端第一版形态 | **独立 HTML 文件**（不接入 TanStack） | 快速验证 Loop，避免动到主前端 |
| 端口 | 后端 3001，HTML 直接 file:// 打开 | 加 CORS 允许 file:// 请求 |
| **关思考** | 请求里带 `thinking: { type: "disabled" }` | 上次测试一次「你好」烧了 2380 个 reasoning token，非常贵 |

---

## 三、要建的目录结构

```
flipped-ai/
├── backend/                       # 【新建】Node.js 后端
│   ├── package.json               # express + openai + tsx + dotenv
│   ├── tsconfig.json
│   ├── .env                       # 从 frontend/.env.local 复制一份（也可以直接读上层的）
│   └── src/
│       ├── llm.ts                 # LLM 调用封装（chat() 函数，关思考、错误处理）
│       ├── personas/
│       │   └── wenning.ts         # 温宁人设卡（system prompt）
│       └── server.ts              # Express 服务，暴露 POST /api/chat
├── demo/                          # 【新建】独立 HTML 测试页
│   └── wenning-chat.html          # 纯 HTML+CSS+JS，能跟温宁聊天
├── frontend/                      # 现有前端（本次不动）
└── docs/
    ├── roadmap.md
    ├── doubao-api-setup.md
    └── milestone-1-plan.md        # 【本文件】
```

---

## 四、文件内容规划

### 4.1 `backend/package.json`
```json
{
  "name": "flipped-ai-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "openai": "^4.68.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^22.16.5",
    "tsx": "^4.19.0",
    "typescript": "^5.8.3"
  }
}
```

### 4.2 `backend/src/llm.ts`（LLM 调用封装）
- 用 `openai` 包 new 一个 client，baseURL 指向豆包
- 导出 `chat(messages, options)` 函数
- **默认关掉深度思考**（`thinking: { type: "disabled" }`）
- 参数：`messages`（对话历史）、`temperature`（默认 0.9，让温宁说话有变化）
- 返回：`content` 字符串
- 错误处理：catch 后返回 `{ error, hint }`

### 4.3 `backend/src/personas/wenning.ts`（温宁人设）

温宁的核心设定（从 `data/house.ts` 已有信息提炼）：
- 21 岁害羞女生
- 说话轻声细语，会小结巴（"你、你好"），常有神态描写
- 在心动小屋 Day 4，跟林一在厨房有暧昧互动
- 跟沈知在阳台有秘密关系
- 玩家性别：男（`playerGender: "m"`）

导出 `wenningSystemPrompt: string`，作为 system 消息。

### 4.4 `backend/src/server.ts`（Express 服务）
- `POST /api/chat`
- 请求体：`{ history: Message[], userMessage: string }`
- 处理：
  1. 拼 messages: `[systemPrompt, ...history, { role: 'user', content: userMessage }]`
  2. 调 `chat()`
  3. 返回：`{ reply: string, usage: { totalTokens } }`
- CORS 允许所有源（包括 `null` origin，对应 file://）
- 从 `../frontend/.env.local` 读环境变量（或复制一份到 `backend/.env`）

### 4.5 `demo/wenning-chat.html`（聊天页）
纯 HTML，无框架依赖：
- 顶部：温宁头像 + 名字 + 当前场景（"厨房 · 21:13"）
- 中间：聊天气泡（用户蓝色右侧、温宁粉色左侧）
- 底部：输入框 + 发送按钮
- localStorage 存对话历史（重启页面不丢）
- 有"清空对话"按钮
- fetch `http://localhost:3001/api/chat`
- 显示 token 消耗（页面底部小字，方便观察成本）

---

## 五、启动/验证步骤（重启对话后按顺序做）

1. **cd 到 backend，install 依赖**
   ```bash
   cd /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/backend
   npm install
   ```
2. **确认能读到 API Key**（后端从 `../frontend/.env.local` 读，或者复制一份到 `backend/.env`）
3. **启动后端**
   ```bash
   npm run dev
   # 应该看到：Server listening on http://localhost:3001
   ```
4. **用 macOS 的 open 打开 HTML**
   ```bash
   open /Users/joycejin/Desktop/codespace/恋综体验/flipped-ai/demo/wenning-chat.html
   ```
5. **在页面里发一句话给温宁**，验证：
   - 有回复
   - 回复符合人设（害羞、结巴、有神态描写）
   - 底部 token 数在合理范围（`< 200 total tokens` 一次就说明关思考成功）
6. **多轮测试**：告诉温宁"我喜欢下雨"，几轮后问她"我说过喜欢什么天气来着？" —— 验证短期记忆。

---

## 六、验收标准

里程碑 1 完成的标志：
- [ ] 能连续跟温宁聊 10 轮不出戏
- [ ] 一次简单对话 token < 200（关思考成功）
- [ ] 温宁记得同一会话内你说过的话
- [ ] 页面在浏览器直接打开就能用，不用 dev server

---

## 七、下一次对话如何接续

直接告诉 Claude：
> "继续心动小屋里程碑 1，看 `docs/milestone-1-plan.md`，开始建 backend"

Claude 应该按这个方案：
1. 创建 `backend/package.json`（内容见 4.1）
2. 创建 `backend/tsconfig.json`
3. 创建 `backend/src/llm.ts`
4. 创建 `backend/src/personas/wenning.ts`
5. 创建 `backend/src/server.ts`
6. 创建 `demo/wenning-chat.html`
7. 帮你 `npm install`
8. 帮你启动服务 + open HTML

---

## 八、之后要注意的坑

- **豆包深度思考默认开启**，请求里必须显式 disable，否则每次几千 token
- **前端 HTML 用 file:// 打开时，Origin 是 `null`**，CORS 要允许
- **API Key 别再截图**（上次已经暴露过一次）
- **温宁的性格描写要具体**，别写"她很害羞"这种抽象词 —— 要写"说话会小结巴"、"耳尖会红"、"低头看袖口"这种可执行动作

---

## 九、里程碑 1 落地记录（2026-08-14）

### 实际交付
- **后端**：`backend/`，Node.js + Express + tsx + openai SDK，端口 3001
  - `POST /api/chat` 已可用，`GET /health` 健康检查
  - `backend/src/llm.ts`：chat() 封装，强制 `thinking: { type: "disabled" }`
  - `backend/src/personas/wenning.ts`：温宁 system prompt（4 段：基础 / 动作库 / 剧情坐标 / 说话规则）
  - `backend/src/server.ts`：从 `../frontend/.env.local` 读环境变量
- **前端 demo**：`demo/wenning-chat.html`，纯 HTML+JS，`open` 直接打开，localStorage 存历史
- 依赖已装好，`npm run dev` 可直接启动

### Token 实测（**修正验收标准**）
- 单轮"嗨" → 温宁一句短回复：**prompt 580 / completion 39 / total 619**
- system prompt 占绝大部分（中文 tokenization 1 汉字 ≈ 2-3 token）
- ⚠️ **原验收标准「一次对话 < 200 token」不现实**，中文角色扮演做不到
- 但没有 reasoning token 爆炸（关思考成功），成本 ~￥0.001/轮，仍可接受
- 后续可通过精简"说话规则"段落（第 4 段）省 100-150 token，但建议先跑几轮再优化

### 短期记忆验证 ✅
- 告诉温宁「我喜欢下雨」→ 后一轮问「我说过喜欢什么天气」→ 答「是下雨天嘛」

### 架构决策 · 保持 demo 独立（不接入 TanStack）
- 前端是 TanStack Start（React 19 + 内置 server routes），有能力把 backend 合并进去
- 里程碑 1 阶段**故意不接入**，等里程碑 2 一起做：`frontend/src/routes/chat/$character.tsx` 动态路由，一次把多角色架构立好

### 后续待办
- [ ] 温宁 system prompt 试聊几轮后决定要不要精简
- [ ] 里程碑 2 时接入 TanStack Start，走动态路由
- [ ] `frontend/.env.local` 里的 `ARK_API_KEY` 曾在截图暴露过（`ark-4cd63f70-...`），有空去火山方舟停用重建


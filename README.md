# flipped-ai · 心动小屋

沉浸式 AI 互动恋综 App。

> 你不是在看恋综，你正在经历一场心动。

## 仓库结构

```
flipped-ai/
├── backend/                 # Node + Express + tsx
│   ├── src/
│   │   ├── server.ts        # 路由：/api/chat、/api/scenes、/api/scenes/:id、/api/choice
│   │   ├── llm.ts           # OpenAI SDK 封装（JSON mode）
│   │   ├── choice-judge.ts  # 玩家选 A/B/C 后调 LLM 判定后果
│   │   ├── personas/        # 角色人设 + 房子世界观
│   │   └── prompts/         # LLM prompt 构造
│   └── scenes/              # 场景素材（外部作者可加）
│       ├── _schema.md       # 素材作者写 Scene 的规范
│       ├── _relationship-whitelist.ts   # 10 项关系值白名单
│       └── *.ts             # 4 个占位 scene
│
├── frontend/                # Vite + React + TanStack Router
│   └── src/
│       ├── components/HouseApp.tsx  # 主流程组件
│       ├── data/house.ts    # 前端静态 scene（后端未启动时的 fallback）
│       ├── hooks/useHouseState.ts   # 内存态关系值 + 历史
│       └── lib/api.ts       # API client
│
├── docs/
│   ├── roadmap.md
│   ├── milestone-1-plan.md
│   ├── milestone-2a-record.md
│   └── superpowers/         # spec + plan
│
└── demo/wenning-chat.html   # 里程碑 1 的纯 HTML 聊天页
```

## 文档

- 完整 PRD（飞书）：<https://my.feishu.cn/wiki/SqFgwKL81iYTKjkk6Obcz4y9nVd>
- v0.2 路线图：[docs/roadmap.md](docs/roadmap.md)
- 里程碑 1 记录：[docs/milestone-1-plan.md](docs/milestone-1-plan.md)
- 里程碑 2a 记录：[docs/milestone-2a-record.md](docs/milestone-2a-record.md)

## 本地运行

需要两个进程同时跑：

**后端**（3001 端口）
```sh
cd backend
npm install
cp .env.example .env   # 填入 ARK_API_KEY
npm run dev
```

**前端**（默认 8080）
```sh
cd frontend
npm install
npm run dev
```

打开前端后，点小屋里的厨房 / 客厅 / 阳台，选 A/B/C，会看到 LLM 生成的剧情走向。后端没启动时前端会 fallback 到 `frontend/src/data/house.ts` 的静态版本。

## 测试

```sh
cd backend && npm test   # 23 tests：sanitizer / prompt / whitelist / scenes registry
```

## 加新场景要改的地方

如果要加一个新 scene（比如 `garden`），需要同时改 3-4 处：

1. **`backend/scenes/garden.ts`** —— 新建一个 scene 文件（照 `_schema.md` 写）
2. **`backend/scenes/index.ts`** —— import 并加入 `scenes` 数组
3. **`frontend/src/components/HouseApp.tsx`（约第 79 行）** —— 把新 id 加入 `const ids = [...]` 数组
4. **`frontend/src/data/house.ts`** —— 加一份 fallback 版本（后端挂掉时用）

## 其他"写死"的地方

- **后端地址**：`frontend/src/lib/api.ts:1` `const API_BASE = "http://localhost:3001"`，部署时需要改成 env 变量
- **关系值白名单**：新关系值要同时改 `backend/scenes/_relationship-whitelist.ts` 和 scene 里的 `affectableRelationships`

## 版本

- **v0.1**：三 Tab（小屋 / 心动观察 / 我的）· 单日循环 · 硬编码剧本
- **里程碑 1**：后端骨架 + `POST /api/chat` 跑通豆包 API
- **里程碑 2a**：`POST /api/choice` LLM 判定 · 前端接入 · 4 个占位 scene · 关系值白名单
- **v0.2 目标**：每个角色独立人设卡 · 三层记忆系统 · 动态 scene 生成（见 [roadmap.md](docs/roadmap.md)）

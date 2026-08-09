# flipped-ai · 心动小屋

沉浸式 AI 互动恋综 App。

> 你不是在看恋综，你正在经历一场心动。

## 仓库结构

```
flipped-ai/
├── frontend/         # 前端 (React 19 + TanStack Start + Tailwind v4)
├── (backend/)        # 后端 & Agent 层 · 规划中
└── (docs/)           # 设计与规划文档 · 规划中
```

## 文档

- 完整 PRD（飞书）：<https://my.feishu.cn/wiki/SqFgwKL81iYTKjkk6Obcz4y9nVd>
- 原始 PRD（作者思考版）：`~/Desktop/codespace/xindong-xiaowu-prd/PRD.md`

## 前端

```sh
cd frontend
npm install
npm run dev
```

前端基于 [heart-scene-spark](https://github.com/JoyceJin0913/heart-scene-spark)（Lovable 生成的 v0.1 UI）迁移而来，后续开发在 `frontend/` 下继续。

## 版本

- **v0.1 MVP**：三 Tab（小屋 / 心动观察 / 我的）· 单日循环 · 硬编码剧本 · localStorage 持久化
- **v0.2 规划**：接入 LLM Agent · 每个角色独立人设卡 · 三层记忆系统

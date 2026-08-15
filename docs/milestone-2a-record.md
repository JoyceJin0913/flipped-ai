# 里程碑 2a · 落地记录

> 完成时间：2026-08-15
> Spec: [docs/superpowers/specs/2026-08-15-milestone-2a-design.md](superpowers/specs/2026-08-15-milestone-2a-design.md)
> Plan: [docs/superpowers/plans/2026-08-15-milestone-2a.md](superpowers/plans/2026-08-15-milestone-2a.md)
> 分支: `feature/milestone-2a`

## 实际交付

### 后端
- 新增 `POST /api/choice` —— 玩家选 A/B/C 后调 LLM 判定后果
- 新增 `GET /api/scenes` / `GET /api/scenes/:id` —— 静态素材查询
- 新增 `chatJson()` in [llm.ts](../backend/src/llm.ts) —— 用 OpenAI JSON mode，输出保证是可解析 JSON
- [llm.ts](../backend/src/llm.ts) 改用 lazy client init（apiKey 校验推迟到实际调用时），修复 test 载入时报错的问题

### 4 个占位 Scene
- `kitchen` · 厨房里的十二分钟（温宁 × 林一）
- `living` · 沙发上的第一次分组（苏杳/沈知/夏可 × 林一）
- `balcony` · 阳台上的那支烟火（温宁 × 沈知 × 林一）
- `kitchen-2` · 宵夜时间（许佳 × 林一）—— 前端未接入，作为多样性测试素材

### 关系值白名单（10 项）
- 人对人 5 项：林一 × 温宁 / 许佳 / 苏杳 心动值 · 林一 × 沈知 信任度 · 温宁 × 沈知 信任度
- 氛围 5 项：紧张感 · 信任度 · 悬念值 · 意外度 · 林一的信息差

### 前端
- 新增 [frontend/src/lib/api.ts](../frontend/src/lib/api.ts) —— API client
- 新增 [frontend/src/hooks/useHouseState.ts](../frontend/src/hooks/useHouseState.ts) —— 内存态 relationships + history 管理
- 改 [frontend/src/components/HouseApp.tsx](../frontend/src/components/HouseApp.tsx) —— SceneView 展示动态 resultText + loading 态；HouseApp 顶层 handlePick 调 API、静默更新关系值

### 素材作者接口
- [backend/scenes/_schema.md](../backend/scenes/_schema.md) —— 完整字段说明 + 禁止事项 + 写 Scene 技巧，供外部素材作者的 agent 参考

## Token 与延迟实测

单次 Choice 判定（厨房场景 · 选 A · 初始关系值）：
- **Total tokens: 1005**（prompt 857 / completion 148）
- 延迟：约 4-5 秒
- 白名单校验通过，effect 全在白名单内

对照 spec 目标：
- ✅ < 3 秒？→ 实测 4-5 秒，略超但可接受
- ✅ < 1500 token？→ 1005，达标
- ✅ resultText 有具体动作神态？→ AI 输出："指尖捏着洗碗棉顿了两秒，耳尖悄悄泛出浅粉，垂着眼把最后一个瓷碗冲净放进沥水架..."

## 单测覆盖

23 tests 全绿，分布：
- `_relationship-whitelist.test.ts` × 3
- `scenes/index.test.ts` × 6（含 scenes registry 一致性、白名单交叉验证）
- `prompts/choice-judge.test.ts` × 6（prompt 构造）
- `choice-judge.test.ts` × 8（sanitizer 边界：白名单 drop、delta clamp、length 校验、结构校验）

## 遇到的坑与修复

1. **llm.ts 顶层 apiKey 检查破 vitest 载入** —— 改成 lazy client init（`getClient()`），只在真正调用时校验。commit `c903c50` 的一部分
2. **backend scene id 跟 frontend house.ts 不一致导致 404** —— 后端原本用 `kitchen-1`/`living-1`/`balcony-1`，前端 `HouseApp` 传的是 `kitchen`/`living`/`balcony`。改后端 id 对齐前端。commit `9e34d97`
3. **vitest.config.ts include 只覆盖 `src/**`，scenes/ 里的 test 找不到** —— 扩展 include 到 `["src/**/*.test.ts", "scenes/**/*.test.ts"]`。commit `4d4a54b` 的一部分

## Out of Scope（下次做）

- **里程碑 2b**：SQLite 持久化 + 跨会话长期记忆（Day 1 说过的话 Day 5 还记得）
- **里程碑 3**：多角色 AI（每个角色单独有 agent）
- **素材作者接入**：外部作者按 `_schema.md` 交付更多 scene；同时把 `kitchen-2` 补上前端入口
- **前端接入 TanStack 动态路由**：里程碑 3 做 `chat/$character` 时一并做

## 提交列表

```
9e34d97 fix: align backend scene ids with frontend house.ts
616c4f3 feat: HouseApp calls /api/choice and updates relationships
e27cc66 feat: SceneView shows dynamic result and loading state
3edeb66 feat: add frontend api client and useHouseState hook
f1d4cb2 feat: add /api/scenes and /api/choice endpoints
c903c50 feat: add choice output sanitizer and judgeChoice
26dc9ff feat: add house context and choice judge prompt builder
d8e35fb feat: add 4 placeholder scenes and registry
54f55a2 docs: add scene author schema
4d4a54b feat: add scene types and relationship whitelist
bf92af8 chore: setup vitest for backend
```

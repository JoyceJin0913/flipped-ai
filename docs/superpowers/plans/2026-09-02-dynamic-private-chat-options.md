# 私聊动态对话选项实施计划

- 日期：2026-09-02
- Spec：`docs/dynamic-private-chat-options-spec.md`（v1.0）
- 执行方式：subagent-driven，每个 task 派 fresh subagent，主会话逐 task review
- 基线：阶段 1 代码已存在（`frontend/src/lib/chatSuggestions.ts` 358 行 + `frontend/src/data/chatTopics.ts` 的 `planChatSuggestionSlots`），`tsc` 干净，`output-context-smoke` / `interaction-signal-smoke` 通过

## 设计决策（相对 spec 的落地说明）

- **D1** `planChatSuggestionSlots(context, recentMessages?)` 接受当前对话，供 continue slot 承接 NPC 最后一句话（对应 spec §4 架构图中「当前最近对话 → 规划器」的边）。
- **D2** `SuggestionSlot` 比 spec §6.1 多本地字段 `fallbackReply`：断网/模型失败时客户端离线兜底回复，保证 20 轮可聊（spec §2.2/§9.3）。该字段不随请求发送。
- **D3** 记忆声称校验通过 slotId 前缀 `advance_follow_` 实现（规划器只给记忆跟进 slot 这个前缀）；服务端与客户端共用同一前缀常量与校验函数（spec §9.1）。guidance 中不再需要单独的权限标记。
- **D4** `callDoubao` 增加 `maxTokens` 选项；reply + 3 选项的单次调用需要 ~700 token（当前硬编码 220 不够，spec §12 要求每轮一次调用）。
- **D5** 旧 `getChatTopics` 保留为 @deprecated alias 直到调用点全部迁移（spec §6.3），Task D 移除。
- **D6** 前端测试沿用 tsx smoke 模式：`cd frontend && ../backend/node_modules/.bin/tsx src/core/__smoke__/xxx.ts`。
- **D7** 模型失败一律 HTTP 200 + `mode="fallback"`；仅缺 NPC id/name/day、跨域、缺 slots 返回 4xx（spec §9.3）。

## 任务拆分

### Task A —— 阶段 1 收尾：纯函数测试矩阵（§15.1）
- 新建 `frontend/src/core/__smoke__/chat-suggestions-smoke.ts`，覆盖：
  - 无记忆/低好感/低张力 → continue/express/advance 三个不同 slot
  - 冲突记忆或高张力 → 恰好一个 repair，不出现两个道歉选项
  - 高好感 → 可出现 romantic_probe；低好感 → 不出现
  - 只有目标 NPC 最近合法记忆形成跟进 slot
  - 模型返回 0/1/2/3 条合法选项 → 最终恰好 3 条（`fillSuggestionGaps`）
  - 重复文本/未知 slot/超长/Markdown/隐藏数值/无依据记忆声称 → 拒绝并按 slot 补齐（`validateGeneratedSuggestions`）
  - `mergeGeneratedSuggestions` 按 slotId 合并后仍使用本地 signal
- 验证：smoke 通过 + `rtk tsc` 干净。不改生产代码。

### Task B —— 阶段 2：服务端动态生成（§7/§8/§9/§12）
- `frontend/src/lib/doubao.server.ts`：`callDoubao` 增加 `maxTokens` 选项（默认 220 保持不变）。
- `frontend/src/routes/api.chat.ts` 重写：
  - 请求清理：member/context/history（最近 10 条×240 字符）/userMessage（可选，opening 模式）/slots（3 条，只收 slotId/direction/guidance/fallbackLabel/fallbackText，丢弃任何 signal/数值/记忆字段）
  - 一次模型调用同时产出 `{reply, suggestions}`；opening 模式 reply 必须为空
  - 结构化解析（剥 code fence、容错 JSON 提取）、`validateGeneratedSuggestions` + `fillSuggestionGaps` 逐项补齐、`mode` 计算
  - 服务端兜底：模型失败/超时/非法输出 → 200 + 通用 reply 兜底 + slot fallback 文案（§9.3）
  - 结构化日志：generationId、npcId、day、消息数、mode、通过数、拒绝原因枚举、耗时、usage（不记完整私聊文本，§12）
  - 过渡兼容：slots 缺失或非法时暂走旧 reply-only 路径（Task D 收紧为 400）
- `frontend/src/lib/api.ts`：`postChat` 契约升级为 spec §7.1/§7.3（slots 必传、AbortSignal 支持、新响应类型），复用 `lib/chatSuggestions.ts` 的类型。
- 验证：`rtk tsc` 干净 + lint + 现有 smoke 不回归。无法本地起模型时用构造请求手测 4xx 与清理逻辑。

### Task C —— 阶段 3：客户端逐轮编排（§10/§11）
- `frontend/src/components/HouseApp.tsx` 的 `ChatSheet`：
  - 打开即显示本地 slot fallback（`planChatSuggestionSlots` + `mergeGeneratedSuggestions(slots, [])`），同时异步请求开场选项，成功且未过期时整组原子替换
  - 每次发送：追加玩家消息 → 禁用选项与提交 → 以最新对话规划下一轮 slots → 单次 `postChat`（含 slots）→ 成功后同时追加 reply 与下一轮选项（按 slotId 合并，signal 取本地 slot）
  - 竞态保护：单调 requestId + AbortController（关闭面板/切换 NPC/新发送时 abort 旧请求）
  - 保留：自由输入（保守映射）、20 轮上限、onLog、`applyInteractionSignal` 幂等结算（`${chatSessionId}:r${roundNumber}`）、首轮写一条记忆
  - 断网兜底：请求失败用 slot.fallbackReply，选项回退 fallback 文案
- 验证：`rtk tsc` + lint + build 通过。

### Task D —— 阶段 4：结算回归与收尾（§11/§15/§16）
- api.chat.ts 收紧：slots 必填且恰好 3 条合法，否则 400（D7）
- 移除 `getChatTopics`/`generateChatTopics` alias 及不再使用的旧模板（spec §6.3 迁移完成后）
- 迁移 `output-context-smoke.ts` 旧断言到 `planChatSuggestionSlots` 契约
- 全量回归：`rtk tsc`、`rtk lint`、`rtk npm run build`、全部可运行 smoke
- 输出手测清单（首轮/连续三轮/冲突记忆/高好感/自由输入/模型失败/快速切换 NPC）与验收核对表（spec §16）

## 已知无关问题（不阻塞）

- 三个 smoke（event-output-context / island / settle / turnrunner）因 `.webp` 头像资源在 tsx 下不可加载而失败，属 2026-08-27 头像提交引入的历史遗留，与本次 spec 无关，另行处理。

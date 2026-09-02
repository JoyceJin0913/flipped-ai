# 私聊动态对话选项 —— 实施交付报告（Task D 收尾）

> 日期：2026-09-02
> Spec：`docs/dynamic-private-chat-options-spec.md`（v1.0）
> Plan：`docs/superpowers/plans/2026-09-02-dynamic-private-chat-options.md`
> 状态：阶段 1-4 代码完成，回归全绿；手测待用户执行（见 §5）

---

## 1. 各阶段完成情况（对照 spec §13 完成标志）

| 阶段 | spec §13 内容 | 完成标志 | 状态与证据 |
|---|---|---|---|
| 阶段 1 | 契约与纯函数 | 不调用 LLM 也能从任意合法 `NpcOutputContext` 得到恰好三个、意图不重复、可结算的选项 | **完成**（Task A）。`planChatSuggestionSlots` + `lib/chatSuggestions` 纯函数层；`chat-suggestions-smoke.ts`（core + lib 两份）全过 |
| 阶段 2 | 服务端动态生成 | 模型返回完整 / 部分非法 / 完全非法 / 超时四种情况下 API 都能产出合法 reply 与恰好三个选项 | **完成**（Task B）。Task D 已收紧为唯一 slots 路径；模型侧行为经代码走查 + 纯函数覆盖，**无 ARK key，未端到端实测** |
| 阶段 3 | 客户端逐轮编排 | 连续 20 轮每轮承接最新回复；快速关闭/切换/连续操作无过期响应覆盖 | **完成**（Task C）。requestId + AbortController、原子替换、离线兜底均已落地；交互层待手测 |
| 阶段 4 | 结算、回归与可观测性 | 动态选项可信 slot 元数据接回 `InteractionSignal`；幂等与记忆写入验证；结构化日志；类型检查 / lint / smoke / 生产构建 / 关键手测 | **完成（除手测）**（本次 Task D）。slots 契约收紧、旧 alias 移除、smoke 迁移、全量回归通过（见 §3）；手测见 §5 |

Task D 具体完成项：

1. **`routes/api.chat.ts` 收紧契约（plan D7 / spec §9.3）**：删除旧 reply-only 路径（原 503 分支）；`slots` 清理后不是恰好 3 条合法 → 400，错误消息注明「需要恰好 3 条 slotId 互异且兜底文案非空的 slots」。保留 `rejectCrossOrigin` / `rateLimit` / `member.name` 必填 / JSON 解析失败四类 4xx。文件头注释移除「过渡策略」说明，标注唯一路径。
2. **移除旧 alias（spec §6.3）**：`chatTopics.ts` 删除 `getChatTopics`、`generateChatTopics`、`StatefulChatTopic`、`FALLBACK_TOPICS`、`repairTopic`、`memoryFollowUpTopic`、`flirtTopic` 及不再使用的 import（`ChatTopic`、`InteractionStrength`、`InteractionValence`；`MemoryTag` 仍被 `advanceMemoryFollowSlot` 使用而保留）。保留 `planChatSuggestionSlots` 全部 slot 工厂。清理文件级 @deprecated 注释，写入文件用途说明。
3. **迁移旧 smoke 断言**：`output-context-smoke.ts` 三处 `getChatTopics` 断言迁移到 `planChatSuggestionSlots` 契约（等价但按新 slotId/意图语义，见 §2）。

---

## 2. 迁移后的 output-context-smoke 断言（Task D item 3）

最终文件：`frontend/src/core/__smoke__/output-context-smoke.ts`（166 行）

- 冲突状态（chatB：tension 60 + conflict 记忆）→ 恰好 3 个 slot；direction 依次为 `continue/express/advance`；`slots[2].slotId === "advance_repair"` 且 `intent === "repair"`；全组 repair 恰好 1 个；三个 intent 互不相同；每个 slot 携带确定性 signal 字段。
- 高好感 + 秘密记忆（chatA：72/65 + secret 记忆 a-private）→ 出现 `advance_follow_secret_a-private` 且 `intent === "support"`。（原「高 interest 生成 romantic_probe」断言按 §6.2 优先级迁移：可跟进记忆 > 高好感，跟进占位 advance，暧昧试探不再断言。）
- 默认状态（npc_c）→ 恰好 3 个 slot、intent 互不相同；无 `repair`、无 `romantic_probe`、无 `advance_follow_` 前缀记忆跟进。
- 文件其余断言（上下文可见性、私密记忆不串 NPC、隐藏数值不进 LLM 文本等）未改动；结尾文案改为 "output context + dynamic chat suggestions smoke passed ✓"。

---

## 3. 全量回归结果（最终状态，2026-09-02）

| 命令 | 结果 |
|---|---|
| `tsx src/core/__smoke__/chat-suggestions-smoke.ts` | PASS（chat suggestions pure-function smoke passed ✓） |
| `tsx src/core/__smoke__/output-context-smoke.ts` | PASS（output context + dynamic chat suggestions smoke passed ✓） |
| `tsx src/core/__smoke__/interaction-signal-smoke.ts` | PASS（12 条断言） |
| asset-loader 版 `island-smoke.ts` | PASS（累计 97 条断言） |
| asset-loader 版 `settle-smoke.ts` | PASS |
| asset-loader 版 `event-output-context-smoke.ts` | PASS |
| asset-loader 版 `turnrunner-smoke.ts` | PASS（59/59，与改动前基线一致，非历史遗留失败） |
| asset-loader 版 `lib/__smoke__/chat-suggestions-smoke.ts` | PASS |
| `rtk tsc`（repo 根，spec 指定命令） | TypeScript: No errors found |
| `../node_modules/.bin/tsc --noEmit`（frontend 自身 tsconfig 复核） | 无错误 |
| `eslint`（HouseApp / api / chatSuggestions / chatTopics / api.chat / doubao.server / 两份 smoke） | 0 errors（prettier 自动修复 2 处） |
| `npm run build`（frontend 生产构建） | built in 141ms，exit 0 |
| `rtk npm run build`（repo 根，spec 指定命令） | exit 0 |

> 说明：spec 命令表中的 `rtk tsc` 与 `rtk npm run build` 在 repo 根执行，实际只覆盖废弃旧拷贝 `flipped-ai/src`；本次功能位于 `frontend/src`，故额外以 `frontend/tsconfig.json` 与 `frontend` 的 `npm run build` 复核，两者均通过。

---

## 4. spec §15 测试矩阵逐项核对

### 4.1 纯函数（§15.1）— 全部通过（chat-suggestions-smoke / output-context-smoke）

- [x] 无记忆、低好感、低张力时仍生成 `continue/express/advance` 三个不同 slot —— §15.1-1 + output-context 默认态断言
- [x] 有冲突记忆或高张力时恰好一个 `repair` slot，不出现两个道歉选项 —— §15.1-2（张力 40 / 冲突记忆 / 拒绝记忆三场景）+ 冲突态断言
- [x] 高好感可出现 `romantic_probe`，低好感不出现 —— §15.1-3（含 60 边界、NPC 侧好感、记忆优先于暧昧）
- [x] 只有目标 NPC 的最近合法记忆能形成跟进 slot —— §15.1-4（chat 标签不跟进、secret 变体、多记忆只跟最近、冲突不叠加、跨 NPC 隔离）
- [x] 模型返回 0/1/2/3 条合法选项时最终均恰好为 3 条 —— §15.1-6（source 序列 + mode 一并断言）
- [x] 重复文本、未知 slot、超长文本、Markdown 和无依据记忆声称被拒绝并按 slot 补齐 —— §15.1-7/8/10（reason 枚举断言 + 通用池逐项跳过）
- [x] 客户端按 `slotId` 合并后仍使用原始本地 `signal`，伪造字段无法覆盖 —— §15.1-9（截断、未知/重复 slot 丢弃一并覆盖）

### 4.2 API（§15.2）— 代码走查验证，无 ARK key，未端到端实测

- [x] 无 `userMessage` 请求返回无 reply 的三个开场选项 —— `generateDynamicChatResponse` 的 `openingMode` 门控 reply（走查）
- [x] 有 `userMessage` 请求返回合法 reply 与下一轮三个选项 —— 同一入口、单次调用（走查）
- [x] 模型返回非 JSON、缺字段、错误 slot 或超长内容时降级正常 —— `parseModelChatOutput` 容错 + `validateGeneratedSuggestions` + `fillSuggestionGaps`（纯函数层已测；服务端接线走查）
- [x] 模型超时不发起第二次计费请求 —— `callDoubao` 单次调用、`AbortSignal.timeout(12s)`、catch 即整体降级不重试（走查）
- [x] 恶意玩家输入不能覆盖 system prompt 或要求泄露其他 NPC 记忆 —— 玩家文本包引号标注为数据 + 只读资料清洗 + prompt 显式「非指令」约束（走查）
- [x] 缺 NPC id/name/day 和跨域请求被正确拒绝 —— `member.name` 必填 400、`slots ≠ 3` 400、`rejectCrossOrigin` 保留（走查）
  - 备注：`npcId`/`day` 缺省时实现为容忍（npcId 置空走通用人设、day 缺省不注入），未按 spec §9.3 字面返回 4xx——这是阶段 2 定稿行为（plan D7 收窄），Task D 未扩大改动范围；如需完全对齐 spec 文本请另开小 task。

### 4.3 UI 与整合（§15.3）— 代码走查 + 既有 smoke；交互项待手测

- [x] 打开面板立即有本地兜底选项，动态结果整组替换 —— `HouseApp` ChatSheet：`planChatSuggestionSlots` 同步兜底 + 异步开场请求 + 原子替换（走查）
- [x] 玩家在初始请求返回前已发送消息时，过期结果不覆盖新会话 —— 单调 `requestId` 校验（走查）
- [x] 快速关闭面板或切换 NPC 不产生过期 setState / 串话 / 异常 —— `AbortController` 取消 + requestId 双保险（走查）
- [x] 选择动态选项和自由输入都只结算一次 `InteractionSignal` —— 会话幂等 id `${chatSessionId}:r${roundNumber}`（`interaction-signal-smoke` + 走查）
- [x] 断网或服务端故障时仍可连续聊满 20 轮 —— 客户端失败路径用 `slot.fallbackReply` + fallback 文案（走查；需手测断网确认）
- [x] 当天私聊人数、日结束门槛、事件流、结局与报告页不回退 —— 本轮改动不触碰相关状态机；`turnrunner/event-output-context/island/settle` smoke 全过

### 4.4 项目回归（§15.4）— 全部通过

- [x] TypeScript 检查通过（repo 根 + frontend 双跑）
- [x] lint 通过（改动文件清单，非整仓）
- [x] 现有 NPC 状态 / output context / interaction signal / island store smoke 通过
- [x] 生产构建通过（frontend + repo 根双跑）
- [ ] 手测（首轮 / 连续三轮 / 冲突记忆 / 高好感 / 自由输入 / 模型失败 / 快速切换 NPC）—— **待用户执行**，清单见 §5

---

## 5. 手测清单（给用户）

前置：`cd frontend && npm run dev`，打开本地地址进入小屋某日；`/api/chat` 由 frontend TanStack 服务端处理，模型经 `ARK_API_KEY` + `ARK_ENDPOINT_ID`（或 `ARK_MODEL`）调用 Doubao/ARK。

1. **首轮打开**：点开某位 NPC 私聊 → 立即出现三个可点选项（先本地兜底，随后整体替换为动态文案，无逐个闪烁）；三选项意图明显不同（承接/表达/推进）。
2. **连续三轮**：连续选择/输入三轮，每轮 NPC 回复后出现新的三个选项；选项承接上一轮 NPC 最后一句（continue 选项），不重复相同通用话题。
3. **冲突记忆 NPC**：与该 NPC 存在张力/冲突记忆时，恰好出现一个「把没说开的话聊清楚」类 repair 选项，且不会同时出现两条同义修复/跟进。
4. **高好感 NPC**：高好感 NPC 的选项与低好感 NPC 可观察差异（推进方向含关心/暧昧试探空间）；若有秘密记忆，应出现「关心上次只对你说的事」跟进选项且只有它引用该记忆。
5. **自由输入**：文本框始终可用；自由输入结算正常（保守映射），选项在发送后照常刷新。
6. **断网 / 模型失败**：临时清空 `ARK_API_KEY`（或停掉模型服务）后重开私聊/继续发送 → 仍能看到三个选项、NPC 有本地兜底回复、会话不中断、可聊满 20 轮（服务端日志 mode=fallback）。
7. **快速切换 NPC / 关闭面板**：发送后立刻切 NPC 或关闭面板 → 无报错、无串话、回来/切回后状态与选项属于当前 NPC。
8. 顺带回归：当天私聊人数、20 轮上限、「与 3 位不同嘉宾私聊后才可结束当天」、日结束与事件流正常。

---

## 6. spec §16 验收标准逐条核对

- [x] 开场与每轮 NPC 回复后都会生成新的三个选项 —— 代码层面完成（open + 每轮 send 均重新规划并请求）；交互确认见手测 1/2
- [x] 选项同时受 NPC 人设、当天/地点、关系描述、目标 NPC 最近记忆和当前对话影响 —— `planChatSuggestionSlots(NpcOutputContext, recentMessages)` 单一读取层 + continue 承接最近 NPC 语句（smoke 覆盖无对话/有对话分支）
- [x] 三个选项意图不重复，不再同时出现两个实质相同的冲突修复选项 —— output-context 冲突断言 + §15.1-2
- [x] 所有返回均为恰好三个、可直接发送、长度合法且文本唯一 —— `fillSuggestionGaps` 结构性保证 + §15.1-6/7 断言
- [x] 无依据共同回忆、隐藏数值、其他 NPC 私密记忆不会进入选项或 NPC 回复 —— 校验模式 + `parseReadOnlyNpcContext` 只读资料 + §15.1-4g / output-context 串线断言
- [x] 模型不能修改选项对应的结算意图、强度、记忆标签或关系数值 —— signal 永远取本地 slot（§15.1-9 伪造字段用例）
- [x] 模型不可用或部分输出不合法时，服务端与客户端降级均能让会话继续 —— 服务端 200+fallback、客户端 fallbackReply（走查；断网手测见 §5-6）
- [x] 仍只存在一套 NPC 状态/记忆权威来源，未恢复 `f7acd4f` 平行 `chatHistory` —— 无新增存储
- [x] 并发、取消、重试和组件卸载不会导致过期选项、重复结算或跨 NPC 串话 —— requestId + AbortController（走查；手测 7）
- [x] 项目回归检查全部通过 —— §3

---

## 7. 已知遗留（不阻塞）

1. **根目录整仓 lint 慢**：本轮只 lint 了改动文件清单（任务指定范围）；整仓 `eslint .` 有已知性能问题，建议后续单独处理。
2. **smoke 已并入 core/__smoke__**：原 `frontend/src/lib/__smoke__/chat-suggestions-smoke.ts` 中 core 文件未覆盖的场景已并入 `frontend/src/core/__smoke__/chat-suggestions-smoke.ts`，lib 侧重复文件及其空目录已删除（位置约定保持 core/__smoke__）。
3. **spec §9.3 vs 实现**：缺 `npcId`/`day` 目前容忍而非 4xx（阶段 2 定稿，D7 收窄），如需严格对齐另开小 task。
4. **ARK 端到端**：无 key 环境，API 侧与模型失败路径仅代码走查 + 纯函数测试，需按 §5 手测补足。
5. 阶段 2-4 改动尚在工作区未提交（含 spec/plan 文档、smoke 新文件），由主会话决定提交策略。

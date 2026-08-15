# 豆包 / 火山方舟 API 接入指南

《心动小屋》v0.2 使用**豆包 Seed 1.6**（通过火山方舟平台）作为主 LLM。本指南带你从零拿到 API key。

---

## 一、总览：需要拿到 3 个东西

填到 `frontend/.env.local` 里的 3 个值：

```env
ARK_API_KEY=xxxxxxxxxxxx...        # 你的 API Key
ARK_ENDPOINT_ID=ep-xxxxxxxxx       # 你创建的接入点 ID
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3   # 已填好，不用改
```

---

## 二、7 步流程

### Step 1 · 注册火山引擎账号

- 网址：<https://www.volcengine.com>
- 手机号注册，需要**实名认证**（个人身份证或企业执照）
- 实名认证约 1-3 分钟

### Step 2 · 进入火山方舟控制台

- 直达链接：<https://console.volcengine.com/ark/>
- 或者从火山引擎首页 → 顶部搜索 "方舟" → 点击"火山方舟"

### Step 3 · 开通模型（豆包 Seed 1.6）

- 左侧导航栏 → **模型广场**（或"体验中心"）
- 找到 **"豆包大模型 · Doubao-Seed-1.6"**
- 点击"开通"
- 阅读并同意服务协议
- **首次开通会送免费 tokens**（每个模型通常送 50 万 token，够 v0.2 调试用一阵）

> 💡 备选模型（如果 Seed 1.6 感觉贵）：
> - Doubao-Seed-1.6-Flash（更快更便宜，输入约 ¥0.15/百万 token）
> - Doubao-Seed-1.6-Lite

### Step 4 · 创建"接入点"（Endpoint）

火山方舟和其他平台最大的区别：**必须先创建 Endpoint 才能调用**。

- 左侧导航 → **在线推理** → **创建接入点**
- 配置：
  - **接入点名称**：随便起，例如 `xindong-wenning-agent`
  - **模型**：选 Doubao-Seed-1.6（或你在 Step 3 开通的模型）
  - **计费方式**：**后付费**（按 token 用量结算，最常见）
  - **限流**：默认即可
- 点"确认接入"
- 创建完后，你会看到 **接入点 ID**，形如 `ep-20260807190000-xxxxx`
- **复制这个 ID → 填到 `.env.local` 的 `ARK_ENDPOINT_ID`**

### Step 5 · 生成 API Key

- 左侧导航 → **API Key 管理**（或"访问密钥"）
- 点"**创建 API Key**"
- **给权限**：至少勾选"**火山方舟推理**"权限
- 命名例如 `xindong-dev`
- 复制生成的 Key（形如 `xxxxxxxx...`，40+ 字符）
- ⚠️ **API Key 只在创建时显示一次**，如果关掉页面就再也看不到，只能重新生成
- **复制 → 填到 `.env.local` 的 `ARK_API_KEY`**

### Step 6 · 充值（可选，但推荐）

- 免费额度可能不够长期开发用
- 左侧导航 → **费用中心** → **充值**
- **最低 ¥10 起充**
- v0.2 调试阶段建议先充 ¥50~100（够跑几万次对话）

### Step 7 · 测试是否能调通

在项目 `frontend/` 目录下跑：

```bash
# 加载 .env.local
export $(cat .env.local | grep -v '^#' | xargs)

# 测试调用
curl -X POST "$ARK_BASE_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "'"$ARK_ENDPOINT_ID"'",
    "messages": [
      {"role": "system", "content": "你是温宁，一个害羞的 21 岁女生。"},
      {"role": "user", "content": "你好呀"}
    ]
  }'
```

**成功**：返回 JSON，里面有 `choices[0].message.content` 是温宁的回复。
**失败**：仔细看 error message：
- `401` = API Key 错了或权限不够
- `404` = Endpoint ID 错了或没开通
- `429` = 限流，稍等再试
- `402` = 没充值/免费额度用完

---

## 三、常见问题

### Q1: 一定要充钱吗？
免费额度（50 万 token）可以先跑一段时间。v0.2 调试 100 次对话大约用 20 万 token，够用。**但生产环境必须充钱**。

### Q2: 我不想实名怎么办？
火山方舟必须实名。备选方案：改用 **DeepSeek**（<https://platform.deepseek.com>），邮箱注册就能用，价格差不多。改 `.env.local` 里 `LLM_PROVIDER=deepseek`。

### Q3: Endpoint ID vs API Key 是什么关系？
- **API Key**：证明你是谁（身份证）
- **Endpoint ID**：证明你要调哪个模型（房间号）
- 一个账号可以创建多个 Endpoint（每个绑不同模型）
- 一个账号可以有多个 API Key（可以分给不同项目/环境）

### Q4: 我的 API Key 被泄漏了怎么办？
立即到 API Key 管理页 → 停用/删除旧 key → 创建新 key。因为 `.env.local` 有 gitignore 保护，只要没手动 push 就是安全的。

### Q5: 定价是多少？
Doubao-Seed-1.6 (2026 年上半年)：
- 输入：¥0.8 / 百万 token
- 输出：¥8 / 百万 token
- 缓存命中：输入部分 20% 折扣

对我们这个 App 一次对话（约 1500 输入 + 200 输出 token）成本 ≈ ¥0.003。

---

## 四、我把 API Key 存哪？

**开发环境**：`frontend/.env.local`（本文件已在 gitignore 里）

**生产环境**（未来上线时）：
- Vercel / Netlify → 项目 Environment Variables 面板
- 自建服务器 → 系统环境变量或 secret manager
- **绝对不要 commit 到 git**

---

## 五、拿到 3 个值后怎么办？

打开 `frontend/.env.local`（我已经帮你从 `.env.example` 复制好了），填入：

```env
ARK_API_KEY=<Step 5 拿到的 API Key>
ARK_ENDPOINT_ID=<Step 4 拿到的 Endpoint ID>
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
# 其他保持默认
```

然后告诉我"填好了"，我就可以做下一步（Agent 层）。

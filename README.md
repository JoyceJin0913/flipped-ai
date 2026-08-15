# 🏝️ 心动岛（Heart Signal Island）

> AI 驱动的恋综互动游戏 —— 七天六夜的心动实验

## ✨ 项目概览

**心动岛** 是一款基于 PRD 文档完整实现的 AI 恋综互动游戏。玩家扮演一档恋爱综艺的嘉宾，在七天六夜的岛居生活中，通过对话选择、心动投票和事件决策，与 5 位 NPC 嘉宾 + 4 位竞争者发展关系，最终找到自己的心动对象。

### 核心体验

- 🎭 **十二题人格测试** → MBTI + 依恋类型诊断
- 💕 **智能匹配池** → 四维加权算法（高契合/反差吸引/雷区检测）
- 💬 **五类意图对话** → 试探/推进/安抚/幽默/冒险，每种对不同依恋型效果不同
- 📊 **实时心动值系统** → 基于 §12 判定矩阵的数值引擎
- 🔒 **冰山四层解锁** → 对话深入逐步揭示 NPC 真实人格
- 🗳️ **每日心动投票** → 2票/天，私聊结束弹窗 + 复盘可撤回改投
- 🏠 **三幕日循环** → 白天公共事件 → 私聊时间 → 独处复盘（顺序锁死）
- 📺 **共同记忆引擎** → 公共事件影响全员关系，各依人格重算态度
- 💓 **心动分级信号** → 微动/心动/暴击/吃醋 四级视觉反馈
- 🎮 **读心猜猜小游戏** → 猜 NPC 性格线索赢取点数
- 📍 **Day5 多人约会** → 约会选择 + 闯入券连锁反应
- 🏆 **终选之夜** → 三种结局：牵手成功 / 错位遗憾 / 独自离岛
- 📊 **复盘画像** → 心动轨迹图 / 依恋诊断 / 专一度分析 / 口嫌体正直检测

---

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **React** | 19.x | UI 框架 |
| **TanStack Router** | 1.170.x | 文件路由系统 |
| **Tailwind CSS** | 4.x | 原子化样式（oklch 色彩系统） |
| **Radix UI / shadcn** | 最新 | 无障碍组件库（46个） |
| **Zustand** | 最新 | 全局状态管理 + localStorage 持久化 |
| **Lucide React** | 最新 | 图标库 |
| **Vite** | 8.x | 构建工具 |

> **设计系统**: 深色玻璃态（glass morphism）+ oklch 色彩空间 + 自定义语义色（male/female/romance）

---

## 📁 项目结构

```
flipped-ai/
├── index.html                  # 入口 HTML
├── package.json               # 依赖配置
├── vite.config.ts             # Vite 配置（纯客户端模式）
├── tsconfig.json              # TypeScript 配置
│
├── src/
│   ├── main.tsx               # 应用入口
│   ├── styles.css             # Tailwind v4 设计系统（oklch + glass-card）
│   │
│   ├── core/                  # 🔥 核心数据层（唯一口径源）
│   │   ├── types.ts           # PRD §4 完整类型定义
│   │   ├── npcLibrary.ts      # PRD §13 16位NPC角色库（冰山四层）
│   │   └── scoring.ts         # PRD §12 数值引擎（计分/判定/匹配池）
│   │
│   ├── stores/                # 状态管理
│   │   └── useGameStore.ts    # Zustand 全局 Store + 持久化 + 共同记忆引擎
│   │
│   ├── components/
│   │   ├── GameApp.tsx        # 🎯 主入口（Phase Router + 三Tab 布局）
│   │   ├── game/              # 🎮 游戏业务组件
│   │   │   ├── shared.tsx     # UI 原子组件（TopBar/Avatar/HeartBar/BottomSheet/TabBar）
│   │   │   ├── onboarding.tsx # 冷启四阶段（建档/人格测试/8选5/入岛）
│   │   │   ├── dayloop.tsx    # 三幕日循环 + 私聊判定引擎 + 偷看闯入
│   │   │   └── observation.tsx# 心动观察/我的/终选之夜/复盘画像
│   │   └── ui/                # shadcn/ui 组件库（46个组件）
│   │
│   ├── routes/                # TanStack Router 文件路由
│   │   ├── __root.tsx         # 根路由
│   │   └── index.tsx          # 首页路由 → GameApp
│   │
│   ├── data/                  # Lovable 原始数据（保留参考）
│   │   └── house.ts
│   │
│   └── lib/                   # 工具函数
│       └── utils.ts
│
└── public/                    # 公共资源
    └── favicon.ico
```

**代码统计**: 64 个源文件 | ~8800 行代码 | 业务组件按阶段拆分为 4 个模块（shared / onboarding / dayloop / observation）

**质量状态**: `tsc --noEmit` 零错误（严格模式含 `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`）| `vite build` 通过（356 KB / gzip 113 KB）| 全流程 8 阶段浏览器实测通过

---

## 🎮 游戏流程

```
┌─────────────┐
│  建档案      │ ← 输入姓名/性别/星座
└──────┬───────┘
       ▼
┌─────────────┐
│ 人格测试     │ ← 12题（8题MBTI + 4题依恋）+ 进度条动画
└──────┬───────┘
       ▼
┌─────────────┐
│ 8选5 匹配   │ ← 四维匹配池 + 档位标签(高契合/反差/雷区) + 竞争者生成
└──────┬───────┘
       ▼
┌─────────────┐
│ 开场动画     │ ← 4步渐入动画（登岛介绍）
└──────┬───────┘
       ▼
┌──────────────────────────────────────────────────┐
│ Day 1-6 日循环（三幕引擎）                         │
│ ┌──────────┐  ┌──────────┐  ┌────────────┐       │
│ │ 白天活动   │→ │ 私聊时间   │→ │ 独处复盘    │       │
│ │ ·公共事件  │  │ ·五类对话  │  │ ·心动投票   │       │
│ │ ·嘉宾列表  │  │ ·判定结算  │  │ ·读心猜猜   │       │
│ │ ·心跳信号  │  │ ·投票弹窗  │  │ ·经济系统   │       │
│ └──────────┘  └──────────┘  └────────────┘       │
│                                                    │
│ ⚡ Day5 特殊: 多人约会 + 闯入券连锁反应           │
│ ⚡ 共同记忆: 公共事件影响全员关系                   │
│ ⚡ 心动信号: 微动/心动/暴击/吃醋 视觉反馈          │
└──────────────────┬───────────────────────────────┘
                   ▼
┌─────────────┐
│ 终选之夜     │ ← Day7 最终选择 + 三种结局
│             │   ·牵手成功（双向奔赴）
│             │   ·错位遗憾（单恋/时机未到）
│             │   ·独自离岛（心动值不足）
└──────┬───────┘
       ▼
┌─────────────┐
│ 复盘画像     │ ← 完整数据分析
│             │   ·心动轨迹柱状图（7天趋势）
│             │   ·依恋类型诊断 + 建议
│             │   ·专一度/撤票/口嫌体正直 分析
│             │   ·全员最终排行
└─────────────┘
```

---

## 🧮 数值系统（PRD §12）

### 对话判定公式

```
Δ = 基础值(intent × attachment) × 场景系数 × 阶段系数 + 核心需求奖励
```

### 判定矩阵（基础值）

| 意图 \ 依恋 | 安全型 | 焦虑型 | 回避型 |
|------------|--------|--------|--------|
| 试探 (probe) | +3 | +3 | **+4** |
| 推进 (advance) | +4 | **+6** | -3 |
| 安抚 (soothe) | +3 | **+7** | +2 |
| 幽默 (humor) | +4 | +2 | +3 |
| 冒险 (adventure) | +3 | +4 | **-5** |

### 场景系数

| 场景 | 系数 |
|------|------|
| 日常私聊 | 1.0 |
| **深夜私聊** | **×1.3** |
| 公开群聊 | 0.8 |
| 多人约会 | 1.2 |

### 阶段系数

| 阶段 | 心动值范围 | 系数 |
|------|-----------|------|
| 陌生人 | 0-20 | ×0.8 |
| 破冰中 | 21-45 | ×1.0 |
| 暧昧期 | 46-70 | ×1.2 |
| 心动中 | 71-100 | ×1.4 |

### 冰山线索解锁阈值

`[10, 25, 45, 65]` → 分别解锁 L1表现层 / L2角色层 / L3冲突层 / L4核心层

---

## 🎨 设计系统

> 设计系统**唯一来源**是 `src/styles.css`，与 Lovable 原版 `heart-scene-spark` / `flipped-ai@frontend` 的 `styles.css` 逐行一致（仅补充了原版遗漏的 `text-romance` 工具类与深色滚动条样式）。
> `:root` 本身即暗色主题，不依赖 `.dark` class。

### 色彩（oklch）

```css
--background: oklch(0.16 0.028 20);      /* 暖玫瑰黑底 */
--primary: oklch(0.72 0.15 12);          /* 珊瑚粉主色 */
--accent: oklch(0.78 0.12 65);           /* 金橙强调色 */
--male: oklch(0.68 0.13 245);            /* 男性标识-蓝 */
--female: oklch(0.76 0.13 350);          /* 女性标识-粉 */
--radius: 1.125rem;                      /* Lovable 大圆角基准 */
```

`--male` / `--female` 已在 `@theme inline` 注册为 `--color-male` / `--color-female`，
因此可直接使用语义类：`text-male`、`bg-female/10`、`border-male/40`，
**不要**再写 `bg-[var(--male)]/20` 这类逃逸写法。

### 自定义工具类（`@utility`）

| 工具类 | 作用 |
|--------|------|
| `glass-card` | `color-mix(in oklab, var(--card) 72%, transparent)` + `backdrop-filter: blur(14px)` + 1px 边框 |
| `bg-romance` | 135° 珊瑚粉→金橙渐变（主按钮、我方气泡） |
| `bg-night-fade` | 页面主体的夜色渐隐背景 |
| `shadow-glow` | 主色调发光阴影（选中态、主按钮） |
| `text-romance` | 渐变文字（`background-clip: text`），用于 MBTI 结果等强调文本 |

### 关键 UI 模式（严格对齐 Lovable）

| 元素 | 规范 |
|------|------|
| 页面大标题 | `text-3xl font-semibold tracking-[0.3em] text-primary` 居中；标题超过 4 字自动降为 `text-2xl tracking-[0.18em]` 防溢出 |
| 时间戳 | `text-[11px] tracking-[0.3em] text-muted-foreground` |
| 移动端容器 | `mx-auto w-full max-w-md` |
| 选中态 | `border-primary bg-secondary shadow-glow`（**不用** ring） |
| 主按钮 | `rounded-full bg-romance py-3.5 shadow-glow transition-transform active:scale-[0.98]` |
| 次级按钮 | `border border-border hover:bg-secondary/60` |
| 聊天气泡 | `max-w-[78%] rounded-2xl px-3.5 py-2`；我方 `bg-romance` / 对方 `bg-secondary` |
| 底部抽屉 | 遮罩 `fixed inset-0 z-40 bg-background/70 backdrop-blur-sm` + 面板 `rounded-t-3xl border-t border-border bg-card p-5 pb-28` + 拖拽条 `mx-auto mb-4 h-1 w-10 rounded-full bg-border` |
| TabBar | `nav > ul > li` 结构，`size-5` 图标 + `text-[11px]` 标签 |
| 图标尺寸 | 统一用 `size-*`，不用 `h-* w-*` |
| 滚动条 | 4px 宽、`--border` 色、透明轨道（避免原生白色滚动条破坏玻璃态） |


---

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器（端口 3000） |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览构建结果 |
| `npm run typecheck` | TypeScript 类型检查 |

---

## 📊 与 PRD 的对应关系

| PRD 章节 | 实现位置 | 状态 |
|----------|---------|------|
| §4 类型定义 | `src/core/types.ts` | ✅ 完成 |
| §5 冷启流程 | GameApp: ProfileSetup/Test/Matching/Intro | ✅ 完成 |
| §6 对话系统 | ChatSheet + scoring.ts 判定引擎 | ✅ 完成 |
| §7 心动投票 | VotePanel + Store castVote/revokeVote | ✅ 完成 |
| §8 读心猜猜 | MiniGamePanel 组件 | ✅ 完成 |
| §9 经济系统 | Store economy + ECONOMY_CONFIG | ✅ 完成 |
| §10 偷看/闯入 | Store usePeekCoupon/useIntrudeCoupon | ✅ 接口完成 |
| §11 心动分级信号 | Store getHeartSignal + UI 指示器 | ✅ 完成 |
| §12 数值系统 | `src/core/scoring.ts` | ✅ 完整实现 |
| §13 角色库 | `src/core/npcLibrary.ts` (16位NPC) | ✅ 完整实现 |
| §14 复盘画像 | ReviewView 完整实现 | ✅ 完成 |
| §15 Prompt规格 | （AI接入时使用） | - |
| §16 里程碑 | - | - |

---

## 🔧 开发说明

### 基于 Lovable 前端代码的改造

本项目基于 [Lovable](https://lovable.dev) 生成的前端框架进行了以下改造：

**保留的 Lovable 模式：**
- ✅ shadcn/ui 组件库（46个组件）
- ✅ Tailwind v4 + oklch 设计系统（`styles.css` 与原版逐行一致）
- ✅ 玻璃态 UI 模式（glass-card / shadow-glow / bg-romance / bg-night-fade）
- ✅ 底部弹出层交互（拖拽条 + backdrop-blur 遮罩）
- ✅ 三Tab 导航栏（小屋 / 心动观察 / 我的 · 沉淀故事）
- ✅ 居中宽字距大标题 + 三段式 TopBar（标题 / 副标题 / 时间戳）
- ✅ localStorage 进度持久化

**与Lovable 的差异（有意为之）：**
- TanStack **Start** 降级为纯 **Vite + TanStack Router**（无 SSR，纯客户端 SPA）
  - 因此 CSS 由 `src/main.tsx` 的 `import "./styles.css"` 引入，**不再**走 `__root.tsx` 的 `?url` + head links 注入
  - ⚠️ 这是历史上导致"全站零样式白板"的根因，改动入口文件时务必保留该 import
- 补充原版遗漏的 `text-romance` 工具类（原版代码引用了 3 次但未定义）
- 补充深色滚动条样式（原生白色滚动条会破坏玻璃态观感）
- 长标题自适应字距（`title.length > 4` 时降为 `text-2xl tracking-[0.18em]`），避免「选出你的小屋阵容」等标题溢出
- `GameApp.tsx` 拆分为 4 个模块（`shared` / `onboarding` / `dayloop` / `observation`），避免单文件损坏导致全站白屏

**新增的游戏逻辑：**
- ✅ 完整的 8 阶段游戏流程
- ✅ 16 位 NPC 角色库（冰山四层原文）
- ✅ PRD §12 数值判定引擎
- ✅ 三幕日循环引擎（顺序锁死）
- ✅ 五类意图对话系统 + 投票弹窗
- ✅ 共同记忆引擎（公共事件影响全员）
- ✅ 心动分级视觉信号（五档反馈）
- ✅ 读心猜猜小游戏（3题制）
- ✅ Day5 多人约会场景
- ✅ 终选之夜（三种结局 + 全员排行）
- ✅ 复盘画像（意图分布/关系收官/诊断文案）

### 视觉验收记录

全流程 12 个页面已逐页截图核对（**注意：无障碍树快照不反映 CSS，验证视觉必须截图**）：

| # | 页面 | 状态 |
|---|------|------|
| 1 | 建档（名字/性别/星座） | ✅ 暖玫瑰黑底 + 珊瑚粉标题 + 玻璃态卡片 |
| 2 | 人格测试（12 题） | ✅ 进度条 + 选项卡片 |
| 3 | 测试结果（MBTI/依恋/四轴） | ✅ `text-romance` MBTI + male/female 语义色四轴 |
| 4 | 8 选 5 候选池 | ✅ 契合度徽标 + 选中态发光边框 |
| 5 | 入岛（Day 1 开场） | ✅ 心动候选 + 同性竞争者分区 |
| 6 | 小屋主页（三幕时间轴） | ✅ 时间轴激活态 + 点数徽标 + TabBar |
| 7 | 公共事件（NPC 差异化反应） | ✅ 依恋类型驱动的 ±Δ 显示 |
| 8 | 私聊选择（5 人心动值） | ✅ 阶段徽标 + 渐变心动条 |
| 9 | 私聊抽屉（五意图 + 气泡） | ✅拖拽条 + backdrop-blur + 冰山解锁提示 |
| 10 | 独处复盘（心动瞬间流） | ✅ 按Δ 降序 + 来源标签 |
| 11 | 终选之夜 / 终选结果 | ✅ 选中发光 + 三结局分支 |
| 12 | 复盘画像 | ✅ 意图分布条 + 关系收官 + 数据观察 |


### 后续优化方向

**P0（核心体验）：**
- [ ] 接入 AI/LLM 生成 NPC 台词（当前为模板回复）
- [ ] 充实 Day 1-6 的事件内容（当前有基础模板）

**P1（增强体验）：**
- [ ] 音效 / 背景音乐
- [ ] 动画过渡增强
- [ ] NPC 头像和场景图资源
- [ ] 移动端手势优化

---

##📝 注意事项

1. **CSS 引入链路**：`src/main.tsx` 的 `import "./styles.css"` 是全站样式的唯一入口，删除会导致整站变成无样式 HTML 白板
2. **视觉验证方式**：验证 UI 必须**截图**，无障碍树快照（accessibility snapshot）不包含任何 CSS 信息
3. **运行模式**: 纯客户端 SPA（Vite），SSR 未启用
4. **持久化**: 存储键名为 `heart-signal-island-storage`，清除后进度重置
5. **数值平衡**: §12 的数值是初始值，建议实测后调平
6. **调试入口**: 「我的」页面有「直接跳到终选」按钮（调试用）
7. **构建产物**: CSS 87.5 KB (gzip 14.3 KB) / JS 356KB (gzip 112.7 KB)，`tsc --noEmit` 零错误

---

## 📄 License

MIT

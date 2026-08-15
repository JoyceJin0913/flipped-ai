/**
 * 私聊选项模板池 · 按 MBTI × 嘉宾 × 轮次差异化生成
 *
 * 模板来源（按优先级）：
 *   1. NPC 专属模板（基于个人性格、爱好、感情史设计）
 *   2. MBTI 类型模板（基于认知功能偏好：I/E、N/S、T/F、J/P）
 *   3. 破冰话题模板（恋爱观/爱好/习惯/感情史等通用话题）
 *   4. 事件引用模板（基于当天公共事件）
 *
 * 轮次递进：
 *   - Round 1：事件引用 + 性格化开场
 *   - Round 2：MBTI 偏好话题（深度探索）
 *   - Round 3+：破冰话题（恋爱观/爱好/习惯/感情史/童年等）
 *   - Round 5+：高亲密话题（默契测试、关系定义等）
 */

import type {
  NPC,
  Relationship,
  PlayerProfile,
  IntentType,
  MBTI,
} from "../core/types";

// ============================================================
// 类型定义
// ============================================================

/** 选项生成上下文 */
export interface ChoiceContext {
  /** 当天公共事件话题关键词 */
  eventTopic?: string | undefined;
  /** 该 NPC 在事件中的关键行为描述 */
  npcAction?: string | undefined;
  /** 该 NPC 是否在事件中被提及/关注 */
  npcWasMentioned?: boolean | undefined;
  /** 事件紧张程度 */
  tensionLevel?: "low" | "medium" | "high" | "very-high" | undefined;
  /** 当前是第几天 */
  dayNumber?: number | undefined;
  /** 当前对话轮次（0 表示开场白后的第一次选择） */
  round?: number | undefined;
  /** NPC 最新一句回复（用于衔接上下文） */
  lastNpcReply?: string | undefined;
}

/** 聊天选项 */
export interface ChatChoice {
  id: string;
  /** 显示给玩家的具体文案 */
  text: string;
  /** 映射回数值系统的意图类型（用于计算 Δ） */
  intentType: IntentType;
  /** 选项元数据 */
  meta: {
    relevance: "high" | "medium" | "low";
    riskLevel: "safe" | "moderate" | "risky";
    tags: string[];
    source: "event_ref" | "personality" | "icebreaker" | "mbti_style" | "fallback";
  };
}

// ============================================================
// NPC 专属模板（基于个人性格 + MBTI + 剧情定制）
// ============================================================

interface NpcTemplate {
  /** 触发条件：true 表示任何时候都可用，否则需要 round >= minRound */
  minRound?: number;
  /** 该 NPC 偏好的话题类型 */
  topics: string[];
  templates: Array<{
    text: string;
    intent: IntentType;
    /** 该模板适用的话题分类 */
    category: "event" | "hobby" | "habit" | "love_view" | "history" | "family" | "values" | "daily" | "deep";
  }>;
}

const NPC_SPECIFIC_TEMPLATES: Record<string, NpcTemplate> = {
  // ---- 陆则 · INTJ · 避免型 · 26岁创作者 ----
  luze: {
    topics: ["创作", "独处", "深度思考", "作品", "理想主义"],
    templates: [
      // 事件引用（Day 1 早餐时他沉默）
      { text: "早餐时你一直在低头看咖啡杯……在想什么？", intent: "probe", category: "event" },
      { text: "你说话很少，是不是更喜欢一个人待着？", intent: "probe", category: "habit" },
      { text: "你平时创作的时候，灵感一般从哪儿来？", intent: "probe", category: "hobby" },
      { text: "你害怕过和人走得太近吗？", intent: "probe", category: "deep" },
      { text: "你心里有没有一个'完美的关系'的样子？", intent: "probe", category: "love_view" },
      { text: "你觉得一个人能不能同时爱两个人？", intent: "probe", category: "values" },
      { text: "你上一次想靠近一个人，是什么时候？", intent: "advance", category: "history" },
      { text: "我读懂了你刚才那句话里没说出来的那层意思", intent: "advance", category: "deep" },
      { text: "你可以不用每次都那么完美", intent: "soothe", category: "deep" },
      { text: "我想知道……你有没有试着不那么'安全'地靠近一个人？", intent: "advance", category: "love_view" },
    ],
  },

  // ---- 温柔 · ISFJ · 安全型 · 28岁守护者 ----
  wenrou: {
    topics: ["照顾人", "家庭", "日常习惯", "稳定", "责任"],
    templates: [
      { text: "你总在照顾别人——谁在照顾你？", intent: "soothe", category: "daily" },
      { text: "你的家人知道你来这里了吗？他们怎么说？", intent: "probe", category: "family" },
      { text: "你做饭这么好吃，是因为一直在为喜欢的人做吗？", intent: "probe", category: "love_view" },
      { text: "你的一天通常是什么样的？", intent: "probe", category: "habit" },
      { text: "如果一段关系让你累但又放不下，你会怎么办？", intent: "probe", category: "values" },
      { text: "你上一段感情，最让你舍不得的是什么？", intent: "probe", category: "history" },
      { text: "你做饭的样子看起来很安心", intent: "soothe", category: "daily" },
      { text: "我想看你做早餐的样子……可以吗？", intent: "advance", category: "hobby" },
      { text: "被照顾的感觉是什么样的？", intent: "advance", category: "deep" },
      { text: "你愿意让我也照顾你一次吗？", intent: "advance", category: "deep" },
    ],
  },

  // ---- 江野 · ENTP · 焦虑型 · 25岁辩论家 ----
  jiangye: {
    topics: ["辩论", "观点", "聪明", "博弈", "新事物"],
    templates: [
      { text: "你刚才说的那句话，我想跟你抬个杠", intent: "humor", category: "values" },
      { text: "我赌你下一句想说什么", intent: "humor", category: "deep" },
      { text: "你最受不了别人身上的哪种'蠢'？", intent: "probe", category: "values" },
      { text: "你的恋爱是不是都输给'想太多'了？", intent: "probe", category: "history" },
      { text: "你说这么多话的时候，是不是其实最怕没人接话？", intent: "probe", category: "deep" },
      { text: "你相信'灵魂伴侣'这个东西吗？", intent: "probe", category: "love_view" },
      { text: "如果我说你其实比看起来更认真，你会怎么回？", intent: "advance", category: "deep" },
      { text: "你这张嘴厉害，但心里是不是没嘴上那么硬？", intent: "soothe", category: "deep" },
      { text: "我想知道你什么时候会真的放下戒备", intent: "advance", category: "love_view" },
      { text: "你上次在一个人面前彻底闭嘴，是什么时候？", intent: "probe", category: "history" },
    ],
  },

  // ---- 小海 · ESFP · 安全型 · 24岁太阳 ----
  xiaohai: {
    topics: ["玩", "当下", "运动", "快乐", "朋友"],
    templates: [
      { text: "你笑起来的频率是不是全屋最高的？", intent: "humor", category: "daily" },
      { text: "如果不考虑后果，你最想现在冲去做的事是什么？", intent: "adventure", category: "values" },
      { text: "你这性格，是不是从来没有'冷战'过？", intent: "probe", category: "habit" },
      { text: "你喜欢什么户外活动？", intent: "probe", category: "hobby" },
      { text: "你谈恋爱是轰轰烈烈派还是平平淡淡派？", intent: "probe", category: "love_view" },
      { text: "你跟朋友在一起时最爱玩什么？", intent: "probe", category: "hobby" },
      { text: "你最快原谅一个人的纪录是多久？", intent: "probe", category: "values" },
      { text: "我想跟你一起做一件很傻的事", intent: "adventure", category: "deep" },
      { text: "你让我想起我很久没笑过的那段时间", intent: "soothe", category: "deep" },
      { text: "你前一任是不是被你'太爱笑'给气走的？", intent: "humor", category: "history" },
    ],
  },

  // ---- 白泽 · INFP · 焦虑型 · 27岁艺术家 ----
  baize: {
    topics: ["感受", "艺术", "梦境", "敏感", "内心世界"],
    templates: [
      { text: "你刚才沉默的那几秒，是不是在想什么很美的东西？", intent: "probe", category: "deep" },
      { text: "你最近一次哭是因为什么？", intent: "soothe", category: "history" },
      { text: "你用什么方式跟世界相处？", intent: "probe", category: "habit" },
      { text: "你相信有'命中注定'这种东西吗？", intent: "probe", category: "love_view" },
      { text: "你最爱自己作品的哪一部分？", intent: "probe", category: "hobby" },
      { text: "你小时候的梦想是什么？现在还相信吗？", intent: "probe", category: "family" },
      { text: "我感觉到你刚才有一瞬间的紧张——是我说错了什么吗？", intent: "soothe", category: "deep" },
      { text: "我读你拍的那张照片，感觉到了一些没说出口的东西", intent: "advance", category: "deep" },
      { text: "你害怕'被看穿'吗？", intent: "probe", category: "deep" },
      { text: "我希望你能更相信自己值得被喜欢", intent: "soothe", category: "deep" },
    ],
  },

  // ---- 顾言 · ESTJ · 安全型 · 30岁决策者 ----
  guyan: {
    topics: ["规划", "目标", "效率", "责任感", "数据"],
    templates: [
      { text: "你做过的最果断的一个决定是什么？", intent: "probe", category: "history" },
      { text: "你的五年计划里，有没有'遇见合适的人'这一项？", intent: "probe", category: "love_view" },
      { text: "你最不能忍受哪种'不靠谱'？", intent: "probe", category: "values" },
      { text: "你平时通过什么方式解压？", intent: "probe", category: "habit" },
      { text: "你工作之外的时间通常怎么分配？", intent: "probe", category: "daily" },
      { text: "你的家人对你的期待是什么？", intent: "probe", category: "family" },
      { text: "你愿意在关系里做'先退一步'的那个人吗？", intent: "probe", category: "values" },
      { text: "我发现我们想的很像", intent: "soothe", category: "deep" },
      { text: "我想让你打乱一次自己的计划", intent: "adventure", category: "deep" },
      { text: "你有过'明明准备好了却还是错过'的经历吗？", intent: "probe", category: "history" },
    ],
  },

  // ---- 承熠 · ENFP · 安全型 · 23岁惊喜制造者 ----
  chengyi: {
    topics: ["想象", "可能性", "创意", "惊喜", "故事"],
    templates: [
      { text: "你脑子里每天有多少个疯狂的想法？", intent: "humor", category: "daily" },
      { text: "如果明天这座岛消失，你会做的第一件事是什么？", intent: "adventure", category: "values" },
      { text: "你最擅长给别人制造什么类型的惊喜？", intent: "probe", category: "hobby" },
      { text: "你相信'巧合'吗？还是所有相遇都是注定的？", intent: "probe", category: "love_view" },
      { text: "你最爱听的睡前故事是什么类型？", intent: "probe", category: "habit" },
      { text: "你有过'一见钟情'的经历吗？", intent: "probe", category: "history" },
      { text: "你刚才那个点子，我想听完整的", intent: "soothe", category: "deep" },
      { text: "我想跟你一起做一件从来没做过的事", intent: "adventure", category: "deep" },
      { text: "你笑的时候像整个夏天——我可以多看你笑几次吗？", intent: "advance", category: "deep" },
      { text: "你家里排行第几？这塑造了你什么样的性格？", intent: "probe", category: "family" },
    ],
  },

  // ---- 周牧 · ISTJ · 避免型 · 26岁逻辑派 ----
  zhoumu: {
    topics: ["逻辑", "系统", "规律", "细节", "稳定"],
    templates: [
      { text: "你做决定前会列多少个'如果'？", intent: "probe", category: "habit" },
      { text: "你有没有过'理性判断正确但心里就是过不去'的时候？", intent: "probe", category: "history" },
      { text: "你的日常生活有什么雷打不动的规律？", intent: "probe", category: "habit" },
      { text: "你最爱哪种'可预测'的东西？", intent: "probe", category: "values" },
      { text: "如果让你用公式定义'爱情'，你会怎么写？", intent: "humor", category: "love_view" },
      { text: "你最长的一段感情是多久？最后为什么结束？", intent: "probe", category: "history" },
      { text: "你心里的'安全感'具体是由什么构成的？", intent: "probe", category: "deep" },
      { text: "我发现你刚才说的话里有一个逻辑漏洞", intent: "humor", category: "deep" },
      { text: "我想看你笑一下——你能做到吗？", intent: "advance", category: "deep" },
      { text: "你愿意让自己的公式里，多一个'例外'吗？", intent: "advance", category: "love_view" },
    ],
  },
};

// ============================================================
// MBTI 风格模板（基于认知功能偏好的通用话题）
// ============================================================

const MBTI_STYLE_TEMPLATES: Partial<Record<MBTI, NpcTemplate>> = {
  // ---- INTJ：独立、深度思考、未来导向 ----
  INTJ: {
    topics: ["深度", "系统", "长期目标", "独立"],
    templates: [
      { text: "你做过的最有战略眼光的决定是什么？", intent: "probe", category: "history" },
      { text: "你怎么看'孤独'这个东西——它是敌人还是朋友？", intent: "probe", category: "values" },
      { text: "你未来三年最想实现的一件事是什么？", intent: "probe", category: "values" },
      { text: "你有多久没跟一个人说出'我需要你'了？", intent: "advance", category: "deep" },
    ],
  },
  // ---- ISFJ：照顾他人、传统、稳定 ----
  ISFJ: {
    topics: ["照顾", "回忆", "家庭", "细节"],
    templates: [
      { text: "你最珍惜的一段回忆是什么？", intent: "probe", category: "history" },
      { text: "你照顾别人的时候，自己会被忽略吗？", intent: "soothe", category: "deep" },
      { text: "你跟家人一周打几次电话？", intent: "probe", category: "family" },
      { text: "你愿意让人照顾你一次吗？", intent: "advance", category: "deep" },
    ],
  },
  // ---- ENTP：辩论、新奇、挑战 ----
  ENTP: {
    topics: ["辩论", "新观点", "挑战", "脑洞"],
    templates: [
      { text: "最近哪个观点让你跟朋友吵了一架？", intent: "humor", category: "values" },
      { text: "你最快说服一个人改变想法的纪录是多久？", intent: "humor", category: "history" },
      { text: "你最讨厌别人用哪句话敷衍你？", intent: "probe", category: "values" },
      { text: "我怀疑你刚才说的反话是真的——我猜对了吗？", intent: "advance", category: "deep" },
    ],
  },
  // ---- ESFP：当下、行动、感性 ----
  ESFP: {
    topics: ["玩", "当下", "感受", "行动"],
    templates: [
      { text: "你最近一次'什么都不做就发呆'是什么时候？", intent: "probe", category: "habit" },
      { text: "你最想在哪个城市生活？", intent: "probe", category: "values" },
      { text: "你心情不好的时候，会做什么让自己开心？", intent: "probe", category: "habit" },
      { text: "我想跟你一起去做一件超酷的事", intent: "adventure", category: "deep" },
    ],
  },
  // ---- INFP：价值观、内省、意义 ----
  INFP: {
    topics: ["意义", "感受", "理想", "内在世界"],
    templates: [
      { text: "你最近一次被一本书/一首歌打动，是因为什么？", intent: "probe", category: "hobby" },
      { text: "你心里有没有一个'绝不能妥协'的价值观？", intent: "probe", category: "values" },
      { text: "你害怕过'被理解错了'吗？", intent: "soothe", category: "deep" },
      { text: "我想听你讲一个对你很重要的小故事", intent: "soothe", category: "history" },
    ],
  },
  // ---- ESTJ：组织、传统、效率 ----
  ESTJ: {
    topics: ["组织", "目标", "效率", "责任"],
    templates: [
      { text: "你管理过最大的一个团队/项目是什么？", intent: "probe", category: "history" },
      { text: "你定计划的时候，是长计划多还是短计划多？", intent: "probe", category: "habit" },
      { text: "你最不能忍受哪类'不守规则'的人？", intent: "probe", category: "values" },
      { text: "你愿意为了一段感情打破自己的规则吗？", intent: "advance", category: "love_view" },
    ],
  },
  // ---- ENFP：可能性、创意、热情 ----
  ENFP: {
    topics: ["可能性", "创意", "故事", "连接"],
    templates: [
      { text: "你最近脑袋里最疯狂的一个想法是什么？", intent: "humor", category: "daily" },
      { text: "你相信'第六感'这种东西吗？", intent: "probe", category: "values" },
      { text: "你最爱哪种类型的对话？", intent: "probe", category: "habit" },
      { text: "我想听你讲你接下来最想做的一件事", intent: "advance", category: "deep" },
    ],
  },
  // ---- ISTJ：逻辑、规则、可预测 ----
  ISTJ: {
    topics: ["逻辑", "事实", "稳定", "细节"],
    templates: [
      { text: "你的日常 routine 是什么样的？", intent: "probe", category: "habit" },
      { text: "你处理过最棘手的一个'逻辑难题'是什么？", intent: "probe", category: "history" },
      { text: "你怎么看待'感情用事'？", intent: "probe", category: "values" },
      { text: "我想听你说一件你反复确认很多次才相信的事", intent: "soothe", category: "deep" },
    ],
  },
  // ---- INTP：思考、概念、可能性 ----
  INTP: {
    topics: ["思考", "概念", "理论", "独立"],
    templates: [
      { text: "你最近在思考的一个理论问题是什么？", intent: "probe", category: "hobby" },
      { text: "你有多少个'未完成的想法'？", intent: "humor", category: "daily" },
      { text: "你最讨厌别人用哪句话打断你的思考？", intent: "probe", category: "values" },
      { text: "我想听你讲一个你最想通但还没想通的问题", intent: "soothe", category: "deep" },
    ],
  },
  // ---- ENTJ：领导、效率、目标 ----
  ENTJ: {
    topics: ["领导", "目标", "决策", "效率"],
    templates: [
      { text: "你做过最大胆的一个商业/人生决定是什么？", intent: "probe", category: "history" },
      { text: "你通常怎么解决团队的冲突？", intent: "probe", category: "values" },
      { text: "你怎么平衡工作和生活？", intent: "probe", category: "habit" },
      { text: "你愿意让一个人打乱你的成功计划吗？", intent: "advance", category: "love_view" },
    ],
  },
  // ---- INFJ：洞察、共情、意义 ----
  INFJ: {
    topics: ["洞察", "共情", "意义", "精神"],
    templates: [
      { text: "你第一次觉得自己'看穿了'一个人，是什么时候？", intent: "probe", category: "deep" },
      { text: "你最不能忍受哪种'表里不一'？", intent: "probe", category: "values" },
      { text: "你心里有没有一个'只有少数人知道'的梦想？", intent: "probe", category: "values" },
      { text: "我想让你知道我也有和你一样的某种'洞察'", intent: "soothe", category: "deep" },
    ],
  },
  // ---- ISFP：当下、感受、艺术 ----
  ISFP: {
    topics: ["当下", "感受", "艺术", "自由"],
    templates: [
      { text: "你现在最想做的'只为自己'的事是什么？", intent: "probe", category: "habit" },
      { text: "你最爱自己作品的哪一部分？", intent: "probe", category: "hobby" },
      { text: "你怎么看待'被束缚'这件事？", intent: "probe", category: "values" },
      { text: "我想看你笑——自然的那种", intent: "advance", category: "deep" },
    ],
  },
  // ---- ESFJ：照顾、和谐、归属 ----
  ESFJ: {
    topics: ["照顾", "和谐", "归属", "社交"],
    templates: [
      { text: "你照顾过最久的一段关系是什么？", intent: "probe", category: "history" },
      { text: "朋友聚会里你通常扮演什么角色？", intent: "probe", category: "habit" },
      { text: "你最讨厌朋友间发生哪种矛盾？", intent: "probe", category: "values" },
      { text: "我想听你讲你最近一次为别人做的事", intent: "soothe", category: "history" },
    ],
  },
  // ---- ISTP：技术、独立、行动 ----
  ISTP: {
    topics: ["技术", "独立", "行动", "问题"],
    templates: [
      { text: "你最近在学/研究什么新技术？", intent: "probe", category: "hobby" },
      { text: "你解决过的最棘手的问题是什么？", intent: "probe", category: "history" },
      { text: "你最讨厌哪种'没效率'的做事方式？", intent: "probe", category: "values" },
      { text: "我想看你做事的样子", intent: "advance", category: "deep" },
    ],
  },
  // ---- ESTP：当下、行动、博弈 ----
  ESTP: {
    topics: ["当下", "行动", "博弈", "刺激"],
    templates: [
      { text: "你最近做过最冲动的一个决定是什么？", intent: "probe", category: "history" },
      { text: "你最爱哪种'肾上腺素飙升'的时刻？", intent: "probe", category: "hobby" },
      { text: "你怎么看待'安分守己'的人？", intent: "probe", category: "values" },
      { text: "我想跟你一起做一件疯狂的事", intent: "adventure", category: "deep" },
    ],
  },
};

// ============================================================
// 破冰话题模板（恋爱观/爱好/习惯/感情史等通用话题）
// ============================================================

const ICE_BREAKER_TEMPLATES: Record<string, NpcTemplate> = {
  love_view: {
    topics: ["爱情观", "关系", "期待"],
    templates: [
      { text: "你相信一见钟情还是日久生情？", intent: "probe", category: "love_view" },
      { text: "你怎么看待'缘分'这个词？", intent: "probe", category: "love_view" },
      { text: "你理想中的另一半是什么样的？", intent: "probe", category: "love_view" },
      { text: "你觉得两个人在一起，最不能缺的是什么？", intent: "probe", category: "values" },
      { text: "你有过'明明很喜欢却不敢靠近'的经历吗？", intent: "probe", category: "history" },
    ],
  },
  hobby: {
    topics: ["爱好", "兴趣", "休闲"],
    templates: [
      { text: "工作之外，你最爱做的事情是什么？", intent: "probe", category: "hobby" },
      { text: "最近有没有入坑什么新爱好？", intent: "probe", category: "hobby" },
      { text: "你最喜欢的电影/书/歌是什么？为什么？", intent: "probe", category: "hobby" },
      { text: "你会因为爱好放弃其他事吗？", intent: "probe", category: "values" },
    ],
  },
  habit: {
    topics: ["日常", "习惯", "性格"],
    templates: [
      { text: "你是早起型还是夜猫子？", intent: "probe", category: "habit" },
      { text: "你有什么奇怪的强迫症吗？", intent: "humor", category: "habit" },
      { text: "心情不好的时候你会做什么？", intent: "probe", category: "habit" },
      { text: "你最近一次睡懒觉是什么时候？", intent: "humor", category: "habit" },
    ],
  },
  history: {
    topics: ["感情史", "过去", "经历"],
    templates: [
      { text: "你最长的一段感情是多久？", intent: "probe", category: "history" },
      { text: "你上一段感情是怎么结束的？", intent: "probe", category: "history" },
      { text: "你现在回头看，最后悔的一段决定是什么？", intent: "probe", category: "history" },
      { text: "你最难忘记的人是哪种类型？", intent: "probe", category: "history" },
    ],
  },
  family: {
    topics: ["家庭", "童年", "成长"],
    templates: [
      { text: "你家里排行第几？小时候是被照顾还是照顾别人？", intent: "probe", category: "family" },
      { text: "你的父母对你最大的影响是什么？", intent: "probe", category: "family" },
      { text: "你小时候的梦想是什么？现在还相信吗？", intent: "probe", category: "family" },
    ],
  },
  values: {
    topics: ["价值观", "底线", "原则"],
    templates: [
      { text: "什么是你绝对不能妥协的？", intent: "probe", category: "values" },
      { text: "你最不能忍受对方的什么？", intent: "probe", category: "values" },
      { text: "你觉得一个好的关系应该是什么样的？", intent: "probe", category: "love_view" },
    ],
  },
};

// ============================================================
// 事件引用模板（按紧张度）
// ============================================================

const EVENT_REF_TEMPLATES: Record<string, NpcTemplate> = {
  high_tension: {
    topics: ["事件深度引用"],
    templates: [
      { text: "刚才发生那件事的时候，你心里在想什么？", intent: "probe", category: "event" },
      { text: "你对今天这件事……有话想说吗？", intent: "soothe", category: "event" },
      { text: "今天这个场景，我注意到你表现得很不一样", intent: "probe", category: "event" },
    ],
  },
  medium_tension: {
    topics: ["事件中等引用"],
    templates: [
      { text: "今天这个活动里，你印象最深的是哪个瞬间？", intent: "probe", category: "event" },
      { text: "刚才的场面里，你最想吐槽的是？", intent: "humor", category: "event" },
      { text: "今天跟你一起做那件事的时候，我感觉到了……", intent: "advance", category: "event" },
    ],
  },
  low_tension: {
    topics: ["事件轻度引用"],
    templates: [
      { text: "今天这个活动，你觉得最有意思的是哪个环节？", intent: "probe", category: "event" },
      { text: "今天的某个瞬间，我到现在还在想", intent: "advance", category: "event" },
      { text: "刚才那件事，你怎么看？", intent: "probe", category: "event" },
    ],
  },
};

// ============================================================
// 全局保底模板
// ============================================================

const FALLBACK_TEMPLATES: NpcTemplate = {
  topics: ["保底"],
  templates: [
    { text: "今天过得怎么样？", intent: "probe", category: "daily" },
    { text: "你在小屋这几天最深的感受是什么？", intent: "probe", category: "deep" },
    { text: "……其实我就是想找个理由和你说说话", intent: "advance", category: "deep" },
  ],
};

// ============================================================
// 风险等级判定
// ============================================================

function getRiskLevel(intent: IntentType, attachment: string): "safe" | "moderate" | "risky" {
  if (attachment === "avoidant" && (intent === "advance" || intent === "adventure")) return "risky";
  if (attachment === "anxious" && intent === "probe") return "moderate";
  if (intent === "soothe") return "safe";
  return "moderate";
}

// ============================================================
// 核心生成函数
// ============================================================

/**
 * 生成 3 个具体聊天选项（差异化版本）
 *
 * 选择策略（按 round 递进）：
 *   - Round 0-1：事件引用 + NPC 专属开场
 *   - Round 2-3：NPC 专属 + MBTI 风格深度话题
 *   - Round 4+：破冰话题（恋爱观/爱好/习惯/感情史）
 *   - Round 6+：更深层的话题
 */
export function generateChatChoices(input: {
  eventContext?: ChoiceContext;
  npc: NPC;
  relationship: Relationship;
  playerProfile?: PlayerProfile;
}): ChatChoice[] {
  const { eventContext, npc, relationship: rel } = input;
  const ctx = eventContext ?? {};
  const stage = rel.stage;
  const round = ctx.round ?? 0;
  const dayNumber = ctx.dayNumber ?? 1;
  const candidates: ChatChoice[] = [];

  // === 第 0 轮（开场）：事件引用 + NPC 专属开场 + MBTI 风格 ===
  if (round === 0) {
    // 0a. 事件引用（如果 NPC 被提及/参与事件）— 只取 1 条
    if (ctx.npcWasMentioned) {
      const eventPool = pickEventPool(ctx.tensionLevel);
      const eventTemplates = eventPool.templates.filter((t) => t.category === "event");
      if (eventTemplates.length > 0) {
        candidates.push(makeChoice(`evt_${candidates.length}`, eventTemplates[0]!, npc, "event_ref"));
      }
    }

    // 0b. NPC 专属模板（前 2 条作为开场）
    const npcTemplates = NPC_SPECIFIC_TEMPLATES[npc.id];
    if (npcTemplates) {
      const openers = npcTemplates.templates.filter(
        (t) => t.category === "event" || t.category === "daily" || t.category === "hobby" || t.category === "deep",
      );
      for (const t of openers.slice(0, 2)) {
        candidates.push(makeChoice(`per_${candidates.length}`, t, npc, "personality"));
      }
    }

    // 0c. MBTI 风格模板（补充一个差异化选项）
    const mbtiPool = MBTI_STYLE_TEMPLATES[npc.mbti];
    if (mbtiPool) {
      for (const t of mbtiPool.templates.slice(0, 1)) {
        candidates.push(makeChoice(`mbti_${candidates.length}`, t, npc, "mbti_style"));
      }
    }
  }

  // === 第 1-2 轮：NPC 专属 + MBTI 风格 ===
  if (round >= 1 && round <= 3) {
    // 1a. NPC 专属模板
    const npcTemplates = NPC_SPECIFIC_TEMPLATES[npc.id];
    if (npcTemplates) {
      const deep = npcTemplates.templates.filter(
        (t) => t.category === "deep" || t.category === "love_view" || t.category === "values",
      );
      for (const t of deep.slice(0, 2)) {
        candidates.push(makeChoice(`per_${candidates.length}`, t, npc, "personality"));
      }
    }

    // 1b. MBTI 风格模板
    const mbtiPool = MBTI_STYLE_TEMPLATES[npc.mbti];
    if (mbtiPool) {
      for (const t of mbtiPool.templates.slice(0, 1)) {
        candidates.push(makeChoice(`mbti_${candidates.length}`, t, npc, "mbti_style"));
      }
    }
  }

  // === 第 4+ 轮：破冰话题（恋爱观/爱好/习惯/感情史） ===
  if (round >= 4) {
    // 4a. 破冰话题
    const iceBreakerKeys = ["love_view", "hobby", "habit", "history", "values"];
    const randomKey = iceBreakerKeys[(round + dayNumber) % iceBreakerKeys.length] ?? "love_view";
    const icePool = ICE_BREAKER_TEMPLATES[randomKey];
    if (icePool) {
      for (const t of icePool.templates.slice(0, 2)) {
        candidates.push(makeChoice(`ice_${candidates.length}`, t, npc, "icebreaker"));
      }
    }

    // 4b. 家庭/童年话题（第 6 轮+）
    if (round >= 6) {
      const familyPool = ICE_BREAKER_TEMPLATES["family"];
      if (familyPool) {
        for (const t of familyPool.templates.slice(0, 1)) {
          candidates.push(makeChoice(`fam_${candidates.length}`, t, npc, "icebreaker"));
        }
      }
    }
  }

  // === 阶段保底（始终补充一些） ===
  if (candidates.length < 3) {
    const stageFallback = getStageFallback(stage, npc);
    for (const t of stageFallback) {
      candidates.push(makeChoice(`fb_${candidates.length}`, t, npc, "fallback"));
    }
  }

  // === 全局保底 ===
  if (candidates.length === 0) {
    for (const t of FALLBACK_TEMPLATES.templates) {
      candidates.push(makeChoice(`fb_${candidates.length}`, t, npc, "fallback"));
    }
  }

  // === 去重 + 选 Top 3 ===
  const selected = selectTopThree(candidates, npc, rel);
  return selected;
}

// ============================================================
// 辅助函数
// ============================================================

function makeChoice(
  id: string,
  template: { text: string; intent: IntentType },
  npc: NPC,
  source: ChatChoice["meta"]["source"],
): ChatChoice {
  return {
    id,
    text: template.text,
    intentType: template.intent,
    meta: {
      relevance: source === "event_ref" ? "high" : source === "fallback" ? "low" : "medium",
      riskLevel: getRiskLevel(template.intent, npc.attachment),
      tags: [source],
      source,
    },
  };
}

function pickEventPool(tension: ChoiceContext["tensionLevel"]): NpcTemplate {
  if (tension === "high" || tension === "very-high") return EVENT_REF_TEMPLATES["high_tension"]!;
  if (tension === "medium") return EVENT_REF_TEMPLATES["medium_tension"]!;
  return EVENT_REF_TEMPLATES["low_tension"]!;
}

function getStageFallback(stage: string, npc: NPC): Array<{ text: string; intent: IntentType }> {
  const stageMap: Record<string, Array<{ text: string; intent: IntentType }>> = {
    stranger: [
      { text: `你是做什么工作的？${npc.personality.surface[0] ? "——我猜跟这个有关" : ""}`, intent: "probe" },
      { text: "你平时有什么兴趣爱好？", intent: "probe" },
      { text: "感觉你是个有意思的人，想多了解你", intent: "advance" },
    ],
    icebreak: [
      { text: "今天和你聊天很开心", intent: "soothe" },
      { text: "你有没有什么想跟我分享的？", intent: "probe" },
      { text: "我发现我们好像挺聊得来的", intent: "humor" },
    ],
    flirt: [
      { text: "其实我有件事想告诉你……", intent: "advance" },
      { text: "你觉得我们现在算什么关系？", intent: "probe" },
      { text: "下次想不想一起做点什么？", intent: "adventure" },
    ],
    crush: [
      { text: "我不想只做朋友了", intent: "advance" },
      { text: "能不能给我一个确定答案？", intent: "advance" },
      { text: "我想让你知道你对我很重要", intent: "soothe" },
    ],
  };
  return stageMap[stage] ?? FALLBACK_TEMPLATES.templates;
}

function selectTopThree(candidates: ChatChoice[], _npc: NPC, _rel: Relationship): ChatChoice[] {
  // 1. 去重（相同文本只保留第一个）
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    if (seen.has(c.text)) return false;
    seen.add(c.text);
    return true;
  });

  // 2. 来源优先级：personality > event_ref ≈ mbti_style > icebreaker > fallback
  // 让 NPC 专属模板和 MBTI 风格模板有更高优先级，避免事件模板过度主导
  const sourcePriority: Record<string, number> = {
    event_ref: 3,
    personality: 4,
    mbti_style: 3,
    icebreaker: 2,
    fallback: 1,
  };

  // 3. 风险平衡：避免 3 个全是 risky，至少有 1 个 safe
  const safeCount = unique.filter((c) => c.meta.riskLevel === "safe").length;
  const riskyCount = unique.filter((c) => c.meta.riskLevel === "risky").length;

  // 4. 排序：来源优先级 → 风险多样性 → 文本长度（更短的更适合）
  const sorted = [...unique].sort((a, b) => {
    const pa = sourcePriority[a.meta.source] ?? 0;
    const pb = sourcePriority[b.meta.source] ?? 0;
    if (pa !== pb) return pb - pa;

    // 偏好风险多样性
    if (a.meta.riskLevel === "safe" && riskyCount > 1 && safeCount === 0) return -1;
    if (b.meta.riskLevel === "safe" && riskyCount > 1 && safeCount === 0) return 1;

    // 短文本优先（更适合手机屏幕）
    return a.text.length - b.text.length;
  });

  // 5. 选 Top 3
  return sorted.slice(0, 3);
}

// ============================================================
// 便捷包装函数
// ============================================================

export function generateChoicesSimple(params: {
  topic?: string;
  npcAction?: string;
  npcMentioned?: boolean;
  tensionLevel?: ChoiceContext["tensionLevel"];
  dayNumber?: number;
  round?: number;
  lastNpcReply?: string;
}): (npc: NPC, rel: Relationship) => ChatChoice[] {
  const ctx: ChoiceContext = {
    eventTopic: params.topic,
    npcAction: params.npcAction,
    npcWasMentioned: params.npcMentioned,
    tensionLevel: params.tensionLevel ?? "low",
    dayNumber: params.dayNumber ?? 1,
    round: params.round ?? 0,
    lastNpcReply: params.lastNpcReply,
  };

  return (npc: NPC, rel: Relationship) =>
    generateChatChoices({ eventContext: ctx, npc, relationship: rel });
}
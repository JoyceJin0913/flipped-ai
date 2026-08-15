/**
 * 心动岛 · 七天公共事件完整脚本数据
 *
 * 基于 docs/public-event-storylines.md 设计文档实现
 * 每个事件包含：开场旁白 → NPC发言序列 → 玩家决策 → 结局分支 → 私聊上下文
 *
 * 好感度 Δ 值在后台记录，不展示给玩家
 */

import type { NPC } from "../core/types";

// ============================================================
// 类型定义
// ============================================================

/** NPC 发言单元 */
export interface NpcLine {
  npcId: string;
  /** 括号内的动作/神情描述（如"（挽起袖子，自然地打开冰箱）"） */
  action: string;
  /** 台词（支持多行） */
  lines: string[];
  /** 基础好感变化 */
  delta: number;
  /** 隐藏线索文本（可选，触发冰山解锁） */
  clue?: string;
  /** 人格映射说明（用于调试/参考，不展示） */
  personalityNote?: string;
}

/** 玩家选项 */
export interface ChoiceOption {
  id: string;
  /** 选项文案（展示给玩家） */
  text: string;
  /** 每位 NPC 的好感度影响（后台记录，不展示给玩家） */
  affinityImpact: Record<string, number | string>;
}

/** 玩家决策点 */
export interface PlayerChoicePoint {
  /** 决策场景描述（在选项前显示的旁白） */
  scenario: string;
  options: ChoiceOption[];
}

/** 结局分支 */
export interface EndingBranch {
  /** 结局旁白（逐段显示） */
  narration: string[];
  /** 分支触发的额外 NPC 反应 */
  extraDialogues?: NpcLine[];
  /** 传递给私聊的上下文 */
  chatContext: EventChatContext;
}

/** 事件脚本 */
export interface EventScript {
  id: string;
  day: number;
  title: string;
  time: string;
  location: string;
  /** 氛围描述（在事件开始时展示） */
  atmosphere: string;
  arcPhase: string;
  tensionLevel: "low" | "medium" | "high" | "very-high" | "medium-high" | "maximum";
  /** 开场旁白（逐段显示，每段一段话） */
  openingNarration: string[];
  /** 触发 NPC 的发言（打破沉默的人） */
  trigger?: NpcLine;
  /** NPC 发言序列（按出场顺序） */
  npcDialogues: NpcLine[];
  /** 玩家决策点 */
  playerChoice: PlayerChoicePoint;
  /** 结局分支（key = choice option id） */
  endings: Record<string, EndingBranch>;
}

/** 传递给私聊的事件上下文 */
export interface EventChatContext {
  topic: string;
  mentionedNpcs: string[];
  playerStance: string;
  tensionLevel: string;
  keyMoments: string[];
  privateChatOpening?: Record<string, string>;
  relationshipTurningPoint?: boolean;
  jealousyTriggered?: string[];
  /** 终选之夜前置信息（Day 7 使用） */
  finaleSetup?: {
    tomorrowEvent: string;
    choicesAvailable?: string[];
    targetLocked?: boolean;
  };
}

// ============================================================
// NPC ID 常量
// ============================================================

export const NPC_IDS = {
  WENROU: "wenrou",
  LUZE: "luze",
  JIANGYE: "jiangye",
  XIAOHAI: "xiaohai",
  BAIZE: "baize",
  GUYAN: "guyan",
  CHENGYI: "chengyi",
  ZHOUMU: "zhoumu",
} as const;

export type NpcId = (typeof NPC_IDS)[keyof typeof NPC_IDS];

export const ALL_NPC_IDS: NpcId[] = Object.values(NPC_IDS);

// ============================================================
// Day 1 · 早餐桌上的沉默
// ============================================================

export const DAY1_SCRIPT: EventScript = {
  id: "day1_breakfast",
  day: 1,
  title: "早餐桌上的沉默",
  time: "10:00",
  location: "小屋开放式厨房 + 岛台",
  atmosphere:
    "晨光微晃，咖啡香气还没散去。八个人围坐在岛台两侧——有人在看手机，有人在倒水，空气里有一种「不知道该说什么」的微妙安静。冰箱压缩机偶尔发出嗡嗡声，像是替所有人尴尬地清了清嗓子。",
  arcPhase: "icebreak",
  tensionLevel: "low",

  openingNarration: [
    "这是你们来到心动岛的第一个早晨。",
    "没有导演喊 action，没有剧本提示，",
    "只有阳光透过百叶窗在地板上画出的条纹。",
    "你走进厨房的时候——",
    "七双眼睛，几乎同时看了过来。",
    "有期待的、有戒备的、有假装不在意的。",
    "没有人先说话。",
  ],

  trigger: {
    npcId: NPC_IDS.WENROU,
    action: "（挽起袖子）",
    lines: [
      "大家想吃什么？我来做。",
      "对了，你对什么过敏吗？",
    ],
    delta: 3,
    personalityNote:
      "L1 温柔会照顾人 → L2 大管家定位 → 主动破冰但不过分张扬",
  },

  npcDialogues: [
    {
      npcId: NPC_IDS.LUZE,
      action: "（低头看着手里的咖啡杯）",
      lines: [
        "...随便。",
        "……",
      ],
      delta: 1,
      clue:
        "他把你放好的餐具悄悄摆正了一次——左撇子的习惯。如果你注意到了，后续私聊可解锁线索。",
      personalityNote:
        "L1 话少观察力强 → L2 倾听者定位 → 用沉默保护自己",
    },
    {
      npcId: NPC_IDS.JIANGYE,
      action: "（靠在门框上）",
      lines: [
        "哇哦，第一天就有人抢着当管家？温柔你这是要竞选小屋CEO啊。",
        "那你呢？你会做饭吗？还是只会——",
        "——吃？",
      ],
      delta: 2,
      personalityNote:
        "L1 反应快爱辩论 → L2 话题发起者 → 用聪明掩饰紧张",
    },
    {
      npcId: NPC_IDS.XIAOHAI,
      action: "（从沙发上弹起来）",
      lines: [
        "做吃的！我饿死了！温柔哥做什么我都行！",
        "哎对了，昨天谁说会做那个什么……意式烘蛋来着？不会是我吧哈哈哈",
      ],
      delta: 2,
      personalityNote:
        "L1 阳光精力旺盛直来直去 → L2 气氛组定位 → 完全不设防",
    },
    {
      npcId: NPC_IDS.BAIZE,
      action: "（站在窗边给窗台上的多肉浇水）",
      lines: [
        "我……可以帮忙摆盘子。",
        "第一次和大家一起吃早餐呢。感觉有点……紧张又期待。",
      ],
      delta: 2,
      personalityNote:
        "L1 敏感有艺术气质温柔 → L2 文艺担当 → 在角落观察但不冷漠",
    },
    {
      npcId: NPC_IDS.GUYAN,
      action: "（从平板电脑上抬起头）",
      lines: [
        "冰箱里有什么食材？我来列个清单，免得浪费。",
        "第一天，大家放松就好。不用刻意表现什么。",
      ],
      delta: 2,
      personalityNote:
        "L1 成熟稳重有规划 → L2 主心骨定位 → 不动声色地掌控局面",
    },
    {
      npcId: NPC_IDS.CHENGYI,
      action: "（突然从沙发后面探出头）",
      lines: [
        "我有个提议！",
        "我们每人做一道代表自己的菜！然后盲评！输了的人负责洗一周的碗！",
        "……开玩笑的。但我真的想做一道菜。叫'承熠的惊喜'。",
      ],
      delta: 2,
      personalityNote:
        "L1 跳脱点子多自来熟 → L2 惊喜制造者 → 用跳跃思维打破僵局",
    },
    {
      npcId: NPC_IDS.ZHOUMU,
      action: "（已经默默地把咖啡机打开了）",
      lines: [
        "咖啡机需要三分钟预热。",
        "我查过了，冰箱里有鸡蛋、面包、牛奶、还有一点培根。够做简单的早餐。",
      ],
      delta: 1,
      personalityNote:
        "L1 冷静逻辑强有条理 → L2 问题解决者 → 用行动代替语言",
    },
  ],

  playerChoice: {
    scenario:
      "温柔在厨房忙碌，其他人各自找位置坐下或站着。你需要决定自己在第一个集体场景中的姿态。",
    options: [
      {
        id: "A_help",
        text: "我来帮忙打下手吧",
        affinityImpact: {
          wenrou: 4,
          luze: 1,
          jiangye: 3,
          xiaohai: 4,
          baize: 3,
          guyan: 3,
          chengyi: 3,
          zhoumu: 2,
        },
      },
      {
        id: "B_observe",
        text: "我都行，听大家的安排",
        affinityImpact: {
          wenrou: 1,
          luze: 3,
          jiangye: 0,
          xiaohai: 2,
          baize: 3,
          guyan: 2,
          chengyi: 1,
          zhoumu: 3,
        },
      },
      {
        id: "C_showcase",
        text: "其实我会做菜……如果需要的话",
        affinityImpact: {
          wenrou: 5,
          luze: 2,
          jiangye: 2,
          xiaohai: 4,
          baize: 2,
          guyan: 4,
          chengyi: 5,
          zhoumu: 1,
        },
      },
    ],
  },

  endings: {
    A_help: {
      narration: [
        `厨房里渐渐有了说话声。`,
        `温柔给你递了围裙，指尖无意间碰到你的手背。`,
        `"谢谢。"他说，声音很轻。`,
        `江野靠在门框上开始起哄：`,
        `"哎哟，第一天就有人抢着当帮厨？看来咱们小屋来了个宝藏选手啊。"`,
        `陆则依然沉默地喝着咖啡。`,
        `但你注意到——他把你放好的餐具又摆正了一次。`,
        `左撇子的习惯。`,
        `承熠不知道从哪儿变出了一个小喇叭：`,
        `"我宣布！今天的早餐由温柔主厨、副厨！其余人负责——吃！和夸！"`,
        `小海第一个响应："这活儿我行！我专业干这个！"`,
        `周牧默默地把你面前的水杯续满了。什么都没说。`,
      ],
      chatContext: {
        topic: "早餐/厨艺/第一印象/帮忙",
        mentionedNpcs: ["wenrou", "jiangye", "luze", "zhoumu"],
        playerStance: "选择了主动参与，展示了积极态度",
        tensionLevel: "low",
        keyMoments: [
          "温柔递围裙时碰到了手",
          "江野起哄叫你宝藏选手",
          "陆则偷偷摆正餐具",
          "周牧默默续水杯",
        ],
      },
    },
    B_observe: {
      narration: [
        `大家各自忙碌起来。`,
        `你坐在岛台边，看着这个即将共同生活七天的小团体。`,
        `温柔在厨房切菜的声音很有节奏。`,
        `小海和承熠为了谁该拿鸡蛋吵了起来（当然是假吵架）。`,
        `江野在观察每一个人，包括你。`,
        `当你视线和他对上时，他挑了挑眉，没说话，但嘴角弯了一下。`,
        `白泽端着一杯热茶走过来，放在你面前。`,
        `"……给你。"她声音很小，"刚泡的。"`,
        `陆则从你身边经过时，脚步慢了半拍。没有打招呼。`,
        `但他坐下的位置——是你斜对面。`,
        `周牧把一张手写的早餐菜单放在岛台中央。字迹很工整。`,
        `最下面有一行小字："如有特殊需求请提前告知。"`,
      ],
      chatContext: {
        topic: "观察/安静融入/被注意到",
        mentionedNpcs: ["jiangye", "baize", "luze", "zhoumu"],
        playerStance: "选择了安静观察，不张扬但被多人注意到",
        tensionLevel: "low",
        keyMoments: [
          "江野对视时嘴角弯了一下",
          "白泽主动送热茶",
          "陆则坐在斜对面",
          "周牧留下手写菜单",
        ],
      },
    },
    C_showcase: {
      narration: [
        `所有人的目光都转向了你。`,
        `"会做什么菜？"温柔停下手里的动作，眼神里有了期待。`,
        `江野吹了声口哨："哦？深藏不露啊。"`,
        `陆则抬眼看了你一下，没说话。但他的咖啡杯放下了——他在听。`,
        `承熠直接搬了个小板凳坐到你面前：`,
        `"快快快！我要学！你是哪个派系的？川菜？粤菜？还是——黑暗料理？"`,
        `大家笑了起来。`,
        `空气里的那种微妙安静，好像被打破了。`,
      ],
      chatContext: {
        topic: "早餐/厨艺展示/惊喜/能力",
        mentionedNpcs: ["wenrou", "jiangye", "luze", "chengyi"],
        playerStance: "展示了技能，成为焦点",
        tensionLevel: "low",
        keyMoments: [
          "温柔期待地看着你",
          "江野吹口哨调侃",
          "陆则放下杯子认真听",
          "承熠搬小板凳要学",
        ],
      },
    },
  },
};

// ============================================================
// Day 2 · 分组厨艺大比拼
// ============================================================

export const DAY2_SCRIPT: EventScript = {
  id: "day2_cooking_contest",
  day: 2,
  title: "分组厨艺大比拼",
  time: "15:00",
  location: "小屋厨房 + 餐厅区域",
  atmosphere:
    "昨天的早餐让大家稍微熟悉了一些，但「熟悉」和「亲近」之间还差着一整个上午的距离。节目组突然宣布下午有分组厨艺比拼——两个人一组，用固定食材做出一道菜。分组方式？抽签。",
  arcPhase: "icebreak→tension",
  tensionLevel: "medium",

  openingNarration: [
    "午后的阳光斜照进餐厅，",
    "节目组的工作人员搬进来几个巨大的食材箱。",
    `各位，下午的活动是——分组厨艺挑战。" `, 
    "工作人员的声音没有任何感情色彩。",
    `两人一组，抽签决定队友。限时一小时。评委是——你们自己。`,
    "你看到了几微妙的表情变化。",
    "有人跃跃欲试，有人微微皱眉。",
    "分组意味着合作，也意味着——有人会被剩下。",
  ],

  npcDialogues: [
    {
      npcId: NPC_IDS.GUYAN,
      action: "（双手抱胸）",
      lines: [
        "我提议——让我当评委。理由很简单：",
        "第一，我不会做饭。",
        "第二，你们需要一个人保持客观。",
        "当然，如果有人觉得不公平……可以现在提出来。",
      ],
      delta: 1,
    },
    {
      npcId: NPC_IDS.CHENGYI,
      action: "（眼睛亮了）",
      lines: [
        "厨艺比拼？！我最擅长的就是——",
        "……吃东西。做饭嘛……应该也差不多吧？",
        "队友是谁！我要开始 brainstorm 了！我的脑子里已经有十七种可能的菜品了！",
      ],
      delta: 2,
    },
    {
      npcId: NPC_IDS.LUZE,
      action: "（看到签上写着你的名字时）",
      lines: [
        "……",
        "嗯。",
        "你会做什么？",
      ],
      delta: 3,
      clue: "回避型主动提问 = 高兴趣信号",
      personalityNote: "⭐ 关键心动时刻",
    },
    {
      npcId: NPC_IDS.JIANGYE,
      action: "（盯着签上的名字）",
      lines: [
        "……承熠？",
        "好吧。但我先说好——如果你敢在我的菜里加什么奇怪的配料，我会在评审环节实名举报你。",
        "哎，你和陆则组啊。安静组合是吧？我赌五块钱你们整场比赛不超过十句话。",
      ],
      delta: 2,
    },
  ],

  playerChoice: {
    scenario:
      "比赛结束后，大家在收拾厨房。你可以选择和一个 NPC 多聊几句——这会影响今晚私聊的开启话题。",
    options: [
      {
        id: "A_luze",
        text: "走到陆则身边，低声说「其实那条鱼是你主导的吧」",
        affinityImpact: {
          luze: 5,
          wenrou: 1,
          jiangye: 1,
          xiaohai: 0,
          baize: 0,
          guyan: 1,
          chengyi: 0,
          zhoumu: 0,
        },
      },
      {
        id: "B_wenrou",
        text: "帮温柔一起洗碗，顺便问「你平时经常做饭吗」",
        affinityImpact: {
          wenrou: 4,
          luze: 1,
          jiangye: 1,
          xiaohai: 1,
          baize: 1,
          guyan: 1,
          chengyi: 0,
          zhoumu: 0,
        },
      },
      {
        id: "C_jiangye",
        text: "对江野说「你和承熠配合得其实挺好的」",
        affinityImpact: {
          jiangye: 4,
          wenrou: 1,
          luze: 0,
          xiaohai: 0,
          baize: 0,
          guyan: 1,
          chengyi: 2,
          zhoumu: 0,
        },
      },
    ],
  },

  endings: {
    A_luze: {
      narration: [
        `陆则擦手的动作停住了。`,
        `他没有回头，但你知道他在听。`,
        `"……你觉得是吗。"`,
        `（不是疑问句。更像是在确认你已经看穿了什么。）`,
        `"鱼不是我做的。是我们做的。"`,
        `他说完就走了。但你注意到——他的耳尖有点红。`,
        `顾言在不远处看着这一幕，嘴角微扬，在小本子上记了一笔。`,
      ],
      extraDialogues: [
        {
          npcId: NPC_IDS.GUYAN,
          action: "（合上评分本）",
          lines: [
            "D 组，陆则和……评分 9.5/10。",
            "没有多余的动作，没有多余的调味。恰到好处。",
            "就像某些关系一样——不需要太多言语。",
          ],
          delta: 2,
        },
      ],
      chatContext: {
        topic: "厨艺比赛/合作默契/被看穿",
        mentionedNpcs: ["luze", "guyan"],
        playerStance: "主动接近陆则，指出了他的隐藏贡献",
        tensionLevel: "low",
        keyMoments: [
          "陆则主动问你切菜经验",
          "顾言点评'不需要太多言语'",
          "你私下找陆则说话",
        ],
        privateChatOpening: {
          luze: "（洗完手，擦干，看了你一眼）……你刚才说什么。",
          default: "今天做饭的时候，感觉你和陆则还挺有默契的",
        },
      },
    },
    B_wenrou: {
      narration: [
        `温柔递给你一块干净的毛巾。`,
        `"偶尔做。在家的时候，大部分时间都是我来。"`,
        `（水龙头流着水，他的声音混在水声里，听起来很温柔）`,
        `"习惯了照顾人。有时候会觉得——被人照顾的感觉，其实也不错。"`,
        `他说这句话的时候没有看你。但你知道这句话不是对自己说的。`,
        `白泽在旁边悄悄给你们倒了杯水，笑了笑走开了。`,
      ],
      chatContext: {
        topic: "厨艺/日常照顾/温柔",
        mentionedNpcs: ["wenrou", "baize"],
        playerStance: "选择帮助温柔，进入温柔日常线",
        tensionLevel: "low",
        keyMoments: [
          "温柔教白泽切菜",
          "你主动帮温柔洗碗",
          "温柔的自然照顾模式",
        ],
      },
    },
    C_jiangye: {
      narration: [
        `江野愣了一下，随即恢复了那副吊儿郎当的样子。`,
        `"配合？你说我和那个脑洞王？"`,
        `（瞥了一眼还在对着灶台兴奋比划的承熠）`,
        `"……好吧，确实没翻车。但这绝对是因为我的控场能力强。跟他没关系。 absolutely not。"`,
        `但他说话的时候一直在用余光瞟你。`,
        `像是在确认——你是不是真的在关注他。`,
      ],
      chatContext: {
        topic: "竞争/调侃/暗藏关心",
        mentionedNpcs: ["jiangye", "chengyi"],
        playerStance: "选择回应江野的调侃，进入互怼暧昧线",
        tensionLevel: "medium",
        keyMoments: [
          "江野赌你和陆则不超过十句话",
          "承熠的灾难创意",
          "你主动找江野说话",
        ],
      },
    },
  },
};

// ============================================================
// Day 3 · 真心话大冒险
// ============================================================

export const DAY3_SCRIPT: EventScript = {
  id: "day3_truth_or_dare",
  day: 3,
  title: "真心话大冒险",
  time: "20:30",
  location: "小屋客厅 · 地毯区",
  atmosphere:
    "晚饭后，不知是谁提议的——「来玩真心话大冒险吧」。客厅的灯被调暗了，只留了几盏落地灯。大家盘腿坐在地毯上，中间放着一个空酒瓶。有人在笑，有人在紧张地捏着衣角。这是一个会让秘密边缘变得模糊的游戏。",
  arcPhase: "tension",
  tensionLevel: "high",

  openingNarration: [
    "瓶身旋转的声音在地毯上格外清晰。",
    "所有人的眼睛都跟着它转。",
    "停下了。",
    "指向了——",
  ],

  npcDialogues: [
    {
      npcId: NPC_IDS.XIAOHAI,
      action: "（挠了挠后脑勺）",
      lines: [
        "最近一次？呃……",
        "就……前几天吧。遇到一个觉得挺有意思的人。",
        "但我不告诉你们是谁！这是隐私！下一个！快点转瓶子！",
      ],
      delta: 2,
    },
    {
      npcId: NPC_IDS.BAIZE,
      action: "（手指绞着衣角）",
      lines: [
        "最难读懂的……",
        "可能是……陆则吧。",
        "不是因为你冷——是因为感觉你好像一直在想很多事情，但从来不说出来。",
        "……和我一样。害怕说错话。",
      ],
      delta: 2,
    },
    {
      npcId: NPC_IDS.LUZE,
      action: "（沉默了三秒）",
      lines: [
        "……你说得对。",
      ],
      delta: 2,
      clue: "稀有事件：回避型公开承认情绪 = 极高信任信号",
      personalityNote: "⭐⭐ 稀有事件",
    },
    {
      npcId: NPC_IDS.JIANGYE,
      action: "（身体明显绷紧了）",
      lines: [
        "哦？这题有意思。",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.WENROU,
      action: "（依然是温和的表情）",
      lines: [
        "……这个问题，不用勉强回答。",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.LUZE,
      action: "（低头看着地毯的花纹）",
      lines: [
        // 他的呼吸频率变了。你能看出来。（通过动作描述体现）
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.BAIZE,
      action: "（捂住了嘴）",
      lines: [
        // 她在替你紧张。也在替自己紧张——因为她也有可能被选。
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.GUYAN,
      action: "（抱臂靠在沙发上）",
      lines: [
        "公平的问题。答案本身不重要，重要的是——你愿不愿意诚实。",
      ],
      delta: 0,
    },
  ],

  playerChoice: {
    scenario:
      "瓶子的柄最终指向了你。「如果现在必须选一个人和你一起离开这座岛，你选谁？」——所有人都在等你的答案。",
    options: [
      {
        id: "A_pick_someone",
        text: "选一个人的名字",
        affinityImpact: {
          // 动态计算：选中的人 +5~8，其余 -1~-3
          _dynamic: "pick_one_bonus",
        },
      },
      {
        id: "B_skip",
        text: "「这个问题……能不能跳过」",
        affinityImpact: {
          jiangye: -2,
          wenrou: 1,
          luze: 0,
          xiaohai: 1,
          baize: 1,
          guyan: 0,
          chengyi: 0,
          zhoumu: 0,
        },
      },
      {
        id: "C_honest",
        text: "「我现在还不知道。但七天之后，我会知道的」",
        affinityImpact: {
          guyan: 3,
          wenrou: 1,
          luze: 1,
          jiangye: 1,
          xiaohai: 1,
          baize: 1,
          chengyi: 1,
          zhoumu: 1,
        },
      },
    ],
  },

  endings: {
    A_pick_someone: {
      narration: [
        `你说出了那个名字的瞬间——`,
        `空气凝固了一秒。`,
        `然后，各种反应同时涌来。`,
      ],
      chatContext: {
        topic: "真心话大冒险/秘密/选择/心跳加速",
        mentionedNpcs: ["luze", "jiangye", "wenrou", "baize", "guyan"],
        playerStance: "在真心话游戏中做出了选择",
        tensionLevel: "high",
        keyMoments: [
          "小海暗示有心动对象",
          "白泽公开表示害怕说错话",
          "陆则罕见地承认情绪",
          "玩家被迫做出选择",
        ],
        privateChatOpening: {
          luze: "（坐在天台的栏杆旁，没有看你）……你刚才说的。是真的吗。",
          jiangye: "（靠在走廊墙上，双手插兜）所以——认真的？",
          wenrou: "（在厨房洗杯子，背对着你）今天玩得开心吗？",
          baize: "（抱着膝盖坐在房间角落）……你答那道题的时候，我好紧张。",
          default: "今天那个游戏……你还记得吗",
        },
      },
    },
    B_skip: {
      narration: [
        `江野的笑容淡了一点。`,
        `但温柔点了点头，像是在说「没关系」。`,
        `陆则的表情没有任何变化。`,
        `但你知道他在意——因为他的手指停止了摩挲杯沿。`,
        `游戏继续。但有些东西，已经不一样了。`,
      ],
      chatContext: {
        topic: "真心话/逃避/未完成的答案",
        mentionedNpcs: ["jiangye", "wenrou", "luze"],
        playerStance: "选择了回避问题",
        tensionLevel: "high",
        keyMoments: [
          "玩家跳过了敏感问题",
          "各人的不同反应",
        ],
      },
    },
    C_honest: {
      narration: [
        `顾言在本子上记了一笔，嘴角微扬。`,
        `"体面的答案。"他评价道。`,
        `江野挑了挑眉：「狡猾。」但他笑的时候眼睛是亮的。`,
        `温柔温和地说：「七天，确实足够了解一个人了。」`,
        `陆则依然沉默。但你看得到——他的肩膀放松了一点。`,
        `因为你没有草率地给出一个答案。`,
      ],
      chatContext: {
        topic: "真心话/诚实/期待",
        mentionedNpcs: ["guyan", "all"],
        playerStance: "给出了成熟而诚实的回答",
        tensionLevel: "medium-high",
        keyMoments: [
          "顾言认可了回答",
          "全员 +1 的温和反应",
        ],
      },
    },
  },
};

// ============================================================
// Day 4 · 海边约会
// ============================================================

export const DAY4_SCRIPT: EventScript = {
  id: "day4_beach_date",
  day: 4,
  title: "海边双人约会",
  time: "16:00",
  location: "心动岛私人海滩",
  atmosphere:
    "下午的阳光把海面晒成了金色。节目组宣布今天的活动是「海边自由时间」——但有一个规则：每个人必须邀请一位异性一起散步。不能拒绝。不能重复。这意味着八个人会分成四对，沿着海岸线走向四个不同的方向。而你——只能选一个人。",
  arcPhase: "tension",
  tensionLevel: "medium-high",

  openingNarration: [
    "海浪声就在不远处，一下一下地拍打着沙滩。",
    "节目组宣布规则的时候，",
    "你看到了八种不同的表情。",
    "有人在期待，有人在紧张，有人在假装不在意。",
    "而现在——所有目光都在等你先做决定。",
  ],

  npcDialogues: [
    {
      npcId: NPC_IDS.WENROU,
      action: "（站在离你三步远的地方）",
      lines: [
        "海边的紫外线很强。你要是没带防晒的话……我这有多余的。",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.LUZE,
      action: "（已经一个人往海滩方向走了几步）",
      lines: [
        // 只有一眼。然后就继续往前走了。
        // 但他走的速度——比你正常走路慢了整整一半。
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.JIANGYE,
      action: "（双手插兜）",
      lines: [
        "啧，这种强制约会的设定也太老套了吧。节目组是不是偶像剧看多了。",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.XIAOHAI,
      action: "（已经在原地蹦跶了好几下）",
      lines: [
        "海！大！海！谁要跟我一起去踩浪花！我可以背人！我很稳的！",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.BAIZE,
      action: "（站在遮阳伞下面）",
      lines: [
        // 看到你看向她的时候，微微侧过了头。但她没有走开。
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.GUYAN,
      action: "（在看表）",
      lines: [
        "四十五分钟后集合。注意安全。",
        "……玩得开心。",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.CHENGYI,
      action: "（不知道从哪弄来了一个游泳圈套在身上）",
      lines: [
        "我宣布！今天我是海上救生员！谁来当我救援的第一个目标？！",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.ZHOUMU,
      action: "（站在人群边缘）",
      lines: [
        // 但墨镜上方露出的眼睛，快速地扫了你一眼。
      ],
      delta: 0,
    },
  ],

  playerChoice: {
    scenario:
      "这是 Day 4 最关键的抉择——选择一位 NPC 作为海边约会对象。被你邀请的人会感到开心，未被邀请的关键 NPC 可能会有失落感。",
    options: [
      {
        id: "pick_luze",
        text: "「……你要不要一起走走？」—— 邀请陆则",
        affinityImpact: {
          luze: 8,
          jiangye: -3,
          wenrou: -1,
          xiaohai: 0,
          baize: 0,
          guyan: 0,
          chengyi: 0,
          zhoumu: 0,
        },
      },
      {
        id: "pick_wenrou",
        text: "「你刚才说防晒霜——能分我吗？」—— 邀请温柔",
        affinityImpact: {
          wenrou: 7,
          luze: 0,
          baize: -2,
          jiangye: 0,
          xiaohai: 0,
          guyan: -1,
          chengyi: 0,
          zhoumu: 0,
        },
      },
      {
        id: "pick_jiangye",
        text: "「你不是说设定老套吗——陪我验证一下？」—— 邀请江野",
        affinityImpact: {
          jiangye: 7,
          luze: -1,
          wenrou: 0,
          xiaohai: 0,
          baize: 0,
          guyan: 0,
          chengyi: 0,
          zhoumu: 0,
        },
      },
      {
        id: "pick_xiaohai",
        text: "「好呀，那你背我去踩浪花！」—— 邀请小海",
        affinityImpact: { xiaohai: 6 },
      },
      {
        id: "pick_baize",
        text: "「一个人站那边会不会无聊——一起走吧」—— 邀请白泽",
        affinityImpact: {
          baize: 7,
          wenrou: -1,
          jiangye: 0,
        },
      },
      {
        id: "pick_guyan",
        text: "「你说了玩得开心——那一起？」—— 邀请顾言",
        affinityImpact: {
          guyan: 6,
          wenrou: -1,
          luze: 0,
        },
      },
      {
        id: "pick_chengyi",
        text: "「救生员，我需要救援——陪我去海边」—— 邀请承熠",
        affinityImpact: { chengyi: 5 },
      },
      {
        id: "pick_zhoumu",
        text: "「你戴墨镜的样子挺酷的——但能看到路吗」—— 邀请周牧",
        affinityImpact: { zhoumu: 6 },
      },
    ],
  },

  endings: {
    pick_luze: {
      narration: [
        `你跟上了陆则的步伐。他没有回头，但脚步更慢了。`,
        `海浪声盖过了你们的呼吸声。走了大概五分钟，他开口了。`,
        `"……你为什么选我。"`,
        `（不是疑问。更像是在确认一个他已经想了很久的答案）`,
        `"昨天那个问题。你选了我。我以为——你可能只是随口说的。"`,
        `（他停下脚步，转过身面对你。海风把他的头发吹乱了。）`,
        `"但现在你又一次选了我。"`,
        `"……我不是一个容易相处的人。温柔更适合你。江野更有趣。小海会让你笑。"`,
        `（声音低了下去）`,
        `"但如果你选的是我会试着……不那么容易逃跑。"`,
      ],
      extraDialogues: [
        {
          npcId: NPC_IDS.LUZE,
          action: "（喉结滚动了一下）",
          lines: [
            "——如果你选的是我——",
            "我会试着不那么容易逃跑。",
          ],
          delta: 10,
          clue: "⭐⭐⭐ Day 4 最高心动时刻 —— 回避型公开承诺尝试",
        },
      ],
      chatContext: {
        topic: "海边约会/选择/独处/心跳",
        mentionedNpcs: ["luze", "jiangye", "wenrou"],
        playerStance: "在海边选择了陆则，经历了独处时刻",
        tensionLevel: "medium-high",
        keyMoments: [
          "四人分组各奔东西",
          "与陆则的独处对话",
          "陆则说'不再逃跑'",
          "未受邀者的反应",
        ],
        jealousyTriggered: ["jiangye"],
        relationshipTurningPoint: true,
      },
    },
    pick_wenrou: {
      narration: [
        `温柔把防晒霜递给你的时候，指尖碰到了你的手腕。`,
        `"涂均匀一点，耳朵后面容易晒伤。"`,
        `（他帮你把防晒霜涂在耳后，动作很自然，像是很久以前就做过很多次一样）`,
        `你们沿着海岸线慢慢走着。他不怎么说话，但每当海浪涌上来的时候，他会下意识地挡在你前面。`,
        `"你不用害怕。我在。"`,
        `他说得很轻。像是自言自语。`,
      ],
      chatContext: {
        topic: "海边约会/保护/温柔",
        mentionedNpcs: ["wenrou", "baize"],
        playerStance: "选择了温柔，体验了被保护的感觉",
        tensionLevel: "medium",
        keyMoments: [
          "温柔帮你涂防晒霜",
          "海浪来时他挡在前面",
          "'我在'的承诺",
        ],
      },
    },
    pick_jiangye: {
      narration: [
        `江野愣了一下——显然没想到你会选他。`,
        `但他很快就恢复了那副吊儿郎当的笑容。`,
        `"哦？我？行啊。"`,
        `（他把手从兜里伸出来，做了一个'请'的手势）`,
        `你们走着走着，他突然开口：`,
        `"喂，你选我——不是因为觉得我好欺负吧？"`,
        `（他在笑，但眼神在认真地看你的反应）`,
      ],
      chatContext: {
        topic: "海边约会/互怼/试探",
        mentionedNpcs: ["jiangye", "luze"],
        playerStance: "选择了江野，进入了互怼暧昧模式",
        tensionLevel: "medium",
        keyMoments: [
          "江野意外于被选中",
          "海边散步中的互相试探",
        ],
      },
    },
    pick_xiaohai: {
      narration: [
        `"耶！！！" 小海直接欢呼出声，一把把你扛到了肩上。`,
        `"出发！目标——大海！"`,
        `一路上海风呼啸，他在跟你讲他小时候在海边捡贝壳的故事。`,
        `全程大笑。阳光、大海、少年的背影——`,
        `一切都明亮得不像话。`,
      ],
      chatContext: {
        topic: "海边约会/快乐/纯真",
        mentionedNpcs: ["xiaohai"],
        playerStance: "选择了小海，体验了最纯粹的快乐",
        tensionLevel: "low",
        keyMoments: ["小海扛着你奔向大海"],
      },
    },
    pick_baize: {
      narration: [
        `白泽的眼睛亮了一下。很短暂，但你能捕捉到。`,
        `"……好。"`,
        `（她把手从裙角上放开，走到你身边）`,
        `你们并肩走在沙滩上。她不太说话，但时不时侧过头来看你。`,
        `"海……很好看。"`,
        `她说。但你感觉她看的不是海。`,
      ],
      chatContext: {
        topic: "海边约会/安静陪伴",
        mentionedNpcs: ["baize", "wenrou"],
        playerStance: "选择了白泽，安静的陪伴",
        tensionLevel: "low",
        keyMoments: ["白泽眼中的光", "并肩走在沙滩上"],
      },
    },
    pick_guyan: {
      narration: [
        `顾言微微颔首。`,
        `"好。四十五分钟后准时集合。"`,
        `（但你们走上沙滩的时候，他的步伐明显慢了下来）`,
        `"平时……很少有机会这样走走。"`,
        `他看着海面，语气少有的轻松。`,
        `"数据分析和海边散步，意外地兼容。"`,
      ],
      chatContext: {
        topic: "海边约会/理性浪漫",
        mentionedNpcs: ["guyan", "wenrou"],
        playerStance: "选择了顾言，意外的柔软一面",
        tensionLevel: "low",
        keyMoments: ["顾言罕见的放松状态"],
      },
    },
    pick_chengyi: {
      narration: [
        `"救援任务收到！！！" 承熠敬了一个不标准的礼。`,
        `"目标海域——前方！全速前进！"`,
        `他拉着你往海边跑，一边跑一边指着天上的云:`,
        `"你看那朵云！像不像一只在跳舞的兔子？！"`,
        `你还没来得及回答，他又指另一朵：`,
        `"那朵像不像顾言生气的脸？！"`,
      ],
      chatContext: {
        topic: "海边约会/快乐/童心",
        mentionedNpcs: ["chengyi"],
        playerStance: "选择了承熠，被快乐感染",
        tensionLevel: "low",
        keyMoments: ["承熠的云朵想象力"],
      },
    },
    pick_zhoumu: {
      narration: [
        `周牧把墨镜摘了下来。露出一双平静的眼睛。`,
        `"……谢谢。"`,
        `（只有两个字。但从他嘴里说出来，感觉像是一段完整的演讲）`,
        `你们走在沙滩上。他走得很快，但每隔一会儿就会放慢脚步等你跟上。`,
        `"潮汐表显示十七点五十分有低潮。到时候可以去看礁石区的螃蟹。"`,
        `——他居然提前查过。`,
      ],
      chatContext: {
        topic: "海边约会/细致关怀",
        mentionedNpcs: ["zhoumu"],
        playerStance: "选择了周牧，发现了隐藏的温柔",
        tensionLevel: "low",
        keyMoments: ["周牧提前查潮汐表", "默默等步伐"],
      },
    },
  },
};

// ============================================================
// Day 5 · 天台夜谈·秘密
// ============================================================

export const DAY5_SCRIPT: EventScript = {
  id: "day5_rooftop_talk",
  day: 5,
  title: "天台夜谈·秘密",
  time: "22:00",
  location: "小屋天台",
  atmosphere:
    "夜幕降临后的天台是整座小屋最私密的地方。星星很亮，风里有海的咸味。有人在天台上待了很久了——当你推开天台的门，发现那里不止一个人。黑暗中，你听到有人在说话。",
  arcPhase: "climax",
  tensionLevel: "very-high",

  openingNarration: [
    "天台的门推开时，夜风迎面扑来。",
    "星星很亮。亮得让人觉得——",
    "有些藏在心里的话，可能藏不住了。",
    "你看到三个人已经在天台上：",
    "江野靠在栏杆上，仰头看星。",
    "白泽坐在地上，抱着膝盖。",
    "陆则站在阴影里，不知道在想什么。",
    "他们看到你进来，同时停下了。",
  ],

  npcDialogues: [
    {
      npcId: NPC_IDS.JIANGYE,
      action: "（让开了半个身位的距离）",
      lines: [
        "哟。来得正好。我们在聊一些——",
        "——不太适合在客厅聊的事。",
        "要不要加入？还是……你去当哨兵？",
      ],
      delta: 0,
    },
  ],

  playerChoice: {
    scenario:
      "三条故事线在你面前展开。你可以走近任何一个人——但今晚，你只能选择一条路走进去。",
    options: [
      {
        id: "A_jiangye",
        text: "走近江野 —— 听他的秘密",
        affinityImpact: {
          jiangye: 5,
          luze: 0,
          baize: 0,
        },
      },
      {
        id: "B_baize",
        text: "走到白泽身边坐下 —— 听她的心事",
        affinityImpact: {
          baize: 5,
          wenrou: 0,
          jiangye: 0,
        },
      },
      {
        id: "C_luze",
        text: "走向阴影里的陆则 —— 听他的防线",
        affinityImpact: {
          luze: 8,
          jiangye: 0,
          baize: 0,
        },
      },
    ],
  },

  endings: {
    A_jiangye: {
      narration: [
        `江野的声音在夜风里显得格外清晰。`,
        `"你知道吗，我小时候是那种——"`,
        `（苦笑）`,
        `"——老师眼里'这孩子很聪明但就是不专心'的学生。"`,
        `"我妈说我是'想太多'。我爸说我是'找存在感'。"`,
        `"但其实我只是……"`,
        `（声音低了下去）`,
        `"我只是害怕如果不一直说话，就会有人忘记我在这里。"`,
        `（转头看你，眼神里有一种你从未见过的认真）`,
        `"你不会忘记我吧？"`,
        `（随即立刻换上惯常的笑容）`,
        `"开玩笑的。我怎么会在乎这种事。"`,
      ],
      extraDialogues: [
        {
          npcId: NPC_IDS.JIANGYE,
          action: "（笑容僵住了一瞬——你在他转身之前看到了）",
          lines: [],
          delta: 5,
          clue: "⭐ 解锁江野 L3 冲突层线索：「用聪明保护自己；害怕无聊和被遗忘」",
        },
      ],
      chatContext: {
        topic: "天台夜谈/秘密/脆弱/江野",
        mentionedNpcs: ["jiangye"],
        playerStance: "走进了江野的内心世界",
        tensionLevel: "very-high",
        keyMoments: [
          "三人同时在天台的秘密聚会",
          "江野展示了真实的脆弱面",
          "害怕被遗忘的核心恐惧",
        ],
        relationshipTurningPoint: true,
        privateChatOpening: {
          jiangye:
            "（深夜发来消息）天台风大，你回房间了吗。……我今天说的话，你别想太多。",
          default: "今天天台上的事……",
        },
      },
    },
    B_baize: {
      narration: [
        `你在白泽身边坐下。她往旁边挪了一点——给你腾出空间。`,
        `"……你来了啊。"`,
        `（把下巴搁在膝盖上，声音闷闷的）`,
        `"我有时候会觉得——在这个屋子里，大家都那么耀眼。"`,
        `（手指无意识地画着裙子上的花纹）`,
        `"温柔像太阳一样暖。江野像烟花一样亮。小海像……像夏天的大海。"`,
        `（很小声地）`,
        `"而我呢……我感觉自己像月亮。只有在很安静的时候才会被人注意到。"`,
        `（抬眼看你，眼底有一点湿意）`,
        `"你会注意到我吗？在我安静的时候？"`,
      ],
      extraDialogues: [
        {
          npcId: NPC_IDS.BAIZE,
          action: "（声音在发抖）",
          lines: [],
          delta: 5,
          clue: "⭐ 解锁白泽 L3 冲突层线索：「过度感知他人情绪；害怕表达后被否定」",
        },
      ],
      chatContext: {
        topic: "天台夜谈/秘密/脆弱/白泽",
        mentionedNpcs: ["baize", "wenrou", "jiangye", "xiaohai"],
        playerStance: "走进了白泽的内心世界",
        tensionLevel: "very-high",
        keyMoments: [
          "白泽把自己比作月亮",
          "害怕不被看见的核心恐惧",
        ],
        relationshipTurningPoint: true,
        privateChatOpening: {
          baize:
            "（坐在房间门口，抱着枕头）……谢谢你留下来陪我。",
          default: "今天天台上的事……白泽还好吗",
        },
      },
    },
    C_luze: {
      narration: [
        `你没有说话。只是走向了他站着的阴影里。`,
        `他没有转身。但你知道他在听着。`,
        `"……这边光线不好。"`,
        `（意思是：你不该过来。但他没有让你走。）`,
        `（沉默了十几秒）`,
        `"前面四天。你选了我三次。"`,
        `（依然面向远方，声音很平）`,
        `"我不明白。"`,
        `（终于转过头。星光下，他的表情比任何时候都更难读懂）`,
        `"我不是一个值得被选三次的人。我会让你失望的。"`,
        `（攥紧了拳头）`,
        `"但如果你还是要选——下一次，别选别人了。"`,
      ],
      extraDialogues: [
        {
          npcId: NPC_IDS.LUZE,
          action: "（拳头攥紧又松开）",
          lines: [],
          delta: 8,
          clue:
            "⭐⭐⭐ 解锁陆则 L3 冲突层 + L4 核心层预览：「害怕被看穿后的失控感」+「其实很想相信一个人，只是每次靠近都会先想退路」",
        },
      ],
      chatContext: {
        topic: "天台夜谈/秘密/承诺/陆则",
        mentionedNpcs: ["luze"],
        playerStance: "走进了陆则的内心世界，收到了排他性请求",
        tensionLevel: "very-high",
        keyMoments: [
          "陆则数了你选他的次数",
          "要求'下一次别选别人'",
          "回避型的终极信任信号",
        ],
        relationshipTurningPoint: true,
        privateChatOpening: {
          luze:
            "（在你房门前站了一会儿，最终没有敲门。但你在门缝下看到了一张纸条：'明天早上，海边。一个人。如果你想的话。'）",
          default: "今天天台上的事……陆则跟你说什么了吗",
        },
      },
    },
  },
};

// ============================================================
// Day 6 · 约会邀请权争夺
// ============================================================

export const DAY6_SCRIPT: EventScript = {
  id: "day6_date_invitation",
  day: 6,
  title: "约会邀请权",
  time: "19:00",
  location: "小屋客厅",
  atmosphere:
    "这是倒数第二天。节目组宣布：今晚每个人有一次正式的约会邀请权——写下一个名字，如果对方也写了你的名字，你们将获得明晚的「专属二人晚餐」。如果没有匹配成功，则进入「公开表白轮」，被邀请者必须当场回应。这是一场关于勇气的博弈。",
  arcPhase: "climax",
  tensionLevel: "maximum",

  openingNarration: [
    "工作人员把纸笔发到了每个人手上。",
    "一张小小的纸条。一支普通的笔。",
    "但要写下的——可能是这七天最重要的一个名字。",
    "房间里安静得能听到心跳声。",
    "有人在咬笔头。有人在装作无所谓。",
    "而你——",
    "你想好了吗？",
  ],

  npcDialogues: [
    {
      npcId: NPC_IDS.WENROU,
      action: "（拿着笔）",
      lines: [
        "我一直在想——有些话是不是应该说出口。但如果说了，会不会给你带来困扰……",
        "算了。写下来吧。至少纸条不会说话。",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.LUZE,
      action: "（几乎是立刻写好了。把纸折好）",
      lines: [
        // 但他的笔迹比平时用力了很多。
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.JIANGYE,
      action: "（转着笔）",
      lines: [
        "这种设定也太狗血了吧。但我喜欢狗血的。来吧，看看谁的运气好。",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.XIAOHAI,
      action: "（写得飞快）",
      lines: [
        "好了！我完成了！不管结果怎么样——至少我勇敢了对不对！",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.BAIZE,
      action: "（攥着纸条）",
      lines: [
        "我……我不知道该写谁。万一……万一对方没写我……",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.GUYAN,
      action: "（最后一个放的）",
      lines: [
        "结果无论如何——都是合理的选择。",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.CHENGYI,
      action: "（兴奋地写着）",
      lines: [
        "我写了一个名字！但我加了备注！'如果你也选了我——我们去看日出吧！'附加条款！不可撤销！",
      ],
      delta: 0,
    },
    {
      npcId: NPC_IDS.ZHOUMU,
      action: "（工整的字迹）",
      lines: [
        // 和其他人相比，他的纸条看起来最不像情书。但也最像一个承诺。
      ],
      delta: 0,
    },
  ],

  playerChoice: {
    scenario:
      "现在，写下那个名字。这可能是你这七天最重要的决定之一。",
    options: [
      {
        id: "pick_luze_d6",
        text: "写下「陆则」的名字",
        affinityImpact: {
          luze: 12,
          jiangye: -4,
          wenrou: -2,
          baize: -3,
        },
      },
      {
        id: "pick_wenrou_d6",
        text: "写下「温柔」的名字",
        affinityImpact: {
          wenrou: 12,
          luze: -1,
          baize: -3,
          jiangye: -1,
        },
      },
      {
        id: "pick_jiangye_d6",
        text: "写下「江野」的名字",
        affinityImpact: {
          jiangye: 12,
          luze: -1,
          wenrou: -1,
          baize: -2,
        },
      },
      {
        id: "pick_baize_d6",
        text: "写下「白泽」的名字",
        affinityImpact: {
          baize: 12,
          wenrou: -2,
          jiangye: -1,
        },
      },
      {
        id: "pick_xiaohai_d6",
        text: "写下「小海」的名字",
        affinityImpact: { xiaohai: 10 },
      },
      {
        id: "pick_guyan_d6",
        text: "写下「顾言」的名字",
        affinityImpact: { guyan: 10 },
      },
      {
        id: "pick_chengyi_d6",
        text: "写下「承熠」的名字",
        affinityImpact: { chengyi: 10 },
      },
      {
        id: "pick_zhoumu_d6",
        text: "写下「周牧」的名字",
        affinityImpact: { zhoumu: 10 },
      },
    ],
  },

  endings: {
    pick_luze_d6: {
      narration: [
        `主持人打开第一张纸条。`,
        `"'陆则' 写的是——……[你的名字]。"`,
        `（全场安静了一秒）`,
        `（打开对应纸条）`,
        `"[你] 写的是——……陆则！！！"`,
        `小海：\"OOOOOOHHH！！！我就知道！！！\"`,
        `江野：（鼓掌，笑容标准但眼底复杂）\"恭喜啊。\"`,
        `温柔：（点头，温和地）\"很好的选择。\"`,
        `白泽：（小声）\"真好啊……\"`,
        `顾言：（记录）\"Day 6，19:23。第一对匹配成功。\"`,
        `陆则站起来。走到你面前。周围的一切好像都静止了。`,
        `\"……你写了我的名字。\"`,
        `\"明天晚上。只有我们两个。\"`,
        `（伸出手）`,
        `\"别迟到。\"`,
      ],
      extraDialogues: [
        {
          npcId: NPC_IDS.LUZE,
          action: "（伸出手）",
          lines: ["别迟到。"],
          delta: 12,
          clue: "⭐⭐⭐⭐ 匹配成功 = 终极认可",
        },
      ],
      chatContext: {
        topic: "约会邀请/双向匹配/勇气/结果",
        mentionedNpcs: ["luze", "jiangye", "wenrou", "baize"],
        playerStance: "与陆则双向匹配成功",
        tensionLevel: "maximum",
        keyMoments: [
          "每人写下名字前的最后发言",
          "揭晓时刻的全场反应",
          "陆则说'别迟到'",
        ],
        relationshipTurningPoint: true,
        privateChatOpening: {
          if_matched: "（发来消息）明天晚上七点。我来接你。",
          default: "今天的结果……你还好吗",
        },
      },
    },
    pick_wenrou_d6: {
      narration: [
        `"匹配成功！"`,
        `温柔的眼睛弯了一下。很浅，但你能看到。`,
        `"……谢谢你。"`,
        `（他把那张纸条小心地对折再对折，放进了口袋）`,
        `"明天晚上。我会准备好。"`,
        `江野在旁边吹了声口哨：\"哦哟，温柔哥终于要开花了？\"`,
        `温柔笑着摇摇头，没反驳。`,
      ],
      chatContext: {
        topic: "约会邀请/双向匹配/温柔",
        mentionedNpcs: ["wenrou", "jiangye", "baize"],
        playerStance: "与温柔双向匹配成功",
        tensionLevel: "maximum",
        keyMoments: ["温柔小心收好纸条", "江野的调侃"],
        relationshipTurningPoint: true,
      },
    },
    pick_jiangye_d6: {
      narration: [
        `"匹配——等等真的假的？！"`,
        `江野手里的笔掉在了桌上。`,
        `他很快捡起来，但耳朵红得很明显。`,
        `"哈。可以啊你。"`,
        `（试图恢复镇定，但嘴角的弧度完全出卖了他）`,
        `"明天晚上。别后悔。"`,
        `陆则在角落里看着这一幕，端起咖啡杯喝了一口。`,
        `——他的手在杯壁上留了一个很深的指纹。`,
      ],
      chatContext: {
        topic: "约会邀请/双向匹配/江野",
        mentionedNpcs: ["jiangye", "luze"],
        playerStance: "与江野双向匹配成功",
        tensionLevel: "maximum",
        keyMoments: ["江野掉笔", "陆则的指纹"],
        relationshipTurningPoint: true,
      },
    },
    pick_baize_d6: {
      narration: [
        `"白泽——匹配成功！"`,
        `白泽捂住了嘴。眼泪一下子就涌出来了。`,
        `"真、真的吗……"`,
        `温柔走过去，轻轻拍了拍她的肩膀。温柔地笑了。`,
        `"恭喜你。"`,
        `白泽哭着点头。那种笑容——`,
        `像月亮终于被人看见了。`,
      ],
      chatContext: {
        topic: "约会邀请/双向匹配/白泽",
        mentionedNpcs: ["baize", "wenrou"],
        playerStance: "与白泽双向匹配成功",
        tensionLevel: "maximum",
        keyMoments: ["白泽的眼泪", "月亮终于被看见"],
        relationshipTurningPoint: true,
      },
    },
    pick_xiaohai_d6: {
      narration: [
        `"小海——匹配！"`,
        `"耶耶耶耶耶！！！"`,
        `小海直接跳起来把你抱了一圈。`,
        `"我就知道我们会在一起的！直觉准不准？！"`,
        `全场都被他感染了。连陆则的嘴角都动了一下。`,
        `——虽然只有一下。`,
      ],
      chatContext: {
        topic: "约会邀请/双向匹配/小海",
        mentionedNpcs: ["xiaohai"],
        playerStance: "与小海双向匹配成功",
        tensionLevel: "high",
        keyMoments: ["小海的拥抱", "连陆则笑了一下"],
      },
    },
    pick_guyan_d6: {
      narration: [
        `"顾言——匹配成功。"`,
        `顾言推了推眼镜。表情依然是那副冷静的模样。`,
        `"……合理的结局。"`,
        `（但他在本子上写字的时候，笔画比平时重了很多）`,
        `"明天见。"`,
        `简短。但你知道这三个字对他来说意味着什么。`,
      ],
      chatContext: {
        topic: "约会邀请/双向匹配/顾言",
        mentionedNpcs: ["guyan"],
        playerStance: "与顾言双向匹配成功",
        tensionLevel: "high",
        keyMoments: ["顾言的'合理'", "笔画加重"],
      },
    },
    pick_chengyi_d6: {
      narration: [
        `"承熠——匹配！！！"`,
        `"附加条款生效！！！！明天日出！！！我们一起去看！！！"`,
        `承熠激动得差点把桌子掀了。`,
        `江野一把拽住他的领子：\"坐下。桌子很贵的。\"`,
        `但承熠的眼睛亮得像两颗星星。`,
        `"你选了我。你真的选了我。啊啊啊啊我太开心了！！！"`,
      ],
      chatContext: {
        topic: "约会邀请/双向匹配/承熠",
        mentionedNpcs: ["chengyi", "jiangye"],
        playerStance: "与承熠双向匹配成功",
        tensionLevel: "high",
        keyMoments: ["承熠的附加条款生效", "日出之约"],
      },
    },
    pick_zhoumu_d6: {
      narration: [
        `"周牧——匹配。"`,
        `周牧推了推眼镜。耳朵以肉眼可见的速度变红了。`,
        `"……概率 12.5%。落在这个区间内。"`,
        `（他站起来，走到你面前）`,
        `"明天晚上。我不会迟到的。"`,
        `——这是他说过的最长的一句话。`,
      ],
      chatContext: {
        topic: "约会邀请/双向匹配/周牧",
        mentionedNpcs: ["zhoumu"],
        playerStance: "与周牧双向匹配成功",
        tensionLevel: "high",
        keyMoments: ["周牧的红耳朵", "最长的一句话"],
      },
    },
  },
};

// ============================================================
// Day 7 · 离别前夜·篝火
// ============================================================

export const DAY7_SCRIPT: EventScript = {
  id: "day7_bonfire_farewell",
  day: 7,
  title: "离别前夜·篝火",
  time: "21:00",
  location: "小屋后院 · 篝火区",
  atmosphere:
    "这是最后一夜。篝火在沙滩上燃起，火星被海风卷向星空。七天前你们还是陌生人，而现在——每个人脸上都有一种说不清的情绪。有人笑着，有人沉默，有人假装在看手机。明天，就要有人离开了。也可能——那个人是你。",
  arcPhase: "resolution",
  tensionLevel: "high",

  openingNarration: [
    "火焰噼啪作响。",
    "映在每个人的脸上，忽明忽暗。",
    "七天。",
    "一百六十八小时。",
    "一万零零八十分钟。",
    "你们在这里分享了早餐、秘密、真心话、",
    "和一个又一个可能改变一切的瞬间。",
    "现在是时候了。",
    "最后一轮——每个人说一句话。",
    "对这个人，或者对这个房间，或者对——",
    "这七天里的自己。",
  ],

  npcDialogues: [
    {
      npcId: NPC_IDS.WENROU,
      action: "（往火里添了一根木柴）",
      lines: [
        "我来这里之前，朋友说我'太累了，该休息一下'。",
        "但这七天——说实话——一点都不累。",
        "能照顾大家，是我的习惯。但在这里被照顾……是很久没有过的体验。",
        "谢谢你们让我觉得——偶尔被人照顾，也不是一件坏事。",
      ],
      delta: 2,
    },
    {
      npcId: NPC_IDS.LUZE,
      action: "（双手插在口袋里）",
      lines: [
        "我没什么好说的。",
        "七天前走进这个厨房的时候，我没想过会和任何人多说一句话。",
        "但现在——",
        "——我不想只说一句话就走。",
        "我留了这个。从第一天起。",
        "……这不算表白。这只是——一个事实陈述。",
      ],
      delta: 10,
      clue:
        "⭐⭐⭐⭐⭐ Day 7 终极心动时刻 —— 保留了你第一天的档案 = 从一开始就在意的铁证",
    },
    {
      npcId: NPC_IDS.JIANGYE,
      action: "（坐在地上）",
      lines: [
        "说实话，我刚来的时候觉得这种节目超傻的。谁会真的在七天里喜欢上谁啊？",
        "然后第三天我就打了脸。第四天又打了一次。第五天——算了不说了，丢人。",
        "我想说的是——不管结果如何，这七天是我很久以来过得最真实的七天。",
        "尤其是——和你说话的那几次。",
      ],
      delta: 3,
    },
    {
      npcId: NPC_IDS.XIAOHAI,
      action: "（第一个打破沉重气氛的人）",
      lines: [
        "喂喂喂！大家怎么都这么严肃啊！",
        "明天是要分开又不是要去火星！我们有微信！有电话！还可以约饭！",
        "……虽然确实会不一样了。",
        "但至少——至少这七天，我们一起笑过对吧？这就够了。",
        "……要是以后还能一起笑就好了。",
      ],
      delta: 2,
    },
    {
      npcId: NPC_IDS.BAIZE,
      action: "（抱着膝盖）",
      lines: [
        "我带了相机来。拍了好多照片。",
        "这张是温柔做饭的时候。这张是小海在沙滩上奔跑。这张是……",
        "……总之。谢谢大家让我觉得——安静的人也可以被看见。",
        "我会想念这里的。每一天。",
      ],
      delta: 3,
      clue: "相机里的偷拍照 = 含蓄的告白",
    },
    {
      npcId: NPC_IDS.GUYAN,
      action: "（手里拿着他那本记录了七天的笔记本）",
      lines: [
        "我记录了这七天发生的所有重要事件。一共 127 条。",
        "按照数据分析——这个小屋的关系网络密度增加了 340%。冲突解决率 89%。正面情绪指数持续上升。",
        "但数据不会告诉你——第七天晚上，坐在这堆篝火旁边，我心里在想什么。",
        "我在想——如果时间可以再多一天，就好了。",
      ],
      delta: 2,
    },
    {
      npcId: NPC_IDS.CHENGYI,
      action: "（突然从后面跳出来）",
      lines: [
        "surprise！！！！！！我做了一个东西！！！",
        "我偷偷找节目组小姐姐帮我打印的！每人一份！来来来！",
        "喂。这一份是你的。",
        "里面那张照片——你笑得最好看。",
      ],
      delta: 3,
    },
    {
      npcId: NPC_IDS.ZHOUMU,
      action: "（最后一个）",
      lines: [
        "我没有准备发言稿。",
        "但这七天——",
        "——是合理的。",
        "我的意思是：来到这里是合理的。遇见你们是合理的。产生的这些……情绪……也是合理的。",
        "我不是很擅长表达。但如果你在我的计算公式里——",
        "——你是一个无法被剔除的变量。",
      ],
      delta: 5,
      clue: "⭐ 周牧式告白：用数学语言说'你是我生命中不可或缺的一部分'",
    },
  ],

  playerChoice: {
    scenario:
      "现在轮到你了。这是你在公共场合的最后一次发言。火焰映在每个人的脸上，每个人都在等你说点什么。",
    options: [
      {
        id: "A_hint",
        text: "「这七天，我喜欢上了这里。也喜欢上了……这里的某个人。」",
        affinityImpact: {
          _dynamic: "hint_love",
          _baseBonus: 1,
          _targetBonus: 5,
        },
      },
      {
        id: "B_stubborn",
        text: "「我不想说再见。所以——我不会说。」",
        affinityImpact: {
          jiangye: 3,
          luze: 3,
          wenrou: 1,
        },
      },
      {
        id: "C_grateful",
        text: "「谢谢你们每一个人。这七天改变了我的某些东西。」",
        affinityImpact: {
          wenrou: 2,
          luze: 2,
          jiangye: 2,
          xiaohai: 2,
          baize: 2,
          guyan: 2,
          chengyi: 2,
          zhoumu: 2,
        },
      },
      {
        id: "D_promise",
        text: "（直接走到某个人面前）「我有话想对你说——但不是现在。明天。」",
        affinityImpact: {
          _dynamic: "target_only",
          _targetBonus: 8,
        },
      },
    ],
  },

  endings: {
    A_hint: {
      narration: [
        `篝火噼啪了一声。火星飞向星空。`,
        `没有人追问「某个人」是谁。`,
        `但每个人的目光都不自觉地投向了不同的方向。`,
        `——他们心里各有答案。`,
        `而你说的这句话，会成为某些人今晚失眠的原因。`,
      ],
      chatContext: {
        topic: "离别/篝火/暗示/终章",
        mentionedNpcs: ["all"],
        playerStance: "暗示了心意但没有点名",
        tensionLevel: "resolution",
        keyMoments: [
          "陆则展示了你第一天的档案",
          "白泽相机里的偷拍照",
          "承熠的丑萌相框",
          "周牧的数学式告白",
          "玩家的暗示发言",
        ],
        finaleSetup: {
          tomorrowEvent: "终选之夜",
          choicesAvailable: ["告白", "放弃", "等待"],
        },
      },
    },
    B_stubborn: {
      narration: [
        `江野挑了挑眉：「任性。我喜欢。\"`,
        `陆则的嘴角几乎不可察觉地动了一下。`,
        `温柔温和地说：「不说就不说。我们都懂。\"`,
        `火焰继续燃烧。有些话不需要说出口。`,
        `——有些人已经听到了。`,
      ],
      chatContext: {
        topic: "离别/任性/默契",
        mentionedNpcs: ["jiangye", "luze", "wenrou"],
        playerStance: "任性地拒绝告别",
        tensionLevel: "resolution",
        keyMoments: ["任性的告别方式", "江野的欣赏"],
        finaleSetup: {
          tomorrowEvent: "终选之夜",
        },
      },
    },
    C_grateful: {
      narration: [
        `温柔第一个回应：「能遇到你，是我们的幸运。\"`,
        `承熠大喊：「我也这么觉得！！！\"`,
        `白泽轻轻地说：「……谢谢你。\"`,
        `篝火照在每个人的脸上。七张脸，七种表情，`,
        `但同一种心情——`,
        `不舍。`,
      ],
      chatContext: {
        topic: "离别/感谢/温暖",
        mentionedNpcs: ["all"],
        playerStance: "温暖地告别每一个人",
        tensionLevel: "resolution",
        keyMoments: ["温暖的终章发言", "全员不舍"],
        finaleSetup: {
          tomorrowEvent: "终选之夜",
        },
      },
    },
    D_promise: {
      narration: [
        `你走到了那个人面前。`,
        `篝火的光在你身后，在你的影子里——`,
        `所有人都在看。`,
        `你没有说出那个名字。`,
        `但那个人知道你在对他/她说。`,
        `"明天。\" 你说。`,
        `只有一个词。但足够了。`,
      ],
      chatContext: {
        topic: "离别/约定/明天",
        mentionedNpcs: ["<target>"],
        playerStance: "做出了明确的约定",
        tensionLevel: "resolution",
        keyMoments: ["面对面的约定", "'明天'的承诺"],
        finaleSetup: {
          tomorrowEvent: "终选之夜",
          targetLocked: true,
        },
      },
    },
  },
};

// ============================================================
// 导出：按天数索引
// ============================================================

/** 按 day number (1-7) 获取事件脚本 */
export function getEventScript(day: number): EventScript | undefined {
  const SCRIPTS: Record<number, EventScript> = {
    1: DAY1_SCRIPT,
    2: DAY2_SCRIPT,
    3: DAY3_SCRIPT,
    4: DAY4_SCRIPT,
    5: DAY5_SCRIPT,
    6: DAY6_SCRIPT,
    7: DAY7_SCRIPT,
  };
  return SCRIPTS[day];
}

/** 获取所有事件脚本列表 */
export function getAllEventScripts(): EventScript[] {
  return [DAY1_SCRIPT, DAY2_SCRIPT, DAY3_SCRIPT, DAY4_SCRIPT, DAY5_SCRIPT, DAY6_SCRIPT, DAY7_SCRIPT];
}

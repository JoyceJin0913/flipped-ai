import living from "@/assets/scene-living.jpg";
import kitchen from "@/assets/scene-kitchen.jpg";
import balcony from "@/assets/scene-balcony.jpg";
import linyi from "@/assets/avatars/linyi.jpg";
import shenzhi from "@/assets/avatars/shenzhi.jpg";
import wenning from "@/assets/avatars/wenning.jpg";
import xujia from "@/assets/avatars/xujia.jpg";
import suyao from "@/assets/avatars/suyao.jpg";
import me from "@/assets/avatars/me.jpg";

export type Gender = "m" | "f";

export type Choice = {
  key: "A" | "B" | "C";
  label: string;
  result: string;
  effects: { name: string; delta: number }[];
};

export type Scene = {
  id: string;
  place: string;
  time: string;
  title: string;
  image: string;
  core?: boolean;
  /** 观察事件：只看剧情，不做选择 */
  observe?: boolean;
  /** 观察事件结尾的一句旁白 */
  outcome?: string;
  dialogue: { who: string; line: string }[];
  question: string;
  hint: string;
  choices: Choice[];
};

/** 图上标出的"此刻正在发生"的热点 */
export type Hotspot = {
  sceneId: string;
  label: string;
  top: string;
  left: string;
};

export const hotspots: Hotspot[] = [
  { sceneId: "kitchen", label: "厨房 · 有人在说话", top: "26%", left: "58%" },
  { sceneId: "balcony", label: "阳台 · 一个人站着", top: "62%", left: "10%" },
];

/** 不需要交互的碎片，只用来铺节奏 */
export const microEvents: { time: string; text: string }[] = [
  { time: "19:20", text: "白露把晚餐端上桌，陆野第一个坐下。" },
  { time: "22:05", text: "夏可在客厅放了首很老的歌，没人换台。" },
];


export type Member = {
  name: string;
  gender: Gender;
  where: string;
  top: string;
  left: string;
  avatar?: string;
};

export const members: Member[] = [
  { name: "林一", gender: "m", where: "在客厅", top: "22%", left: "6%", avatar: linyi },
  { name: "周叙", gender: "m", where: "在厨房", top: "22%", left: "56%" },
  { name: "沈知", gender: "m", where: "在阳台", top: "33%", left: "30%", avatar: shenzhi },
  { name: "陆野", gender: "m", where: "在客厅", top: "44%", left: "6%" },
  { name: "江郁", gender: "m", where: "在阳台", top: "44%", left: "56%" },
  { name: "苏杳", gender: "f", where: "在客厅", top: "55%", left: "6%", avatar: suyao },
  { name: "温宁", gender: "f", where: "在厨房", top: "55%", left: "56%", avatar: wenning },
  { name: "许佳", gender: "f", where: "在阳台", top: "66%", left: "30%", avatar: xujia },
  { name: "白露", gender: "f", where: "在厨房", top: "77%", left: "6%" },
  { name: "夏可", gender: "f", where: "在客厅", top: "77%", left: "56%" },
];

export const avatarOf = (name: string): string | undefined =>
  members.find((m) => m.name === name)?.avatar;

export const genderOf = (name: string): Gender =>
  members.find((m) => m.name === name)?.gender ?? "m";

export const scenes: Scene[] = [
  {
    id: "kitchen",
    place: "厨房",
    time: "21:13",
    title: "厨房里的十二分钟",
    image: kitchen,
    core: true,
    dialogue: [
      { who: "林一", line: "你是不是有话想跟我说？" },
      { who: "温宁", line: "……我也不知道该怎么说。" },
      { who: "林一", line: "那就先别说，站一会儿也行。" },
    ],
    question: "你觉得温宁为什么这么回避？",
    hint: "你的选择会影响后续剧情发展",
    choices: [
      {
        key: "A",
        label: "她在试探林一的态度",
        result: "温宁停顿了一下，把碗放回水槽：「那你先说，你怎么想。」空气忽然变得很轻。",
        effects: [
          { name: "林一 × 温宁 心动值", delta: 6 },
          { name: "紧张感", delta: 3 },
        ],
      },
      {
        key: "B",
        label: "她真的还没想清楚",
        result: "温宁笑了笑，转身去擦台面：「等我想明白了，第一个告诉你。」林一没有追问。",
        effects: [
          { name: "林一 × 温宁 心动值", delta: 2 },
          { name: "信任度", delta: 5 },
        ],
      },
      {
        key: "C",
        label: "她不想告诉林一",
        result: "温宁沉默了整整十二秒，然后说了句「没事」。厨房的灯忽然显得太亮了。",
        effects: [
          { name: "林一 × 温宁 心动值", delta: -3 },
          { name: "悬念值", delta: 8 },
        ],
      },
    ],
  },
  {
    id: "living",
    place: "客厅",
    time: "20:37",
    title: "沙发上的第一次分组",
    image: living,
    observe: true,
    outcome: "话题被轻轻放下，但每个人都记住了刚才谁看了谁一眼。分组的事，留到明早。",
    dialogue: [
      { who: "苏杳", line: "明天的约会，要不要抽签决定？" },
      { who: "沈知", line: "抽签多没意思，自己选吧。" },
      { who: "夏可", line: "那就看谁先开口咯。" },
    ],
    question: "你希望今晚的分组怎么决定？",
    hint: "会影响明天的约会名单",
    choices: [
      {
        key: "A",
        label: "抽签，交给运气",
        result: "签抽出来的一刻，陆野明显松了口气，白露却低下了头。",
        effects: [{ name: "意外度", delta: 7 }],
      },
      {
        key: "B",
        label: "各自邀请，公开表态",
        result: "沈知第一个站起来，走向了阳台的方向。客厅安静了两秒。",
        effects: [
          { name: "沈知 × 许佳 心动值", delta: 5 },
          { name: "紧张感", delta: 4 },
        ],
      },
      {
        key: "C",
        label: "今晚先不定，明早再说",
        result: "话题被轻轻放下，但每个人都记住了刚才谁看了谁一眼。",
        effects: [{ name: "悬念值", delta: 4 }],
      },
    ],
  },
  {
    id: "balcony",
    place: "阳台",
    time: "22:40",
    title: "阳台上的那支烟火",
    image: balcony,
    observe: true,
    outcome: "沈知没有追问，只是把烟火递了过去。夜风把话吹散了。",
    dialogue: [
      { who: "沈知", line: "你今天在厨房，是不是有点奇怪？" },
      { who: "温宁", line: "被你看出来了。" },
    ],
    question: "要不要让沈知把这件事说出去？",
    hint: "秘密的流向决定关系的走向",
    choices: [
      {
        key: "A",
        label: "让沈知替温宁保密",
        result: "沈知点了点头：「那这事就烂在阳台上。」两个人的关系近了一步。",
        effects: [
          { name: "温宁 × 沈知 信任度", delta: 8 },
          { name: "林一的信息差", delta: 5 },
        ],
      },
      {
        key: "B",
        label: "让沈知去提醒林一",
        result: "第二天早餐桌上，林一看向温宁的眼神变了。",
        effects: [
          { name: "林一 × 温宁 心动值", delta: 4 },
          { name: "温宁 × 沈知 信任度", delta: -6 },
        ],
      },
      {
        key: "C",
        label: "什么都不做",
        result: "夜风把话吹散了。有些事，明天会自己发生。",
        effects: [{ name: "悬念值", delta: 6 }],
      },
    ],
  },
];

/** 主线时间线：按时间顺序依次播放的三件事 */
export const storySequence: string[] = ["living", "kitchen", "balcony"];

/** 每段事件之后的过渡文字（最后一条是进入自由活动前的过渡） */
export const storyTransitions: string[] = [
  "半小时后……",
  "夜色又深了一些……",
  "小屋慢慢安静下来……",
];

export const dateCard = {

  title: "明日约会 · 城南旧书店",
  time: "Day 05 · 15:00",
  desc: "五男五女，两人一组，60 分钟独处。名单会在今晚的核心选择之后揭晓。",
};

export type RelationshipCard = {
  name: string;
  value: number;
  desc: string;
  meta: string;
  active: boolean;
};

export const relationshipCards: RelationshipCard[] = [
  {
    name: "温宁",
    value: 72,
    desc: "你今天主动找她聊天",
    meta: "21:13 厨房 · 聊了 12 分钟",
    active: true,
  },
  {
    name: "许佳",
    value: 58,
    desc: "她在晚餐时一直看你",
    meta: "18:47 餐桌 · 偷偷看了你",
    active: true,
  },
  {
    name: "苏杳",
    value: 34,
    desc: "你们今天没有说话",
    meta: "暂无互动",
    active: false,
  },
];

export type GraphNode = {
  name: string;
  top: string;
  left: string;
};

export type GraphEdge = [string, string];

export const relationshipGraph: { nodes: GraphNode[]; edges: GraphEdge[] } = {
  nodes: [
    { name: "温宁", top: "50%", left: "50%" },
    { name: "林一", top: "20%", left: "22%" },
    { name: "沈知", top: "20%", left: "78%" },
    { name: "许佳", top: "80%", left: "22%" },
    { name: "苏杳", top: "80%", left: "78%" },
  ],
  edges: [
    ["林一", "温宁"],
    ["沈知", "温宁"],
    ["许佳", "沈知"],
    ["苏杳", "林一"],
    ["温宁", "苏杳"],
  ],
};

export const meAvatar = me;

export type Profile = {
  name: string;
  day: string;
  target: string;
  value: number;
  moments: number;
};

export const profile: Profile = {
  name: "你",
  day: "Day 04",
  target: "温宁",
  value: 72,
  moments: 3,
};

export type StoryNode = {
  day: string;
  title: string;
};

export const storyTimeline: StoryNode[] = [
  { day: "Day 1", title: "初次见面" },
  { day: "Day 2", title: "第一次约会" },
  { day: "Day 3", title: "和沈知发生争执" },
  { day: "Day 4", title: "林一主动找你聊天" },
];

/** 与成员发起对话时可选的开场白与回应 */
export type ChatTopic = {
  key: string;
  label: string;
  /** 玩家说出的话 */
  say: string;
  /** TA 的回应（按人物覆盖，否则用默认） */
  reply: string;
  replyBy?: Record<string, string>;
};

export const chatTopics: ChatTopic[] = [
  {
    key: "greet",
    label: "打个招呼",
    say: "在忙吗？我路过看到你一个人。",
    reply: "不忙，正好想找人说说话。",
    replyBy: {
      温宁: "……刚才在厨房有点走神，被你看到了。",
      沈知: "我在看外面的灯，你要不要一起站会儿。",
    },
  },
  {
    key: "today",
    label: "问 TA 今天怎么样",
    say: "今天过得怎么样？感觉你有点心事。",
    reply: "还行吧，就是想的事情比说出来的多一点。",
    replyBy: {
      温宁: "有些话我还没想清楚，等我想明白了第一个告诉你。",
      许佳: "晚饭的时候我一直在看你，你没发现吧。",
    },
  },
  {
    key: "invite",
    label: "约 TA 明天的约会",
    say: "明天的约会，如果可以选，我想选你。",
    reply: "……那我记下了。别到时候反悔。",
    replyBy: {
      林一: "行啊，那我明天早点收拾好等你。",
      苏杳: "你确定吗？说出口就不能收回了哦。",
    },
  },
];

export const replyOf = (topic: ChatTopic, name: string): string =>
  topic.replyBy?.[name] ?? topic.reply;

/** 玩家性别（决定"心动观察"里出现的嘉宾） */
export const playerGender: Gender = "m";

/** 一次心动瞬间 */
export type HeartMoment = {
  day: string;
  time: string;
  place: string;
  text: string;
  delta: number;
};

/** 与某位嘉宾的心动档案 */
export type Affinity = {
  name: string;
  value: number;
  status: string;
  moments: HeartMoment[];
};

export const affinities: Affinity[] = [
  {
    name: "温宁",
    value: 72,
    status: "今天在厨房聊了 12 分钟",
    moments: [
      { day: "Day 1", time: "20:10", place: "客厅", text: "自我介绍时，她说的爱好和你一样。", delta: 12 },
      { day: "Day 2", time: "12:30", place: "餐桌", text: "她把最后一块蛋糕留给了你。", delta: 8 },
      { day: "Day 3", time: "22:15", place: "阳台", text: "你们同时沉默了很久，谁都没走。", delta: 16 },
      { day: "Day 4", time: "21:13", place: "厨房", text: "「等我想明白了，第一个告诉你。」", delta: 14 },
    ],
  },
  {
    name: "许佳",
    value: 58,
    status: "晚餐时她一直在看你",
    moments: [
      { day: "Day 1", time: "21:40", place: "客厅", text: "她主动坐到了你旁边。", delta: 10 },
      { day: "Day 3", time: "16:20", place: "院子", text: "她记得你说过怕晒，递了顶帽子。", delta: 12 },
      { day: "Day 4", time: "18:47", place: "餐桌", text: "她偷偷看了你三次，被你发现一次。", delta: 9 },
    ],
  },
  {
    name: "苏杳",
    value: 34,
    status: "今天你们没有说话",
    moments: [
      { day: "Day 2", time: "10:05", place: "厨房", text: "一起洗碗，聊了几句无关紧要的话。", delta: 6 },
      { day: "Day 3", time: "19:50", place: "客厅", text: "她提议抽签，眼神却没看你。", delta: -4 },
    ],
  },
  {
    name: "白露",
    value: 26,
    status: "只在饭桌上打过照面",
    moments: [
      { day: "Day 2", time: "19:20", place: "餐桌", text: "她端菜时说了句「小心烫」。", delta: 8 },
    ],
  },
  {
    name: "夏可",
    value: 18,
    status: "还没有真正开始",
    moments: [
      { day: "Day 4", time: "22:05", place: "客厅", text: "她放了首很老的歌，你多听了两遍。", delta: 5 },
    ],
  },
];

/** 心动值随天数的变化曲线（由瞬间累计而来） */
export const heartTrend = (a: Affinity): { day: string; value: number }[] => {
  let v = a.value - a.moments.reduce((s, m) => s + m.delta, 0);
  return a.moments.map((m) => {
    v += m.delta;
    return { day: m.day, value: v };
  });
};
/** 7 天旅程时间轴：整段体验的节奏 */
export type JourneyDay = {
  day: number;
  label: string;
  title: string;
  desc: string;
};

/** 当前进行到第几天 */
export const currentDay = 4;

export const journey: JourneyDay[] = [
  { day: 1, label: "初见", title: "十个人住进小屋", desc: "自我介绍、第一印象，谁也没敢先开口。" },
  { day: 2, label: "试探", title: "第一次共同任务", desc: "一起做饭、一起收拾，距离在无意中缩短。" },
  { day: 3, label: "分歧", title: "选择开始有代价", desc: "有人被落下，有人第一次觉得不甘心。" },
  { day: 4, label: "靠近", title: "厨房里的十二分钟", desc: "三件事之后，你可以主动私聊想见的人。" },
  { day: 5, label: "约会", title: "两人一组，60 分钟独处", desc: "城南旧书店，名单由昨晚的心动抉择决定。" },
  { day: 6, label: "摊牌", title: "把没说的话说出来", desc: "秘密开始流动，关系被重新排列。" },
  { day: 7, label: "告白", title: "最后一夜的选择", desc: "只能牵一个人的手，走出小屋。" },
];

/* ======================= 7 天结语（结尾页） ======================= */

/** 客观记录：一串可被统计的数字 */
export type FinaleStat = { label: string; value: string; sub?: string };

export const finaleStats: FinaleStat[] = [
  { label: "在小屋的天数", value: "7", sub: "168 小时" },
  { label: "发起的私聊", value: "18", sub: "覆盖 7 位嘉宾" },
  { label: "关键选择", value: "12", sub: "其中 4 次改变了名单" },
  { label: "约会次数", value: "3", sub: "2 次主动 · 1 次被选" },
  { label: "心动短信", value: "5", sub: "发出 3 · 收到 2" },
  { label: "最长的一次沉默", value: "12 分", sub: "Day 3 阳台" },
];

/** 客观记录里的关键节点 */
export const finaleMilestones: { day: string; text: string }[] = [
  { day: "Day 1", text: "第一个开口做自我介绍的人是你。" },
  { day: "Day 2", text: "你把最后一块蛋糕让了出去。" },
  { day: "Day 3", text: "阳台上你们都没说话，你也没有走。" },
  { day: "Day 4", text: "厨房里的十二分钟，你第一次主动问了心事。" },
  { day: "Day 5", text: "旧书店的约会，你迟到了 4 分钟。" },
  { day: "Day 6", text: "摊牌夜，你承认了自己在犹豫。" },
  { day: "Day 7", text: "最后一夜，你只牵了一个人的手。" },
];

/** 与每个人的相处结论 */
export type FinaleBond = {
  name: string;
  value: number;
  tag: string;
  summary: string;
  key: string;
};

export const finaleBonds: FinaleBond[] = [
  {
    name: "温宁",
    value: 88,
    tag: "走到最后的人",
    summary: "从一开始的相似，到后来的沉默都不尴尬。你们的关系是慢慢升起来的，没有一次剧烈的转折。",
    key: "「等我想明白了，第一个告诉你。」",
  },
  {
    name: "许佳",
    value: 64,
    tag: "差一点点",
    summary: "她一直在往前走，你一直在观察。Day 6 之后你们都明白了答案，但谁也没有拆穿。",
    key: "她记得你怕晒，递了一顶帽子。",
  },
  {
    name: "苏杳",
    value: 41,
    tag: "错过的时机",
    summary: "两次可以更近一步的机会都被别的事情打断，你们始终停在朋友那一层。",
    key: "Day 3 她提议抽签，眼神没看你。",
  },
  {
    name: "白露",
    value: 30,
    tag: "礼貌的距离",
    summary: "饭桌上的照面多过真正的对话，你对她的印象一直停留在第一天。",
    key: "「小心烫。」",
  },
  {
    name: "夏可",
    value: 22,
    tag: "还没开始",
    summary: "你们共享过同一首歌，但没有共享过一次完整的谈话。",
    key: "她放了首很老的歌。",
  },
];

/** 性格：入住前的自我刻板印象 vs 小屋里的行为观察 */
export type TraitCompare = {
  axis: string;
  self: number;
  observed: number;
  selfWord: string;
  observedWord: string;
  evidence: string;
};

export const finaleSelfTags = ["理性", "慢热", "不擅长表达", "怕麻烦别人"];
export const finaleObservedTags = ["先靠近的人", "记细节", "回避冲突", "在意公平"];

export const finaleTraits: TraitCompare[] = [
  {
    axis: "主动性",
    self: 35,
    observed: 72,
    selfWord: "我一般等别人先来",
    observedWord: "7 天里 18 次私聊中 13 次由你发起",
    evidence: "Day 1 第一个开口，Day 4 主动问她的心事。",
  },
  {
    axis: "表达",
    self: 30,
    observed: 46,
    selfWord: "说不出口",
    observedWord: "能说，但只在深夜说",
    evidence: "白天多为短句，22:00 后的对话平均长度是白天的 3 倍。",
  },
  {
    axis: "共情",
    self: 60,
    observed: 84,
    selfWord: "还行吧",
    observedWord: "你记住了别人随口说过的事",
    evidence: "5 次对话里引用了对方前几天说过的细节。",
  },
  {
    axis: "冲突处理",
    self: 55,
    observed: 28,
    selfWord: "该说的会说",
    observedWord: "遇到分歧时你更常先让步",
    evidence: "Day 3、Day 6 两次分歧，你都选择了退一步的选项。",
  },
  {
    axis: "专一度",
    self: 70,
    observed: 90,
    selfWord: "会认真对待",
    observedWord: "心动值从 Day 3 起集中在同一个人身上",
    evidence: "后 4 天 71% 的互动指向温宁。",
  },
];

export const finaleVerdict = {
  title: "一个慢，但不会回头的人",
  body:
    "你以为自己是被动的，但数据里你几乎每一次都先走了一步；你以为自己理性，实际上你的选择很早就固定了，只是你花了四天才承认。你不擅长在人多的时候表达，却能在只剩两个人的时候把话说准。你的问题不是不主动，而是太在意会不会打扰别人——这让你错过了苏杳，也让温宁多等了三天。",
};

/** 结语页开头的 slogan：描述这个人的恋爱特征 */
export const finaleSlogan = {
  line: "一个慢，但不会回头的人",
  sub: "SLOW TO SPEAK · QUICK TO STAY",
  desc: "七天里你 13 次先开口，却没有一次先要答案。",
};

/** 分享海报上的三个高光数字 */
export const posterHighlights: { k: string; v: string }[] = [
  { k: "主动开口", v: "13 次" },
  { k: "最长沉默", v: "12 分钟" },
  { k: "最终只牵", v: "1 个人" },
];

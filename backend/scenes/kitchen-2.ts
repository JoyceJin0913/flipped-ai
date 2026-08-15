import type { Scene } from "./types";

export const kitchenTwo: Scene = {
  id: "kitchen-2",
  place: "厨房",
  time: "23:02",
  title: "宵夜时间",
  image: "kitchen",
  ambience: "厨房灯光暖黄，许佳在煮泡面，看到林一进来眼睛亮了一下。",
  presentCharacters: ["许佳", "林一"],
  dialogue: [
    { who: "许佳", line: "你也没睡？要一起吃泡面吗？" },
    { who: "林一", line: "……好像有点香。" },
    { who: "许佳", line: "那你去拿两双筷子。" },
  ],
  question: "许佳的邀请，你怎么看？",
  hint: "你的态度会被看到",
  choices: [
    { key: "A", label: "她只是想找个人陪" },
    { key: "B", label: "她真的对我有意思" },
    { key: "C", label: "她想让温宁看到" },
  ],
  affectableRelationships: [
    "林一 × 许佳 心动值",
    "林一 × 温宁 心动值",
    "紧张感",
    "悬念值",
  ],
};

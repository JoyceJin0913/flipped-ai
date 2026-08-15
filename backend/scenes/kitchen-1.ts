import type { Scene } from "./types";

export const kitchenOne: Scene = {
  id: "kitchen",
  place: "厨房",
  time: "21:13",
  title: "厨房里的十二分钟",
  image: "kitchen",
  ambience: "深夜厨房只剩一盏暖光灯。温宁在洗碗，你（林一）拿了瓶水正准备走，她突然轻轻说了一句。",
  presentCharacters: ["温宁", "林一"],
  dialogue: [
    { who: "温宁", line: "你今天……是不是有点安静？" },
    { who: "林一", line: "有吗？" },
    { who: "温宁", line: "（把碗放进沥水架，没抬头）嗯，比昨天安静。" },
  ],
  question: "温宁这句话，你怎么接？",
  hint: "选项决定你今晚在她心里的样子",
  choices: [
    { key: "A", label: "反问回去：那你觉得我在想什么？" },
    { key: "B", label: "直接承认：我在观察你" },
    { key: "C", label: "岔开：今天的糖水好像少了一颗芋圆" },
  ],
  affectableRelationships: [
    "林一 × 温宁 心动值",
    "紧张感",
    "信任度",
    "悬念值",
  ],
};

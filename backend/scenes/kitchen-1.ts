import type { Scene } from "./types";

export const kitchenOne: Scene = {
  id: "kitchen",
  place: "厨房",
  time: "21:13",
  title: "厨房里的十二分钟",
  image: "kitchen",
  ambience: "深夜厨房，只有一盏暖光灯。温宁在洗碗，看到林一进来手停了一下。",
  presentCharacters: ["温宁", "林一"],
  dialogue: [
    { who: "林一", line: "你是不是有话想跟我说？" },
    { who: "温宁", line: "……我也不知道该怎么说。" },
    { who: "林一", line: "那就先别说，站一会儿也行。" },
  ],
  question: "你觉得温宁为什么这么回避？",
  hint: "你的选择会影响后续剧情发展",
  choices: [
    { key: "A", label: "她在试探林一的态度" },
    { key: "B", label: "她真的还没想清楚" },
    { key: "C", label: "她不想告诉林一" },
  ],
  affectableRelationships: [
    "林一 × 温宁 心动值",
    "紧张感",
    "信任度",
    "悬念值",
  ],
};

import type { Scene } from "./types";

export const balconyOne: Scene = {
  id: "balcony",
  place: "阳台",
  time: "22:40",
  title: "阳台上的那支烟火",
  image: "balcony",
  ambience: "夜风微凉，阳台上沈知靠着栏杆，看见温宁站在角落，手里拿着一封没寄出去的信。",
  presentCharacters: ["沈知", "温宁", "林一"],
  dialogue: [
    { who: "沈知", line: "你怎么一个人在这里？" },
    { who: "温宁", line: "被你看出来了。" },
  ],
  question: "要不要让沈知把温宁的秘密说出去？",
  hint: "秘密的流向决定关系的走向",
  choices: [
    { key: "A", label: "让沈知替温宁保密" },
    { key: "B", label: "让沈知提醒林一" },
    { key: "C", label: "什么都不做" },
  ],
  affectableRelationships: [
    "温宁 × 沈知 信任度",
    "林一 × 温宁 心动值",
    "林一的信息差",
    "悬念值",
  ],
};

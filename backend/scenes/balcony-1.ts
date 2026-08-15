import type { Scene } from "./types";

export const balconyOne: Scene = {
  id: "balcony",
  place: "阳台",
  time: "22:40",
  title: "阳台上的那支烟火",
  image: "balcony",
  ambience: "夜风微凉，阳台上只有你和沈知。他刚点了烟又没抽，像有话说。远处海浪声很轻。",
  presentCharacters: ["沈知", "林一"],
  dialogue: [
    { who: "沈知", line: "白天我在这里碰见温宁了。" },
    { who: "沈知", line: "她请我别说，但你是我兄弟。" },
    { who: "林一", line: "……" },
  ],
  question: "沈知想告诉你温宁的秘密，你怎么办？",
  hint: "沈知的秘密会决定你俩的信任",
  choices: [
    { key: "A", label: "告诉我，我想知道" },
    { key: "B", label: "别说，我不想通过你知道" },
    { key: "C", label: "先别说，让她自己告诉我" },
  ],
  affectableRelationships: [
    "温宁 × 沈知 信任度",
    "林一 × 温宁 心动值",
    "林一的信息差",
    "悬念值",
  ],
};

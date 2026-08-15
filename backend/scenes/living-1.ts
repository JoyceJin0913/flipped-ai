import type { Scene } from "./types";

export const livingOne: Scene = {
  id: "living-1",
  place: "客厅",
  time: "20:37",
  title: "沙发上的第一次分组",
  image: "living",
  ambience: "客厅灯光暖黄，苏杳、沈知、夏可坐在沙发上讨论明天的约会分组，气氛半开玩笑半试探。",
  presentCharacters: ["苏杳", "沈知", "夏可", "林一"],
  dialogue: [
    { who: "苏杳", line: "明天的约会，要不要抽签决定？" },
    { who: "沈知", line: "抽签多没意思，自己选吧。" },
    { who: "夏可", line: "那就看谁先开口咯。" },
  ],
  question: "你希望今晚的分组怎么决定？",
  hint: "会影响明天的约会名单",
  choices: [
    { key: "A", label: "抽签，交给运气" },
    { key: "B", label: "各自邀请，公开表态" },
    { key: "C", label: "让苏杳先决定" },
  ],
  affectableRelationships: [
    "意外度",
    "紧张感",
    "林一 × 苏杳 心动值",
    "林一的信息差",
  ],
};

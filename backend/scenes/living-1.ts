import type { Scene } from "./types";

export const livingOne: Scene = {
  id: "living",
  place: "客厅",
  time: "20:37",
  title: "沙发上的第一次分组",
  image: "living",
  ambience: "客厅暖黄灯下，苏杳、许佳、沈知围在茶几边玩心动匿名信封游戏。桌上有五张空白卡片。",
  presentCharacters: ["苏杳", "许佳", "沈知", "林一"],
  dialogue: [
    { who: "苏杳", line: "规则很简单——每人写一张给某个人的匿名信，最后一起拆。" },
    { who: "许佳", line: "（笑着看林一）敢玩吗？" },
    { who: "沈知", line: "我先说：我写的人今晚可能睡不着。" },
  ],
  question: "轮到你了，写给谁？",
  hint: "你写的人会先被点名",
  choices: [
    { key: "A", label: "写给温宁——虽然她不在这" },
    { key: "B", label: "写给许佳——就在你对面" },
    { key: "C", label: "写给自己——今晚谁都别想读到我的心" },
  ],
  affectableRelationships: [
    "意外度",
    "紧张感",
    "林一 × 苏杳 心动值",
    "林一的信息差",
  ],
};

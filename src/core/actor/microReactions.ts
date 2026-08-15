/**
 * 微反应模板池 + 抽取逻辑
 *
 * 微反应：未发言 NPC 的小动作 / 神情描写。
 * 按人格向量区间 + 情绪标签筛选并加权随机抽取。
 */

import type { PersonalityVector, EmotionTag, PersonalityVectorKey } from "./types";

// ============================================================
// 模板定义
// ============================================================

export interface MicroReactionTemplate {
  id: string;
  category: "gaze" | "gesture" | "expression" | "silence";
  /** 人格向量筛选条件：键名 → [min, max] 区间 */
  personalityFilter: Partial<Record<string, [number, number]>>;
  /** 情绪筛选（为空或不设表示不限制） */
  emotionFilter?: EmotionTag[];
  /** 模板文本，{name} 会被替换为 NPC 名字 */
  text: string;
  /** 权重（越大越容易被选中） */
  weight: number;
}

// ============================================================
// 微反应模板池
// 覆盖 gaze / gesture / expression / silence 四类 × 多种人格区间
// ============================================================

export const MICRO_REACTION_POOL: MicroReactionTemplate[] = [
  // ==================== gaze（眼神） ====================
  {
    id: "gaze_avoid_01",
    category: "gaze",
    personalityFilter: { exposureThreshold: [0.7, 1.0], initiative: [0.0, 0.4] },
    text: "{name}的目光停留一瞬，随即移开",
    weight: 1.0,
  },
  {
    id: "gaze_avoid_02",
    category: "gaze",
    personalityFilter: { exposureThreshold: [0.5, 1.0] },
    emotionFilter: ["curious", "flustered"],
    text: "{name}看了你一眼，又低下头",
    weight: 0.8,
  },
  {
    id: "gaze_jealous_01",
    category: "gaze",
    personalityFilter: { jealousySensitivity: [0.7, 1.0] },
    emotionFilter: ["jealous", "defensive"],
    text: "{name}的视线在你和别人之间来回扫了一下",
    weight: 1.0,
  },
  {
    id: "gaze_active_01",
    category: "gaze",
    personalityFilter: { initiative: [0.6, 1.0] },
    emotionFilter: ["happy", "amused", "curious"],
    text: "{name}远远地朝你这边看过来，笑了一下",
    weight: 0.9,
  },
  {
    id: "gaze_cold_01",
    category: "gaze",
    personalityFilter: { exposureThreshold: [0.6, 1.0], initiative: [0.0, 0.3] },
    emotionFilter: ["cold", "defensive"],
    text: "{name}没有看你，视线落在窗外",
    weight: 0.8,
  },
  {
    id: "gaze_moved_01",
    category: "gaze",
    personalityFilter: { exposureThreshold: [0.0, 0.5], initiative: [0.5, 1.0] },
    emotionFilter: ["moved", "happy"],
    text: "{name}的目光落在你身上，带着一点温度",
    weight: 0.7,
  },

  // ==================== gesture（动作） ====================
  {
    id: "gesture_jealous_01",
    category: "gesture",
    personalityFilter: { jealousySensitivity: [0.7, 1.0] },
    emotionFilter: ["jealous", "defensive"],
    text: "{name}拿起手机，屏幕是黑的，但手指在滑动",
    weight: 1.0,
  },
  {
    id: "gesture_flustered_01",
    category: "gesture",
    personalityFilter: { exposureThreshold: [0.7, 1.0] },
    emotionFilter: ["flustered", "vulnerable"],
    text: "{name}端起杯子喝了一口，其实杯子已经空了",
    weight: 0.8,
  },
  {
    id: "gesture_thinking_01",
    category: "gesture",
    personalityFilter: { humorTendency: [0.6, 1.0] },
    text: "{name}敲了敲桌子，像在想什么",
    weight: 0.7,
  },
  {
    id: "gesture_active_01",
    category: "gesture",
    personalityFilter: { initiative: [0.6, 1.0] },
    emotionFilter: ["happy", "amused"],
    text: "{name}往你这边挪了半步，又装作没事",
    weight: 0.9,
  },
  {
    id: "gesture_retreat_01",
    category: "gesture",
    personalityFilter: { conflictTendency: [0.0, 0.3], exposureThreshold: [0.6, 1.0] },
    emotionFilter: ["cold", "defensive"],
    text: "{name}往后靠了靠，把手抱在胸前",
    weight: 0.8,
  },
  {
    id: "gesture_nervous_01",
    category: "gesture",
    personalityFilter: { jealousySensitivity: [0.6, 1.0], verbosity: [0.5, 1.0] },
    emotionFilter: ["jealous", "flustered"],
    text: "{name}摆弄着手指，动作有些无意识",
    weight: 0.7,
  },

  // ==================== expression（表情） ====================
  {
    id: "expr_amused_01",
    category: "expression",
    personalityFilter: { humorTendency: [0.6, 1.0] },
    emotionFilter: ["amused", "happy"],
    text: "{name}嘴角弯了一下，很快恢复",
    weight: 1.0,
  },
  {
    id: "expr_flustered_01",
    category: "expression",
    personalityFilter: { exposureThreshold: [0.6, 1.0] },
    emotionFilter: ["flustered", "vulnerable"],
    text: "{name}的表情僵了一瞬，随即移开视线",
    weight: 0.9,
  },
  {
    id: "expr_jealous_01",
    category: "expression",
    personalityFilter: { jealousySensitivity: [0.6, 1.0] },
    emotionFilter: ["jealous", "cold"],
    text: "{name}脸上的笑意淡了下去",
    weight: 0.8,
  },
  {
    id: "expr_moved_01",
    category: "expression",
    personalityFilter: { initiative: [0.5, 1.0] },
    emotionFilter: ["moved", "happy"],
    text: "{name}看着你的方向，眼神软了下来",
    weight: 0.9,
  },
  {
    id: "expr_curious_01",
    category: "expression",
    personalityFilter: { initiative: [0.5, 1.0] },
    emotionFilter: ["curious"],
    text: "{name}微微挑眉，似乎来了兴趣",
    weight: 0.7,
  },
  {
    id: "expr_cold_01",
    category: "expression",
    personalityFilter: { exposureThreshold: [0.7, 1.0], conflictTendency: [0.0, 0.3] },
    emotionFilter: ["cold", "defensive"],
    text: "{name}面无表情，看不出什么变化",
    weight: 0.7,
  },

  // ==================== silence（沉默） ====================
  {
    id: "silence_quiet_01",
    category: "silence",
    personalityFilter: { verbosity: [0.0, 0.3], initiative: [0.0, 0.4] },
    text: "{name}什么也没说，低头看着自己的手",
    weight: 1.0,
  },
  {
    id: "silence_cold_01",
    category: "silence",
    personalityFilter: { exposureThreshold: [0.7, 1.0] },
    emotionFilter: ["cold", "defensive"],
    text: "{name}沉默着，没有接话",
    weight: 0.9,
  },
  {
    id: "silence_hesitant_01",
    category: "silence",
    personalityFilter: { conflictTendency: [0.0, 0.3] },
    emotionFilter: ["vulnerable", "moved"],
    text: "{name}安静了一会儿，像是想说什么又咽下去了",
    weight: 0.8,
  },
  {
    id: "silence_jealous_01",
    category: "silence",
    personalityFilter: { jealousySensitivity: [0.7, 1.0] },
    emotionFilter: ["jealous"],
    text: "{name}没说话，但握着杯子的手收紧了",
    weight: 0.9,
  },
  {
    id: "silence_default_01",
    category: "silence",
    personalityFilter: {},
    text: "{name}安静地听着，没有开口",
    weight: 0.5,
  },
];

// ============================================================
// 匹配与抽取
// ============================================================

/** 有效的六维人格键名集合（运行时校验用） */
const VALID_PERSONALITY_KEYS: ReadonlySet<string> = new Set([
  "initiative",
  "jealousySensitivity",
  "exposureThreshold",
  "conflictTendency",
  "humorTendency",
  "verbosity",
]);

/**
 * 检查人格向量是否满足模板的筛选条件
 * personalityFilter 中每个键值对表示一个 [min, max] 区间约束，
 * 全部满足才返回 true。
 */
function matchesPersonality(
  pv: PersonalityVector,
  filter: Partial<Record<string, [number, number]>>,
): boolean {
  for (const [key, range] of Object.entries(filter)) {
    if (range === undefined) continue;
    if (!VALID_PERSONALITY_KEYS.has(key)) continue;
    const value = pv[key as PersonalityVectorKey];
    if (typeof value !== "number") continue;
    if (value < range[0] || value > range[1]) {
      return false;
    }
  }
  return true;
}

/**
 * 按人格向量 + 情绪筛选并加权随机抽取一条微反应
 *
 * @param pv 人格向量
 * @param emotion 当前情绪标签
 * @param npcName NPC 名字（用于替换模板中的 {name}）
 * @returns 微反应文本
 */
export function pickMicroReaction(
  pv: PersonalityVector,
  emotion: EmotionTag,
  npcName: string,
): string {
  const candidates = MICRO_REACTION_POOL.filter((tpl) => {
    // 检查人格区间
    if (!matchesPersonality(pv, tpl.personalityFilter)) return false;
    // 检查情绪标签
    if (tpl.emotionFilter && tpl.emotionFilter.length > 0) {
      if (!tpl.emotionFilter.includes(emotion)) return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    return `${npcName}没有说话，但似乎在听。`;
  }

  // 加权随机抽取
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * totalWeight;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) {
      return c.text.replace(/\{name\}/g, npcName);
    }
  }

  // 浮点精度兜底
  const last = candidates[candidates.length - 1];
  return (last?.text ?? "{name}没有说话。").replace(/\{name\}/g, npcName);
}

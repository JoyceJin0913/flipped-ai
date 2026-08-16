/**
 * 文字人格契约推导
 *
 * 从 NPC 的冰山人格 + MBTI + attachment 推导说话风格约束。
 * 每个 NPC 的 TextContract 体现其独特个性：句长、口头禅、禁忌词、可用语气。
 */

import { getNpcById } from "../npcLibrary";
import type { NPC, AttachmentType } from "../types";
import type { TextContract, EmotionTag } from "./types";

// ============================================================
// 依恋类型 → 静态映射
// ============================================================

/** 依恋类型 → 句长范围 [min, max] */
const ATTACHMENT_LENGTH_RANGE: Record<AttachmentType, [number, number]> = {
  avoidant: [5, 20],
  anxious: [10, 50],
  secure: [10, 40],
};

/** 依恋类型 → 可用语气范围 */
const ATTACHMENT_TONE_RANGE: Record<AttachmentType, EmotionTag[]> = {
  avoidant: ["neutral", "curious", "defensive", "cold", "vulnerable"],
  anxious: ["curious", "happy", "amused", "vulnerable", "jealous", "flustered"],
  secure: ["neutral", "curious", "happy", "amused", "moved", "vulnerable"],
};

/** 依恋类型 → 禁忌词（信息隔离 + 人格红线） */
const ATTACHMENT_FORBIDDEN: Record<AttachmentType, string[]> = {
  avoidant: ["我喜欢你", "我想你", "离不开你", "没有你不行"],
  anxious: ["随便你", "我没事", "不用管我", "无所谓"],
  secure: [],
};

// ============================================================
// 说话风格推导
// ============================================================

/** 从 NPC 的 attachment + mbti 推导说话风格描述 */
function deriveSpeechStyle(npc: NPC): string {
  const { attachment, mbti } = npc;

  if (attachment === "avoidant") {
    switch (mbti) {
      case "INTJ":
      case "ISTJ":
        return "短句、不主动、语尾常停顿、用理性语气";
      case "INFP":
      case "INFJ":
        return "话少、温柔但克制、回答常带停顿";
      case "ISFP":
        return "话少、酷、用动作代替语言";
      default:
        return "短句、不主动、语尾常停顿";
    }
  }

  if (attachment === "anxious") {
    switch (mbti) {
      case "ENTP":
      case "ENTJ":
        return "语速快、爱反问、用幽默掩饰紧张";
      case "ESFJ":
      case "ENFJ":
        return "话多、热情、爱用撒娇语气";
      case "INFP":
      case "INFJ":
        return "细腻、爱铺垫、说话绕弯子";
      default:
        return "语速快、爱反问、用幽默掩饰紧张";
    }
  }

  // secure
  switch (mbti) {
    case "ISFJ":
      return "温和、照顾人语气、不直接表白";
    case "ESFP":
      return "直来直去、活泼、爱用感叹号";
    case "ENTJ":
    case "ESTJ":
      return "果断、有条理、说话直接";
    case "ENFJ":
      return "热情、善解人意、爱铺垫";
    case "ENFP":
      return "跳脱、爱用反问、语气变化大";
    case "ESFJ":
      return "温柔、周到、爱关心人";
    default:
      return "温和、自然、不刻意";
  }
}

// ============================================================
// 口头禅推导
// ============================================================

/** 从 NPC 的 attachment + mbti + 冰山表层特质推导口头禅 */
function deriveCatchphrases(npc: NPC): string[] {
  const phrases: string[] = [];
  const { attachment, mbti, personality } = npc;

  // 依恋类型基础口头禅
  if (attachment === "avoidant") {
    phrases.push("……");
  }

  // MBTI 口头禅
  switch (mbti) {
    case "ENTP":
    case "ENFP":
      phrases.push("不是吗？");
      break;
    case "INTJ":
    case "ISTJ":
      phrases.push("不一定。");
      break;
    case "ESFJ":
    case "ENFJ":
      phrases.push("真的吗？");
      break;
    case "ESFP":
    case "ESTP":
      phrases.push("走！");
      break;
    case "ISFJ":
      phrases.push("没关系。");
      break;
    case "ESTJ":
    case "ENTJ":
      phrases.push("听我的。");
      break;
  }

  // 基于冰山表层特质补充
  for (const s of personality.surface) {
    if (s.includes("温柔") || s.includes("体贴")) {
      if (!phrases.includes("没关系。")) phrases.push("没关系。");
    }
    if (s.includes("有趣") || s.includes("幽默")) {
      phrases.push("有意思。");
    }
    if (s.includes("直来") || s.includes("直接")) {
      phrases.push("就这样。");
    }
  }

  if (phrases.length === 0) {
    phrases.push("嗯。");
  }

  // 最多保留 3 条
  return phrases.slice(0, 3);
}

// ============================================================
// 公开接口
// ============================================================

/**
 * 从 NPC 的冰山人格 + MBTI + attachment 推导文字契约
 */
export function deriveTextContract(npc: NPC): TextContract {
  const lengthRange = ATTACHMENT_LENGTH_RANGE[npc.attachment];
  const toneRange = ATTACHMENT_TONE_RANGE[npc.attachment];
  const forbidden = ATTACHMENT_FORBIDDEN[npc.attachment];

  return {
    npcId: npc.id,
    speechStyle: deriveSpeechStyle(npc),
    catchphrases: deriveCatchphrases(npc),
    forbiddenPhrases: [...forbidden],
    toneRange: [...toneRange],
    sentenceLengthRange: [lengthRange[0], lengthRange[1]] as [number, number],
  };
}

/**
 * 批量推导文字契约
 *
 * @param npcIds NPC ID 列表
 * @returns npcId → TextContract 映射
 */
export function deriveAllTextContracts(npcIds: string[]): Record<string, TextContract> {
  const result: Record<string, TextContract> = {};
  for (const id of npcIds) {
    const npc = getNpcById(id);
    if (npc) {
      result[id] = deriveTextContract(npc);
    }
  }
  return result;
}

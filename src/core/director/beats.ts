/**
 * Beat 蓝图库 + 张力调节
 *
 * 职责：按 Day + Act 生成场景蓝图，管理张力曲线，判定场景收场。
 *
 * 七日情感弧线：
 * - Day 1-2: 破冰期（张力 20-40，3-4 轮对话）
 * - Day 3-4: 升温期（张力 40-70，4-5 轮）
 * - Day 5-6: 冲突期（张力 60-90，5-6 轮）
 * - Day 7:   收束期（张力 30-50，3-4 轮）
 */

import type {
  Beat,
  BeatType,
  SceneBlueprint,
  TensionState,
} from "./types";

// ============================================================
// 七日情感弧线配置
// ============================================================

interface DayArcConfig {
  /** 阶段名称 */
  phase: string;
  /** 场景标题 */
  title: string;
  /** 日间场景地点 */
  daytimeLocation: string;
  /** 私聊场景地点 */
  privateChatLocation: string;
  /** 氛围描述 */
  atmosphere: string;
  /** 基础张力（0-100） */
  tensionBase: number;
  /** 对话节拍数 */
  dialogueBeats: number;
  /** 话题列表 */
  topics: string[];
}

/** 默认弧线（Day 越界时的回退配置） */
const DEFAULT_DAY_ARC: DayArcConfig = {
  phase: "破冰期",
  title: "初见",
  daytimeLocation: "心动小屋客厅",
  privateChatLocation: "阳台",
  atmosphere: "轻松好奇",
  tensionBase: 25,
  dialogueBeats: 3,
  topics: ["自我介绍", "旅途趣事", "房子探索"],
};

/** 七日弧线配置表 */
const DAY_ARCS: Record<number, DayArcConfig> = {
  1: {
    phase: "破冰期",
    title: "初见",
    daytimeLocation: "心动小屋客厅",
    privateChatLocation: "阳台",
    atmosphere: "轻松好奇",
    tensionBase: 25,
    dialogueBeats: 3,
    topics: ["自我介绍", "旅途趣事", "房子探索"],
  },
  2: {
    phase: "破冰期",
    title: "试探",
    daytimeLocation: "海滩",
    privateChatLocation: "花园长椅",
    atmosphere: "阳光放松",
    tensionBase: 35,
    dialogueBeats: 3,
    topics: ["兴趣爱好", "工作日常", "理想型画像"],
  },
  3: {
    phase: "升温期",
    title: "暧昧",
    daytimeLocation: "厨房",
    privateChatLocation: "星空露台",
    atmosphere: "温馨私密",
    tensionBase: 50,
    dialogueBeats: 4,
    topics: ["童年回忆", "心动瞬间", "小秘密交换", "价值观碰撞"],
  },
  4: {
    phase: "升温期",
    title: "靠近",
    daytimeLocation: "花园",
    privateChatLocation: "壁炉旁",
    atmosphere: "浪漫心动",
    tensionBase: 60,
    dialogueBeats: 4,
    topics: ["感情观坦白", "未来规划", "深度对话", "家庭故事"],
  },
  5: {
    phase: "冲突期",
    title: "暗涌",
    daytimeLocation: "客厅",
    privateChatLocation: "厨房深夜",
    atmosphere: "紧张嫉妒",
    tensionBase: 75,
    dialogueBeats: 5,
    topics: ["误会浮现", "吃醋信号", "选择困境", "暗流涌动", "情感纠葛"],
  },
  6: {
    phase: "冲突期",
    title: "对峙",
    daytimeLocation: "露台",
    privateChatLocation: "深夜对话",
    atmosphere: "凝重爆发",
    tensionBase: 85,
    dialogueBeats: 5,
    topics: ["真相揭露", "正面摊牌", "情感宣泄", "关系考验", "转折点"],
  },
  7: {
    phase: "收束期",
    title: "抉择",
    daytimeLocation: "心动小屋",
    privateChatLocation: "终选之地",
    atmosphere: "庄重温柔",
    tensionBase: 40,
    dialogueBeats: 4,
    topics: ["告白时刻", "最终决定", "告别与祝福", "心意传达"],
  },
};

// ============================================================
// Beat 构造工具
// ============================================================

/** createBeat 的可选参数 */
interface BeatOptions {
  topic?: string;
  minSpeakers?: number;
  maxSpeakers?: number;
  mustInclude?: string[];
  playerChoiceRequired?: boolean;
}

/**
 * 构造单个 Beat
 *
 * 注意：exactOptionalPropertyTypes 模式下，可选属性不可赋 undefined，
 * 因此 topic / mustInclude 仅在提供时才挂载到对象上。
 */
function createBeat(
  sceneId: string,
  index: number,
  type: BeatType,
  npcIds: string[],
  tensionTarget: number,
  options?: BeatOptions
): Beat {
  const opts = options ?? {};
  const beat: Beat = {
    id: `${sceneId}-beat-${index}`,
    type,
    speakerCandidates: [...npcIds],
    tensionTarget,
    minSpeakers: opts.minSpeakers ?? 1,
    maxSpeakers: opts.maxSpeakers ?? 3,
    playerChoiceRequired: opts.playerChoiceRequired ?? false,
  };
  if (opts.topic !== undefined) {
    beat.topic = opts.topic;
  }
  if (opts.mustInclude !== undefined) {
    beat.mustInclude = opts.mustInclude;
  }
  return beat;
}

// ============================================================
// 蓝图生成
// ============================================================

/**
 * 按 Day + Act 生成场景蓝图
 *
 * 节拍序列：opening → trigger → N×dialogue → player_choice → resolution
 *
 * 张力计算：以当日基础张力为基准，混入当前张力状态（30%），
 * 私聊场景额外 +10 张力（更私密、风险更高）。
 *
 * @param day      天数 1-7
 * @param act      幕（daytime 日间 / private_chat 私聊）
 * @param tension  当前张力状态（用于自适应调节）
 * @param npcIds   场景内所有 NPC ID 列表
 */
export function generateBlueprint(
  day: number,
  act: "daytime" | "private_chat",
  tension: TensionState,
  npcIds: string[]
): SceneBlueprint {
  const config = DAY_ARCS[day] ?? DEFAULT_DAY_ARC;
  const isPrivate = act === "private_chat";

  // 基础张力 = 日弧线张力×70% + 当前张力×30% + 私聊加成
  const tensionBase = Math.round(
    config.tensionBase * 0.7 + tension.current * 0.3 + (isPrivate ? 10 : 0)
  );

  const location = isPrivate
    ? config.privateChatLocation
    : config.daytimeLocation;
  const sceneId = `day${day}-${act}`;
  const title = `Day ${day} · ${config.title}${isPrivate ? " · 私聊" : ""}`;

  const beats: Beat[] = [];
  let idx = 0;

  // 1. 开场旁白（无人发言）
  beats.push(
    createBeat(sceneId, idx++, "opening", npcIds, tensionBase, {
      minSpeakers: 0,
      maxSpeakers: 0,
    })
  );

  // 2. 触发发言（1-2 位 NPC 主动开口）
  const triggerTopic = config.topics[0];
  beats.push(
    createBeat(sceneId, idx++, "trigger", npcIds, tensionBase + 5, {
      ...(triggerTopic !== undefined ? { topic: triggerTopic } : {}),
      minSpeakers: 1,
      maxSpeakers: 2,
    })
  );

  // 3. 对话节拍（根据日弧线配置决定轮数，张力逐轮缓升）
  for (let i = 0; i < config.dialogueBeats; i++) {
    const topic = config.topics[i % config.topics.length];
    const tensionTarget = tensionBase + Math.round(i * 3);
    beats.push(
      createBeat(sceneId, idx++, "dialogue", npcIds, tensionTarget, {
        ...(topic !== undefined ? { topic } : {}),
        minSpeakers: 1,
        maxSpeakers: 3,
      })
    );
  }

  // 4. 玩家决策（需要玩家做出选择）
  beats.push(
    createBeat(sceneId, idx++, "player_choice", npcIds, tensionBase + 10, {
      minSpeakers: 0,
      maxSpeakers: 0,
      playerChoiceRequired: true,
    })
  );

  // 5. 收场旁白（张力回落）
  beats.push(
    createBeat(
      sceneId,
      idx++,
      "resolution",
      npcIds,
      Math.max(10, tensionBase - 15),
      {
        minSpeakers: 1,
        maxSpeakers: 2,
      }
    )
  );

  return {
    day,
    act,
    sceneId,
    title,
    location,
    atmosphere: config.atmosphere,
    beats,
    fallbackScriptId: `fallback-day${day}-${act}`,
  };
}

// ============================================================
// v1.1 蓝图生成（合并 BeatV1Ext 扩展字段）
// ============================================================

import type { BeatV1Ext } from "./beatTypes";
import { getBeatRecipe } from "../../data/beatRecipes";

/**
 * v1.1 增强蓝图生成
 *
 * 在 generateBlueprint() 基础上，对每个 beat 调 getBeatRecipe(beat.id)
 * 合并 v1.1 扩展字段（narrativeInvariant / trigger / outcomes / factKey / playerRole）。
 *
 * 无配方的 beat 走 v1.0 行为（扩展字段为空对象）。
 */
export function generateBlueprintV11(
  day: number,
  act: "daytime" | "private_chat",
  tension: TensionState,
  npcIds: string[]
): SceneBlueprint {
  const blueprint = generateBlueprint(day, act, tension, npcIds);

  // 合并 v1.1 扩展
  const beatsV11 = blueprint.beats.map((beat) => {
    const recipe = getBeatRecipe(beat.id);
    return { ...beat, ...recipe } as typeof beat;
  });

  return { ...blueprint, beats: beatsV11 };
}

/**
 * 张力调节
 *
 * 根据节拍类型、天数、玩家立场调节张力状态。
 *
 * 调节规则：
 * - opening: 稳定，不变
 * - trigger: 上升（+10×dayMul）
 * - dialogue: 缓慢上升（+5×dayMul）
 * - micro_reaction: 稳定，不变
 * - player_choice: 根据玩家立场升降
 *   - aggressive/advance: 上升（+12×dayMul）
 *   - soothe/retreat: 下降（-8×dayMul）
 *   - 其他: 稳定
 * - resolution: 下降（-12×dayMul）
 * - ending: 大幅下降（-20×dayMul）
 *
 * 天数乘数：Day 1-2 ×0.8（破冰期变化缓），Day 3-4 ×1.0，
 *           Day 5-6 ×1.2（冲突期变化剧烈），Day 7 ×0.9（收束期趋缓）
 *
 * @param current        当前张力状态
 * @param beatType       节拍类型
 * @param day            天数
 * @param playerStance   玩家立场（可选，仅 player_choice 节拍生效）
 */
export function adjustTension(
  current: TensionState,
  beatType: BeatType,
  day: number,
  playerStance?: string
): TensionState {
  const dayMultiplier =
    day <= 2 ? 0.8 : day <= 4 ? 1.0 : day <= 6 ? 1.2 : 0.9;

  let delta = 0;
  let trend: TensionState["trend"] = "stable";

  switch (beatType) {
    case "opening":
      delta = 0;
      trend = "stable";
      break;
    case "trigger":
      delta = Math.round(10 * dayMultiplier);
      trend = "rising";
      break;
    case "dialogue":
      delta = Math.round(5 * dayMultiplier);
      trend = "rising";
      break;
    case "micro_reaction":
      delta = 0;
      trend = "stable";
      break;
    case "player_choice":
      if (playerStance === "aggressive" || playerStance === "advance") {
        delta = Math.round(12 * dayMultiplier);
        trend = "rising";
      } else if (playerStance === "soothe" || playerStance === "retreat") {
        delta = -Math.round(8 * dayMultiplier);
        trend = "falling";
      } else {
        delta = 0;
        trend = "stable";
      }
      break;
    case "resolution":
      delta = -Math.round(12 * dayMultiplier);
      trend = "falling";
      break;
    case "ending":
      delta = -Math.round(20 * dayMultiplier);
      trend = "falling";
      break;
  }

  // 张力钳制在 0-100
  const next = Math.max(0, Math.min(100, current.current + delta));

  return {
    current: next,
    trend,
    lastDelta: next - current.current,
  };
}

// ============================================================
// 收场判定
// ============================================================

/**
 * 收场判定
 *
 * 判定场景是否可以进入收场状态。需同时满足：
 * 1. 已进行到最后一个节拍（beatIndex >= totalBeats - 1）
 * 2. 张力已下降（trend=falling）或处于低位（current < 40）
 * 3. 所有 mustInclude 的 NPC 已发言
 * 4. 至少有 2 位 NPC 发言（保证场景充分展开）
 *
 * @param beatIndex    当前节拍索引
 * @param totalBeats   总节拍数
 * @param tension      当前张力状态
 * @param allSpeakers  已发言 NPC 集合
 * @param mustInclude  必须包含的 NPC 列表（可选）
 */
export function checkResolution(
  beatIndex: number,
  totalBeats: number,
  tension: TensionState,
  allSpeakers: Set<string>,
  mustInclude?: string[]
): boolean {
  // 条件1: 必须已到最后一个节拍
  if (beatIndex < totalBeats - 1) {
    return false;
  }

  // 条件2: 张力必须处于下降趋势或低位
  const tensionLow = tension.current < 40;
  const tensionFalling = tension.trend === "falling";
  if (!tensionLow && !tensionFalling) {
    return false;
  }

  // 条件3: 所有必须包含的 NPC 必须已发言
  if (mustInclude !== undefined) {
    for (const id of mustInclude) {
      if (!allSpeakers.has(id)) {
        return false;
      }
    }
  }

  // 条件4: 至少有 2 位发言者
  if (allSpeakers.size < 2) {
    return false;
  }

  return true;
}

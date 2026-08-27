import { getDay } from "@/data/events";
import { createNpcStateCard, type MemoryNote, type NpcStateCard } from "../npcState";
import { getAllNpcOutputContexts } from "../outputContext";
import { deriveRelationshipRoles } from "../relationshipEngine";
import { createEmptyFacts, writeFacts } from "../worldFacts";
import { buildOptions, highestNpc, runEngineHook, type EngineContext } from "../turnRunner";

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`断言失败：${label}`);
}

function context(cards: Record<string, NpcStateCard>, facts = createEmptyFacts()): EngineContext {
  const state = { npcStateCards: cards, worldFacts: facts, day: 1 };
  const asMap = (purpose: "event_cast" | "event_choices") =>
    Object.fromEntries(getAllNpcOutputContexts(state, purpose).map((item) => [item.npcId, item]));
  return {
    npcIds: Object.keys(cards),
    relationships: Object.fromEntries(
      Object.keys(cards).map((npcId) => [npcId, { toNpc: 30, fromNpc: 30 }]),
    ),
    worldFacts: facts,
    resources: { exemption: 0, trust_points: 0, declaration: 0, solo_chance: 0 },
    day: 1,
    eventIndex: 2,
    eventLog: [],
    outputContexts: { eventCast: asMap("event_cast"), eventChoices: asMap("event_choices") },
    random: () => 0,
  };
}

const guyan = createNpcStateCard("guyan");
const xiaohai = createNpcStateCard("xiaohai");
guyan.interest = { playerToNpc: 65, npcToPlayer: 35 };
xiaohai.interest = { playerToNpc: 55, npcToPlayer: 80 };
xiaohai.trust = 80;
xiaohai.interactionCount = 5;
assert(
  highestNpc(context({ guyan, xiaohai })) === "xiaohai",
  "事件人物排名应读取双向 interest/trust/intimacy",
);

xiaohai.tension = 100;
xiaohai.trust = 0;
xiaohai.interactionCount = 0;
assert(highestNpc(context({ guyan, xiaohai })) === "guyan", "更改状态卡应改变事件人物排序");

guyan.trust = 70;
guyan.interest = { playerToNpc: 68, npcToPlayer: 62 };
const roleCtx = context({ guyan, xiaohai });
const roles = deriveRelationshipRoles(roleCtx.npcIds, roleCtx.outputContexts?.eventCast ?? {});
assert(roles.primary?.npcId === "guyan", "primary 应由统一上下文确定");
assert(roles.mutual?.npcId === "guyan", "mutual 需要双向 interest 达标");
assert(roles.trusted?.npcId === "guyan", "trusted 需要 trust 达标");
assert(
  roles.inviters.some((role) => role.npcId === "guyan"),
  "合格 NPC 应进入 inviter 候选",
);

const luze = createNpcStateCard("luze");
const anran = createNpcStateCard("anran");
const inviteCtx = context({ guyan, xiaohai, luze, anran });
inviteCtx.day = 4;
inviteCtx.relationships = {
  guyan: { toNpc: 30, fromNpc: 30 },
  xiaohai: { toNpc: 30, fromNpc: 30 },
  luze: { toNpc: 30, fromNpc: 90 },
  anran: { toNpc: 30, fromNpc: 80 },
};
const inviteResult = runEngineHook("d4_generate_invites", inviteCtx);
const pairFact = inviteResult.factWrites.find((fact) => fact.key === "day4_date_pairs");
const inviteCountFact = inviteResult.factWrites.find((fact) => fact.key === "day4_invite_count");
const invitePairs = JSON.parse(pairFact?.value ?? "[]") as Array<[string, string]>;
assert(invitePairs.length <= 2, "Day4 统一读取路径也必须把全屋约会名额限制为 2");
assert(Number(inviteCountFact?.value ?? "0") <= 2, "Day4 玩家邀请人数不得超过 2");

const facts = writeFacts(
  createEmptyFacts(),
  [{ key: "day1_first_speaker", value: "guyan" }],
  1,
  "smoke",
);
guyan.tension = 60;
const event = getDay(1)?.events[2];
if (!event || event.kind !== "decision") throw new Error("Day1 样板事件不存在");
let options = buildOptions(event, context({ guyan, xiaohai }, facts));
assert(
  options.options.some((item) => item.option.id === "a_guarded_reply"),
  "高 tension 且无记忆时应使用 fallback",
);

const supportMemory: MemoryNote = {
  id: "support-memory",
  day: 1,
  source: "public_event",
  tag: "support",
  text: "玩家曾在桌边支持我",
  visibility: "public",
  createdAt: 1,
};
guyan.memories = [supportMemory];
options = buildOptions(event, context({ guyan, xiaohai }, facts));
assert(
  options.options.some((item) => item.option.id === "a_continue"),
  "support 记忆应重新开启样板选项",
);

console.log("event output context smoke: ALL PASS");

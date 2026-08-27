import { parseInteractionSignal, type InteractionSignal } from "../interactionSignal";
import {
  appendMemory,
  applySignalToNpcState,
  createNpcStateCard,
  deriveIntimacy,
  type MemoryNote,
} from "../npcState";

let assertions = 0;
function assert(condition: boolean, label: string): void {
  assertions++;
  if (!condition) throw new Error(`断言失败：${label}`);
}

const publicSignal: InteractionSignal = {
  id: "event:1:seat:a:guyan",
  source: "public_event",
  day: 1,
  targetNpcId: "guyan",
  intent: "sit_together",
  valence: "positive",
  strength: 2,
  visibility: "public",
  relationshipDelta: { playerInterest: 80, npcInterest: -80, trust: 3 },
  memory: { tag: "support", text: "玩家在公共场合支持了我", visibility: "public" },
  provenance: { eventId: "seat", optionId: "a" },
};

const parsed = parseInteractionSignal(publicSignal, ["guyan"]);
assert(parsed.success, "合法公共事件信号应通过");
assert(!parseInteractionSignal(publicSignal, ["xiaohai"]).success, "未知 NPC 应拒绝");
assert(!parseInteractionSignal({ ...publicSignal, day: 8 }, ["guyan"]).success, "day 越界应拒绝");
assert(
  !parseInteractionSignal(
    {
      ...publicSignal,
      source: "private_chat",
      visibility: "private",
      provenance: { chatSessionId: "chat-1" },
    },
    ["guyan"],
  ).success,
  "私聊不得携带 relationshipDelta",
);
assert(
  !parseInteractionSignal(
    {
      ...publicSignal,
      source: "private_chat",
      visibility: "private",
      relationshipDelta: undefined,
      memory: { tag: "chat", text: "只属于当前 NPC", visibility: "public" },
      provenance: { chatSessionId: "chat-1" },
    },
    ["guyan"],
  ).success,
  "私聊记忆不得标记为 public",
);

const initial = createNpcStateCard("guyan");
const next = applySignalToNpcState(initial, publicSignal, 100);
assert(next.interest.playerToNpc === 100, "playerInterest 应上钳位");
assert(next.interest.npcToPlayer === 0, "npcInterest 应下钳位");
assert(next.trust === 33 && next.interactionCount === 1, "trust 和互动次数应更新");
assert(deriveIntimacy(next) === 10, "intimacy 应由互动次数派生");
assert(
  next.memories.length === 1 && next.memories[0]?.text.includes("支持") === true,
  "记忆应写入",
);

let memories: MemoryNote[] = [];
for (let index = 0; index < 6; index++) {
  memories = appendMemory(memories, {
    id: `m${index}`,
    day: 1,
    source: "private_chat",
    tag: "chat",
    text: `memory ${index}`,
    visibility: "private",
    createdAt: index,
  });
}
assert(memories.length === 5 && memories[0]?.id === "m1", "只保留最近 5 条记忆");
const deduped = appendMemory(memories, { ...memories[4]!, id: "another-id" });
assert(deduped.length === 5, "同日/来源/标签/文本应去重");

console.log(`InteractionSignal 冒烟测试通过 ✓（${assertions} 条断言）`);

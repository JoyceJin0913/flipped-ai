import type { Scene, WorldState, ChoiceKey, ChoiceResult, Effect } from "../scenes/types";
import { allowedRelationshipNames } from "../scenes/_relationship-whitelist";
import { buildChoicePrompt } from "./prompts/choice-judge";
import { chatJson } from "./llm";

type Sanitized =
  | { ok: true; value: ChoiceResult }
  | { ok: false; error: string };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function sanitizeChoiceOutput(raw: unknown): Sanitized {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "output not object" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.resultText !== "string") return { ok: false, error: "resultText not string" };
  const resultText = obj.resultText.trim();
  if (resultText.length < 10) return { ok: false, error: "resultText too short" };
  if (resultText.length > 500) return { ok: false, error: "resultText too long" };

  if (!Array.isArray(obj.effects)) return { ok: false, error: "effects not array" };

  const effects: Effect[] = [];
  for (const e of obj.effects) {
    if (typeof e !== "object" || e === null) continue;
    const eo = e as Record<string, unknown>;
    if (typeof eo.name !== "string") continue;
    if (typeof eo.delta !== "number" || Number.isNaN(eo.delta)) continue;
    if (!allowedRelationshipNames.has(eo.name)) continue;
    effects.push({ name: eo.name, delta: clamp(Math.round(eo.delta), -10, 10) });
  }
  if (effects.length === 0) return { ok: false, error: "no valid effects" };
  const truncated = effects.slice(0, 5);
  return { ok: true, value: { resultText, effects: truncated } };
}

export async function judgeChoice(
  scene: Scene,
  choiceKey: ChoiceKey,
  worldState: WorldState,
): Promise<
  | { ok: true; result: ChoiceResult; usage: { totalTokens: number; promptTokens: number; completionTokens: number } }
  | { ok: false; error: string; hint?: string }
> {
  const { system, user } = buildChoicePrompt(scene, choiceKey, worldState);
  const llmResult = await chatJson([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  if (!llmResult.ok) return { ok: false, error: llmResult.error, hint: "hint" in llmResult ? llmResult.hint : undefined };

  let parsed: unknown;
  try {
    parsed = JSON.parse(llmResult.content);
  } catch {
    return { ok: false, error: "LLM output not valid JSON", hint: llmResult.content.slice(0, 100) };
  }
  const sanitized = sanitizeChoiceOutput(parsed);
  if (!sanitized.ok) {
    return { ok: false, error: `LLM output invalid: ${sanitized.error}` };
  }
  return {
    ok: true,
    result: sanitized.value,
    usage: {
      totalTokens: llmResult.totalTokens,
      promptTokens: llmResult.promptTokens,
      completionTokens: llmResult.completionTokens,
    },
  };
}

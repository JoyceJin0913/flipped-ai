import { z } from "zod";

export const MEMORY_TAGS = [
  "chat",
  "support",
  "promise",
  "date",
  "conflict",
  "rejection",
  "secret",
] as const;

export const memoryTagSchema = z.enum(MEMORY_TAGS);
export const interactionSourceSchema = z.enum(["public_event", "private_chat"]);
export const interactionValenceSchema = z.enum(["positive", "negative", "mixed", "neutral"]);
export const interactionStrengthSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const finiteIntegerDelta = z.number().int().finite().min(-100).max(100);
const nonEmptyId = z.string().trim().min(1).max(160);

export const interactionSignalSchema = z
  .object({
    id: nonEmptyId,
    source: interactionSourceSchema,
    day: z.number().int().min(1).max(7),
    targetNpcId: nonEmptyId,
    intent: z.string().trim().min(1).max(80),
    valence: interactionValenceSchema,
    strength: interactionStrengthSchema,
    visibility: z.enum(["private", "public"]),
    relationshipDelta: z
      .object({
        playerInterest: finiteIntegerDelta.optional(),
        npcInterest: finiteIntegerDelta.optional(),
        trust: finiteIntegerDelta.optional(),
        tension: finiteIntegerDelta.optional(),
      })
      .strict()
      .optional(),
    memory: z
      .object({
        tag: memoryTagSchema,
        text: z.string().trim().min(1).max(200),
        visibility: z.enum(["private", "public"]),
      })
      .strict()
      .optional(),
    provenance: z
      .object({
        eventId: nonEmptyId.optional(),
        optionId: z.string().trim().max(160).optional(),
        chatSessionId: nonEmptyId.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((signal, ctx) => {
    if (signal.source === "public_event") {
      if (!signal.provenance.eventId || signal.provenance.optionId === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "public_event requires eventId and optionId",
          path: ["provenance"],
        });
      }
      if (signal.visibility !== "public") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "public_event visibility must be public",
          path: ["visibility"],
        });
      }
      if (signal.memory && signal.memory.visibility !== "public") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "public_event memory visibility must be public",
          path: ["memory", "visibility"],
        });
      }
    } else {
      if (!signal.provenance.chatSessionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "private_chat requires chatSessionId",
          path: ["provenance"],
        });
      }
      if (signal.relationshipDelta !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "private_chat may not provide relationshipDelta",
          path: ["relationshipDelta"],
        });
      }
      if (signal.visibility !== "private") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "private_chat visibility must be private",
          path: ["visibility"],
        });
      }
      if (signal.memory && signal.memory.visibility !== "private") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "private_chat memory visibility must be private",
          path: ["memory", "visibility"],
        });
      }
    }
  });

export type MemoryTag = z.infer<typeof memoryTagSchema>;
export type InteractionSource = z.infer<typeof interactionSourceSchema>;
export type InteractionValence = z.infer<typeof interactionValenceSchema>;
export type InteractionStrength = z.infer<typeof interactionStrengthSchema>;
export type InteractionSignal = z.infer<typeof interactionSignalSchema>;

export type ParseInteractionSignalResult =
  { success: true; signal: InteractionSignal } | { success: false; error: string };

/** Parse the untrusted boundary and verify that the target belongs to this run. */
export function parseInteractionSignal(
  input: unknown,
  npcIds: readonly string[],
): ParseInteractionSignalResult {
  const parsed = interactionSignalSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  if (!npcIds.includes(parsed.data.targetNpcId)) {
    return { success: false, error: `unknown targetNpcId: ${parsed.data.targetNpcId}` };
  }
  return { success: true, signal: parsed.data };
}

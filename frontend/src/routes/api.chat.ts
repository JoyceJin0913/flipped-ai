import { createFileRoute } from "@tanstack/react-router";
import { callDoubao, cleanText, rateLimit, rejectCrossOrigin } from "@/lib/doubao.server";
import { buildNpcSystemPrompt } from "@/core/npcSystemPrompts";

type ChatBody = {
  member?: { id?: unknown; name?: unknown; where?: unknown; gender?: unknown };
  history?: Array<{ from?: unknown; text?: unknown }>;
  userMessage?: unknown;
  context?: { day?: unknown; playerName?: unknown; heartValue?: unknown };
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rejected = rejectCrossOrigin(request) ?? rateLimit(request);
        if (rejected) return rejected;

        try {
          const body = (await request.json()) as ChatBody;
          const name = cleanText(body.member?.name, 20);
          const npcId = cleanText(body.member?.id, 30);
          const where = cleanText(body.member?.where, 30);
          const playerName = cleanText(body.context?.playerName, 20);
          const userMessage = cleanText(body.userMessage, 240);
          if (!name || !userMessage) {
            return Response.json({ error: "member.name 和 userMessage 必填" }, { status: 400 });
          }

          const history = (Array.isArray(body.history) ? body.history : [])
            .slice(-8)
            .map((item) => ({
              role: item.from === "ta" ? ("assistant" as const) : ("user" as const),
              content: cleanText(item.text, 240),
            }))
            .filter((item) => item.content);

          const result = await callDoubao([
            {
              role: "system",
              content: buildNpcSystemPrompt({
                ...(npcId ? { npcId } : {}),
                name,
                ...(where ? { location: where } : {}),
                ...(typeof body.context?.day === "number"
                  ? { day: Math.max(1, Math.min(7, Math.trunc(body.context.day))) }
                  : {}),
                ...(playerName ? { playerName } : {}),
                ...(typeof body.context?.heartValue === "number"
                  ? { heartValue: body.context.heartValue }
                  : {}),
              }),
            },
            ...history,
            { role: "user", content: userMessage },
          ]);

          return Response.json({ reply: result.content, usage: result.usage });
        } catch (error) {
          const message = error instanceof Error ? error.message : "豆包调用失败";
          return Response.json({ error: message }, { status: 503 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { callDoubao, cleanText, rateLimit, rejectCrossOrigin } from "@/lib/doubao.server";

type ChatBody = {
  member?: { name?: unknown; where?: unknown; gender?: unknown };
  history?: Array<{ from?: unknown; text?: unknown }>;
  userMessage?: unknown;
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
          const where = cleanText(body.member?.where, 30);
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
              content: `你正在扮演恋爱真人秀《心动岛》的嘉宾“${name}”。当前地点：${where || "小屋"}。用自然、克制、带一点暧昧的中文口语回应玩家。保持人物边界，不替玩家做决定，不提及自己是 AI，不输出舞台说明、列表或 Markdown。回复 1 到 3 句，最多 90 个汉字。`,
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

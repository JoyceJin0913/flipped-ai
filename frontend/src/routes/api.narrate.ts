import { createFileRoute } from "@tanstack/react-router";
import { callDoubao, cleanText, rateLimit, rejectCrossOrigin } from "@/lib/doubao.server";

type NarrateBody = {
  day?: unknown;
  eventTitle?: unknown;
  location?: unknown;
  context?: unknown;
  choice?: unknown;
  fallback?: unknown;
};

export const Route = createFileRoute("/api/narrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rejected = rejectCrossOrigin(request) ?? rateLimit(request);
        if (rejected) return rejected;

        try {
          const body = (await request.json()) as NarrateBody;
          const eventTitle = cleanText(body.eventTitle, 80);
          const choice = cleanText(body.choice, 300);
          if (!eventTitle || !choice) {
            return Response.json({ error: "eventTitle 和 choice 必填" }, { status: 400 });
          }

          const result = await callDoubao([
            {
              role: "system",
              content:
                "你是恋爱真人秀《心动岛》的旁白。根据事件背景和玩家选择，写一段克制、具体、有余韵的即时反馈。不得改变规则、数值、人物关系或宣告结局；不输出标题、列表、Markdown。只写 1 到 3 句，最多 110 个汉字。",
            },
            {
              role: "user",
              content: [
                `第 ${Number(body.day) || 1} 天`,
                `事件：${eventTitle}`,
                `地点：${cleanText(body.location, 40) || "小屋"}`,
                `背景：${cleanText(body.context, 500)}`,
                `玩家选择：${choice}`,
                `规则引擎原反馈：${cleanText(body.fallback, 300)}`,
              ].join("\n"),
            },
          ]);

          return Response.json({ resultText: result.content, usage: result.usage });
        } catch (error) {
          const message = error instanceof Error ? error.message : "豆包调用失败";
          return Response.json({ error: message }, { status: 503 });
        }
      },
    },
  },
});

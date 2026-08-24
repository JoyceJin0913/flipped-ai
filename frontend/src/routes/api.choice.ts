import { createFileRoute } from "@tanstack/react-router";
import { callDoubao, cleanText, rateLimit, rejectCrossOrigin } from "@/lib/doubao.server";

type ChoiceBody = {
  sceneId?: unknown;
  choiceKey?: unknown;
  worldState?: {
    relationships?: Record<string, unknown>;
    recentHistory?: Array<{ time?: unknown; place?: unknown; summary?: unknown }>;
  };
};

export const Route = createFileRoute("/api/choice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rejected = rejectCrossOrigin(request) ?? rateLimit(request);
        if (rejected) return rejected;

        try {
          const body = (await request.json()) as ChoiceBody;
          const sceneId = cleanText(body.sceneId, 50);
          const choiceKey = cleanText(body.choiceKey, 1);
          if (!sceneId || !["A", "B", "C"].includes(choiceKey)) {
            return Response.json({ error: "sceneId 和有效的 choiceKey 必填" }, { status: 400 });
          }

          const history = (body.worldState?.recentHistory ?? [])
            .slice(-5)
            .map((item) => cleanText(item.summary, 100))
            .filter(Boolean)
            .join("；");
          const relationshipNames = Object.keys(body.worldState?.relationships ?? {}).slice(0, 10);
          const result = await callDoubao([
            {
              role: "system",
              content:
                "你是恋爱真人秀《心动岛》的旁白。根据场景、选择和最近经历生成即时反馈。不要输出数值、标题、列表或 Markdown，不要替玩家决定后续行动。只写 1 到 3 句，最多 110 个汉字。",
            },
            {
              role: "user",
              content: `场景：${sceneId}\n玩家选择：${choiceKey}\n场内人物：${relationshipNames.join("、")}\n最近经历：${history || "暂无"}`,
            },
          ]);

          return Response.json({ resultText: result.content, effects: [], usage: result.usage });
        } catch (error) {
          const message = error instanceof Error ? error.message : "豆包调用失败";
          return Response.json({ error: message }, { status: 503 });
        }
      },
    },
  },
});

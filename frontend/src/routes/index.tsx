import { createFileRoute } from "@tanstack/react-router";
import { AppRoot } from "@/components/AppRoot";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "小屋 · 心动观察恋综互动" },
      {
        name: "description",
        content: "进入心动小屋，观察成员的每日事件，做出你的核心选择，影响关系走向与明日约会。",
      },
      { property: "og:title", content: "小屋 · 心动观察恋综互动" },
      {
        property: "og:description",
        content: "每天 3~5 个关键事件，1 次核心选择，你的判断决定故事走向。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppRoot,
});

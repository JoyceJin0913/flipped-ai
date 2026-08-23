import { createFileRoute } from "@tanstack/react-router";
import { scenes } from "@/data/house";

export const Route = createFileRoute("/api/scenes/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const scene = scenes.find((item) => item.id === params.id);
        return scene
          ? Response.json(scene)
          : Response.json({ error: "scene not found" }, { status: 404 });
      },
    },
  },
});

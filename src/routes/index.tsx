import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { GameApp } from "@/components/GameApp";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: GameApp,
});

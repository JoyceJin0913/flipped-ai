import { kitchenOne } from "./kitchen-1";
import { livingOne } from "./living-1";
import { balconyOne } from "./balcony-1";
import { kitchenTwo } from "./kitchen-2";
import type { Scene } from "./types";

export type { Scene, SceneChoice, ChoiceKey, WorldState, Effect, ChoiceResult, HistoryEntry } from "./types";

export const scenes: Scene[] = [kitchenOne, livingOne, balconyOne, kitchenTwo];

export function getSceneById(id: string): Scene | undefined {
  return scenes.find((s) => s.id === id);
}

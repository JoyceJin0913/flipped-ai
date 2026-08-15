export type ChoiceKey = "A" | "B" | "C";

export type SceneChoice = {
  key: ChoiceKey;
  label: string;
};

export type SceneDialogueLine = {
  who: string;
  line: string;
};

export type Scene = {
  id: string;
  place: string;
  time: string;
  title: string;
  image: string;
  ambience: string;
  presentCharacters: string[];
  dialogue: SceneDialogueLine[];
  question: string;
  hint: string;
  choices: SceneChoice[];
  affectableRelationships: string[];
};

export type HistoryEntry = {
  time: string;
  place: string;
  summary: string;
};

export type WorldState = {
  relationships: Record<string, number>;
  recentHistory: HistoryEntry[];
};

export type Effect = {
  name: string;
  delta: number;
};

export type ChoiceResult = {
  resultText: string;
  effects: Effect[];
};

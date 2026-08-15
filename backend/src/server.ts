import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

// 优先读 backend/.env；没有则回退到 ../frontend/.env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.resolve(__dirname, "../../frontend/.env.local"),
  override: false,
});

// dotenv 装载之后再 import llm.ts —— 否则模块顶层的环境变量读取会拿到 undefined
const { chat } = await import("./llm.js");
const { wenningSystemPrompt } = await import("./personas/wenning.js");
const { scenes, getSceneById } = await import("../scenes/index.js");
const { judgeChoice } = await import("./choice-judge.js");

const app = express();
app.use(express.json());
// file:// 打开的 HTML 发起请求时，Origin 会是字符串 "null"，cors({ origin: true }) 会回显它
app.use(cors({ origin: true }));

type IncomingMessage = { role: "user" | "assistant"; content: string };

app.post("/api/chat", async (req, res) => {
  const { history, userMessage } = req.body as {
    history?: IncomingMessage[];
    userMessage?: string;
  };

  if (typeof userMessage !== "string" || !userMessage.trim()) {
    return res.status(400).json({ error: "userMessage 不能为空" });
  }

  const messages = [
    { role: "system" as const, content: wenningSystemPrompt },
    ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const result = await chat(messages);
  if (!result.ok) {
    return res.status(500).json({ error: result.error, hint: result.hint });
  }
  res.json({
    reply: result.content,
    usage: {
      totalTokens: result.totalTokens,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    },
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/scenes", (_req, res) => {
  res.json(scenes.map((s) => ({ id: s.id, place: s.place, time: s.time, title: s.title })));
});

app.get("/api/scenes/:id", (req, res) => {
  const scene = getSceneById(req.params.id);
  if (!scene) return res.status(404).json({ error: "scene not found" });
  res.json(scene);
});

app.post("/api/choice", async (req, res) => {
  const { sceneId, choiceKey, worldState } = (req.body ?? {}) as {
    sceneId?: string;
    choiceKey?: string;
    worldState?: { relationships?: Record<string, number>; recentHistory?: unknown[] };
  };
  if (typeof sceneId !== "string") return res.status(400).json({ error: "sceneId required" });
  if (choiceKey !== "A" && choiceKey !== "B" && choiceKey !== "C") {
    return res.status(400).json({ error: "choiceKey must be A/B/C" });
  }
  if (typeof worldState !== "object" || worldState === null) {
    return res.status(400).json({ error: "worldState required" });
  }
  const scene = getSceneById(sceneId);
  if (!scene) return res.status(404).json({ error: "scene not found" });

  const ws = {
    relationships: worldState.relationships ?? {},
    recentHistory: (worldState.recentHistory ?? []) as Array<{ time: string; place: string; summary: string }>,
  };
  const result = await judgeChoice(scene, choiceKey, ws);
  if (!result.ok) return res.status(500).json({ error: result.error, hint: result.hint });
  res.json({
    resultText: result.result.resultText,
    effects: result.result.effects,
    usage: result.usage,
  });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

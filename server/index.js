import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 3001;

// ARK_API_KEY 必须由环境变量提供
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const ARK_MODEL = process.env.ARK_MODEL || "doubao-seed-2-1-pro-260628";
const MAX_TOKENS_DEFAULT = 1024;
const TIMEOUT_MS = 20000;

const app = express();
app.use(express.json({ limit: "1mb" }));

// 生产环境托管前端静态资源
if (process.env.NODE_ENV === "production") {
  const distDir = path.join(ROOT, "dist");
  app.use(express.static(distDir));
  // SPA fallback：非 /api 路径都回 index.html
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// ---- LLM 代理接口 ----
app.post("/api/chat", async (req, res) => {
  if (!ARK_API_KEY) {
    return res.status(500).json({ error: "ARK_API_KEY not configured" });
  }
  const { messages, temperature = 0.85, maxTokens = MAX_TOKENS_DEFAULT } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages required" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(ARK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        messages,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(502).json({ error: "upstream_error", detail: data });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        error: "empty_content",
        finish_reason: data?.choices?.[0]?.finish_reason,
      });
    }

    res.json({
      content,
      finishReason: data?.choices?.[0]?.finish_reason,
      usage: data?.usage,
    });
  } catch (e) {
    clearTimeout(timer);
    res.status(504).json({
      error: "timeout_or_network",
      message: String(e?.message ?? e),
    });
  }
});

// ---- 健康检查 ----
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: !!ARK_API_KEY, model: ARK_MODEL });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on :${PORT} (production=${process.env.NODE_ENV === "production"})`);
});

type DoubaoMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CompletionPayload = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
};

const requests = new Map<string, { count: number; resetAt: number }>();

export function rejectCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin || origin === new URL(request.url).origin) return null;
  return Response.json({ error: "cross-origin request rejected" }, { status: 403 });
}

export function rateLimit(request: Request, limit = 20): Response | null {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const current = requests.get(key);
  if (!current || current.resetAt <= now) {
    requests.set(key, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  if (current.count >= limit) {
    return Response.json({ error: "请求太频繁，请稍后再试" }, { status: 429 });
  }
  current.count += 1;
  return null;
}

export type DoubaoCallOptions = {
  /** 本次调用的输出 token 上限，默认 220（沿用历史值；动态选项链路按需放宽）。 */
  maxTokens?: number;
  /** 采样温度，默认 0.85（沿用历史值）。 */
  temperature?: number;
};

export async function callDoubao(messages: DoubaoMessage[], options: DoubaoCallOptions = {}) {
  const apiKey = process.env["ARK_API_KEY"];
  const model = process.env["ARK_ENDPOINT_ID"] ?? process.env["ARK_MODEL"];
  const baseUrl = process.env["ARK_BASE_URL"] ?? "https://ark.cn-beijing.volces.com/api/v3";
  const { maxTokens = 220, temperature = 0.85 } = options;

  if (!apiKey || !model) {
    throw new Error("豆包尚未配置：缺少 ARK_API_KEY 或 ARK_ENDPOINT_ID");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
    }),
    signal: AbortSignal.timeout(12_000),
  });

  const payload = (await response.json()) as CompletionPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `豆包请求失败（${response.status}）`);
  }

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("豆包返回了空内容");

  return {
    content,
    usage: {
      totalTokens: payload.usage?.total_tokens ?? 0,
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
    },
  };
}

export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

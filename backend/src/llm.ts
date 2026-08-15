import OpenAI from "openai";

const apiKey = process.env.ARK_API_KEY;
const baseURL = process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";
const model = process.env.ARK_ENDPOINT_ID ?? "doubao-seed-2-1-pro-260628";

if (!apiKey) {
  throw new Error("ARK_API_KEY 未设置。请在 backend/.env 或 frontend/.env.local 里配置。");
}

const client = new OpenAI({ apiKey, baseURL });

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResult =
  | {
      ok: true;
      content: string;
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
    }
  | { ok: false; error: string; hint?: string };

export async function chat(
  messages: ChatMessage[],
  options: { temperature?: number } = {},
): Promise<ChatResult> {
  const temperature = options.temperature ?? 0.9;
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      // 关掉深度思考：一次「你好」不再烧掉几千 reasoning token
      // @ts-expect-error - 火山方舟专有参数，不在 OpenAI 类型定义里
      thinking: { type: "disabled" },
    });
    const content = response.choices[0]?.message?.content ?? "";
    const totalTokens = response.usage?.total_tokens ?? 0;
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;
    return { ok: true, content, totalTokens, promptTokens, completionTokens };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    let hint: string | undefined;
    if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
      hint = "API Key 可能失效，检查 ARK_API_KEY";
    } else if (message.includes("model") || message.includes("endpoint")) {
      hint = "模型 ID 可能不对，检查 ARK_ENDPOINT_ID";
    }
    return { ok: false, error: message, hint };
  }
}

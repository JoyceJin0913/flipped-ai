/**
 * LLM 代理客户端 —— 前端统一 fetch 封装
 *
 * 前端不再直接持有 API key，所有 LLM 调用走 /api/chat 代理。
 * dev 环境 Vite proxy 转发到 localhost:3001，生产同源。
 */

export interface ChatProxyRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatProxyResponse {
  content: string;
  finishReason?: string;
  usage?: unknown;
}

/**
 * 调本机 Express 代理
 * @returns ChatProxyResponse 或 null（网络/服务端错误时）
 */
export async function chatViaProxy(
  req: ChatProxyRequest
): Promise<ChatProxyResponse | null> {
  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!resp.ok) {
      console.warn("[llmClient] proxy returned", resp.status);
      return null;
    }

    const data = await resp.json();
    if (!data?.content || typeof data.content !== "string") {
      console.warn("[llmClient] empty content in proxy response");
      return null;
    }

    return {
      content: data.content,
      ...(data.finishReason ? { finishReason: data.finishReason } : {}),
      ...(data.usage ? { usage: data.usage } : {}),
    };
  } catch (e) {
    console.warn("[llmClient] fetch failed:", e);
    return null;
  }
}

/**
 * Serverless chat endpoint for the portfolio assistant.
 *
 * Deployed as a Vercel function. Its only job is to hold the API key and relay
 * one turn of conversation to an OpenAI-compatible provider — the tool
 * *schemas* come from the client, and any tool the model chooses is executed by
 * the client, because every tool here is a UI action.
 *
 * Provider is configurable so the same code runs against OpenAI or Groq:
 *   ASSISTANT_API_KEY   required
 *   ASSISTANT_BASE_URL  default https://api.openai.com/v1
 *   ASSISTANT_MODEL     default gpt-4o-mini
 */

interface IncomingMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: unknown;
  tool_call_id?: string;
}

interface ChatRequest {
  messages: IncomingMessage[];
  system: string;
  tools?: unknown[];
}

const BASE_URL = process.env.ASSISTANT_BASE_URL ?? "https://api.openai.com/v1";
const MODEL = process.env.ASSISTANT_MODEL ?? "gpt-4o-mini";

/** Caps to keep a single visitor from running up the bill. */
const MAX_MESSAGES = 24;
const MAX_CHARS_PER_MESSAGE = 2000;
const MAX_TOKENS = 500;

export const config = { runtime: "edge" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ASSISTANT_API_KEY;
  if (!apiKey) {
    // Deliberately explicit: this is the one failure a deployer needs to fix,
    // and a generic 500 would send them hunting through logs.
    return json({ error: "not_configured" }, 503);
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!Array.isArray(body.messages) || typeof body.system !== "string") {
    return json({ error: "Expected { system, messages }" }, 400);
  }

  // Trim to the most recent turns and clamp each one. The system prompt is
  // rebuilt every request, so dropping old turns costs no grounding.
  const messages = body.messages.slice(-MAX_MESSAGES).map((message) => ({
    ...message,
    content:
      typeof message.content === "string"
        ? message.content.slice(0, MAX_CHARS_PER_MESSAGE)
        : message.content,
  }));

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: body.system }, ...messages],
        ...(body.tools?.length ? { tools: body.tools, tool_choice: "auto" } : {}),
        temperature: 0.3,
        max_tokens: MAX_TOKENS,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      // Surface the status so the client can distinguish "out of quota" from
      // "bad key", but never echo the provider's body — it can contain the
      // organisation id and other account details.
      console.error("assistant upstream error", upstream.status, detail.slice(0, 400));
      return json({ error: "upstream_error", status: upstream.status }, 502);
    }

    const data = (await upstream.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };

    const message = data.choices?.[0]?.message;

    return json({
      content: message?.content ?? "",
      toolCalls:
        message?.tool_calls?.map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: safeParse(call.function.arguments),
        })) ?? [],
    });
  } catch (error) {
    console.error("assistant request failed", error);
    return json({ error: "request_failed" }, 500);
  }
}

/** Models occasionally emit malformed argument JSON; an empty object is safer
 *  than a 500, since the client validates each tool's arguments anyway. */
function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

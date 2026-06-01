import type { ChatRequest, ChatResponse } from "./types";

export class LangGraphUnavailableError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "LangGraphUnavailableError";
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChatResponsePayload(payload: unknown): payload is ChatResponse {
  if (!isRecord(payload)) {
    return false;
  }

  const requiredStrings = ["id", "answer", "generationMode"] as const;
  const requiredObjects = ["retrieval", "risk", "telemetry"] as const;
  const requiredArrays = ["sources", "citations", "trace", "architecture", "suggestedQuestions"] as const;

  return (
    requiredStrings.every((field) => typeof payload[field] === "string") &&
    requiredObjects.every((field) => isRecord(payload[field])) &&
    requiredArrays.every((field) => Array.isArray(payload[field]))
  );
}

function requireRemoteResponse(payload: unknown): ChatResponse {
  if (isRecord(payload) && payload.__error__) {
    throw new Error("LangGraph Agent Server returned an error state.");
  }

  if (!isChatResponsePayload(payload)) {
    throw new Error("LangGraph Agent Server response does not match the web contract.");
  }

  return payload;
}

export async function runRemotePreventionGraph(request: ChatRequest): Promise<ChatResponse> {
  const baseUrl = process.env.LANGGRAPH_API_URL?.replace(/\/$/, "");
  const assistantId = process.env.LANGGRAPH_ASSISTANT_ID || "axa_prevention_coach";
  if (!baseUrl) {
    throw new LangGraphUnavailableError("LANGGRAPH_API_URL is required to call LangGraph Cloud.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authToken = process.env.LANGGRAPH_AUTH_TOKEN;
  const apiKey = process.env.LANGGRAPH_API_KEY || process.env.LANGSMITH_API_KEY;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  } else if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  } else {
    throw new LangGraphUnavailableError("LANGGRAPH_AUTH_TOKEN, LANGGRAPH_API_KEY or LANGSMITH_API_KEY is required to call LangGraph Cloud.");
  }
  const tenantId = process.env.LANGSMITH_TENANT_ID;
  if (tenantId) {
    headers["X-Tenant-Id"] = tenantId;
  }

  const graphInput = {
    ...request,
    chat_history: request.chatHistory,
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/runs/wait`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assistant_id: assistantId,
        input: graphInput,
        metadata: {
          app: "axa-prevention-coach",
          channel: "vercel-bff",
        },
      }),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error.";
    throw new LangGraphUnavailableError(`LangGraph Cloud request failed: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new LangGraphUnavailableError(`LangGraph Cloud returned ${response.status}: ${body.slice(0, 180)}`, response.status);
  }

  return requireRemoteResponse(await response.json());
}

import { NextResponse } from "next/server";
import { runPreventionGraph } from "@/lib/coach/agents";
import { LangGraphUnavailableError } from "@/lib/coach/langgraph";
import type { Audience, ChatHistoryMessage, ChatRequest } from "@/lib/coach/types";

export const runtime = "nodejs";

function isAudience(value: unknown): value is Audience {
  return value === "particulier" || value === "flotte" || value === "mixte";
}

function parseChatHistory(value: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map(
      (entry): ChatHistoryMessage => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: typeof entry.content === "string" ? entry.content.trim().slice(0, 1200) : "",
      }),
    )
    .filter((entry) => entry.content)
    .slice(-8);
}

function parseRequest(payload: unknown): ChatRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must be an object.");
  }

  const record = payload as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : "";
  const scenarioId = typeof record.scenarioId === "string" ? record.scenarioId : undefined;
  const audience = isAudience(record.audience) ? record.audience : undefined;
  const chatHistory = parseChatHistory(record.chatHistory);

  if (!message.trim() && !scenarioId) {
    throw new Error("Request requires a message or scenarioId.");
  }

  return { message, scenarioId, audience, chatHistory };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const graphRequest = parseRequest(payload);
    const response = await runPreventionGraph(graphRequest);

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error.";
    const status = error instanceof LangGraphUnavailableError ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

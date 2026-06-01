import { NextResponse } from "next/server";
import { runPreventionGraph } from "@/lib/coach/agents";
import { LangGraphUnavailableError } from "@/lib/coach/langgraph";
import type { Audience } from "@/lib/coach/types";

export const runtime = "nodejs";

interface BffChatHistoryItem {
  content?: unknown;
  type?: unknown;
}

function isAudience(value: unknown): value is Audience {
  return value === "particulier" || value === "flotte" || value === "mixte";
}

function parseBffRequest(payload: unknown): { message: string; audience?: Audience } {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must be an object.");
  }

  const record = payload as Record<string, unknown>;
  const input = record.input && typeof record.input === "object" ? (record.input as Record<string, unknown>) : {};
  const config = record.config && typeof record.config === "object" ? (record.config as Record<string, unknown>) : {};
  const metadata =
    config.metadata && typeof config.metadata === "object" ? (config.metadata as Record<string, unknown>) : {};
  const rawMessage = typeof input.input === "string" ? input.input : "";
  const rawHistory = Array.isArray(input.chat_history) ? (input.chat_history as BffChatHistoryItem[]) : [];
  const historyText = rawHistory
    .map((item) => (typeof item.content === "string" ? item.content : ""))
    .filter(Boolean)
    .join("\n");
  const message = rawMessage.trim() || historyText.trim();
  const audience = isAudience(metadata.audience) ? metadata.audience : undefined;

  if (!message) {
    throw new Error("Request requires input.input or input.chat_history content.");
  }

  return { message, audience };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const graphRequest = parseBffRequest(payload);
    const response = await runPreventionGraph(graphRequest);

    return NextResponse.json(
      {
        error_code: null,
        is_success: true,
        data: {
          output: response.answer,
          metadata: response.telemetry,
          sources: response.citations.map((citation) => ({
            label: citation.label,
            title: citation.title,
            url: citation.sourceUrl,
            page: citation.page,
          })),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, X-CSRF",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected coach_bot error.";
    const isGraphError = error instanceof LangGraphUnavailableError;
    return NextResponse.json(
      {
        error_code: isGraphError ? "graph_unavailable" : "bad_request",
        is_success: false,
        data: {
          output: message,
          metadata: null,
          sources: [],
        },
      },
      { status: isGraphError ? 503 : 400 },
    );
  }
}

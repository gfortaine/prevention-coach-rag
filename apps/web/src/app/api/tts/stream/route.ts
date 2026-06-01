import { NextRequest, NextResponse } from "next/server";

import {
  assertMistralTtsConfigured,
  MISTRAL_STREAM_CONTENT_TYPE,
  normalizeTtsText,
  splitTextIntoMistralChunks,
  streamMistralAudioChunks,
} from "@/lib/coach/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readText(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { text?: unknown };
    return typeof body.text === "string" ? body.text : "";
  }

  const formData = await request.formData();
  const formText = formData.get("text");

  return typeof formText === "string" ? formText : "";
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error_code: code, message }, { status });
}

export async function POST(request: NextRequest) {
  let chunks: string[];

  try {
    assertMistralTtsConfigured();
    chunks = splitTextIntoMistralChunks(normalizeTtsText(await readText(request)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lecture vocale Mistral indisponible.";
    const status = message.includes("configured") ? 503 : 422;

    return jsonError(status, status === 503 ? "tts_not_configured" : "tts_invalid_input", message);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const audioBytes of streamMistralAudioChunks(chunks, request.signal)) {
          controller.enqueue(audioBytes);
        }
        controller.close();
      } catch (error) {
        console.error("TTS stream route failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": MISTRAL_STREAM_CONTENT_TYPE,
      "X-Accel-Buffering": "no",
    },
  });
}

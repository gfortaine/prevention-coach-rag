import { NextResponse } from "next/server";
import { normalizeTtsText, synthesizeMistralAudio } from "@/lib/coach/tts";

export const runtime = "nodejs";
export const preferredRegion = "cdg1";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const rawText = contentType.includes("application/json")
      ? ((await request.json()) as { text?: unknown }).text
      : (await request.formData()).get("text");
    const text = normalizeTtsText(rawText);
    const audio = await synthesizeMistralAudio(text);

    return new Response(audio.bytes, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": audio.contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected TTS error.";
    const isConfigurationError = message.includes("not configured");
    const isInputError = message.includes("TTS text") || message.includes("Mistral TTS chunk");
    const status = isConfigurationError ? 503 : isInputError ? 422 : 502;
    if (!isInputError) {
      console.error("TTS route failed", { message, status });
    }

    return NextResponse.json(
      {
        error_code: isConfigurationError ? "tts_not_configured" : isInputError ? "tts_invalid_input" : "tts_provider_error",
        is_success: false,
        data: {
          output:
            isConfigurationError
              ? "Mistral TTS provider is not configured."
              : isInputError
                ? "Le texte est trop long pour cet endpoint de lecture vocale."
              : "Mistral TTS provider is temporarily unavailable.",
        },
      },
      { status },
    );
  }
}

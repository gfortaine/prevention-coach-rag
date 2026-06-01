import { NextResponse } from "next/server";
import { generateAxaBffAudio, normalizeTtsText } from "@/lib/coach/tts";

export const runtime = "nodejs";
export const preferredRegion = "cdg1";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const text = normalizeTtsText(formData.get("text"));
    const id = await generateAxaBffAudio(text);

    return NextResponse.json(
      {
        error_code: null,
        is_success: true,
        data: { id },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected TTS generation error.";

    return NextResponse.json(
      {
        error_code: "tts_generation_error",
        is_success: false,
        data: {
          output: message,
        },
      },
      { status: 502 },
    );
  }
}

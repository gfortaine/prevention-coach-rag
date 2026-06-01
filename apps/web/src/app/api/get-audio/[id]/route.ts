import { NextResponse } from "next/server";
import { fetchAxaBffAudio } from "@/lib/coach/tts";

export const runtime = "nodejs";
export const preferredRegion = "cdg1";

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Audio id is required." }, { status: 400 });
    }

    const audio = await fetchAxaBffAudio(id);

    return new Response(audio.bytes, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": audio.contentType.includes("audio") ? audio.contentType : "audio/wav",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected TTS audio fetch error.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

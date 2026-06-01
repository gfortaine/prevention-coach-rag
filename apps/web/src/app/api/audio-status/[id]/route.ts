import { NextResponse } from "next/server";
import { waitForAxaBffAudio } from "@/lib/coach/tts";

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

    await waitForAxaBffAudio(id);

    return new Response("end: ready\n\n", {
      headers: {
        "Cache-Control": "no-cache, no-store",
        "Content-Type": "text/event-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected TTS status error.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

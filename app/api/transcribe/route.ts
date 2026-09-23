import { NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/server/feed";
import { hasTranscriptionProvider, transcribeAudio } from "@/lib/server/transcribe";
import type { SpokenLang } from "@/lib/language";

export const runtime = "nodejs";
// Groq is fast, but a long episode plus the fetch that precedes it can still
// run past the platform's default. Vercel honors this on plans that allow
// it; on ones that don't, it is simply capped lower than requested.
export const maxDuration = 60;

/**
 * Auto-generates a transcript for an episode whose feed publishes none, via
 * Groq's free-tier Whisper endpoint. Explicitly triggered by the person, not
 * loaded automatically like a published transcript - see lib/server/transcribe.ts
 * for why.
 */
export async function POST(request: Request) {
  let audioUrl: string;
  let sourceLang: SpokenLang | undefined;
  try {
    const body = (await request.json()) as { audioUrl?: string; sourceLang?: string };
    audioUrl = (body.audioUrl ?? "").trim();
    sourceLang = body.sourceLang === "de" || body.sourceLang === "en" ? body.sourceLang : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!audioUrl) return NextResponse.json({ error: "audioUrl is required" }, { status: 400 });

  if (!hasTranscriptionProvider()) {
    return NextResponse.json(
      { error: "No transcription provider configured.", reason: "no-key" },
      { status: 503 },
    );
  }

  let parsed: URL;
  try {
    parsed = assertPublicUrl(audioUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 },
    );
  }

  const result = await transcribeAudio(parsed, sourceLang);
  if (!result.ok) {
    const status = result.reason === "too-large" ? 413 : 502;
    return NextResponse.json({ error: result.reason, reason: result.reason }, { status });
  }

  const segments = result.segments.map((seg, index) => ({
    id: `gen-${index}`,
    start: seg.start,
    end: seg.end,
    text: seg.text,
    isFinal: true,
  }));

  return NextResponse.json({ segments });
}

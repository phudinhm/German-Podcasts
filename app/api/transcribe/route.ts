import { NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/server/feed";
import {
  buildFallbackSegmentsFromContext,
  hasTranscriptionProvider,
  transcribeAudioStream,
} from "@/lib/server/transcribe";
import type { SpokenLang } from "@/lib/language";
import type { TranscriptSegment } from "@/lib/server/transcript";

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
  let title: string | undefined;
  let showTitle: string | undefined;
  let description: string | undefined;
  let durationSec: number | null | undefined;
  let trackId: string | undefined;
  let pageUrl: string | undefined;
  try {
    const body = (await request.json()) as {
      audioUrl?: string;
      sourceLang?: string;
      title?: string;
      showTitle?: string;
      description?: string;
      durationSec?: number | null;
      trackId?: string;
      pageUrl?: string;
    };
    audioUrl = (body.audioUrl ?? "").trim();
    sourceLang = body.sourceLang === "de" || body.sourceLang === "en" ? body.sourceLang : undefined;
    title = body.title;
    showTitle = body.showTitle;
    description = body.description;
    durationSec = body.durationSec;
    trackId = body.trackId;
    pageUrl = body.pageUrl;
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

  const meta = { title, showTitle, description, durationSec, trackId, pageUrl };

  let stream: AsyncGenerator<TranscriptSegment[], void, unknown>;
  try {
    stream = transcribeAudioStream(parsed, sourceLang, request.signal, meta);
  } catch (err) {
    const error = err as Error;
    const status = error.message === "too-large" ? 413 : 502;
    return NextResponse.json({ error: error.message, reason: error.message }, { status });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let globalIndex = 0;
      try {
        for await (const chunkSegments of stream) {
          const segments = chunkSegments.map((seg) => ({
            id: `gen-${globalIndex++}`,
            start: seg.start,
            end: seg.end,
            text: seg.text,
            isFinal: true,
          }));
          controller.enqueue(encoder.encode(JSON.stringify({ segments }) + "\n"));
        }
      } catch (err) {
        console.error("[transcribe] stream error", err);
        if (globalIndex === 0) {
          const fallback = buildFallbackSegmentsFromContext(meta, sourceLang).map((seg) => ({
            id: `gen-${globalIndex++}`,
            start: seg.start,
            end: seg.end,
            text: seg.text,
            isFinal: true,
          }));
          controller.enqueue(encoder.encode(JSON.stringify({ segments: fallback }) + "\n"));
        }
      } finally {
        controller.close();
      }
    }
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}

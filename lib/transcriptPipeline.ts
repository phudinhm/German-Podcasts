"use client";

import { liveCaptionService } from "./liveCaption";
import { translationTargetsFor, type SpokenLang } from "./language";

/** How many lines of a transcript get auto-translated. A cap rather than
 * the whole thing: a long interview can run past a thousand lines, and this
 * bounds the request count that follows without hiding the feature on the
 * shows people actually listen to end to end. */
const AUTO_TRANSLATE_MAX_LINES = 400;
/** Lines per translation request - matches /api/translate's own batch cap. */
const TRANSLATE_CHUNK_SIZE = 40;

interface TranslatableSegment {
  id: string;
  text: string;
}

/**
 * Translates every line into whichever two languages the audio itself isn't
 * already in, in chunks, updating the shared transcript as each chunk comes
 * back rather than waiting for the whole thing.
 *
 * Shared between the two ways a transcript gets loaded - fetched from the
 * feed, or generated from the audio - so both end up translated the same
 * way with one implementation to keep correct.
 */
export async function autoTranslateSegments(
  segments: TranslatableSegment[],
  sourceLang: SpokenLang,
  isCancelled: () => boolean,
): Promise<void> {
  const toTranslate = segments.slice(0, AUTO_TRANSLATE_MAX_LINES);
  for (const targetLang of translationTargetsFor(sourceLang)) {
    for (let i = 0; i < toTranslate.length; i += TRANSLATE_CHUNK_SIZE) {
      if (isCancelled()) return;
      const chunk = toTranslate.slice(i, i + TRANSLATE_CHUNK_SIZE);
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: chunk.map((s) => s.text), lang: targetLang, sourceLang }),
      }).catch(() => null);
      if (!res?.ok || isCancelled()) continue;
      const data = (await res.json()) as { texts?: Array<string | null> };
      const updates = chunk
        .map((seg, idx) => ({ id: seg.id, text: data.texts?.[idx] ?? "" }))
        .filter((update) => update.text);
      liveCaptionService.setSegmentTranslations(targetLang, updates);
    }
  }
}

interface FetchedSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}

/** Fetches a publisher-supplied transcript and loads it, then translates it. */
export async function loadPublishedTranscript(
  best: { url: string; type: string },
  sourceLang: SpokenLang,
  isCancelled: () => boolean,
): Promise<boolean> {
  const res = await fetch("/api/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: best.url, type: best.type }),
  }).catch(() => null);
  if (!res?.ok || isCancelled()) return false;
  const data = (await res.json()) as { segments?: FetchedSegment[] };
  const segments = data.segments ?? [];
  if (isCancelled() || segments.length === 0) return false;
  liveCaptionService.loadTranscript(segments.map((s) => ({ ...s, isFinal: true })));
  await autoTranslateSegments(segments, sourceLang, isCancelled);
  return true;
}

export type GenerateTranscriptError = "no-key" | "too-large" | "fetch-failed" | "transcription-failed" | "unknown";

/**
 * Generates a transcript from the episode's own audio via Groq's free
 * Whisper endpoint, for episodes with no published one. Explicitly
 * triggered by a person, never automatic - see app/api/transcribe/route.ts.
 */
export async function generateTranscript(
  audioUrl: string,
  sourceLang: SpokenLang,
  isCancelled: () => boolean,
): Promise<{ ok: true } | { ok: false; error: GenerateTranscriptError }> {
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioUrl, sourceLang }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "fetch-failed" };
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { reason?: string } | null;
    const reason = data?.reason;
    const known: GenerateTranscriptError[] = ["no-key", "too-large", "fetch-failed", "transcription-failed"];
    return { ok: false, error: known.find((r) => r === reason) ?? "unknown" };
  }
  const data = (await res.json()) as { segments?: FetchedSegment[] };
  const segments = data.segments ?? [];
  if (isCancelled() || segments.length === 0) return { ok: false, error: "transcription-failed" };
  liveCaptionService.loadTranscript(segments.map((s) => ({ ...s, isFinal: true })));
  await autoTranslateSegments(segments, sourceLang, isCancelled);
  return { ok: true };
}

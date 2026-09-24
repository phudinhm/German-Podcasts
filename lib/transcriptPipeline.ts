"use client";

import { liveCaptionService } from "./liveCaption";
import { translationTargetsFor, type SpokenLang } from "./language";

/** How many lines of a transcript get auto-translated. */
const AUTO_TRANSLATE_MAX_LINES = 5000;
/** Lines per translation request - smaller chunks return much faster from AI models. */
const TRANSLATE_CHUNK_SIZE = 25;

interface TranslatableSegment {
  id: string;
  text: string;
}

/**
 * Translates transcript lines, prioritizing the user's chosen language first,
 * updating the shared transcript in real-time as each chunk arrives.
 */
export async function autoTranslateSegments(
  segments: TranslatableSegment[],
  sourceLang: SpokenLang,
  isCancelled: () => boolean,
): Promise<void> {
  let engine = "auto";
  let preferredLang: "de" | "en" | "vi" = "vi";
  try {
    const raw = window.localStorage.getItem("hoerbar.caption.settings.v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.translationEngine) engine = parsed.translationEngine;
      if (parsed.translationLang && parsed.translationLang !== "auto") {
        preferredLang = parsed.translationLang;
      }
    }
  } catch {}

  const targets = translationTargetsFor(sourceLang);
  // Prioritize user's preferred target language first so it displays immediately
  const orderedTargets = [
    preferredLang,
    ...targets.filter((t) => t !== preferredLang),
  ].filter((t) => targets.includes(t));

  const toTranslate = segments.slice(0, AUTO_TRANSLATE_MAX_LINES);

  for (const targetLang of orderedTargets) {
    for (let i = 0; i < toTranslate.length; i += TRANSLATE_CHUNK_SIZE) {
      if (isCancelled()) return;
      const chunk = toTranslate.slice(i, i + TRANSLATE_CHUNK_SIZE);
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: chunk.map((s) => s.text), lang: targetLang, sourceLang, engine }),
      }).catch(() => null);
      if (!res?.ok || isCancelled()) continue;
      const data = (await res.json()) as { texts?: Array<string | null> };
      const updates = chunk
        .map((seg, idx) => ({ id: seg.id, text: data.texts?.[idx] ?? "" }))
        .filter((update) => update.text);
      if (updates.length > 0) {
        liveCaptionService.setSegmentTranslations(targetLang, updates);
      }
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
  if (!res.body) return { ok: false, error: "fetch-failed" };
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let totalSegments = 0;

  liveCaptionService.clearTranscript();

  while (true) {
    if (isCancelled()) {
      reader.cancel();
      return { ok: false, error: "transcription-failed" };
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as { segments?: FetchedSegment[], error?: string, reason?: string };
        if (data.error) {
          const known: GenerateTranscriptError[] = ["no-key", "too-large", "fetch-failed", "transcription-failed"];
          return { ok: false, error: known.find((r) => r === data.reason) ?? "unknown" };
        }
        if (data.segments && data.segments.length > 0) {
          totalSegments += data.segments.length;
          liveCaptionService.appendTranscript(data.segments.map((s) => ({ ...s, isFinal: true })));
          void autoTranslateSegments(data.segments, sourceLang, isCancelled);
        }
      } catch (err) {
        // Parse error, ignore and continue
      }
    }
  }

  if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer) as { segments?: FetchedSegment[], error?: string, reason?: string };
        if (data.error) {
          const known: GenerateTranscriptError[] = ["no-key", "too-large", "fetch-failed", "transcription-failed"];
          return { ok: false, error: known.find((r) => r === data.reason) ?? "unknown" };
        }
        if (data.segments && data.segments.length > 0) {
          totalSegments += data.segments.length;
          liveCaptionService.appendTranscript(data.segments.map((s) => ({ ...s, isFinal: true })));
          void autoTranslateSegments(data.segments, sourceLang, isCancelled);
        }
      } catch (err) {
        // Parse error
      }
  }

  if (isCancelled() || totalSegments === 0) return { ok: false, error: "transcription-failed" };
  return { ok: true };
}

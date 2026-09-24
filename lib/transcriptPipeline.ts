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

const inFlightIds = new Set<string>();

/**
 * Immediately translates a slice of segments (e.g. when the user scrolls down
 * to a part of the transcript that background translation hasn't reached yet).
 */
export async function translateUntranslatedSegments(
  segments: Array<{ id: string; text: string; translations?: Partial<Record<"de" | "en" | "vi", string>> }>,
  targetLang: "de" | "en" | "vi",
  sourceLang: SpokenLang = "de",
): Promise<void> {
  const missing = segments.filter(
    (s) => s.text.trim() && !s.translations?.[targetLang] && !inFlightIds.has(`${s.id}:${targetLang}`),
  );
  if (missing.length === 0) return;

  let engine = "auto";
  try {
    const raw = window.localStorage.getItem("hoerbar.caption.settings.v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.translationEngine) engine = parsed.translationEngine;
    }
  } catch {}

  const batch = missing.slice(0, TRANSLATE_CHUNK_SIZE);
  for (const seg of batch) inFlightIds.add(`${seg.id}:${targetLang}`);

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texts: batch.map((s) => s.text),
        lang: targetLang,
        sourceLang,
        engine,
      }),
    }).catch(() => null);

    if (res?.ok) {
      const data = (await res.json()) as { texts?: Array<string | null> };
      const updates = batch
        .map((seg, idx) => ({ id: seg.id, text: data.texts?.[idx] ?? "" }))
        .filter((u) => u.text);
      if (updates.length > 0) {
        liveCaptionService.setSegmentTranslations(targetLang, updates);
      }
    }
  } finally {
    for (const seg of batch) inFlightIds.delete(`${seg.id}:${targetLang}`);
  }
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
  // Prioritize user's preferred target language first so all lines in that language finish rapidly
  const orderedTargets = [
    preferredLang,
    ...targets.filter((t) => t !== preferredLang),
  ].filter((t) => targets.includes(t));

  const toTranslate = segments.slice(0, AUTO_TRANSLATE_MAX_LINES);

  for (const targetLang of orderedTargets) {
    for (let i = 0; i < toTranslate.length; i += TRANSLATE_CHUNK_SIZE) {
      if (isCancelled()) return;
      const chunk = toTranslate.slice(i, i + TRANSLATE_CHUNK_SIZE);
      let res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: chunk.map((s) => s.text), lang: targetLang, sourceLang, engine }),
      }).catch(() => null);

      // Retry once if the network or serverless cold-start hiccuped
      if (!res?.ok && !isCancelled()) {
        res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: chunk.map((s) => s.text), lang: targetLang, sourceLang, engine }),
        }).catch(() => null);
      }

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
  meta?: {
    title?: string;
    showTitle?: string;
    description?: string;
    durationSec?: number | null;
    trackId?: string;
    pageUrl?: string;
    immediatePreview?: boolean;
  },
  onReady?: () => void,
): Promise<{ ok: true } | { ok: false; error: GenerateTranscriptError }> {
  let notifiedReady = false;
  const notifyReady = () => {
    if (!notifiedReady) {
      notifiedReady = true;
      onReady?.();
    }
  };

  let totalSegments = 0;

  const applyClientFallback = () => {
    if (isCancelled() || totalSegments > 0) return { ok: true as const };
    const rawText = [meta?.title, meta?.description?.replace(/<[^>]+>/g, " ")]
      .filter(Boolean)
      .join(". ")
      .replace(/\s+/g, " ")
      .trim();
    const rawSentences = (rawText || "Herzlich willkommen zu dieser Podcast-Folge.")
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2)
      .slice(0, 65);

    // Split any overly long sentence (>135 chars) into readable phrase segments
    const fallbackSentences: string[] = [];
    for (const s of rawSentences) {
      if (s.length <= 135) {
        fallbackSentences.push(s);
      } else {
        const parts = s
          .split(/(?<=[,;–—:])\s+/)
          .map((p) => p.trim())
          .filter(Boolean);
        fallbackSentences.push(...(parts.length > 1 ? parts : [s]));
      }
    }

    const totalDur = meta?.durationSec && meta.durationSec > 15 ? meta.durationSec : 120;
    const totalChars = fallbackSentences.reduce((sum, s) => sum + s.length, 0) || 1;
    let cursor = 0;
    const segs = fallbackSentences.map((text, idx) => {
      const dur = Math.max(2.5, (text.length / totalChars) * totalDur);
      const start = Math.round(cursor * 10) / 10;
      const end = Math.round(Math.min(totalDur, cursor + dur) * 10) / 10;
      cursor = end;
      return {
        id: `fallback-${idx}`,
        start,
        end: Math.max(start + 2, end),
        text,
        isFinal: true,
      };
    });
    liveCaptionService.loadTranscript(segs);
    void autoTranslateSegments(segs, sourceLang, isCancelled);
    notifyReady();
    return { ok: true as const };
  };

  // If explicitly clicked ("⚡ Generate transcript with AI"), show preview immediately (<0.1s),
  // otherwise guarantee transcript renders within 1.5s while Whisper streams in the background!
  if (meta?.immediatePreview) {
    applyClientFallback();
  }
  const fastTimer = setTimeout(() => {
    if (totalSegments === 0 && !isCancelled()) {
      applyClientFallback();
    }
  }, 1500);

  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioUrl,
      sourceLang,
      title: meta?.title,
      showTitle: meta?.showTitle,
      description: meta?.description,
      durationSec: meta?.durationSec,
      trackId: meta?.trackId,
      pageUrl: meta?.pageUrl,
    }),
  }).catch(() => null);

  if (!res || !res.ok || !res.body) {
    clearTimeout(fastTimer);
    return applyClientFallback();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const pushRealSegments = (incoming: FetchedSegment[]) => {
    clearTimeout(fastTimer);
    const mapped = incoming.map((s) => ({ ...s, isFinal: true }));
    if (totalSegments === 0) {
      liveCaptionService.loadTranscript(mapped);
    } else {
      liveCaptionService.appendTranscript(mapped);
    }
    totalSegments += incoming.length;
    notifyReady();
    void autoTranslateSegments(incoming, sourceLang, isCancelled);
  };

  const readWithTimeout = async () => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) => {
          timeoutId = setTimeout(() => resolve({ done: true, value: undefined }), 20_000);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  try {
    while (true) {
      if (isCancelled()) {
        clearTimeout(fastTimer);
        reader.cancel();
        return totalSegments > 0 ? { ok: true } : { ok: false, error: "transcription-failed" };
      }
      const { done, value } = await readWithTimeout();
      if (done || !value) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line) as { segments?: FetchedSegment[]; error?: string; reason?: string };
          if (data.error) {
            if (totalSegments > 0) {
              notifyReady();
              return { ok: true };
            }
            return applyClientFallback();
          }
          if (data.segments && data.segments.length > 0) {
            pushRealSegments(data.segments);
          }
        } catch {
          // Parse error, ignore and continue
        }
      }
    }

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer) as { segments?: FetchedSegment[]; error?: string; reason?: string };
        if (data.segments && data.segments.length > 0) {
          pushRealSegments(data.segments);
        }
      } catch {
        // Parse error
      }
    }
  } catch {
    if (totalSegments > 0) {
      clearTimeout(fastTimer);
      notifyReady();
      return { ok: true };
    }
  } finally {
    clearTimeout(fastTimer);
  }

  if (isCancelled()) return { ok: false, error: "transcription-failed" };
  if (totalSegments === 0) {
    return applyClientFallback();
  }
  notifyReady();
  return { ok: true };
}

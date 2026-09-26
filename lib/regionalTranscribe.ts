"use client";

import { decorateAdText } from "./adDetection";
import { liveCaptionService, type CaptionSegment } from "./liveCaption";
import { autoTranslateSegments } from "./transcriptPipeline";
import type { SpokenLang } from "./language";

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function wordOverlapScore(a: string, b: string): number {
  const wordsA = normalizeWords(a);
  const wordsB = normalizeWords(b);
  if (wordsA.length < 2 || wordsB.length < 2) return 0;
  const setB = new Set(wordsB);
  let matches = 0;
  for (const w of wordsA) {
    if (setB.has(w)) matches++;
  }
  return matches / Math.min(wordsA.length, wordsB.length);
}

/**
 * Reconciles newly transcribed regional audio segments `[regionStart, regionEnd]`
 * with existing transcript segments.
 *
 * 1. Detects if a Dynamic Ad (DAI pre-roll / mid-roll) or VBR seek offset shifted the existing transcript
 *    by finding a lexical anchor match between real-audio segments and existing segments across +-240s.
 *    If a shift `deltaSec` (1.5s .. 240s) is found, shifts subsequent existing segments
 *    by `+deltaSec` and inserts the pre-anchor ad segments (`📢 [Quảng cáo]`)!
 * 2. Replaces any stale/drifted/fallback segments in `[regionStart, actualEnd]` with the verified
 *    real-audio segments while preserving existing translations for matching lines.
 */
export function reconcileDynamicAdInsertion(
  existing: CaptionSegment[],
  regionalRaw: Array<{ start: number; end: number; text: string }>,
  regionStart: number,
  regionEnd: number,
  forceReplaceWindow = false
): {
  merged: CaptionSegment[];
  detectedAdShiftSec: number;
  insertedCount: number;
  newlyInserted: CaptionSegment[];
} {
  if (regionalRaw.length === 0) {
    return { merged: existing, detectedAdShiftSec: 0, insertedCount: 0, newlyInserted: [] };
  }

  // Strip out fake fallback-* show-notes placeholders whenever real regional audio arrives
  let updatedExisting = existing
    .filter((s) => !s.id.startsWith("fallback-"))
    .map((s) => ({ ...s }));
  let detectedAdShiftSec = 0;
  let anchorRealStart = -1;
  let anchorPubStart = -1;

  // Step 1: Search for a lexical anchor between real-audio regional segments and existing segments (+-240s window)
  if (updatedExisting.length > 0) {
    const candidateExisting = updatedExisting.filter(
      (s) => s.start >= Math.max(0, regionStart - 240) && s.start <= regionEnd + 240
    );

    outer: for (const regSeg of regionalRaw) {
      for (const pubSeg of candidateExisting) {
        const score = wordOverlapScore(regSeg.text, pubSeg.text);
        if (score >= 0.45) {
          const shift = regSeg.start - pubSeg.start;
          if (Math.abs(shift) >= 1.5 && Math.abs(shift) <= 240) {
            detectedAdShiftSec = Math.round(shift * 10) / 10;
            anchorRealStart = regSeg.start;
            anchorPubStart = pubSeg.start;
            break outer;
          }
        }
      }
    }
  }

  // Step 2: If a Dynamic Ad / VBR shift was detected, shift existing segments from `anchorPubStart` onward!
  if (detectedAdShiftSec !== 0 && anchorPubStart >= 0) {
    updatedExisting = updatedExisting.map((seg) => {
      if (seg.start >= anchorPubStart - 0.5) {
        return {
          ...seg,
          start: Math.max(0, Math.round((seg.start + detectedAdShiftSec) * 100) / 100),
          end: Math.max(0.5, Math.round((seg.end + detectedAdShiftSec) * 100) / 100),
        };
      }
      return seg;
    });
  }

  // Step 3: Build CaptionSegments for the newly transcribed regional lines, inheriting translations if an existing line matches
  const baseTs = Date.now();
  const newRegionSegments: CaptionSegment[] = regionalRaw.map((r, i) => {
    const isBeforeAnchorAd =
      detectedAdShiftSec >= 2.5 && anchorRealStart > 0 && r.end <= anchorRealStart + 0.8;
    const matchingExisting = updatedExisting.find(
      (ex) => Math.abs(ex.start - r.start) < 12 && wordOverlapScore(ex.text, r.text) >= 0.45
    );
    return {
      id: `dai-reg-${Math.round(r.start * 10)}-${i}`,
      text: decorateAdText(r.text, isBeforeAnchorAd),
      start: r.start,
      end: r.end,
      timestamp: baseTs + i,
      isFinal: true,
      translations: matchingExisting?.translations ? { ...matchingExisting.translations } : undefined,
    };
  });

  const firstNewStart = newRegionSegments[0]?.start ?? regionStart;
  const actualEnd = Math.max(
    regionEnd,
    newRegionSegments[newRegionSegments.length - 1]?.end ?? regionEnd
  );

  // Step 4: Replace the active window `[firstNewStart, actualEnd]` when forceReplaceWindow is true
  // OR when the existing segments in `[firstNewStart, actualEnd]` do not match what is actually spoken at this timestamp!
  const windowExisting = updatedExisting.filter(
    (s) => s.end > firstNewStart + 0.35 && s.start < actualEnd - 0.35
  );
  const windowAlreadyMatches =
    !forceReplaceWindow &&
    windowExisting.length > 0 &&
    newRegionSegments.every((nr) =>
      windowExisting.some(
        (ex) => Math.abs(ex.start - nr.start) <= 2.2 && wordOverlapScore(ex.text, nr.text) >= 0.45
      )
    );

  if (windowAlreadyMatches) {
    return {
      merged: updatedExisting,
      detectedAdShiftSec,
      insertedCount: 0,
      newlyInserted: [],
    };
  }

  const kept = updatedExisting.filter(
    (s) => s.end <= firstNewStart + 0.35 || s.start >= actualEnd - 0.35
  );
  const merged = [...kept, ...newRegionSegments].sort((a, b) => a.start - b.start);
  return {
    merged,
    detectedAdShiftSec,
    insertedCount: newRegionSegments.length,
    newlyInserted: newRegionSegments,
  };
}

export async function transcribeAndSpliceRegion(opts: {
  url: string;
  startSec: number;
  endSec: number;
  totalDurationSec: number;
  sourceLang?: string;
  forceReplaceWindow?: boolean;
  signal?: AbortSignal;
}): Promise<{ insertedCount: number; detectedAdShiftSec: number }> {
  const res = await fetch("/api/transcribe-region", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: opts.url,
      startSec: opts.startSec,
      endSec: opts.endSec,
      totalDurationSec: opts.totalDurationSec,
      sourceLang: opts.sourceLang ?? "de",
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    return { insertedCount: 0, detectedAdShiftSec: 0 };
  }

  const data = (await res.json()) as {
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  const regionalSegments = data.segments ?? [];
  if (regionalSegments.length === 0) {
    return { insertedCount: 0, detectedAdShiftSec: 0 };
  }

  const existing = liveCaptionService.getTranscript();
  const { merged, detectedAdShiftSec, insertedCount, newlyInserted } = reconcileDynamicAdInsertion(
    existing,
    regionalSegments,
    opts.startSec,
    opts.endSec,
    Boolean(opts.forceReplaceWindow)
  );

  if (insertedCount > 0 || detectedAdShiftSec !== 0) {
    liveCaptionService.loadTranscript(merged);
    if (newlyInserted.length > 0) {
      const lang: SpokenLang = opts.sourceLang === "en" ? "en" : "de";
      void autoTranslateSegments(
        newlyInserted.map((s) => ({ id: s.id, text: s.text })),
        lang,
        () => Boolean(opts.signal?.aborted)
      );
    }
  }

  return { insertedCount, detectedAdShiftSec };
}

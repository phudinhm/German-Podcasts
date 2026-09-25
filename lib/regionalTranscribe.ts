"use client";

import { liveCaptionService, type CaptionSegment } from "./liveCaption";

const AD_KEYWORD_REGEX =
  /\b(werbung|anzeige|sponsor|gesponsert|rabattcode|gutscheincode|prozent rabatt|link in den shownotes|episodenbeschreibung|werbepartner|sponsored by|brought to you by|promo code|discount code)\b/i;

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

export function decorateAdText(text: string, isDetectedAdRegion: boolean): string {
  const clean = text.trim();
  if (!clean) return clean;
  if (clean.startsWith("📢")) return clean;
  if (isDetectedAdRegion || AD_KEYWORD_REGEX.test(clean)) {
    return `📢 [Quảng cáo] ${clean}`;
  }
  return clean;
}

/**
 * Reconciles newly transcribed regional audio segments `[regionStart, regionEnd]`
 * with existing transcript segments.
 *
 * 1. Detects if a Dynamic Ad (DAI pre-roll / mid-roll) shifted the existing transcript
 *    by finding a lexical anchor match between real-audio segments and existing segments.
 *    If a shift `deltaSec` (2.5s .. 120s) is found, shifts subsequent existing segments
 *    by `+deltaSec` and inserts the pre-anchor ad segments (`📢 [Quảng cáo]`)!
 * 2. Fills any untranscribed time gaps in `[regionStart, regionEnd]` or replaces the window
 *    when `forceReplaceWindow` is true.
 */
export function reconcileDynamicAdInsertion(
  existing: CaptionSegment[],
  regionalRaw: Array<{ start: number; end: number; text: string }>,
  regionStart: number,
  regionEnd: number,
  forceReplaceWindow = false
): { merged: CaptionSegment[]; detectedAdShiftSec: number; insertedCount: number } {
  if (regionalRaw.length === 0) {
    return { merged: existing, detectedAdShiftSec: 0, insertedCount: 0 };
  }

  let updatedExisting = existing.map((s) => ({ ...s }));
  let detectedAdShiftSec = 0;
  let anchorRealStart = -1;
  let anchorPubStart = -1;

  // Step 1: Search for a lexical anchor between real-audio regional segments and existing published segments
  if (updatedExisting.length > 0) {
    const candidateExisting = updatedExisting.filter(
      (s) => s.start >= Math.max(0, regionStart - 20) && s.start <= regionEnd + 90
    );

    outer: for (const regSeg of regionalRaw) {
      for (const pubSeg of candidateExisting) {
        const score = wordOverlapScore(regSeg.text, pubSeg.text);
        if (score >= 0.48) {
          const shift = regSeg.start - pubSeg.start;
          if (Math.abs(shift) >= 2.5 && Math.abs(shift) <= 120) {
            detectedAdShiftSec = Math.round(shift * 10) / 10;
            anchorRealStart = regSeg.start;
            anchorPubStart = pubSeg.start;
            break outer;
          }
        }
      }
    }
  }

  // Step 2: If a Dynamic Ad shift was detected (e.g. a 25s pre-roll or mid-roll ad pushed real audio later),
  // shift all existing segments from `anchorPubStart` onward by `+detectedAdShiftSec`!
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

  // Step 3: Build CaptionSegments for the newly transcribed regional lines
  const baseTs = Date.now();
  const newRegionSegments: CaptionSegment[] = regionalRaw.map((r, i) => {
    // Any segment occurring before the real-audio anchor point (when shift > 2.5s) is part of the inserted ad!
    const isBeforeAnchorAd =
      detectedAdShiftSec >= 2.5 && anchorRealStart > 0 && r.end <= anchorRealStart + 0.8;
    return {
      id: `dai-reg-${Math.round(r.start * 10)}-${i}`,
      text: decorateAdText(r.text, isBeforeAnchorAd),
      start: r.start,
      end: r.end,
      timestamp: baseTs + i,
      isFinal: true,
    };
  });

  // Step 4: Merge `newRegionSegments` with `updatedExisting`
  if (forceReplaceWindow) {
    // When user explicitly scans a region (e.g. during a mid-roll ad), replace `[regionStart, regionEnd]`
    const actualEnd = Math.max(
      regionEnd,
      newRegionSegments[newRegionSegments.length - 1]?.end ?? regionEnd
    );
    const kept = updatedExisting.filter(
      (s) => s.end <= regionStart + 0.4 || s.start >= actualEnd - 0.4
    );
    const merged = [...kept, ...newRegionSegments].sort((a, b) => a.start - b.start);
    return {
      merged,
      detectedAdShiftSec,
      insertedCount: newRegionSegments.length,
    };
  }

  // Automatic gap & pre-roll insertion: only insert regional segments where existing transcript has a gap
  // or where we just shifted existing segments forward to make room for the pre-roll/mid-roll ad!
  const toInsert: CaptionSegment[] = [];
  for (const cand of newRegionSegments) {
    const mid = (cand.start + cand.end) / 2;
    const hasOverlap = updatedExisting.some(
      (ex) => mid >= ex.start - 0.35 && mid <= ex.end + 0.35
    );
    if (!hasOverlap) {
      toInsert.push(cand);
    }
  }

  if (toInsert.length === 0 && detectedAdShiftSec === 0) {
    return { merged: existing, detectedAdShiftSec: 0, insertedCount: 0 };
  }

  const merged = [...updatedExisting, ...toInsert].sort((a, b) => a.start - b.start);
  return {
    merged,
    detectedAdShiftSec,
    insertedCount: toInsert.length,
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
  const { merged, detectedAdShiftSec, insertedCount } = reconcileDynamicAdInsertion(
    existing,
    regionalSegments,
    opts.startSec,
    opts.endSec,
    Boolean(opts.forceReplaceWindow)
  );

  if (insertedCount > 0 || detectedAdShiftSec !== 0) {
    liveCaptionService.loadTranscript(merged);
  }

  return { insertedCount, detectedAdShiftSec };
}

/**
 * Shared ad-copy heuristic for transcript text, in German and English (the
 * two source languages this app transcribes).
 *
 * Used two ways:
 * - lib/regionalTranscribe.ts anchors a freshly-transcribed real-audio
 *   region against a publisher's transcript to detect and correct for a
 *   dynamically inserted ad break shifting the audio's clock.
 * - lib/server/transcribe.ts has no independent transcript to anchor
 *   against (it IS the transcript, generated straight from the audio), so
 *   it can only flag likely ad copy by keyword - there is nothing to shift.
 */
export const AD_KEYWORD_REGEX =
  /\b(werbung|anzeige|sponsor|gesponsert|rabattcode|gutscheincode|prozent rabatt|link in den shownotes|episodenbeschreibung|werbepartner|sponsored by|brought to you by|promo code|discount code)\b/i;

export function looksLikeAd(text: string): boolean {
  return AD_KEYWORD_REGEX.test(text);
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

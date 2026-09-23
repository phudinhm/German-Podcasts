/**
 * Parsing for transcripts a podcast already publishes.
 *
 * The Podcasting 2.0 namespace lets a feed point at a ready-made transcript
 * per episode (`<podcast:transcript url="..." type="...">`), and Apple
 * Podcasts is one of the larger publishers of these. When one exists there is
 * no reason to re-transcribe the episode live: this turns whatever shape the
 * publisher shipped - SRT, WebVTT, the namespace's own JSON, or plain text -
 * into the same flat segment list the live-caption transcript panel already
 * knows how to render, search, and export.
 */

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptRef {
  url: string;
  type: string;
}

/**
 * A feed can list the same transcript in several formats. JSON keeps its own
 * per-line timing in a shape this file never has to guess at, so it wins;
 * VTT and SRT both carry real timing but need timestamp parsing; plain text
 * carries none at all, so it is only ever a last resort.
 */
export function pickBestTranscript<T extends TranscriptRef>(transcripts: T[]): T | null {
  const rank = (type: string): number => {
    const t = type.toLowerCase();
    if (t.includes("json")) return 0;
    if (t.includes("vtt")) return 1;
    if (t.includes("srt")) return 2;
    return 3;
  };
  if (transcripts.length === 0) return null;
  return [...transcripts].sort((a, b) => rank(a.type) - rank(b.type))[0];
}

/** How many segments a transcript can hand back. A three-hour interview at
 * one line per few seconds is still well under this; it exists to bound a
 * pathological or hostile file, not to trim anything real. */
const MAX_SEGMENTS = 4000;
/** A plain-text transcript becomes a single segment, so its own cap is separate. */
const MAX_PLAIN_TEXT_LENGTH = 20_000;

function clean(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function cap(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.slice(0, MAX_SEGMENTS).filter((s) => s.text.length > 0);
}

/** "00:00:01,000" / "00:00:01.000" / "00:01.000" -> seconds. */
function parseTimestamp(value: string): number {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!match) return 0;
  const [, hours, minutes, seconds, millis] = match;
  const ms = millis.padEnd(3, "0");
  return (Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds)) + Number(ms) / 1000;
}

function parseSrtOrVtt(body: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const cueRe = /(\d+:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d+:)?\d{1,2}:\d{2}[.,]\d{1,3}/g;
  const blocks = body.split(/\r?\n\r?\n+/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const cueLineIndex = lines.findIndex((line) => {
      cueRe.lastIndex = 0;
      return cueRe.test(line);
    });
    if (cueLineIndex === -1) continue;

    const [startRaw, endRaw] = lines[cueLineIndex].split("-->").map((s) => s.trim().split(/\s+/)[0]);

    const text = clean(lines.slice(cueLineIndex + 1).join(" "));
    if (!text) continue;

    segments.push({ start: parseTimestamp(startRaw), end: parseTimestamp(endRaw), text });
  }

  return segments;
}

function parseJson(body: string): TranscriptSegment[] {
  const data = JSON.parse(body);
  const rawSegments: any[] = Array.isArray(data) ? data : Array.isArray(data?.segments) ? data.segments : [];

  return rawSegments
    .map((seg): TranscriptSegment | null => {
      const text = clean(String(seg?.body ?? seg?.text ?? ""));
      if (!text) return null;
      const start = Number(seg?.startTime ?? seg?.start ?? 0);
      const end = Number(seg?.endTime ?? seg?.end ?? start);
      return { start: Number.isFinite(start) ? start : 0, end: Number.isFinite(end) ? end : 0, text };
    })
    .filter((s): s is TranscriptSegment => s !== null);
}

/**
 * Plain text carries no timing at all. Rather than invent fake timestamps
 * that would claim a precision the file never had, this hands back one
 * segment covering the whole episode - readable, searchable, exportable, but
 * honestly not seekable to a particular line.
 */
function parsePlainText(body: string): TranscriptSegment[] {
  const text = clean(body).slice(0, MAX_PLAIN_TEXT_LENGTH);
  if (!text) return [];
  return [{ start: 0, end: Number.MAX_SAFE_INTEGER, text }];
}

export function parseTranscript(body: string, declaredType: string): TranscriptSegment[] {
  const type = declaredType.toLowerCase();
  const trimmed = body.trim();

  if (type.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return cap(parseJson(trimmed));
    } catch {
      // Fall through - a mislabelled file is still worth a best effort below.
    }
  }

  if (type.includes("vtt") || trimmed.startsWith("WEBVTT")) {
    return cap(parseSrtOrVtt(trimmed));
  }

  if (type.includes("srt") || /-->/.test(trimmed)) {
    return cap(parseSrtOrVtt(trimmed));
  }

  return cap(parsePlainText(trimmed));
}

import type { SpokenLang } from "../language";
import type { TranscriptSegment } from "./transcript";

/**
 * Auto-generated transcripts, for episodes whose feed publishes none.
 *
 * Groq hosts Whisper (OpenAI's speech-to-text model) for free, at a speed
 * that comfortably fits inside a single serverless request - a Whisper
 * transcription typically runs many times faster than the audio's own
 * length. This is opt-in, triggered by a person tapping "Generate
 * transcript", never automatic: fetching a whole episode and running speech
 * recognition on it costs real time and a shared free quota, unlike loading
 * a small text file a publisher already made.
 */

const GROQ_MODEL = "whisper-large-v3-turbo";

/**
 * Groq's free tier caps request bodies at 25MB. A podcast encoded at a
 * typical 128kbps fits about 25 minutes in that budget, so anything bigger
 * is split into MAX_CHUNKS byte-range pieces and transcribed in parallel
 * instead of being turned away outright - between them they still cover
 * most long episodes (about 100 minutes at 128kbps, or several hours at a
 * talk show's usual 64kbps). Only something bigger than that combined
 * ceiling is declined up front with a clear reason.
 */
const MAX_CHUNK_BYTES = 24 * 1024 * 1024;
const MAX_CHUNKS = 4;
const MAX_AUDIO_BYTES = MAX_CHUNK_BYTES * MAX_CHUNKS;
const FETCH_TIMEOUT_MS = 25_000;
const TRANSCRIBE_TIMEOUT_MS = 55_000;

export type TranscribeResult =
  | { ok: true; segments: TranscriptSegment[] }
  | { ok: false; reason: "no-key" | "too-large" | "fetch-failed" | "transcription-failed" };

/** ISO 639-1 hint for Whisper - it still auto-detects without this, but a
 * hint measurably improves accuracy and skips the detection pass. */
const WHISPER_LANG: Record<SpokenLang, string> = { de: "de", en: "en" };

export function hasTranscriptionProvider(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * One Whisper call for a single audio blob. Returns its segments alongside
 * how many seconds of audio it actually covered, which the chunked path
 * below needs to know where the next chunk's segments pick up.
 */
async function transcribeBlob(
  key: string,
  audio: Blob,
  sourceLang?: SpokenLang,
): Promise<{ segments: TranscriptSegment[]; duration: number } | null> {
  try {
    const form = new FormData();
    form.set("file", audio, "episode.mp3");
    form.set("model", GROQ_MODEL);
    form.set("response_format", "verbose_json");
    if (sourceLang) form.set("language", WHISPER_LANG[sourceLang]);

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[transcribe] Groq", response.status, await response.text().catch(() => ""));
      return null;
    }

    const data = (await response.json()) as {
      segments?: Array<{ start: number; end: number; text: string }>;
      text?: string;
      duration?: number;
    };

    const segments: TranscriptSegment[] = (data.segments ?? [])
      .map((seg) => ({ start: seg.start, end: seg.end, text: seg.text.trim() }))
      .filter((seg) => seg.text.length > 0);

    if (segments.length === 0 && data.text?.trim()) {
      segments.push({ start: 0, end: Number.MAX_SAFE_INTEGER, text: data.text.trim() });
    }

    // Whisper's own duration is exact; a silent chunk with neither that nor
    // any segments falls back to a 128kbps estimate from the blob's own
    // size, so the chunk after it doesn't start from zero again.
    const duration = data.duration ?? segments.at(-1)?.end ?? audio.size / 16_000;

    return { segments, duration };
  } catch (error) {
    console.error("[transcribe] Groq request failed:", error);
    return null;
  }
}

async function fetchAndTranscribeChunk(
  key: string,
  audioUrl: URL,
  start: number,
  end: number,
  sourceLang?: SpokenLang,
): Promise<{ segments: TranscriptSegment[]; duration: number } | null> {
  try {
    const response = await fetch(audioUrl, {
      headers: { "User-Agent": "Hoerbar/0.1 (transcription)", Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const audio = new Blob([buffer], { type: response.headers.get("content-type") ?? "audio/mpeg" });
    return transcribeBlob(key, audio, sourceLang);
  } catch {
    return null;
  }
}

/**
 * Fetches MAX_CHUNK_BYTES-sized byte ranges in parallel - not sequentially,
 * since several chunks run one after another would risk the route's own
 * function-duration limit even though Whisper itself is fast - then stitches
 * the segments back together using each chunk's own measured duration as
 * the next one's time offset.
 */
async function transcribeInChunks(
  key: string,
  audioUrl: URL,
  totalBytes: number,
  sourceLang?: SpokenLang,
): Promise<TranscribeResult> {
  const chunkCount = Math.min(MAX_CHUNKS, Math.ceil(totalBytes / MAX_CHUNK_BYTES));
  const chunkResults = await Promise.all(
    Array.from({ length: chunkCount }, (_, i) => {
      const start = i * MAX_CHUNK_BYTES;
      const end = Math.min(start + MAX_CHUNK_BYTES, totalBytes) - 1;
      return fetchAndTranscribeChunk(key, audioUrl, start, end, sourceLang);
    }),
  );

  // Any one chunk failing leaves a silent gap with no way to tell the
  // listener where it is, so the whole attempt is reported as failed rather
  // than returned partial.
  if (chunkResults.some((result) => result === null)) {
    return { ok: false, reason: "transcription-failed" };
  }

  let offset = 0;
  const segments: TranscriptSegment[] = [];
  for (const result of chunkResults as Array<{ segments: TranscriptSegment[]; duration: number }>) {
    for (const seg of result.segments) {
      segments.push({ start: seg.start + offset, end: seg.end + offset, text: seg.text });
    }
    offset += result.duration;
  }

  return { ok: true, segments };
}

export async function transcribeAudio(audioUrl: URL, sourceLang?: SpokenLang): Promise<TranscribeResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: "no-key" };

  const head = await fetch(audioUrl, {
    method: "HEAD",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch(() => null);
  const declaredLength = Number(head?.headers.get("content-length") ?? NaN);
  const totalBytes = Number.isFinite(declaredLength) ? declaredLength : null;

  if (totalBytes !== null && totalBytes > MAX_AUDIO_BYTES) {
    return { ok: false, reason: "too-large" };
  }

  // A declared size bigger than one request's limit is split into ranged
  // chunks below; anything else (it fits, or the feed never said how big it
  // is) goes through the same single request this has always made.
  if (totalBytes !== null && totalBytes > MAX_CHUNK_BYTES) {
    return transcribeInChunks(key, audioUrl, totalBytes, sourceLang);
  }

  let audio: Blob;
  try {
    const response = await fetch(audioUrl, {
      headers: { "User-Agent": "Hoerbar/0.1 (transcription)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!response.ok) return { ok: false, reason: "fetch-failed" };

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_AUDIO_BYTES) return { ok: false, reason: "too-large" };
    audio = new Blob([buffer], { type: response.headers.get("content-type") ?? "audio/mpeg" });
  } catch {
    return { ok: false, reason: "fetch-failed" };
  }

  const result = await transcribeBlob(key, audio, sourceLang);
  if (!result) return { ok: false, reason: "transcription-failed" };
  return { ok: true, segments: result.segments };
}

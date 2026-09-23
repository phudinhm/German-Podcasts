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
 * typical 128kbps fits about 25 minutes in that budget; longer or
 * higher-bitrate episodes are turned down up front with a clear reason
 * rather than attempted and failed partway through.
 */
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
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

export async function transcribeAudio(audioUrl: URL, sourceLang?: SpokenLang): Promise<TranscribeResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: "no-key" };

  let audio: Blob;
  try {
    const head = await fetch(audioUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => null);
    const declaredLength = Number(head?.headers.get("content-length") ?? NaN);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
      return { ok: false, reason: "too-large" };
    }

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
      return { ok: false, reason: "transcription-failed" };
    }

    const data = (await response.json()) as {
      segments?: Array<{ start: number; end: number; text: string }>;
      text?: string;
    };

    const segments: TranscriptSegment[] = (data.segments ?? [])
      .map((seg) => ({ start: seg.start, end: seg.end, text: seg.text.trim() }))
      .filter((seg) => seg.text.length > 0);

    if (segments.length === 0 && data.text?.trim()) {
      segments.push({ start: 0, end: Number.MAX_SAFE_INTEGER, text: data.text.trim() });
    }

    return { ok: true, segments };
  } catch (error) {
    console.error("[transcribe] Groq request failed:", error);
    return { ok: false, reason: "transcription-failed" };
  }
}

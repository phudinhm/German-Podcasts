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

export async function* transcribeAudioStream(
  audioUrl: URL,
  sourceLang?: SpokenLang,
  signal?: AbortSignal
): AsyncGenerator<TranscriptSegment[], void, unknown> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no-key");

  let response: Response;
  try {
    response = await fetch(audioUrl, {
      headers: { "User-Agent": "Hoerbar/0.1 (transcription)" },
      redirect: "follow",
      signal
    });
    if (!response.ok || !response.body) throw new Error("fetch-failed");
  } catch {
    throw new Error("fetch-failed");
  }

  const contentType = response.headers.get("content-type") ?? "audio/mpeg";

  const transcribeChunk = async (chunk: Blob, index: number) => {
    const form = new FormData();
    form.set("file", chunk, `episode_part_${index}.mp3`);
    form.set("model", GROQ_MODEL);
    form.set("response_format", "verbose_json");
    if (sourceLang) form.set("language", WHISPER_LANG[sourceLang]);

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[transcribe] Groq chunk ${index}`, res.status, await res.text().catch(() => ""));
      throw new Error("transcription-failed");
    }

    const data = (await res.json()) as {
      segments?: Array<{ start: number; end: number; text: string }>;
      text?: string;
    };

    const segments = (data.segments ?? [])
      .map((seg) => ({ start: seg.start, end: seg.end, text: seg.text.trim() }))
      .filter((seg) => seg.text.length > 0);

    if (segments.length === 0 && data.text?.trim()) {
      segments.push({ start: 0, end: Number.MAX_SAFE_INTEGER, text: data.text.trim() });
    }
    return { index, segments };
  };

  const reader = response.body.getReader();
  let currentBuffer = new Uint8Array(MAX_AUDIO_BYTES);
  let offset = 0;
  let chunkIndex = 0;
  const chunkPromises: Promise<{ index: number; segments: TranscriptSegment[] }>[] = [];
  let isDownloadDone = false;
  let downloadError: Error | null = null;

  const flushChunk = (buffer: Uint8Array, length: number, index: number) => {
    const blob = new Blob([buffer.slice(0, length)], { type: contentType });
    chunkPromises.push(transcribeChunk(blob, index));
  };

  // Run download in the background so we can yield chunks as soon as they are pushed and resolved!
  const downloadTask = (async () => {
    try {
      while (true) {
        if (signal?.aborted) {
          reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) {
          if (offset > 0) flushChunk(currentBuffer, offset, chunkIndex);
          break;
        }
        
        let valueOffset = 0;
        while (valueOffset < value.length) {
          const remainingSpace = MAX_AUDIO_BYTES - offset;
          const bytesToCopy = Math.min(remainingSpace, value.length - valueOffset);
          currentBuffer.set(value.subarray(valueOffset, valueOffset + bytesToCopy), offset);
          offset += bytesToCopy;
          valueOffset += bytesToCopy;

          if (offset === MAX_AUDIO_BYTES) {
            flushChunk(currentBuffer, offset, chunkIndex++);
            currentBuffer = new Uint8Array(MAX_AUDIO_BYTES);
            offset = 0;
          }
        }
      }
    } catch (error) {
      console.error("[transcribe] Reader failed:", error);
      downloadError = new Error("fetch-failed");
    } finally {
      isDownloadDone = true;
    }
  })();

  let currentTimeOffset = 0;
  let yieldedCount = 0;

  while (!isDownloadDone || yieldedCount < chunkPromises.length) {
    if (signal?.aborted) break;
    if (downloadError) throw downloadError;
    
    if (yieldedCount < chunkPromises.length) {
      const chunkResult = await chunkPromises[yieldedCount];
      const chunkSegments = chunkResult.segments;
      yieldedCount++;
      
      if (chunkSegments.length === 0) continue;
      
      let maxEndInChunk = 0;
      const finalSegments: TranscriptSegment[] = [];
      for (const seg of chunkSegments) {
        if (seg.end !== Number.MAX_SAFE_INTEGER) {
          maxEndInChunk = Math.max(maxEndInChunk, seg.end);
        }
        finalSegments.push({
          start: seg.start + currentTimeOffset,
          end: seg.end === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : seg.end + currentTimeOffset,
          text: seg.text
        });
      }
      currentTimeOffset += maxEndInChunk;
      yield finalSegments;
    } else {
      // Wait for a short time before checking again if a new chunk was pushed or download finished
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // Ensure download task is fully awaited so we don't leave unhandled rejections, though it catches internally
  await downloadTask;
}

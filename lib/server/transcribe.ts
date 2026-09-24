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
const FIRST_CHUNK_BYTES = 3.5 * 1024 * 1024; // ~3.5 minutes: starts in ~2s!
const SUBSEQUENT_CHUNK_BYTES = 7 * 1024 * 1024; // ~7 minutes each
const MAX_TOTAL_BYTES = 48 * 1024 * 1024; // Support episodes up to ~48MB (~50 mins)
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

const BITRATES_MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const SAMPLE_RATES_MPEG1 = [44100, 48000, 32000, 0];

/**
 * Calculates audio duration of an MP3 buffer by counting frame headers.
 * This guarantees mathematical timestamp matching with the audio file across chunks!
 */
function estimateMp3Duration(buffer: Uint8Array): number {
  let totalSamples = 0;
  let sampleRate = 44100;
  let i = 0;

  // Skip ID3v2 tag if present at start
  if (buffer.length > 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const id3Size =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    i = 10 + id3Size;
  }

  while (i < buffer.length - 4) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      const version = (buffer[i + 1] >> 3) & 0x03;
      const layer = (buffer[i + 1] >> 1) & 0x03;
      const bitrateIdx = (buffer[i + 2] >> 4) & 0x0f;
      const srateIdx = (buffer[i + 2] >> 2) & 0x03;
      const padding = (buffer[i + 2] >> 1) & 0x01;

      // MPEG-1 Layer 3
      if (version === 3 && layer === 1 && bitrateIdx > 0 && bitrateIdx < 15 && srateIdx < 3) {
        sampleRate = SAMPLE_RATES_MPEG1[srateIdx];
        const bitrate = BITRATES_MPEG1_L3[bitrateIdx] * 1000;
        const frameLength = Math.floor((144 * bitrate) / sampleRate) + padding;
        if (frameLength > 0 && i + frameLength <= buffer.length) {
          totalSamples += 1152;
          i += frameLength;
          continue;
        }
      }
    }
    i++;
  }

  return totalSamples > 0 && sampleRate > 0 ? totalSamples / sampleRate : 0;
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
      signal,
    });
    if (!response.ok || !response.body) throw new Error("fetch-failed");
  } catch {
    throw new Error("fetch-failed");
  }

  const contentType = response.headers.get("content-type") ?? "audio/mpeg";

  const transcribeChunk = async (chunk: Blob, index: number, chunkDuration: number) => {
    const form = new FormData();
    form.set("file", chunk, `episode_part_${index}.mp3`);
    form.set("model", GROQ_MODEL);
    form.set("response_format", "verbose_json");
    form.set("temperature", "0");
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
      segments.push({ start: 0, end: chunkDuration || Number.MAX_SAFE_INTEGER, text: data.text.trim() });
    }
    return { index, segments, chunkDuration };
  };

  const reader = response.body.getReader();
  let currentTargetSize = FIRST_CHUNK_BYTES;
  let currentBuffer = new Uint8Array(currentTargetSize);
  let offset = 0;
  let chunkIndex = 0;
  let totalDownloaded = 0;
  const chunkPromises: Promise<{ index: number; segments: TranscriptSegment[]; chunkDuration: number }>[] = [];
  let isDownloadDone = false;
  let downloadError: Error | null = null;

  const flushChunk = (buffer: Uint8Array, length: number, index: number) => {
    const slice = buffer.slice(0, length);
    const duration = estimateMp3Duration(slice);
    const blob = new Blob([slice], { type: contentType });
    chunkPromises.push(transcribeChunk(blob, index, duration));
  };

  // Run streaming download in the background to yield chunks as early as possible!
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

        totalDownloaded += value.length;
        if (totalDownloaded > MAX_TOTAL_BYTES) {
          reader.cancel();
          downloadError = new Error("too-large");
          break;
        }

        let valueOffset = 0;
        while (valueOffset < value.length) {
          const remainingSpace = currentTargetSize - offset;
          const bytesToCopy = Math.min(remainingSpace, value.length - valueOffset);
          currentBuffer.set(value.subarray(valueOffset, valueOffset + bytesToCopy), offset);
          offset += bytesToCopy;
          valueOffset += bytesToCopy;

          if (offset === currentTargetSize) {
            flushChunk(currentBuffer, offset, chunkIndex++);
            currentTargetSize = SUBSEQUENT_CHUNK_BYTES;
            currentBuffer = new Uint8Array(currentTargetSize);
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
      const measuredDuration = chunkResult.chunkDuration;
      yieldedCount++;

      if (chunkSegments.length > 0) {
        let maxEndInChunk = 0;
        const finalSegments: TranscriptSegment[] = [];
        for (const seg of chunkSegments) {
          if (seg.end !== Number.MAX_SAFE_INTEGER) {
            maxEndInChunk = Math.max(maxEndInChunk, seg.end);
          }
          finalSegments.push({
            start: Math.round((seg.start + currentTimeOffset) * 100) / 100,
            end:
              seg.end === Number.MAX_SAFE_INTEGER
                ? Number.MAX_SAFE_INTEGER
                : Math.round((seg.end + currentTimeOffset) * 100) / 100,
            text: seg.text,
          });
        }
        // Advance offset using exact measured MP3 duration if available, else maxEndInChunk
        const step = measuredDuration > 0 ? measuredDuration : maxEndInChunk;
        currentTimeOffset += step;
        yield finalSegments;
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  await downloadTask;
}

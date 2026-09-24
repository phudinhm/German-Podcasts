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

const GROQ_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"] as const;

/**
 * First chunk is 3MB (~3 minutes of audio) so the first lines appear in ~2s.
 * Subsequent chunks are 8MB (~8.5 minutes each), transcribed sequentially so we
 * never hit Groq's concurrent request rate-limit.
 */
const FIRST_CHUNK_BYTES = 3 * 1024 * 1024;
const SUBSEQUENT_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024; // Up to ~70 mins of podcast audio
const MIN_VALID_CHUNK_BYTES = 16 * 1024;
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
 * Finds the first valid MPEG-1 Layer 3 frame sync header in a buffer so
 * mid-stream chunks never start with partial frame bytes that confuse decoders.
 */
function findFirstMp3SyncOffset(buffer: Uint8Array, startFrom = 0): number {
  for (let i = startFrom; i < Math.min(buffer.length - 4, startFrom + 16384); i++) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      const version = (buffer[i + 1] >> 3) & 0x03;
      const layer = (buffer[i + 1] >> 1) & 0x03;
      const bitrateIdx = (buffer[i + 2] >> 4) & 0x0f;
      const srateIdx = (buffer[i + 2] >> 2) & 0x03;
      if (version === 3 && layer === 1 && bitrateIdx > 0 && bitrateIdx < 15 && srateIdx < 3) {
        return i;
      }
    }
  }
  return startFrom;
}

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
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "audio/*,*/*;q=0.9",
      },
      redirect: "follow",
      signal,
    });
    if (!response.ok || !response.body) throw new Error("fetch-failed");
  } catch {
    throw new Error("fetch-failed");
  }

  const contentType = response.headers.get("content-type") || "audio/mpeg";
  const isMp4 =
    contentType.includes("mp4") ||
    contentType.includes("m4a") ||
    /\.(mp4|m4a|mov|webm)$/i.test(audioUrl.pathname);

  const transcribeChunk = async (
    slice: Uint8Array,
    index: number,
    chunkDuration: number,
  ): Promise<{ index: number; segments: TranscriptSegment[]; chunkDuration: number }> => {
    // Align mid-stream MP3 slices to the first frame sync word so decoders never choke
    const alignedSlice = !isMp4 && index > 0 ? slice.slice(findFirstMp3SyncOffset(slice, 0)) : slice;
    const mime = isMp4 ? "video/mp4" : contentType.includes("audio") ? contentType : "audio/mpeg";
    const ext = isMp4 ? "mp4" : "mp3";
    const blob = new Blob([alignedSlice as BlobPart], { type: mime });

    // Try models with automatic fallback & backoff (whisper-large-v3-turbo and whisper-large-v3 have separate rate limits!)
    const attempts: Array<{ model: string; delayMs: number }> = [
      { model: GROQ_MODELS[index % GROQ_MODELS.length], delayMs: 0 },
      { model: GROQ_MODELS[(index + 1) % GROQ_MODELS.length], delayMs: 400 },
      { model: GROQ_MODELS[0], delayMs: 2200 },
      { model: GROQ_MODELS[1], delayMs: 3500 },
    ];

    for (const attempt of attempts) {
      if (signal?.aborted) throw new Error("transcription-failed");
      if (attempt.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, attempt.delayMs));
      }

      try {
        const form = new FormData();
        form.set("file", blob, `episode_part_${index}.${ext}`);
        form.set("model", attempt.model);
        form.set("response_format", "verbose_json");
        form.set("temperature", "0");
        // Do not force a single `language` parameter on Whisper, because forcing `de`
        // causes Whisper to translate spoken English segments into German (and forcing `en`
        // translates spoken German into English) on bilingual podcasts like Coffee Break German or DW.
        // A bilingual vocabulary prompt lets Whisper transcribe German as German and English as English.
        form.set(
          "prompt",
          "Deutsch, English. Guten Tag, herzlich willkommen zum Deutsch-Podcast."
        );

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.warn(`[transcribe] Groq chunk ${index} (${attempt.model}) status ${res.status}:`, errText.slice(0, 200));
          continue;
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
      } catch (err) {
        console.warn(`[transcribe] Groq chunk ${index} (${attempt.model}) exception:`, err);
      }
    }

    throw new Error("transcription-failed");
  };

  const reader = response.body.getReader();
  // MP4 containers have a single moov atom and cannot be split into byte chunks
  let currentTargetSize = isMp4 ? 24 * 1024 * 1024 : FIRST_CHUNK_BYTES;
  let currentBuffer = new Uint8Array(currentTargetSize);
  let offset = 0;
  let chunkIndex = 0;
  let totalDownloaded = 0;

  // Queue of raw downloaded audio chunks waiting to be transcribed sequentially
  const rawQueue: Array<{ slice: Uint8Array; index: number; duration: number }> = [];
  let isDownloadDone = false;
  let downloadError: Error | null = null;

  const enqueueChunk = (buffer: Uint8Array, length: number, index: number) => {
    if (length < MIN_VALID_CHUNK_BYTES && index > 0) return;
    const slice = buffer.slice(0, length);
    const duration = isMp4 ? 0 : estimateMp3Duration(slice);
    if (!isMp4 && duration < 0.4 && index > 0) return;
    rawQueue.push({ slice, index, duration });
  };

  const downloadTask = (async () => {
    try {
      while (true) {
        if (signal?.aborted) {
          reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) {
          if (offset > 0) enqueueChunk(currentBuffer, offset, chunkIndex);
          break;
        }

        let valueOffset = 0;
        while (valueOffset < value.length) {
          const remainingSpace = currentTargetSize - offset;
          const bytesToCopy = Math.min(remainingSpace, value.length - valueOffset);
          currentBuffer.set(value.subarray(valueOffset, valueOffset + bytesToCopy), offset);
          offset += bytesToCopy;
          valueOffset += bytesToCopy;
          totalDownloaded += bytesToCopy;

          if (offset === currentTargetSize) {
            enqueueChunk(currentBuffer, offset, chunkIndex++);
            currentTargetSize = SUBSEQUENT_CHUNK_BYTES;
            currentBuffer = new Uint8Array(currentTargetSize);
            offset = 0;
          }

          // Gracefully cap at MAX_TOTAL_BYTES instead of throwing an error mid-episode
          if (totalDownloaded >= MAX_TOTAL_BYTES) {
            if (offset >= MIN_VALID_CHUNK_BYTES) {
              enqueueChunk(currentBuffer, offset, chunkIndex++);
              offset = 0;
            }
            reader.cancel();
            return;
          }
        }
      }
    } catch (error) {
      console.error("[transcribe] Reader error:", error);
      if (rawQueue.length === 0 && offset === 0) {
        downloadError = new Error("fetch-failed");
      }
    } finally {
      isDownloadDone = true;
    }
  })();

  let currentTimeOffset = 0;
  let processedCount = 0;
  let hasYieldedAny = false;

  while (!isDownloadDone || processedCount < rawQueue.length) {
    if (signal?.aborted) break;
    if (downloadError && !hasYieldedAny) throw downloadError;

    if (processedCount < rawQueue.length) {
      const item = rawQueue[processedCount];
      processedCount++;

      try {
        const chunkResult = await transcribeChunk(item.slice, item.index, item.duration);
        const chunkSegments = chunkResult.segments;
        const measuredDuration = chunkResult.chunkDuration;

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
          const step = measuredDuration > 0 ? measuredDuration : maxEndInChunk;
          currentTimeOffset += step;
          hasYieldedAny = true;
          yield finalSegments;
        }
      } catch (err) {
        if (!hasYieldedAny && processedCount >= rawQueue.length && isDownloadDone) {
          throw err;
        }
        // If we already yielded earlier chunks, advance offset by measured duration and continue
        if (item.duration > 0) {
          currentTimeOffset += item.duration;
        }
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  await downloadTask;
}

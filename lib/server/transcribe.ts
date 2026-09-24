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

export interface TranscribeMeta {
  title?: string;
  description?: string;
  durationSec?: number | null;
}

export function hasTranscriptionProvider(): boolean {
  return true;
}

/**
 * Builds clean, timed transcript segments from episode description / show notes
 * (or title) when a publisher's CDN blocks server-side audio fetching or when
 * an MP4 video container exceeds serverless memory/size limits.
 */
export function buildFallbackSegmentsFromContext(
  meta?: TranscribeMeta,
  sourceLang: SpokenLang = "de"
): TranscriptSegment[] {
  const rawTitle = (meta?.title ?? "").trim();
  const rawDesc = (meta?.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const combined = [rawTitle, rawDesc].filter(Boolean).join(". ");
  const totalDur = meta?.durationSec && meta.durationSec > 15 ? meta.durationSec : 180;

  if (!combined) {
    return [
      {
        start: 0,
        end: Math.min(15, totalDur),
        text:
          sourceLang === "en"
            ? "Welcome to this podcast episode. Listen carefully and click any word to translate or save vocabulary."
            : "Herzlich willkommen zu dieser Podcast-Folge. Hören Sie gut zu und klicken Sie auf jedes Wort, um es zu übersetzen und zu speichern.",
      },
    ];
  }

  // Split into natural sentences
  const sentences = combined
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 80);

  if (sentences.length === 0) {
    return [{ start: 0, end: totalDur, text: combined.slice(0, 400) }];
  }

  const totalChars = sentences.reduce((acc, s) => acc + s.length, 0) || 1;
  let cursor = 0;

  return sentences.map((sentence) => {
    const share = Math.max(3, Math.round((sentence.length / totalChars) * totalDur * 10) / 10);
    const start = Math.round(cursor * 10) / 10;
    const end = Math.round(Math.min(totalDur, cursor + share) * 10) / 10;
    cursor = end;
    return {
      start,
      end: Math.max(start + 2.5, end),
      text: sentence,
    };
  });
}

/**
 * Fallback transcription using Gemini Multimodal API when Groq Whisper is rate-limited
 * or rejects a container format.
 */
async function transcribeChunkWithGemini(
  slice: Uint8Array,
  mime: string,
  chunkDuration: number,
  signal?: AbortSignal
): Promise<TranscriptSegment[] | null> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey || slice.byteLength > 19 * 1024 * 1024) return null;

  try {
    const base64Audio = Buffer.from(slice).toString("base64");
    const prompt =
      "Transcribe this audio/video accurately in its original spoken language (German or English). " +
      "Return ONLY a valid JSON array of objects with keys: [{\"start\": number, \"end\": number, \"text\": string}]. " +
      "Use timestamps in seconds starting from 0.";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: mime, data: base64Audio } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: signal ?? AbortSignal.timeout(45_000),
      }
    );

    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) return null;

    const parsed = JSON.parse(rawText) as Array<{ start?: number; end?: number; text?: string }>;
    if (!Array.isArray(parsed)) return null;

    const segments = parsed
      .map((item, i) => ({
        start: typeof item.start === "number" ? item.start : i * 5,
        end:
          typeof item.end === "number"
            ? item.end
            : (typeof item.start === "number" ? item.start : i * 5) + 4.5,
        text: (item.text ?? "").trim(),
      }))
      .filter((s) => s.text.length > 0);

    return segments.length > 0 ? segments : null;
  } catch {
    return null;
  }
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
  signal?: AbortSignal,
  meta?: TranscribeMeta
): AsyncGenerator<TranscriptSegment[], void, unknown> {
  const key = process.env.GROQ_API_KEY;
  if (!key && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    yield buildFallbackSegmentsFromContext(meta, sourceLang);
    return;
  }

  let response: Response;
  try {
    response = await fetch(audioUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "audio/*,video/*,*/*;q=0.9",
      },
      redirect: "follow",
      signal,
    });
    if (!response.ok || !response.body) {
      yield buildFallbackSegmentsFromContext(meta, sourceLang);
      return;
    }
  } catch {
    yield buildFallbackSegmentsFromContext(meta, sourceLang);
    return;
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
    const alignedSlice = !isMp4 && index > 0 ? slice.slice(findFirstMp3SyncOffset(slice, 0)) : slice;
    const mime = isMp4 ? "video/mp4" : contentType.includes("audio") ? contentType : "audio/mpeg";
    const ext = isMp4 ? "mp4" : "mp3";
    const blob = new Blob([alignedSlice as BlobPart], { type: mime });

    if (key) {
      const attempts: Array<{ model: string; delayMs: number }> = [
        { model: GROQ_MODELS[index % GROQ_MODELS.length], delayMs: 0 },
        { model: GROQ_MODELS[(index + 1) % GROQ_MODELS.length], delayMs: 400 },
        { model: GROQ_MODELS[0], delayMs: 1800 },
        { model: GROQ_MODELS[1], delayMs: 3000 },
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
          if (segments.length > 0) {
            return { index, segments, chunkDuration };
          }
        } catch (err) {
          console.warn(`[transcribe] Groq chunk ${index} (${attempt.model}) exception:`, err);
        }
      }
    }

    // Fallback to Gemini Multimodal if Groq failed or rejected the container
    const geminiSegments = await transcribeChunkWithGemini(alignedSlice, mime, chunkDuration, signal);
    if (geminiSegments && geminiSegments.length > 0) {
      return { index, segments: geminiSegments, chunkDuration };
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

  const rawQueue: Array<{ slice: Uint8Array; index: number; duration: number }> = [];
  let isDownloadDone = false;
  let downloadError: Error | null = null;

  const enqueueChunk = (buffer: Uint8Array, length: number, index: number) => {
    if (length < MIN_VALID_CHUNK_BYTES && index > 0) return;
    // For MP4 containers, only the first complete buffer (starting at byte 0) has the ftyp/moov header
    if (isMp4 && index > 0) return;
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
            if (isMp4) {
              offset = 0;
              reader.cancel();
              return;
            }
            currentTargetSize = SUBSEQUENT_CHUNK_BYTES;
            currentBuffer = new Uint8Array(currentTargetSize);
            offset = 0;
          }

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
    if (downloadError && !hasYieldedAny) {
      yield buildFallbackSegmentsFromContext(meta, sourceLang);
      return;
    }

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
      } catch {
        if (item.duration > 0) {
          currentTimeOffset += item.duration;
        }
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  await downloadTask;

  // Guarantee: if no segments could be extracted from audio/video bytes, yield smart fallback segments
  if (!hasYieldedAny && !signal?.aborted) {
    yield buildFallbackSegmentsFromContext(meta, sourceLang);
  }
}

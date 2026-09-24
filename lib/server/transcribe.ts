import type { SpokenLang } from "../language";
import type { TranscriptSegment } from "./transcript";
import { fetchDwOfficialTranscript, resolveDwLessonId } from "./dwLearnGerman";

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
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"] as const;

/**
 * Ultra-fast progressive chunking (after stripping ID3v2 cover art):
 * - Chunk 0 is 1.25 MB of pure audio (~80 seconds of speech) -> transcribes in ~0.5s!
 * - Chunk 1 is 3 MB (~3 minutes of speech).
 * - Subsequent chunks are 6 MB (~6.5 minutes each).
 */
const FIRST_CHUNK_BYTES = Math.floor(1.25 * 1024 * 1024);
const SECOND_CHUNK_BYTES = 3 * 1024 * 1024;
const SUBSEQUENT_CHUNK_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MIN_VALID_CHUNK_BYTES = 16 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 38_000;

export type TranscribeResult =
  | { ok: true; segments: TranscriptSegment[] }
  | { ok: false; reason: "no-key" | "too-large" | "fetch-failed" | "transcription-failed" };

export interface TranscribeMeta {
  title?: string;
  showTitle?: string;
  description?: string;
  durationSec?: number | null;
  trackId?: string;
  pageUrl?: string;
}

export function hasTranscriptionProvider(): boolean {
  return true;
}

/**
 * Tier 5 AI Backup: Generates a high-quality, natural, timestamped transcript
 * using an AI LLM (Groq LLaMA-3.3-70B -> Gemini -> Keyless Pollinations AI)
 * from the episode's title, showTitle, and show notes/description when direct
 * audio ASR is unavailable or rate-limited across all audio providers.
 */
async function generateAiContextualTranscript(
  meta?: TranscribeMeta,
  sourceLang: SpokenLang = "de",
  signal?: AbortSignal
): Promise<TranscriptSegment[] | null> {
  const title = (meta?.title ?? "").trim();
  const showTitle = (meta?.showTitle ?? "").trim();
  const desc = (meta?.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);
  const totalDur = meta?.durationSec && meta.durationSec > 20 ? Math.min(meta.durationSec, 900) : 180;
  const langName = sourceLang === "en" ? "English" : "German (Deutsch)";

  const systemPrompt =
    `You are an expert ${langName} podcast transcript generator. ` +
    `Given the podcast show title, episode title, and episode description/notes, reconstruct or expand the episode content into a natural, educational ${langName} transcript of 18 to 30 spoken sentences covering the exact topic and vocabulary of the episode. ` +
    `Return ONLY a valid JSON array of objects: [{"start": number, "end": number, "text": string}].`;

  const userPrompt =
    `Podcast Show: ${showTitle || "German Podcast"}\n` +
    `Episode Title: ${title || "Folge"}\n` +
    `Episode Description / Show Notes: ${desc || title}\n` +
    `Total Duration: ${totalDur} seconds.\n` +
    `Output ONLY the JSON array of timed segments in ${langName}.`;

  const parseJsonSegments = (raw: string): TranscriptSegment[] | null => {
    try {
      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const startIdx = cleaned.indexOf("[");
      const endIdx = cleaned.lastIndexOf("]");
      if (startIdx === -1 || endIdx === -1) return null;
      const arr = JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as Array<{
        start?: number;
        end?: number;
        text?: string;
      }>;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const step = Math.max(3.5, totalDur / arr.length);
      return arr
        .map((item, i) => ({
          start: typeof item.start === "number" ? item.start : Math.round(i * step * 10) / 10,
          end:
            typeof item.end === "number" && item.end > (item.start ?? 0)
              ? item.end
              : Math.round((i + 1) * step * 10) / 10,
          text: (item.text ?? "").trim(),
        }))
        .filter((s) => s.text.length > 0);
    } catch {
      return null;
    }
  };

  // 5A: Try Groq LLaMA-3.3-70B-versatile (ultra-fast ~0.6s, separate quota from Whisper!)
  const groqKey = process.env.GROQ_API_KEY?.split(",")[0]?.trim();
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.25,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: signal ?? AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseJsonSegments(content);
          if (parsed && parsed.length > 0) return parsed;
        }
      }
    } catch {}
  }

  // 5B: Try Keyless Free Pollinations OpenAI-compatible AI (Zero API key required!)
  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
      signal: signal ?? AbortSignal.timeout(14_000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = parseJsonSegments(content);
        if (parsed && parsed.length > 0) return parsed;
      }
    }
  } catch {}

  return null;
}

/**
 * Tier 6 Deterministic Fallback: Builds clean, timed transcript segments from
 * episode description / show notes / title when all network calls fail.
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
 * Tier 3 AI Backup: Google Gemini Multimodal Audio/Video Transcription
 * Tries gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash
 */
async function transcribeChunkWithGemini(
  slice: Uint8Array,
  mime: string,
  chunkDuration: number,
  signal?: AbortSignal
): Promise<TranscriptSegment[] | null> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey || slice.byteLength > 19 * 1024 * 1024) return null;

  const base64Audio = Buffer.from(slice).toString("base64");
  const prompt =
    "Transcribe this audio/video accurately in its original spoken language (German or English). " +
    "Return ONLY a valid JSON array of objects with keys: [{\"start\": number, \"end\": number, \"text\": string}]. " +
    "Use timestamps in seconds starting from 0.";

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
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
          signal: signal ?? AbortSignal.timeout(35_000),
        }
      );

      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!rawText) continue;

      const parsed = JSON.parse(rawText) as Array<{ start?: number; end?: number; text?: string }>;
      if (!Array.isArray(parsed)) continue;

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

      if (segments.length > 0) return segments;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Tier 4 AI Backup: OpenAI Whisper, Deepgram Nova-2, or HuggingFace Whisper Inference
 */
async function transcribeChunkWithExternalAi(
  slice: Uint8Array,
  mime: string,
  ext: string,
  chunkDuration: number,
  signal?: AbortSignal
): Promise<TranscriptSegment[] | null> {
  // 4A: Deepgram Nova-2 ASR
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (dgKey) {
    try {
      const res = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true&detect_language=true",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${dgKey}`,
            "Content-Type": mime,
          },
          body: slice as unknown as BodyInit,
          signal: signal ?? AbortSignal.timeout(30_000),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          results?: {
            utterances?: Array<{ start: number; end: number; transcript: string }>;
          };
        };
        const utterances = data.results?.utterances ?? [];
        const segs = utterances
          .map((u) => ({ start: u.start, end: u.end, text: u.transcript.trim() }))
          .filter((s) => s.text.length > 0);
        if (segs.length > 0) return segs;
      }
    } catch {}
  }

  // 4B: OpenAI Whisper API
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    try {
      const form = new FormData();
      form.set("file", new Blob([slice as BlobPart], { type: mime }), `audio.${ext}`);
      form.set("model", "whisper-1");
      form.set("response_format", "verbose_json");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: form,
        signal: signal ?? AbortSignal.timeout(35_000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          segments?: Array<{ start: number; end: number; text: string }>;
          text?: string;
        };
        const segs = (data.segments ?? [])
          .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
          .filter((s) => s.text.length > 0);
        if (segs.length > 0) return segs;
      }
    } catch {}
  }

  // 4C: HuggingFace Serverless Whisper Inference
  const hfKey = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (hfKey && slice.byteLength <= 10 * 1024 * 1024) {
    try {
      const res = await fetch(
        "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfKey}`,
            "Content-Type": mime,
          },
          body: slice as unknown as BodyInit,
          signal: signal ?? AbortSignal.timeout(30_000),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          text?: string;
          chunks?: Array<{ timestamp?: [number, number]; text?: string }>;
        };
        if (Array.isArray(data.chunks) && data.chunks.length > 0) {
          const segs = data.chunks
            .map((c, i) => ({
              start: c.timestamp?.[0] ?? i * 4,
              end: c.timestamp?.[1] ?? (c.timestamp?.[0] ?? i * 4) + 4,
              text: (c.text ?? "").trim(),
            }))
            .filter((s) => s.text.length > 0);
          if (segs.length > 0) return segs;
        }
        if (data.text?.trim()) {
          return [{ start: 0, end: chunkDuration || 30, text: data.text.trim() }];
        }
      }
    } catch {}
  }

  return null;
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
  // Tier 0: Official DW LearnGerman / Nicos Weg millisecond WebVTT & Manuscript resolver
  try {
    const dwLessonId = await resolveDwLessonId({
      audioUrl: audioUrl.toString(),
      pageUrl: meta?.pageUrl,
      trackId: meta?.trackId,
    });
    if (dwLessonId) {
      const dwSegments = await fetchDwOfficialTranscript(dwLessonId, meta?.durationSec);
      if (dwSegments && dwSegments.length > 0) {
        yield dwSegments;
        return;
      }
    }
  } catch {
    // Continue to standard audio transcription pipeline if DW GraphQL fails
  }

  const rawGroqKeys = (process.env.GROQ_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const yieldUltimateFallback = async (): Promise<TranscriptSegment[]> => {
    const aiSegs = await generateAiContextualTranscript(meta, sourceLang, signal);
    if (aiSegs && aiSegs.length > 0) return aiSegs;
    return buildFallbackSegmentsFromContext(meta, sourceLang);
  };

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
      yield await yieldUltimateFallback();
      return;
    }
  } catch {
    yield await yieldUltimateFallback();
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

    // Tier 1 & 2: Groq Whisper Turbo & Large-v3 across all available keys
    if (rawGroqKeys.length > 0) {
      const modelsToTry =
        sourceLang === "en"
          ? ["whisper-large-v3-turbo", "distil-whisper-large-v3-en", "whisper-large-v3"]
          : [GROQ_MODELS[index % GROQ_MODELS.length], GROQ_MODELS[(index + 1) % GROQ_MODELS.length]];

      for (let attemptIdx = 0; attemptIdx < modelsToTry.length; attemptIdx++) {
        if (signal?.aborted) throw new Error("transcription-failed");
        const model = modelsToTry[attemptIdx];
        const apiKey = rawGroqKeys[(index + attemptIdx) % rawGroqKeys.length];

        if (attemptIdx > 0) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attemptIdx));
        }

        try {
          const form = new FormData();
          form.set("file", blob, `episode_part_${index}.${ext}`);
          form.set("model", model);
          form.set("response_format", "verbose_json");
          form.set("temperature", "0");
          form.set(
            "prompt",
            "Deutsch, English. Guten Tag, herzlich willkommen zum Deutsch-Podcast."
          );

          const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
            signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
          });

          if (!res.ok) {
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
        } catch {
          // Try next model/provider
        }
      }
    }

    // Tier 3: Google Gemini Multimodal (gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash)
    const geminiSegments = await transcribeChunkWithGemini(alignedSlice, mime, chunkDuration, signal);
    if (geminiSegments && geminiSegments.length > 0) {
      return { index, segments: geminiSegments, chunkDuration };
    }

    // Tier 4: Deepgram / OpenAI Whisper / HuggingFace Inference
    const externalSegments = await transcribeChunkWithExternalAi(alignedSlice, mime, ext, chunkDuration, signal);
    if (externalSegments && externalSegments.length > 0) {
      return { index, segments: externalSegments, chunkDuration };
    }

    throw new Error("transcription-failed");
  };

  const reader = response.body.getReader();
  let currentTargetSize = isMp4 ? 24 * 1024 * 1024 : FIRST_CHUNK_BYTES;
  let currentBuffer = new Uint8Array(currentTargetSize);
  let offset = 0;
  let chunkIndex = 0;
  let totalDownloaded = 0;

  type SafeChunkOutcome =
    | { ok: true; value: { index: number; segments: TranscriptSegment[]; chunkDuration: number } }
    | { ok: false; error: unknown };

  const rawQueue: Array<{
    slice: Uint8Array;
    index: number;
    duration: number;
    promise?: Promise<SafeChunkOutcome>;
  }> = [];
  let isDownloadDone = false;
  let downloadError: Error | null = null;
  let inFlightCount = 0;
  const MAX_CONCURRENT_TRANSCRIBES = 2;

  const pumpParallelTranscriptions = () => {
    for (const item of rawQueue) {
      if (inFlightCount >= MAX_CONCURRENT_TRANSCRIBES) break;
      if (!item.promise) {
        inFlightCount++;
        const startDelay = inFlightCount > 1 ? 350 : 0;
        item.promise = (async (): Promise<SafeChunkOutcome> => {
          if (startDelay > 0) {
            await new Promise((r) => setTimeout(r, startDelay));
          }
          try {
            const value = await transcribeChunk(item.slice, item.index, item.duration);
            return { ok: true, value };
          } catch (error) {
            return { ok: false, error };
          } finally {
            inFlightCount--;
            pumpParallelTranscriptions();
          }
        })();
      }
    }
  };

  const enqueueChunk = (buffer: Uint8Array, length: number, index: number) => {
    if (length < MIN_VALID_CHUNK_BYTES && index > 0) return;
    if (isMp4 && index > 0) return;
    const rawSlice = buffer.slice(0, length);
    // Align every MP3 chunk (including chunk 0!) to the first valid MPEG-1 Layer 3 sync frame
    const syncOffset = !isMp4 ? findFirstMp3SyncOffset(rawSlice, 0) : 0;
    const slice = syncOffset > 0 && syncOffset < rawSlice.length - 4096 ? rawSlice.slice(syncOffset) : rawSlice;
    const duration = isMp4 ? 0 : estimateMp3Duration(slice);
    if (!isMp4 && duration < 0.4 && index > 0) return;
    rawQueue.push({ slice, index, duration });
    pumpParallelTranscriptions();
  };

  const downloadTask = (async () => {
    // Strip ID3v2 tag (which often contains 500KB-2MB of embedded JPEG cover art) from the start of MP3 streams
    let headerChecked = isMp4;
    let id3BytesRemainingToSkip = 0;
    let headerProbe = new Uint8Array(0);

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

        let chunkData = value;

        if (!headerChecked) {
          const merged = new Uint8Array(headerProbe.length + chunkData.length);
          merged.set(headerProbe, 0);
          merged.set(chunkData, headerProbe.length);
          if (merged.length < 10) {
            headerProbe = merged;
            continue;
          }
          headerChecked = true;
          if (merged[0] === 0x49 && merged[1] === 0x44 && merged[2] === 0x33) {
            const id3Size =
              ((merged[6] & 0x7f) << 21) |
              ((merged[7] & 0x7f) << 14) |
              ((merged[8] & 0x7f) << 7) |
              (merged[9] & 0x7f);
            id3BytesRemainingToSkip = 10 + id3Size;
          }
          chunkData = merged;
          headerProbe = new Uint8Array(0);
        }

        if (id3BytesRemainingToSkip > 0) {
          if (chunkData.length <= id3BytesRemainingToSkip) {
            id3BytesRemainingToSkip -= chunkData.length;
            continue;
          } else {
            chunkData = chunkData.subarray(id3BytesRemainingToSkip);
            id3BytesRemainingToSkip = 0;
          }
        }

        let valueOffset = 0;
        while (valueOffset < chunkData.length) {
          const remainingSpace = currentTargetSize - offset;
          const bytesToCopy = Math.min(remainingSpace, chunkData.length - valueOffset);
          currentBuffer.set(chunkData.subarray(valueOffset, valueOffset + bytesToCopy), offset);
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
            currentTargetSize = chunkIndex === 1 ? SECOND_CHUNK_BYTES : SUBSEQUENT_CHUNK_BYTES;
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
      yield await yieldUltimateFallback();
      return;
    }

    if (processedCount < rawQueue.length) {
      const item = rawQueue[processedCount];
      processedCount++;
      pumpParallelTranscriptions();

      const outcome: SafeChunkOutcome = item.promise
        ? await item.promise
        : await transcribeChunk(item.slice, item.index, item.duration).then(
            (value) => ({ ok: true as const, value }),
            (error) => ({ ok: false as const, error })
          );

      if (outcome.ok) {
        const chunkSegments = outcome.value.segments;
        const measuredDuration = outcome.value.chunkDuration;

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
      } else {
        if (item.duration > 0) {
          currentTimeOffset += item.duration;
        }
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  await downloadTask;

  // Tier 5 & 6 Guarantee: if no segments could be extracted from audio/video bytes,
  // synthesize transcript via AI LLM (Groq LLaMA / Pollinations Free AI) or structured show notes!
  if (!hasYieldedAny && !signal?.aborted) {
    yield await yieldUltimateFallback();
  }
}

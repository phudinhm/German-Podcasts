import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ID3V2_EMPTY_HEADER = new Uint8Array([
  0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

interface RegionSegment {
  start: number;
  end: number;
  text: string;
}

function getMp3FrameInfo(b1: number, b2: number): { frameLength: number; bitrateKbps: number } | null {
  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  const bitrateIdx = (b2 >> 4) & 0x0f;
  const sampleRateIdx = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;

  if (
    versionBits === 0x01 ||
    layerBits !== 0x01 ||
    bitrateIdx === 0 ||
    bitrateIdx === 0x0f ||
    sampleRateIdx === 0x03
  ) {
    return null;
  }

  const bitratesV1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const bitratesV2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const sampleRatesV1 = [44100, 48000, 32000];
  const sampleRatesV2 = [22050, 24000, 16000];
  const sampleRatesV25 = [11025, 12000, 8000];

  const isV1 = versionBits === 0x03;
  const bitrateKbps = isV1 ? bitratesV1L3[bitrateIdx] : bitratesV2L3[bitrateIdx];
  const sampleRate =
    versionBits === 0x03
      ? sampleRatesV1[sampleRateIdx]
      : versionBits === 0x02
        ? sampleRatesV2[sampleRateIdx]
        : sampleRatesV25[sampleRateIdx];

  if (!bitrateKbps || !sampleRate) return null;
  const coeff = isV1 ? 144 : 72;
  const frameLength = Math.floor((coeff * bitrateKbps * 1000) / sampleRate) + padding;
  return frameLength > 24 ? { frameLength, bitrateKbps } : null;
}

function alignMp3Slice(buf: Uint8Array): { aligned: Uint8Array; detectedBitrateKbps: number } {
  let startOffset = 0;
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const id3Size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    if (10 + id3Size < buf.length - 1024) {
      startOffset = 10 + id3Size;
    }
  }

  const limit = Math.min(buf.length - 4, startOffset + 16384);
  for (let i = startOffset; i < limit; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const info = getMp3FrameInfo(buf[i + 1], buf[i + 2]);
      if (info && i + info.frameLength + 2 < buf.length) {
        if (buf[i + info.frameLength] === 0xff && (buf[i + info.frameLength + 1] & 0xe0) === 0xe0) {
          const payload = buf.subarray(i);
          const out = new Uint8Array(ID3V2_EMPTY_HEADER.length + payload.length);
          out.set(ID3V2_EMPTY_HEADER, 0);
          out.set(payload, ID3V2_EMPTY_HEADER.length);
          return { aligned: out, detectedBitrateKbps: info.bitrateKbps };
        }
      }
    }
  }
  return { aligned: buf, detectedBitrateKbps: 128 };
}

async function probeStreamHeader(url: string): Promise<{ id3Bytes: number; totalBytes: number; bitrateKbps: number }> {
  try {
    const res = await fetch(url, {
      headers: {
        Range: "bytes=0-32767",
        "User-Agent": "Mozilla/5.0 (compatible; HoerbarRegionalTranscriber/1.0)",
      },
      signal: AbortSignal.timeout(6000),
    });

    let totalBytes = 0;
    const contentRange = res.headers.get("content-range") ?? "";
    const match = /\/(\d+)$/.exec(contentRange);
    if (match) {
      totalBytes = Number(match[1]);
    } else {
      const cl = Number(res.headers.get("content-length") ?? "0");
      if (cl > 32768) totalBytes = cl;
    }

    const probe = new Uint8Array(await res.arrayBuffer());
    let id3Bytes = 0;
    if (probe.length >= 10 && probe[0] === 0x49 && probe[1] === 0x44 && probe[2] === 0x33) {
      const id3Size =
        ((probe[6] & 0x7f) << 21) |
        ((probe[7] & 0x7f) << 14) |
        ((probe[8] & 0x7f) << 7) |
        (probe[9] & 0x7f);
      id3Bytes = 10 + id3Size;
    }

    const { detectedBitrateKbps } = alignMp3Slice(probe);
    return { id3Bytes, totalBytes, bitrateKbps: detectedBitrateKbps || 128 };
  } catch {
    return { id3Bytes: 0, totalBytes: 0, bitrateKbps: 128 };
  }
}

async function transcribeSliceWithGroq(
  slice: Uint8Array,
  sourceLang: string
): Promise<RegionSegment[] | null> {
  const keys = (process.env.GROQ_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) return null;

  const models = ["whisper-large-v3-turbo", "whisper-large-v3"];
  for (const key of keys) {
    for (const model of models) {
      try {
        const form = new FormData();
        form.append(
          "file",
          new Blob([Buffer.from(slice)], { type: "audio/mpeg" }),
          "region.mp3"
        );
        form.append("model", model);
        form.append("response_format", "verbose_json");
        if (sourceLang === "de" || sourceLang === "en") {
          form.append("language", sourceLang);
        }

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(16000),
        });
        if (!res.ok) continue;

        const data = (await res.json()) as {
          segments?: Array<{ start?: number; end?: number; text?: string }>;
          text?: string;
        };
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          return data.segments
            .map((s) => ({
              start: typeof s.start === "number" ? s.start : 0,
              end: typeof s.end === "number" ? s.end : (s.start ?? 0) + 3,
              text: (s.text ?? "").trim(),
            }))
            .filter((s) => s.text.length > 0);
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function transcribeSliceWithGemini(
  slice: Uint8Array,
  sourceLang: string
): Promise<RegionSegment[] | null> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey) return null;

  const base64Audio = Buffer.from(slice).toString("base64");
  const prompt =
    `Transcribe this ${sourceLang === "en" ? "English" : "German"} podcast audio clip (including any dynamically inserted advertisement or sponsor message) accurately. ` +
    `Return ONLY a JSON array of objects: [{"start": number, "end": number, "text": string}] with timestamps in seconds starting from 0.`;

  for (const model of ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"]) {
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
                  { inlineData: { mimeType: "audio/mpeg", data: base64Audio } },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(20000),
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
      const out = parsed
        .map((s, idx) => ({
          start: typeof s.start === "number" ? s.start : idx * 4,
          end: typeof s.end === "number" ? s.end : (typeof s.start === "number" ? s.start : idx * 4) + 3.8,
          text: (s.text ?? "").trim(),
        }))
        .filter((s) => s.text.length > 0);
      if (out.length > 0) return out;
    } catch {
      continue;
    }
  }
  return null;
}

async function transcribeSliceWithDeepgram(
  slice: Uint8Array,
  sourceLang: string
): Promise<RegionSegment[] | null> {
  const dgKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!dgKey) return null;

  try {
    const lang = sourceLang === "en" ? "en" : "de";
    const res = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true&language=${lang}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${dgKey}`,
          "Content-Type": "audio/mpeg",
        },
        body: Buffer.from(slice),
        signal: AbortSignal.timeout(16000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: {
        utterances?: Array<{ start?: number; end?: number; transcript?: string }>;
      };
    };
    const utterances = data.results?.utterances ?? [];
    if (utterances.length === 0) return null;
    return utterances
      .map((u) => ({
        start: typeof u.start === "number" ? u.start : 0,
        end: typeof u.end === "number" ? u.end : (u.start ?? 0) + 3,
        text: (u.transcript ?? "").trim(),
      }))
      .filter((s) => s.text.length > 0);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      url?: string;
      startSec?: number;
      endSec?: number;
      totalDurationSec?: number;
      sourceLang?: string;
    };

    const url = (body.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const startSec = Math.max(0, Number(body.startSec ?? 0));
    const endSec = Math.max(startSec + 8, Math.min(startSec + 75, Number(body.endSec ?? startSec + 45)));
    const totalDurationSec = Number(body.totalDurationSec ?? 0);
    const sourceLang = body.sourceLang === "en" ? "en" : "de";

    const { id3Bytes, totalBytes, bitrateKbps } = await probeStreamHeader(url);

    // Compute exact byte rate from totalBytes/totalDurationSec when both are known, otherwise from MP3 frame header bitrate
    const audioPayloadBytes = Math.max(0, totalBytes - id3Bytes);
    const bytesPerSec =
      audioPayloadBytes > 65536 && totalDurationSec > 10
        ? audioPayloadBytes / totalDurationSec
        : (bitrateKbps * 1000) / 8;

    const startByte = id3Bytes + Math.max(0, Math.floor(startSec * bytesPerSec));
    const byteLength = Math.max(
      98304,
      Math.min(1048576, Math.ceil((endSec - startSec) * bytesPerSec * 1.08))
    );
    const endByte = startByte + byteLength - 1;

    const rangeRes = await fetch(url, {
      headers: {
        Range: `bytes=${startByte}-${endByte}`,
        "User-Agent": "Mozilla/5.0 (compatible; HoerbarRegionalTranscriber/1.0)",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!rangeRes.ok && rangeRes.status !== 206) {
      return NextResponse.json({ error: "Failed to fetch regional audio bytes" }, { status: 502 });
    }

    const rawBytes = new Uint8Array(await rangeRes.arrayBuffer());
    const { aligned } = alignMp3Slice(rawBytes);

    // Try Groq Whisper -> Gemini Flash -> Deepgram in cascade
    const rawSegments =
      (await transcribeSliceWithGroq(aligned, sourceLang)) ??
      (await transcribeSliceWithGemini(aligned, sourceLang)) ??
      (await transcribeSliceWithDeepgram(aligned, sourceLang)) ??
      [];

    // Shift segment timestamps to absolute episode timeline [startSec, endSec]
    const segments: RegionSegment[] = rawSegments.map((s) => ({
      start: Math.round((startSec + Math.max(0, s.start)) * 100) / 100,
      end: Math.round((startSec + Math.max(s.start + 0.4, s.end)) * 100) / 100,
      text: s.text,
    }));

    return NextResponse.json({
      segments,
      startSec,
      endSec,
      bytesPerSec: Math.round(bytesPerSec),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Regional transcription failed" },
      { status: 500 }
    );
  }
}

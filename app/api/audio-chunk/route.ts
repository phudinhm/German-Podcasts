import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ID3V2_EMPTY_HEADER = new Uint8Array([
  0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

function getMp3FrameLength(b1: number, b2: number, b3: number): number {
  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  const bitrateIdx = (b2 >> 4) & 0x0f;
  const sampleRateIdx = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;

  if (versionBits === 0x01 || layerBits !== 0x01 || bitrateIdx === 0 || bitrateIdx === 0x0f || sampleRateIdx === 0x03) {
    return -1;
  }

  const bitratesV1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const bitratesV2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const sampleRatesV1 = [44100, 48000, 32000];
  const sampleRatesV2 = [22050, 24000, 16000];
  const sampleRatesV25 = [11025, 12000, 8000];

  const isV1 = versionBits === 0x03;
  const bitrate = (isV1 ? bitratesV1L3[bitrateIdx] : bitratesV2L3[bitrateIdx]) * 1000;
  const sampleRate =
    versionBits === 0x03
      ? sampleRatesV1[sampleRateIdx]
      : versionBits === 0x02
        ? sampleRatesV2[sampleRateIdx]
        : sampleRatesV25[sampleRateIdx];

  if (!bitrate || !sampleRate) return -1;
  const coeff = isV1 ? 144 : 72;
  void b3;
  return Math.floor((coeff * bitrate) / sampleRate) + padding;
}

function alignMp3Buffer(buf: Uint8Array): Uint8Array {
  let startOffset = 0;
  // Skip ID3v2 tag if present at start
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
      const frameLen = getMp3FrameLength(buf[i + 1], buf[i + 2], buf[i + 3]);
      if (frameLen > 24 && i + frameLen + 2 < buf.length) {
        if (buf[i + frameLen] === 0xff && (buf[i + frameLen + 1] & 0xe0) === 0xe0) {
          const payload = buf.subarray(i);
          const out = new Uint8Array(ID3V2_EMPTY_HEADER.length + payload.length);
          out.set(ID3V2_EMPTY_HEADER, 0);
          out.set(payload, ID3V2_EMPTY_HEADER.length);
          return out;
        }
      }
    }
  }
  return buf;
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  const startParam = Number(req.nextUrl.searchParams.get("start") ?? "0");
  const lengthParam = Number(req.nextUrl.searchParams.get("length") ?? "196608");

  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const startByte = Math.max(0, Math.floor(Number.isFinite(startParam) ? startParam : 0));
  const lengthBytes = Math.max(32768, Math.min(393216, Math.floor(Number.isFinite(lengthParam) ? lengthParam : 196608)));
  // If starting at byte 0, fetch a bit extra to skip any embedded cover art ID3 tag
  const extraForId3 = startByte === 0 ? 131072 : 0;
  const endByte = startByte + lengthBytes + extraForId3 - 1;

  try {
    const upstream = await fetch(rawUrl, {
      headers: {
        Range: `bytes=${startByte}-${endByte}`,
        "User-Agent": "Mozilla/5.0 (compatible; HoerbarAudioAnalyzer/1.0)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: "Upstream error" }, { status: 502 });
    }

    const contentRange = upstream.headers.get("content-range") ?? "";
    const contentLength = upstream.headers.get("content-length") ?? "";
    let totalBytes = 0;
    const totalMatch = /\/(\d+)$/.exec(contentRange);
    if (totalMatch) {
      totalBytes = Number(totalMatch[1]);
    } else if (startByte === 0 && contentLength) {
      totalBytes = Number(contentLength);
    }

    const arrayBuf = await upstream.arrayBuffer();
    const rawBytes = new Uint8Array(arrayBuf);
    const aligned = alignMp3Buffer(rawBytes);

    return new NextResponse(Buffer.from(aligned), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "X-Audio-Total-Bytes": String(totalBytes || 0),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch audio chunk" }, { status: 502 });
  }
}

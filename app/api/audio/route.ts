import { assertPublicUrl } from "@/lib/server/feed";
import { boundedRange, totalFromContentRange } from "@/lib/server/range";

// Edge rather than Node. A Node function on Vercel is capped at sixty seconds
// of wall clock, and a media element holding one connection open while it
// buffers an episode will hit that ceiling and have the stream cut underneath
// it. Edge streams a response without that cap, and costs less per byte.
export const runtime = "edge";

/**
 * Bytes served per request. See boundedRange for why this exists.
 */
const CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Same-origin passthrough for podcast audio.
 *
 * This exists for one reason. A browser will not let Web Audio read a
 * cross-origin media element unless the CDN sends CORS headers, and many
 * podcast CDNs do not. Without readable audio there is no way to transcribe a
 * stream in the browser, which is why captions previously had to go round
 * through the microphone and the speakers.
 *
 * The cost is real and worth stating: this is the one place where media
 * bandwidth lands on our server instead of the publisher's. So it is used only
 * for transcription, only after a direct attempt has been shown to fail, and
 * never for ordinary playback, which always streams from the publisher.
 */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("url is required", { status: 400 });

  let url: URL;
  try {
    url = assertPublicUrl(target);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid URL", { status: 400 });
  }

  const { start, end } = boundedRange(request.headers.get("range"), CHUNK_BYTES);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: {
        "User-Agent": "Hoerbar/0.1 (audio passthrough)",
        Accept: "audio/*,video/*;q=0.9,*/*;q=0.8",
        Range: `bytes=${start}-${end}`,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    return new Response("The audio source could not be reached.", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`The audio source responded ${upstream.status}.`, { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "audio/mpeg";
  // Refuse anything that is plainly a web page rather than media: without this
  // an HTML error page would be handed to the decoder as if it were audio.
  if (/^text\/html/i.test(type)) {
    return new Response("That address returns a web page, not a media file.", { status: 415 });
  }

  const headers = new Headers({
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    // Same-origin already, but the header is what makes the element readable
    // if the app is ever served from a different host than the API.
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  });
  for (const header of ["last-modified", "etag"]) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }

  const upstreamRange = upstream.headers.get("content-range");
  if (upstream.status === 206 && upstreamRange) {
    // The source honoured the range, so its own accounting is authoritative.
    headers.set("Content-Range", upstreamRange);
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new Response(upstream.body, { status: 206, headers });
  }

  // A source that ignores Range hands back the whole file. Passing that on as
  // a 200 is correct and still works; the element simply buffers more at once.
  const total = totalFromContentRange(upstreamRange) ?? Number(upstream.headers.get("content-length") ?? 0);
  if (total) headers.set("Content-Length", String(total));
  return new Response(upstream.body, { status: 200, headers });
}
